/**
 * Соответствия: subjectId (AlfaCRM) → courseId (дерево сайта).
 * Имена предметов и курсов — только подписи. Раскладка групп — applyScheduleMap по ID.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SCHOOLS, SCHOOL_COURSE_MATCH } from "@/data/site";
import { listPriceRows, SCHOOL_DIRECTION, tidyCourseName } from "@/data/prices-core";
import { SEED_SUBJECTS, loadSubjects } from "@/data/crm-subjects";
import { type CrmSlot } from "@/data/crm-slots-core";
import { slotMismatch } from "@/data/slot-mismatch";
import { loadSiteTree, saveSiteTree } from "./site-tree";
import { SUBJECT_TO_COURSE, resolveGroupCourseId, groupAssignKey } from "./ids";
import { UNMAPPED_SCHOOL } from "./group-status";

export type SchoolLink = { schedule: string; siteHref: string; schoolId?: string };
export type CourseLink = {
  subjectId: number;
  subjectName: string;
  /** ID курса в дереве. Соответствие subjectId → courseId, не по имени. */
  courseId: string;
  schoolId: string;
  siteHref: string;
  school: string;
};

type MapFile = { schools: SchoolLink[]; courses: CourseLink[] };

function fileOf() {
  return join(process.cwd(), "storage", "schedule-map.json");
}

export function siteSchools() {
  const tree = loadSiteTree();
  return tree.schools.map((s) => ({ href: s.href || s.id, label: s.label }));
}

export function siteCourses() {
  const tree = loadSiteTree();
  const ageLo = (s: string) => {
    const m = String(s || "").match(/(\d{1,2})/);
    return m ? Number(m[1]) : 99;
  };
  return tree.courses
    .slice()
    .sort((a, b) => {
      const sa = tree.schools.findIndex((s) => s.id === a.schoolId);
      const sb = tree.schools.findIndex((s) => s.id === b.schoolId);
      if (sa !== sb) return sa - sb;
      return ageLo(a.age || a.label) - ageLo(b.age || b.label) || a.label.localeCompare(b.label, "ru");
    })
    .map((c) => ({
      href: c.href || c.id,
      name: c.label,
      school: tree.schools.find((s) => s.id === c.schoolId)?.label || "",
      age: c.age || "",
      schoolId: c.schoolId,
      courseId: c.id,
    }));
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
  const tree = loadSiteTree();
  if (tree.schools.length) {
    return tree.schools.map((s) => ({ schedule: s.label, siteHref: s.href || s.id, schoolId: s.id }));
  }
  return SCHOOLS.map((s) => ({ schedule: s.label, siteHref: s.href, schoolId: s.href }));
}

function seedCourses(): CourseLink[] {
  const tree = loadSiteTree();
  const prices = listPriceRows();
  const out: CourseLink[] = [];
  const subjects = loadSubjects();
  const list = subjects.length ? subjects : SEED_SUBJECTS;
  for (const sub of list) {
    const path = SUBJECT_TO_COURSE[sub.id] || "";
    const course = path ? tree.courses.find((c) => c.id === path || c.href === path) : undefined;
    const price = prices.find((r) => (r.courseId || r.path) === (course?.id || path) || r.path === path);
    const href = course?.href || path || price?.path || "";
    const schoolNode = course ? tree.schools.find((s) => s.id === course.schoolId) : undefined;
    const school = schoolNode?.label || price?.direction || schoolByPath(href) || "";
    out.push({
      subjectId: sub.id,
      subjectName: sub.name,
      courseId: course?.id || path,
      schoolId: course?.schoolId || schoolNode?.id || "",
      siteHref: href,
      school,
    });
  }
  return out;
}

function emptyCourses(): CourseLink[] {
  const subjects = loadSubjects();
  const list = subjects.length ? subjects : SEED_SUBJECTS;
  return list.map((sub) => ({
    subjectId: sub.id,
    subjectName: sub.name,
    courseId: "",
    schoolId: "",
    siteHref: "",
    school: "",
  }));
}

function packLink(c: Partial<CourseLink>, name = ""): CourseLink {
  return {
    subjectId: Number(c.subjectId) || 0,
    subjectName: c.subjectName || name,
    courseId: String(c.courseId || c.siteHref || "").trim(),
    schoolId: String(c.schoolId || ""),
    siteHref: String(c.siteHref || c.courseId || ""),
    school: String(c.school || ""),
  };
}

export function loadScheduleMap(): MapFile {
  const schools = defaultSchools();
  try {
    if (!existsSync(fileOf())) {
      const seeded: MapFile = { schools, courses: seedCourses() };
      mkdirSync(dirname(fileOf()), { recursive: true });
      writeFileSync(fileOf(), JSON.stringify(seeded, null, 2));
      return seeded;
    }
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<MapFile>;
    const schoolRows = schools.map((d) => {
      const hit = raw.schools?.find((s) => (s.schoolId && s.schoolId === d.schoolId) || s.siteHref === d.siteHref) || d;
      return { ...d, ...hit, schoolId: hit.schoolId || d.schoolId };
    });
    const courses = emptyCourses().map((d) => {
      const hit = raw.courses?.find((c) => c.subjectId === d.subjectId);
      if (!hit) return d;
      return packLink(hit, hit.subjectName || d.subjectName);
    });
    for (const c of raw.courses || []) {
      if (!courses.some((x) => x.subjectId === c.subjectId)) courses.push(packLink(c, c.subjectName));
    }
    return { schools: schoolRows, courses };
  } catch {
    return { schools, courses: seedCourses() };
  }
}

