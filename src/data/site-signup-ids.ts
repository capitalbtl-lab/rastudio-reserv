/** Заявка с сайта → ID для Alfa. Не Number(courseId дерева). */

export type SignupSlot = {
  groupId?: number;
  branchId?: number;
  subjectId?: number;
  courseId?: string;
};

export function resolveSignupIds(opts: {
  gid?: string;
  branchId?: number;
  courseId?: string;
  subjectId?: number;
  slots: SignupSlot[];
  subjectOfCourse?: (courseId: string) => number;
}): { subjectId: number; courseId: string; groupId: number; source: "explicit" | "group" | "numeric" | "map" | "none" } {
  const groupId = Number(String(opts.gid || "").replace(/\D/g, "")) || 0;
  const courseId = String(opts.courseId || "").trim();
  if (Number(opts.subjectId) > 0) {
    return { subjectId: Number(opts.subjectId), courseId, groupId, source: "explicit" };
  }
  if (groupId) {
    const slot =
      opts.slots.find((s) => Number(s.groupId) === groupId && (!opts.branchId || Number(s.branchId) === opts.branchId)) ||
      opts.slots.find((s) => Number(s.groupId) === groupId);
    if (Number(slot?.subjectId) > 0) {
      return {
        subjectId: Number(slot!.subjectId),
        courseId: slot!.courseId || courseId,
        groupId,
        source: "group",
      };
    }
  }
  if (/^\d+$/.test(courseId)) {
    return { subjectId: Number(courseId), courseId: "", groupId, source: "numeric" };
  }
  if (courseId && opts.subjectOfCourse) {
    const sid = Number(opts.subjectOfCourse(courseId)) || 0;
    if (sid) return { subjectId: sid, courseId, groupId, source: "map" };
  }
  return { subjectId: 0, courseId, groupId, source: "none" };
}
