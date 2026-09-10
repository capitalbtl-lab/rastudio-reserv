import { teacherIdSet, slotBeatTeacherIds, ownerOnlyTeacherIds, ownerTeacherIdsOf, type SlotTeachers } from "./crm-group-teachers-core.ts";

export type CrmTeacher = { id: number; name: string; branchIds: number[] };
export type TeacherGroup = {
  groupId: number;
  branchId: number;
  name: string;
  subjectId?: number;
  subject?: string;
  day?: string;
  from?: string;
  to?: string;
  ownerOnly?: boolean;
};

type SlotLike = SlotTeachers & {
  groupId?: number;
  groupName?: string;
  branchId?: number;
  subjectId?: number;
  subject?: string;
  dayLabel?: string;
  timeFrom?: string;
  timeTo?: string;
};

export { teacherIdSet, slotBeatTeacherIds, ownerOnlyTeacherIds };

export function slotTeacherIds(s: SlotTeachers) {
  const beat = slotBeatTeacherIds(s);
  if (beat.length) return beat;
  const raw = s.teacherIds?.length ? s.teacherIds : s.teacherId ? [s.teacherId] : [];
  return teacherIdSet(raw);
}

/** Урок.teacher_ids, иначе группа. Пустой массив урока не затирает группу.
 * Для занятия ученика используйте pickLessonTeacherIds (бит, не ответственные). */
export function pickTeacherIds(lessonIds: unknown, groupIds: unknown) {
  const lesson = asIds(lessonIds);
  return lesson.length ? lesson : asIds(groupIds);
}

function asIds(raw: unknown) {
  return teacherIdSet(raw);
}

export function teachersFromSlots(slots: SlotLike[]): CrmTeacher[] {
  const map = new Map<number, CrmTeacher>();
  const put = (n: number, name: string, branchId: number) => {
    const hit = map.get(n) || { id: n, name: name || String(n), branchIds: [] as number[] };
    if (name && name !== String(n)) hit.name = name;
    if (branchId && !hit.branchIds.includes(branchId)) hit.branchIds.push(branchId);
    map.set(n, hit);
  };
  for (const s of slots) {
    const b = Number(s.branchId) || 0;
    for (const n of slotTeacherIds(s)) put(n, s.teacher || "", b);
    for (const n of ownerTeacherIdsOf(s)) put(n, s.ownerTeacher || "", b);
  }
  return [...map.values()];
}

/** Диск + группы. Филиал педагога — из групп, не из имени. */
export function mergeTeacherLists(saved: CrmTeacher[], derived: CrmTeacher[]) {
  const map = new Map<number, CrmTeacher>();
  for (const t of saved) {
    const id = Number(t.id) || 0;
    if (!id) continue;
    map.set(id, { id, name: t.name || `педагог ${id}`, branchIds: [...(t.branchIds || [])] });
  }
  let changed = false;
  for (const t of derived) {
    const id = Number(t.id) || 0;
    if (!id) continue;
    const hit = map.get(id);
    if (!hit) {
      map.set(id, { id, name: t.name || `педагог ${id}`, branchIds: [...(t.branchIds || [])] });
      changed = true;
      continue;
    }
    if (t.name && t.name !== hit.name && t.name !== String(id)) {
      hit.name = t.name;
      changed = true;
    }
    for (const b of t.branchIds || []) {
      if (b && !hit.branchIds.includes(b)) {
        hit.branchIds.push(b);
        changed = true;
      }
    }
  }
  const items = [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), "ru") || a.id - b.id);
  return { items, changed };
}

