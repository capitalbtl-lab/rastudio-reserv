import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { logAdmin } from "./admin-settings";
import { applyScheduleMap, loadScheduleMap, saveScheduleMap, siteCourses, siteSchools, type CourseLink, type SchoolLink } from "./schedule-map";
import { listAdminSlots, saveAdminSlots } from "./alfacrm-schedule";
import { stampSubjects } from "./crm-slots";
import { loadSiteTree, pinAllGuesses } from "./site-tree";
import { guessTariffLinks, saveTariffMap, type TariffLink } from "./tariff-map";
import { loadTariffs } from "./crm-tariffs";

function pack() {
  const map = loadScheduleMap();
  const store = loadTariffs();
  const tariffs = guessTariffLinks(store.items);
  return {
    ...map,
    siteSchools: siteSchools(),
    siteCourses: siteCourses(),
    tree: loadSiteTree(),
    tariffs,
    tariffNames: store.items.filter((t) => !t.archive && t.id > 0).map((t) => ({ id: t.id, name: t.name })),
  };
}

export const adminScheduleMap = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        action: "get" | "save" | "apply" | "saveTariffs";
        schools?: SchoolLink[];
        courses?: CourseLink[];
        tariffs?: TariffLink[];
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
      pinAllGuesses(slots);
      saveAdminSlots(slots);
      logAdmin("Соответствия школ и курсов сохранены, расписание на сайте обновлено");
      return { ok: true as const, ...pack(), count: slots.length, schools: map.schools, courses: map.courses };
    }
    if (data.action === "saveTariffs") {
      const items = saveTariffMap(data.tariffs || []);
      logAdmin(`Соответствия абонементов сохранены на сайте: ${items.filter((x) => x.courseId).length} привязано. CRM не менялась.`);
      return { ok: true as const, ...pack(), tariffs: guessTariffLinks(loadTariffs().items, items) };
    }
    if (data.action === "apply") {
      const slots = applyScheduleMap(stampSubjects(listAdminSlots()));
      pinAllGuesses(slots);
      saveAdminSlots(slots);
      logAdmin("Соответствия применены к расписанию на сайте");
      return { ok: true as const, ...pack(), count: slots.length };
    }
    return { ok: true as const, ...pack() };
  });
