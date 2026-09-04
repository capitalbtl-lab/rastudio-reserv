/** Публичные факты курса из админки: дерево, цены, слоты, абонементы. */
import { listAdminSlots } from "./alfacrm-schedule";
import { listPriceRows } from "./prices-core";
import { loadSiteTree } from "./site-tree";
import { guessTariffLinks } from "./tariff-map";
import { loadTariffs } from "./crm-tariffs";
import { schoolIdOfPath } from "./site-bind-core";

export type CourseMeta = {
  courseId: string;
  schoolId: string;
  age: string;
  mins: number;
  cities: string[];
  tariffIds: number[];
};

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
  const paths = new Set<string>([...tree.courses.map((c) => c.id), ...prices.map((r) => r.courseId || r.path).filter(Boolean)]);
  const out: CourseMeta[] = [];
  for (const path of paths) {
    const course = tree.courses.find((c) => c.id === path || c.href === path);
    const price = prices.find((r) => r.path === path || r.courseId === path);
    const id = course?.id || path;
    const groupSlots = slots.filter((s) => s.courseId === id || s.courseId === path);
    const cities = [...new Set(groupSlots.map((s) => cityOfBranch(s.branchId)).filter(Boolean))];
    out.push({
      courseId: id,
      schoolId: course?.schoolId || schoolIdOfPath(path),
      age: course?.age || price?.age || "",
      mins: Number(price?.mins) || 0,
      cities,
      tariffIds: links.filter((t) => t.courseId === id).map((t) => t.tariffId),
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
      const c = tree.courses.find((x) => x.id === l.courseId);
      const s = tree.schools.find((x) => x.id === (l.schoolId || c?.schoolId));
      return `${l.tariffId} → ${s?.id || l.schoolId} / ${c?.id || l.courseId}`;
    }),
  ].join("\n");
}
