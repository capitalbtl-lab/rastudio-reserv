/** Доска раздела «Сайт»: школы/курсы/группы только по ID. */
import type { SiteTree } from "./site-tree.ts";
import { resolveGroupCourseId } from "./course-subject-core.ts";

export type IdMapCourse = { subjectId: number; courseId?: string; siteHref?: string };

export type PublicCourseRow = {
  id: string;
  schoolId: string;
  label: string;
  age: string;
  groups: number;
  emptyTeacher: number;
  noPlaces: number;
  tariffs: number[];
  groupKeys: { groupId: number; branchId: number }[];
};

export type PublicSchoolRow = { id: string; label: string; courses: PublicCourseRow[] };

export type PublicLooseGroup = {
  id: string;
  groupId: number;
  branchId: number;
  name: string;
  subjectId: number;
};

function courseInTree(tree: SiteTree, raw?: string) {
  const id = String(raw || "").trim();
  if (!id) return "";
  return tree.courses.find((c) => c.id === id || c.href === id)?.id || "";
}

function schoolInTree(tree: SiteTree, raw?: string) {
  const id = String(raw || "").trim();
  if (!id) return "";
  return tree.schools.find((s) => s.id === id || s.href === id)?.id || "";
}

/** courseId группы: assign → slot.courseId → карта subjectId. Не по имени. */
export function publicCourseIdOf(
  s: { id?: string; groupId?: number; branchId?: number; courseId?: string; subjectId?: number },
  tree: SiteTree,
  mapCourses?: IdMapCourse[],
) {
  return resolveGroupCourseId(s, tree, mapCourses);
}

export function publicGroupsOfCourse(
  slots: { id?: string; groupId?: number; branchId?: number; courseId?: string; subjectId?: number }[],
  courseId: string,
  tree: SiteTree,
  mapCourses?: IdMapCourse[],
) {
  const want = courseInTree(tree, courseId);
  if (!want) return [];
  return slots.filter((s) => publicCourseIdOf(s, tree, mapCourses) === want);
}

export function publicSiteBoard(
  slots: {
    id: string;
    groupId: number;
    groupName?: string;
    branchId: number;
    courseId?: string;
    subjectId?: number;
    teacher?: string;
    teacherId?: number;
    limit?: number;
  }[],
  tree: SiteTree,
  mapCourses?: IdMapCourse[],
  tariffLinks?: { tariffId: number; courseId: string }[],
) {
  const links = tariffLinks || [];
  const schools: PublicSchoolRow[] = tree.schools.map((s) => {
    const schoolId = schoolInTree(tree, s.id);
    const courses = tree.courses
      .filter((c) => schoolInTree(tree, c.schoolId) === schoolId)
      .map((c) => {
        const courseId = courseInTree(tree, c.id);
        const groups = publicGroupsOfCourse(slots, courseId, tree, mapCourses);
        return {
          id: courseId || c.id,
          schoolId,
          label: c.label,
          age: c.age,
          groups: groups.length,
          emptyTeacher: groups.filter((g) => !g.teacher && !g.teacherId).length,
          noPlaces: groups.filter((g) => !g.limit).length,
          tariffs: links.filter((t) => courseInTree(tree, t.courseId) === courseId).map((t) => t.tariffId),
          groupKeys: groups
            .filter((g) => Number(g.groupId) > 0)
            .map((g) => ({ groupId: Number(g.groupId), branchId: Number(g.branchId) || 0 })),
        };
      });
    return { id: schoolId || s.id, label: s.label, courses };
  });
  const bound = new Set(
    schools.flatMap((s) => s.courses.flatMap((c) => c.groupKeys.map((g) => `${g.branchId}:${g.groupId}`))),
  );
  const loose: PublicLooseGroup[] = slots
    .filter((g) => Number(g.groupId) > 0 && !bound.has(`${g.branchId}:${g.groupId}`))
    .map((g) => ({
      id: g.id,
      groupId: Number(g.groupId),
      branchId: Number(g.branchId) || 0,
      name: g.groupName || `группа ${g.groupId}`,
      subjectId: Number(g.subjectId) || 0,
    }));
  const teacherIds = new Set(slots.map((s) => Number(s.teacherId) || 0).filter(Boolean));
  return {
    schools,
    loose,
    stats: {
      schools: tree.schools.length,
      courses: tree.courses.length,
      groups: slots.filter((s) => Number(s.groupId) > 0).length,
      loose: loose.length,
      tariffs: links.filter((t) => courseInTree(tree, t.courseId)).length,
      teachers: teacherIds.size,
    },
  };
}
