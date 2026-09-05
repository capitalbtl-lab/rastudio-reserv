/**
 * Соответствия: subjectId (AlfaCRM) → courseId (дерево сайта).
 * Имена предметов и курсов — только подписи. Раскладка групп — applyScheduleMap по ID.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SCHOOLS } from "@/data/site";
import { SEED_SUBJECTS, loadSubjects } from "@/data/crm-subjects";
import { type CrmSlot } from "@/data/crm-slots-core";
import { slotMismatch } from "@/data/slot-mismatch";
import { loadSiteTree, saveSiteTree } from "./site-tree";
import { SUBJECT_TO_COURSE, resolveGroupCourseId, joinCourseSubject, courseSubjectGapText, groupAssignKey, canonCourseId, canonSchoolId } from "./ids";
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
  const tree = loadSiteTree();
  const course = tree.courses.find((c) => c.id === p || c.href === p);
  if (course) return tree.schools.find((s) => s.id === course.schoolId)?.label || "";
  return tree.schools.find((s) => s.id === p || s.href === p)?.label || "";
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
  const out: CourseLink[] = [];
  const subjects = loadSubjects();
  const list = subjects.length ? subjects : SEED_SUBJECTS;
  for (const sub of list) {
    const path = SUBJECT_TO_COURSE[sub.id] || "";
    const course = path ? tree.courses.find((c) => c.id === path || c.href === path) : undefined;
    const schoolNode = course ? tree.schools.find((s) => s.id === course.schoolId) : undefined;
    out.push({
      subjectId: sub.id,
      subjectName: sub.name,
      courseId: course?.id || "",
      schoolId: course?.schoolId || "",
      siteHref: course?.href || "",
      school: schoolNode?.label || "",
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
  const tree = loadSiteTree();
  const cid = canonCourseId(tree, String(c.courseId || "").trim()) || canonCourseId(tree, String(c.siteHref || "").trim());
  const course = cid ? tree.courses.find((x) => x.id === cid) : undefined;
  const schoolId = course?.schoolId || canonSchoolId(tree, String(c.schoolId || ""));
  const school = schoolId ? tree.schools.find((s) => s.id === schoolId) : undefined;
  return {
    subjectId: Number(c.subjectId) || 0,
    subjectName: c.subjectName || name,
    courseId: cid,
    schoolId: schoolId || "",
    siteHref: course?.href || "",
    school: school?.label || "",
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
    courses: (data.courses?.length ? data.courses : emptyCourses()).map((c) => packLink(c, c.subjectName)),
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

/** Школа сайта по subjectId из карты. Имя не смотрим. */
export function schoolLabelOfSubject(subjectId: number) {
  if (!subjectId) return "";
  const map = loadScheduleMap();
  const link = map.courses.find((c) => c.subjectId === subjectId);
  if (link?.school) return link.school;
  const tree = loadSiteTree();
  const course = link?.courseId ? tree.courses.find((c) => c.id === link.courseId) : undefined;
  const school = tree.schools.find((s) => s.id === (link?.schoolId || course?.schoolId));
  return school?.label || "";
}

/** Раскладывает группы по courseId. Сначала assign (карточка), иначе карта subjectId. */
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
    if (key && !cid && tree.assign[key] && !tree.courses.some((c) => c.id === tree.assign[key] || c.href === tree.assign[key])) {
      delete tree.assign[key];
      assignDirty = true;
    }
    const course = cid ? tree.courses.find((c) => c.id === cid || c.href === cid) : undefined;
    const schoolNode = course ? tree.schools.find((x) => x.id === course.schoolId) : undefined;
    if (!course || !schoolNode) {
      const join = joinCourseSubject(s, tree, map.courses);
      const gap = courseSubjectGapText(join);
      const mm = gap ? { level: "soft" as const, text: gap } : slotMismatch(s);
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
