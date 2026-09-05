/** Публичные факты курса из админки: дерево, цены, слоты, абонементы. Только ID. */
import { listAdminSlots } from "./alfacrm-schedule";
import { listPriceRows } from "./prices-core";
import { loadSiteTree } from "./site-tree";
import { guessTariffLinks } from "./tariff-map";
import { loadTariffs } from "./crm-tariffs";
import { canonCourseId, canonSchoolId } from "./ids";
import { publicGroupsOfCourse, publicSiteBoard } from "./public-bind-core";

export type CourseMeta = {
  courseId: string;
  schoolId: string;
  age: string;
  mins: number;
  cities: string[];
  tariffIds: number[];
};

export { publicGroupsOfCourse, publicSiteBoard } from "./public-bind-core";
export type { PublicCourseRow, PublicSchoolRow, PublicLooseGroup } from "./public-bind-core";

function cityOfBranch(id?: number) {
  if (id === 3) return "Луховицы";
  if (id === 1 || id === 2) return "Коломна";
  return "";
}

export function publicCoursesMeta(): CourseMeta[] {
  const tree = loadSiteTree();
  const prices = listPriceRows();
  const slots = listAdminSlots();
  const links = guessTariffLinks(loadTariffs().items);
  const out: CourseMeta[] = [];
  for (const course of tree.courses) {
    const id = canonCourseId(tree, course.id);
    if (!id) continue;
    const groupSlots = publicGroupsOfCourse(slots, id, tree);
    const price = prices.find((r) => canonCourseId(tree, r.courseId || r.path || "") === id);
    const cities = [...new Set(groupSlots.map((s) => cityOfBranch(s.branchId)).filter(Boolean))];
    out.push({
      courseId: id,
      schoolId: canonSchoolId(tree, course.schoolId),
      age: course.age || price?.age || "",
      mins: Number(price?.mins) || 0,
      cities,
      tariffIds: links.filter((t) => canonCourseId(tree, t.courseId) === id).map((t) => t.tariffId),
    });
  }
  return out;
}

export function tariffMapForAgent() {
  const tree = loadSiteTree();
  const links = guessTariffLinks(loadTariffs().items).filter((x) => x.courseId);
  if (!links.length) return "Абонементы ещё не привязаны к курсам сайта (Соответствия → Абонементы).";
  return [
    "Соответствие абонементов сайта (tariffId → schoolId / courseId). Только сайт, не CRM:",
    ...links.map((l) => {
      const courseId = canonCourseId(tree, l.courseId);
      const c = tree.courses.find((x) => x.id === courseId);
      const schoolId = canonSchoolId(tree, l.schoolId || c?.schoolId || "");
      return `${l.tariffId} → ${schoolId || l.schoolId} / ${courseId || l.courseId}`;
    }),
  ].join("\n");
}
