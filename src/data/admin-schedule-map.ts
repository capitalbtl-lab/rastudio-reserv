import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { logAdmin } from "./admin-settings";
import { applyScheduleMap, loadScheduleMap, saveScheduleMap, siteCourses, siteSchools, type CourseLink, type SchoolLink } from "./schedule-map";
import { listAdminSlots, saveAdminSlots } from "./alfacrm-schedule";
import { stampSubjects } from "./crm-slots";

export const adminScheduleMap = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        action: "get" | "save" | "apply";
        schools?: SchoolLink[];
        courses?: CourseLink[];
      },
  )
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    if (data.action === "save") {
      const map = saveScheduleMap({
        schools: data.schools || [],
        courses: data.courses || [],
      });
      const slots = applyScheduleMap(stampSubjects(listAdminSlots()));
      saveAdminSlots(slots);
      logAdmin("Соответствия школ и курсов сохранены, расписание на сайте обновлено");
      return { ok: true as const, ...map, siteSchools: siteSchools(), siteCourses: siteCourses(), count: slots.length };
    }
    if (data.action === "apply") {
      const slots = applyScheduleMap(stampSubjects(listAdminSlots()));
      saveAdminSlots(slots);
      logAdmin("Соответствия применены к расписанию на сайте");
      return { ok: true as const, ...loadScheduleMap(), siteSchools: siteSchools(), siteCourses: siteCourses(), count: slots.length };
    }
    const map = loadScheduleMap();
    return { ok: true as const, ...map, siteSchools: siteSchools(), siteCourses: siteCourses() };
  });