export function saveScheduleMap(data: MapFile) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  const next: MapFile = {
    schools: data.schools?.length ? data.schools : defaultSchools(),
    courses: (data.courses?.length ? data.courses : emptyCourses()).map((c) => ({
      subjectId: c.subjectId,
      subjectName: c.subjectName,
      courseId: c.courseId || c.siteHref || "",
      schoolId: c.schoolId || "",
      siteHref: c.siteHref || c.courseId || "",
      school: c.school || "",
    })),
  };
  writeFileSync(fileOf(), JSON.stringify(next, null, 2));
  return next;
}

export const ROBOT_COURSE_ORDER = [
  "Робототехника 5–6 лет",
  "Робототехника 7–9 лет",
  "Робототехника 10–14 лет",
  "Робототехника на английском",
];

export function robotCourseOrder(a: string, b: string) {
  const ia = ROBOT_COURSE_ORDER.indexOf(a);
  const ib = ROBOT_COURSE_ORDER.indexOf(b);
  if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  return a.localeCompare(b, "ru");
}

export function canonicalCourse(
  name: string,
  school?: string,
  extra?: { age?: string; path?: string; subject?: string },
) {
  const n = tidyCourseName(name);
  const hay = `${name} ${n} ${extra?.subject || ""} ${extra?.path || ""} ${extra?.age || ""} ${school || ""}`
    .toLowerCase()
    .replace(/ё/g, "е");
  if (school === "Школа робототехники" || /робототех|билингв/.test(hay)) {
    if (/англий|билингв|roboticsinenglish/.test(hay)) return "Робототехника на английском";
    const ageHay = `${extra?.age || ""} ${extra?.path || ""} ${name} ${extra?.subject || ""}`;
    if (/robototehnika-5/.test(ageHay) || /(?:^|[^\d])5\s*[-–]\s*[67](?:[^\d]|$)/.test(ageHay)) return "Робототехника 5–6 лет";
    if (/robototehnika-7/.test(ageHay) || /(?:^|[^\d])7\s*[-–]\s*9(?:[^\d]|$)/.test(ageHay)) return "Робототехника 7–9 лет";
    if (/robototehnika-10/.test(ageHay) || /(?:9|10|11)\s*[-–]\s*1[1-4]/.test(ageHay)) return "Робототехника 10–14 лет";
    return n || "Робототехника";
  }
  return n;
}

/** Раскладывает группы по courseId / subjectId. Карта предмета важнее старого assign. */
export function applyScheduleMap(slots: CrmSlot[]): CrmSlot[] {
  const tree = loadSiteTree();
  const map = loadScheduleMap();
  let assignDirty = false;
  const mapped = slots.map((s) => {
    const cid = resolveGroupCourseId(s, tree, map.courses);
    const key = groupAssignKey(s);
    if (key && cid && tree.assign[key] !== cid) {
      tree.assign[key] = cid;
      assignDirty = true;
    }
    if (key && !cid && tree.assign[key]) {
      delete tree.assign[key];
      assignDirty = true;
    }
    const course = cid ? tree.courses.find((c) => c.id === cid || c.href === cid) : undefined;
    const schoolNode = course ? tree.schools.find((x) => x.id === course.schoolId) : undefined;
    if (!course || !schoolNode) {
      const mm = slotMismatch(s);
      return {
        ...s,
        courseId: "",
        schoolId: "",
        school: "",
        path: "",
        mismatch: mm.level || undefined,
        mismatchText: mm.text || undefined,
      };
    }
    const next = {
      ...s,
      courseId: course.id,
      schoolId: schoolNode.id,
      school: schoolNode.label,
      course: course.label,
      path: course.href || s.path,
      age: s.age || course.age,
    };
    const mm = slotMismatch(next);
    return { ...next, mismatch: mm.level || undefined, mismatchText: mm.text || undefined };
  });
  if (assignDirty) saveSiteTree(tree);
  return inheritSchoolBySubject(mapped);
}

/** Школа без курса: тот же subjectId, что у уже привязанной группы. Имя не смотрим. */
export function inheritSchoolBySubject(slots: CrmSlot[]): CrmSlot[] {
  const bySub = new Map<string, { schoolId: string; school: string }>();
  for (const s of slots) {
    if (s.subjectId && s.schoolId && s.school && s.school !== UNMAPPED_SCHOOL) {
      bySub.set(`${s.branchId}:${s.subjectId}`, { schoolId: s.schoolId, school: s.school });
    }
  }
  return slots.map((s) => {
    if (s.schoolId) return s;
    const hit = s.subjectId ? bySub.get(`${s.branchId}:${s.subjectId}`) : undefined;
    if (hit) return { ...s, schoolId: hit.schoolId, school: hit.school };
    return { ...s, school: s.school || UNMAPPED_SCHOOL };
  });
}
