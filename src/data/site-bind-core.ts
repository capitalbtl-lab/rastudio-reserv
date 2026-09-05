/** Клиент и сервер: школы/курсы сайта по ID, без AlfaCRM и без заводской таблицы предметов. */
import { SCHOOLS } from "./site";
import { listPriceRows, tidyCourseName } from "./prices-core";

export type SiteSchoolOpt = { id: string; label: string; href: string };
export type SiteCourseOpt = { id: string; schoolId: string; label: string; href: string; age: string };

export function siteSchoolOptions(): SiteSchoolOpt[] {
  return SCHOOLS.map((s) => ({ id: s.href, label: s.label, href: s.href }));
}

export function schoolIdOfPath(path: string) {
  const p = String(path || "");
  if (!p) return "";
  const row = listPriceRows().find((r) => r.courseId === p || r.path === p || r.id === p);
  if (row?.schoolId) return row.schoolId;
  if (SCHOOLS.some((s) => s.href === p)) return p;
  return "";
}

export function siteCourseOptions(): SiteCourseOpt[] {
  const seen = new Set<string>();
  const out: SiteCourseOpt[] = [];
  for (const r of listPriceRows()) {
    const id = String(r.courseId || r.path || "");
    if (!id || seen.has(id)) continue;
    const schoolId = String(r.schoolId || schoolIdOfPath(id));
    if (!schoolId || schoolId === id) continue;
    seen.add(id);
    const age = String(r.age || "").replace(/^Для детей\s*/i, "").trim();
    const name = tidyCourseName(r.name) || r.name;
    out.push({
      id,
      schoolId,
      label: age && !name.toLowerCase().includes(age.slice(0, 5).toLowerCase()) ? `${name} · ${age}` : name,
      href: r.path || id,
      age,
    });
  }
  return out.sort((a, b) => a.schoolId.localeCompare(b.schoolId) || a.label.localeCompare(b.label, "ru"));
}

/** id в форме записи = courseId сайта (path). subjectId резолвит сервер по карте. */
export function trialCourseOptions() {
  return siteCourseOptions().map((c) => {
    const school = siteSchoolOptions().find((s) => s.id === c.schoolId);
    const name = c.label;
    return {
      id: c.id,
      name: school && !name.toLowerCase().includes(school.label.slice(0, 8).toLowerCase()) ? `${school.label}: ${name}` : name,
      courseId: c.id,
      schoolId: c.schoolId,
    };
  });
}

export function courseIdOfPath(path: string) {
  const n = `/${String(path || "").replace(/^\/+/, "")}`.replace(/\/+$/, "") || "";
  const hit = siteCourseOptions().find((c) => c.id === n || c.id === path);
  return hit?.id || "";
}
