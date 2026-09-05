/**
 * Стык courseId (сайт) и subjectId (CRM). Без диска, без имён.
 * courseId = assign[gid:branchId:groupId] → slot.courseId → карта subjectId.
 */

export type JoinTree = {
  schools: { id: string; href?: string }[];
  courses: { id: string; href?: string; schoolId: string }[];
  assign?: Record<string, string>;
};

export type IdMapCourse = { subjectId: number; courseId?: string; siteHref?: string };

export type JoinSlot = {
  id?: string;
  groupId?: number;
  branchId?: number;
  courseId?: string;
  subjectId?: number;
};

export function groupAssignKey(s: { id?: string; groupId?: number; branchId?: number }) {
  if (Number(s.groupId) > 0) return `gid:${Number(s.branchId) || 0}:${s.groupId}`;
  return String(s.id || "");
}

function courseIdInTree(tree: JoinTree, id: string) {
  if (!id) return "";
  const hit = tree.courses.find((c) => c.id === id || c.href === id);
  return hit?.id || "";
}

export function canonCourseId(tree: JoinTree, raw: string) {
  return courseIdInTree(tree, String(raw || "").trim());
}

export function canonSchoolId(tree: JoinTree, raw: string) {
  const id = String(raw || "").trim();
  if (!id) return "";
  const hit = tree.schools.find((s) => s.id === id || s.href === id);
  return hit?.id || "";
}

export function courseIdOfGroup(s: JoinSlot, tree: JoinTree) {
  const key = groupAssignKey(s);
  const id = (key && tree.assign?.[key]) || s.courseId || "";
  return courseIdInTree(tree, id);
}

export function courseIdOfSubject(subjectId: number, tree: JoinTree, mapCourses?: IdMapCourse[]) {
  if (!subjectId || !mapCourses?.length) return "";
  const link = mapCourses.find((c) => c.subjectId === subjectId);
  const raw = String(link?.courseId || link?.siteHref || "").trim();
  if (!raw) return "";
  return courseIdInTree(tree, raw);
}

export function resolveGroupCourseId(s: JoinSlot, tree: JoinTree, mapCourses?: IdMapCourse[]): string {
  const assigned = courseIdOfGroup(s, tree);
  if (assigned) return assigned;
  if (s.courseId) {
    const own = courseIdInTree(tree, s.courseId);
    if (own) return own;
  }
  if (s.subjectId && mapCourses?.length) {
    const fromMap = courseIdOfSubject(s.subjectId, tree, mapCourses);
    if (fromMap) return fromMap;
  }
  return "";
}

export type CourseSubjectSource = "assign" | "slot" | "map" | "none";
export type CourseSubjectGap = "" | "no-course" | "no-subject";

export type CourseSubjectJoin = {
  courseId: string;
  schoolId: string;
  subjectId: number;
  source: CourseSubjectSource;
  gap: CourseSubjectGap;
};

export function joinCourseSubject(s: JoinSlot, tree: JoinTree, mapCourses?: IdMapCourse[]): CourseSubjectJoin {
  const key = groupAssignKey(s);
  const assigned = courseIdInTree(tree, (key && tree.assign?.[key]) || "");
  const own = courseIdInTree(tree, String(s.courseId || ""));
  const mapped = s.subjectId && mapCourses?.length ? courseIdOfSubject(s.subjectId, tree, mapCourses) : "";
  const courseId = assigned || own || mapped || "";
  const source: CourseSubjectSource = assigned ? "assign" : own ? "slot" : mapped ? "map" : "none";
  const course = courseId ? tree.courses.find((c) => c.id === courseId || c.href === courseId) : undefined;
  const subjectId = Number(s.subjectId) || 0;
  let gap: CourseSubjectGap = "";
  if (!courseId && subjectId) gap = "no-course";
  else if (courseId && !subjectId) gap = "no-subject";
  return {
    courseId,
    schoolId: course?.schoolId || "",
    subjectId,
    source,
    gap,
  };
}

export function courseSubjectGapText(join: CourseSubjectJoin) {
  if (join.gap === "no-course") {
    return `subjectId ${join.subjectId} без курса сайта. Карта Соответствия, не название группы.`;
  }
  if (join.gap === "no-subject") {
    return `courseId ${join.courseId} без предмета CRM. Выберите subjectId филиала в карточке группы.`;
  }
  return "";
}

export function subjectIdsOfCourse(courseId: string, mapCourses?: IdMapCourse[]): number[] {
  if (!courseId || !mapCourses?.length) return [];
  return mapCourses
    .filter((c) => c.courseId === courseId)
    .map((c) => c.subjectId)
    .filter(Boolean);
}

export function subjectIdOfCourse(courseId: string, mapCourses?: IdMapCourse[]): number {
  if (!courseId) return 0;
  const ids = [...new Set(subjectIdsOfCourse(courseId, mapCourses))];
  return ids.length === 1 ? ids[0] : 0;
}
