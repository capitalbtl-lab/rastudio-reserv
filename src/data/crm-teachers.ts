import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CrmSlot } from "./crm-slots-core";

export type CrmTeacher = { id: number; name: string; branchIds: number[] };
export type TeacherGroup = { groupId: number; branchId: number; name: string };

function fileOf() {
  return join(process.cwd(), "storage", "crm-teachers.json");
}

export function loadTeachers(): CrmTeacher[] {
  try {
    if (!existsSync(fileOf())) return [];
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as CrmTeacher[];
    return Array.isArray(raw) ? raw.filter((t) => t.id && t.name) : [];
  } catch {
    return [];
  }
}

export function saveTeachers(items: CrmTeacher[]) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify(items, null, 2));
  return items;
}

function slotTeacherIds(s: { teacherId?: number; teacherIds?: number[] }) {
  const raw = s.teacherIds?.length ? s.teacherIds : s.teacherId ? [s.teacherId] : [];
  return [...new Set(raw.map(Number).filter(Boolean))];
}

export function teachersFromSlots(slots: CrmSlot[]): CrmTeacher[] {
  const map = new Map<number, CrmTeacher>();
  for (const s of slots) {
    for (const n of slotTeacherIds(s)) {
      const hit = map.get(n) || { id: n, name: s.teacher || String(n), branchIds: [] as number[] };
      if (s.teacher) hit.name = s.teacher;
      const b = Number(s.branchId) || 0;
      if (b && !hit.branchIds.includes(b)) hit.branchIds.push(b);
      map.set(n, hit);
    }
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

export function groupsOfTeacher(teacherId: number, slots: CrmSlot[]): TeacherGroup[] {
  const id = Number(teacherId) || 0;
  if (!id) return [];
  const out: TeacherGroup[] = [];
  const seen = new Set<string>();
  for (const s of slots) {
    if (!slotTeacherIds(s).includes(id)) continue;
    const gid = Number(s.groupId) || 0;
    const branchId = Number(s.branchId) || 0;
    const k = `${branchId}:${gid}`;
    if (!gid || seen.has(k)) continue;
    seen.add(k);
    out.push({ groupId: gid, branchId, name: s.groupName || `группа ${gid}` });
  }
  return out.sort((a, b) => a.branchId - b.branchId || a.name.localeCompare(b.name, "ru"));
}

export function teachersAtBranch(branchId: number, list = loadTeachers()) {
  if (!branchId) return list;
  return list.filter((t) => (t.branchIds || []).includes(branchId));
}

export function teacherAllowed(id: number, branchId: number, list = loadTeachers()) {
  if (!id || !branchId) return false;
  return list.some((t) => t.id === id && (t.branchIds || []).includes(branchId));
}

/** Только teacherId. Имя педагога — подпись, не ключ. */
export function teacherIdsOfSlot(
  s: { teacherId?: number; teacherIds?: number[] },
  branchId: number,
  list = loadTeachers(),
) {
  return [...new Set(slotTeacherIds(s).filter((id) => teacherAllowed(id, branchId, list)))];
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

export function listTeachers(slots: CrmSlot[]) {
  const { items, changed } = mergeTeacherLists(loadTeachers(), teachersFromSlots(slots));
  if (changed && items.length) saveTeachers(items);
  return items;
}
