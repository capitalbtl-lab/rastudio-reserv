/** Клиент и сервер: школы/курсы сайта по ID, без AlfaCRM. */
import { SCHOOLS, SCHOOL_COURSE_MATCH } from "./site";
import { listPriceRows, tidyCourseName } from "./prices-core";
import { SUBJECT_TO_COURSE } from "./ids";

export type SiteSchoolOpt = { id: string; label: string; href: string };
export type SiteCourseOpt = { id: string; schoolId: string; label: string; href: string; age: string };

export function siteSchoolOptions(): SiteSchoolOpt[] {
  return SCHOOLS.map((s) => ({ id: s.href, label: s.label, href: s.href }));
}

export function schoolIdOfPath(path: string) {
  const p = String(path || "");
  if (!p) return "";
  if (SCHOOLS.some((s) => s.href === p)) {
    const nested = SCHOOLS.find((s) => s.href !== p && SCHOOL_COURSE_MATCH[s.href]?.(p));
    if (nested) return nested.href;
    return p;
  }
  return SCHOOLS.find((s) => SCHOOL_COURSE_MATCH[s.href]?.(p))?.href || "";
}

export function siteCourseOptions(): SiteCourseOpt[] {
  const seen = new Set<string>();
  const out: SiteCourseOpt[] = [];
  for (const r of listPriceRows()) {
    const id = String(r.courseId || r.path || "");
    if (!id || seen.has(id)) continue;
    const schoolId = schoolIdOfPath(id);
    if (!schoolId) continue;
    if (schoolId === id && !SCHOOL_COURSE_MATCH[id]) continue;
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

export function subjectIdOfCoursePath(path: string) {
  const n = `/${String(path || "").replace(/^\/+/, "")}`.replace(/\/+$/, "") || "";
  const hit = Object.entries(SUBJECT_TO_COURSE).find(([, p]) => p === n);
  return hit ? String(hit[0]) : "";
}

export function trialCourseOptions() {
  const courses = siteCourseOptions();
  const seen = new Set<string>();
  const out: { id: string; name: string; courseId: string; schoolId: string }[] = [];
  for (const [sid, path] of Object.entries(SUBJECT_TO_COURSE)) {
    if (seen.has(sid)) continue;
    seen.add(sid);
    const c = courses.find((x) => x.id === path || x.href === path);
    const school = siteSchoolOptions().find((s) => s.id === (c?.schoolId || schoolIdOfPath(path)));
    const name = c?.label || path;
    out.push({
      id: String(sid),
      name: school && !name.toLowerCase().includes(school.label.slice(0, 8).toLowerCase()) ? `${school.label}: ${name}` : name,
      courseId: c?.id || path,
      schoolId: c?.schoolId || school?.id || "",
    });
  }
  return out;
}
