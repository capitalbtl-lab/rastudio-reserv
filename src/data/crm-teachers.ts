import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CrmSlot } from "./crm-slots-core";

export type CrmTeacher = { id: number; name: string; branchIds: number[] };

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

export function teachersFromSlots(slots: CrmSlot[]): CrmTeacher[] {
  const map = new Map<number, CrmTeacher>();
  for (const s of slots) {
    const ids = s.teacherIds?.length ? s.teacherIds : s.teacherId ? [s.teacherId] : [];
    for (const id of ids) {
      const n = Number(id);
      if (!n) continue;
      const hit = map.get(n) || { id: n, name: s.teacher || String(n), branchIds: [] as number[] };
      if (s.teacher) hit.name = s.teacher;
      const b = Number(s.branchId) || 0;
      if (b && !hit.branchIds.includes(b)) hit.branchIds.push(b);
      map.set(n, hit);
    }
  }
  return [...map.values()];
}

export function teachersAtBranch(branchId: number, list = loadTeachers()) {
  if (!branchId) return list;
  return list.filter((t) => t.branchIds.includes(branchId));
}

export function teacherAllowed(id: number, branchId: number, list = loadTeachers()) {
  if (!id || !branchId) return false;
  return list.some((t) => t.id === id && t.branchIds.includes(branchId));
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
  const saved = loadTeachers();
  if (saved.length) return saved;
  const derived = teachersFromSlots(slots);
  if (derived.length) saveTeachers(derived);
  return derived;
}