export function groupsOfTeacher(teacherId: number, slots: SlotLike[]): TeacherGroup[] {
  const id = Number(teacherId) || 0;
  if (!id) return [];
  const out: TeacherGroup[] = [];
  const seen = new Set<string>();
  const DAYS = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  for (const s of slots) {
    const gid = Number(s.groupId) || 0;
    const branchId = Number(s.branchId) || 0;
    if (!gid) continue;
    const beats = s.beats?.length
      ? s.beats
      : [{ day: undefined, timeFrom: s.timeFrom, timeTo: s.timeTo, teacherIds: s.teacherIds }];
    for (const b of beats) {
      const ids = teacherIdSet(b.teacherIds?.length ? b.teacherIds : s.teacherIds?.length ? s.teacherIds : s.teacherId);
      if (!ids.includes(id)) continue;
      const from = String(b.timeFrom || s.timeFrom || "");
      const day = Number((b as { day?: number }).day) || 0;
      const dayLabel = day ? DAYS[day] : s.dayLabel;
      const k = `${branchId}:${gid}:${day}:${from}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        groupId: gid,
        branchId,
        name: s.groupName || `группа ${gid}`,
        subjectId: Number(s.subjectId) || undefined,
        subject: s.subject || undefined,
        day: dayLabel || undefined,
        from: from || undefined,
        to: String(b.timeTo || s.timeTo || "") || undefined,
      });
    }
    if (ownerOnlyTeacherIds(s).includes(id)) {
      const k = `${branchId}:${gid}:owner`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push({
          groupId: gid,
          branchId,
          name: s.groupName || `группа ${gid}`,
          subjectId: Number(s.subjectId) || undefined,
          subject: s.subject || undefined,
          ownerOnly: true,
        });
      }
    }
  }
  return out.sort((a, b) => a.branchId - b.branchId || a.name.localeCompare(b.name, "ru"));
}

export function subjectsOfTeacher(teacherId: number, slots: SlotLike[]) {
  const seen = new Map<number, string>();
  for (const g of groupsOfTeacher(teacherId, slots)) {
    if (g.subjectId) seen.set(g.subjectId, g.subject || `предмет ${g.subjectId}`);
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function teachersAtBranchFromSlots(branchId: number, slots: SlotLike[], list: CrmTeacher[] = []) {
  const map = new Map<number, CrmTeacher>();
  for (const t of list) {
    if (!branchId || (t.branchIds || []).includes(branchId)) map.set(t.id, { ...t, branchIds: [...(t.branchIds || [])] });
  }
  for (const s of slots) {
    if (branchId && Number(s.branchId) !== branchId) continue;
    for (const id of slotTeacherIds(s)) {
      const prev = map.get(id);
      if (!prev) map.set(id, { id, name: s.teacher || `педагог ${id}`, branchIds: s.branchId ? [s.branchId] : [] });
      else if (s.teacher && (!prev.name || prev.name === String(id))) prev.name = s.teacher;
    }
  }
  return [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), "ru") || a.id - b.id);
}

export function teachersAtBranch(branchId: number, list: CrmTeacher[]) {
  if (!branchId) return list;
  return list.filter((t) => (t.branchIds || []).includes(branchId));
}

export function teacherAllowed(id: number, branchId: number, list: CrmTeacher[], slotBranchId?: number) {
  if (!id || !branchId) return false;
  if (slotBranchId && slotBranchId === branchId) return true;
  return list.some((t) => t.id === id && (t.branchIds || []).includes(branchId));
}

/** teacherId группы в этом филиале не выкидывать, даже если справочник ещё без филиала. */
export function teacherIdsOfSlot(
  s: { teacherId?: number; teacherIds?: number[]; branchId?: number },
  branchId: number,
  list: CrmTeacher[],
) {
  const ids = slotTeacherIds(s);
  if (!branchId) return ids;
  const slotBranch = Number(s.branchId) || 0;
  return ids.filter((id) => teacherAllowed(id, branchId, list, slotBranch));
}

export function mergeTeacher(list: CrmTeacher[], id: number, name: string, branchId: number) {
  const hit = list.find((t) => t.id === id);
  if (hit) {
    if (name) hit.name = name;
    if (branchId && !hit.branchIds.includes(branchId)) hit.branchIds.push(branchId);
    return;
  }
  list.push({ id, name: name || String(id), branchIds: branchId ? [branchId] : [] });
}
