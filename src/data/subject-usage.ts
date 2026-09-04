export type SubjectUsage = {
  groups: Record<number, number>;
  students: Record<number, number>;
  groupTotal: number;
  studentTotal: number;
};

export function countSubjectUsage(
  slots: { groupId?: number; branchId?: number; subjectId?: number; taken?: number; statusId?: number }[],
): Map<number, SubjectUsage> {
  const seen = new Set<string>();
  const by = new Map<number, SubjectUsage>();
  for (const s of slots) {
    if (!s.groupId || s.statusId === 3 || s.statusId === 4) continue;
    const key = `${Number(s.branchId) || 0}:${s.groupId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sid = Number(s.subjectId) || 0;
    if (!sid) continue;
    const row = by.get(sid) || { groups: {}, students: {}, groupTotal: 0, studentTotal: 0 };
    const bid = Number(s.branchId) || 0;
    row.groups[bid] = (row.groups[bid] || 0) + 1;
    row.students[bid] = (row.students[bid] || 0) + Number(s.taken || 0);
    row.groupTotal += 1;
    row.studentTotal += Number(s.taken || 0);
    by.set(sid, row);
  }
  return by;
}
