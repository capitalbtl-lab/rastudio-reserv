import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SCHOOLS, SCHOOL_COURSE_MATCH } from "@/data/site";
import { listPriceRows, SCHOOL_DIRECTION, splitCourseAge, tidyCourseName } from "@/data/prices-core";
import { SEED_SUBJECTS, bestSubject, loadSubjects, type CrmSubject } from "@/data/crm-subjects";
import { type CrmSlot } from "@/data/crm-slots-core";
import { schoolFromHay, slotMismatch } from "@/data/slot-mismatch";

export type SchoolLink = { schedule: string; siteHref: string };
export type CourseLink = { subjectId: number; subjectName: string; siteHref: string; school: string };

type MapFile = { schools: SchoolLink[]; courses: CourseLink[] };

const SUBJECT_PATH: Record<number, string> = {
  12: "/art-studio-3-4",
  116: "/art-studio-3-4",
  13: "/art-studio-5-6",
  14: "/art-studio-7-8",
  92: "/art-studio-9-13",
  115: "/art-studio-9-13",
  5: "/podgotovka-v-hudvuz",
  11: "/sculptural-studio",
  97: "/digitalartschool",
  36: "/robototehnika-5-7",
  37: "/robototehnika-7-9",
  35: "/robototehnika-10-14",
  114: "/roboticsinenglish",
  46: "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-python",
  48: "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-си",
  52: "/kursy-shkoly-programmirovaniya/it-школа-разработка-игр-на-unity",
  43: "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-5-7-лет",
  98: "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-7-9-лет",
  15: "/kursy-shkoly-programmirovaniya/it-лаборатория-dev-для-детей-9-10-лет",
  107: "/gamedesign",
  39: "/3d-modeling",
  27: "/science-course",
  89: "/teslaphysics",
  67: "/radioengineering",
  25: "/robototehnika-v-kolomne",
  16: "/preparation-for-school",
  108: "/happybricks",
  109: "/planet-steam",
  4: "/model-school",
  110: "/englishlanguagesm",
  111: "/englishlanguagegg",
  112: "/vitaminkorean",
  113: "/japanese",
};

function fileOf() {
  return join(process.cwd(), "storage", "schedule-map.json");
}

export function siteSchools() {
  return SCHOOLS.map((s) => ({ href: s.href, label: s.label }));
}

export function siteCourses() {
  const rows = listPriceRows();
  const seen = new Set<string>();
  const out: { href: string; name: string; school: string; age: string }[] = [];
  for (const r of rows) {
    const href = r.path;
    if (!href || seen.has(href)) continue;
    seen.add(href);
    out.push({ href, name: r.name, school: r.direction || schoolByPath(href), age: String(r.age || "").replace(/^Курс для (детей|девочек)\s*/i, "").trim() });
  }
  for (const s of SCHOOLS) {
    if (seen.has(s.href)) continue;
    seen.add(s.href);
    out.push({ href: s.href, name: s.label, school: s.label, age: s.kicker || "" });
  }
  return out.sort((a, b) => a.school.localeCompare(b.school, "ru") || a.name.localeCompare(b.name, "ru") || a.age.localeCompare(b.age, "ru"));
}

export function schoolByPath(path: string) {
  const p = path || "";
  const hit = SCHOOLS.find((s) => s.href === p);
  if (hit) return hit.label;
  for (const s of SCHOOLS) {
    if (SCHOOL_COURSE_MATCH[s.href]?.(p)) return s.label;
  }
  return SCHOOL_DIRECTION[p] || "";
}

function defaultSchools(): SchoolLink[] {
  return SCHOOLS.map((s) => ({ schedule: s.label, siteHref: s.href }));
}

function defaultCourses(): CourseLink[] {
  const prices = listPriceRows();
  const out: CourseLink[] = [];
  const subjects = loadSubjects();
  const list = subjects.length ? subjects : SEED_SUBJECTS;
  for (const sub of list) {
    const path = SUBJECT_PATH[sub.id] || "";
    const price = prices.find((r) => r.path === path) || prices.find((r) => bestSubject(`${r.name} ${r.age}`)?.id === sub.id);
    const href = path || price?.path || "";
    let school = price?.direction || schoolByPath(href) || schoolBySubject(sub);
    if (/беспилот/.test(sub.name)) school = "Школа наук и инженерии";
    if (sub.id === 109 || /планет/.test(sub.name.toLowerCase())) school = "Школа раннего развития";
    if (sub.id === 108 || /лего/.test(sub.name.toLowerCase())) school = "Школа раннего развития";
    out.push({ subjectId: sub.id, subjectName: sub.name, siteHref: href, school: school || "Прочее" });
  }
  return out;
}

function schoolBySubject(sub: CrmSubject) {
  return schoolFromHay(sub.name);
}

export function loadScheduleMap(): MapFile {
  const fallback: MapFile = { schools: defaultSchools(), courses: defaultCourses() };
  try {
    if (!existsSync(fileOf())) return fallback;
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<MapFile>;
    const schools = defaultSchools().map((d) => raw.schools?.find((s) => s.schedule === d.schedule) || d);
    const courses = defaultCourses().map((d) => {
      const hit = raw.courses?.find((c) => c.subjectId === d.subjectId);
      if (!hit) return d;
      const hrefSchool = schoolByPath(hit.siteHref || "");
      const hrefOk = !hrefSchool || hrefSchool === d.school;
      return {
        ...d,
        siteHref: hrefOk && hit.siteHref ? hit.siteHref : d.siteHref,
        school: d.school,
      };
    });
    for (const c of raw.courses || []) {
      if (!courses.some((x) => x.subjectId === c.subjectId)) courses.push(c);
    }
    return { schools, courses };
  } catch {
    return fallback;
  }
}

export function saveScheduleMap(data: MapFile) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  const next: MapFile = {
    schools: data.schools?.length ? data.schools : defaultSchools(),
    courses: data.courses?.length ? data.courses : defaultCourses(),
  };
  writeFileSync(fileOf(), JSON.stringify(next, null, 2));
  return next;
}

export { schoolFromHay };

export function applyScheduleMap(slots: CrmSlot[]): CrmSlot[] {
  const map = loadScheduleMap();
  const byId = new Map(map.courses.map((c) => [c.subjectId, c]));
  const prices = listPriceRows();
  return slots.map((s) => {
    const link = (s.subjectId && byId.get(s.subjectId)) || map.courses.find((c) => c.subjectName && s.subject && c.subjectName === s.subject);
    const schoolFromSub =
      (link?.school && link.school !== "Прочее" ? link.school : "") ||
      schoolFromHay(s.subject) ||
      schoolByPath(link?.siteHref || s.path);
    const schoolFromName = schoolFromHay(s.groupName);
    const school =
      (schoolFromSub && schoolFromSub !== "Прочее" ? schoolFromSub : "") ||
      (schoolFromName !== "Прочее" ? schoolFromName : "") ||
      s.school;
    const price = link?.siteHref ? prices.find((r) => r.path === link.siteHref) : undefined;
    const split = splitCourseAge(price?.name || link?.subjectName || s.subject || s.course || "");
    const age = s.age || split.age || splitCourseAge(s.groupName).age;
    const next = {
      ...s,
      school: school || s.school,
      path: link?.siteHref || s.path || "",
      course: tidyCourseName(split.name),
      age,
    };
    const mm = slotMismatch(next);
    return { ...next, mismatch: mm.level || undefined, mismatchText: mm.text || undefined };
  });
}