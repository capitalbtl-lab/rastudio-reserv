import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CrmSlot } from "./crm-slots-core";
import {
  mergeTeacherLists,
  teachersFromSlots,
  teachersAtBranchFromSlots,
  type CrmTeacher,
} from "./crm-teachers-core";

export type { CrmTeacher, TeacherGroup } from "./crm-teachers-core";
export {
  slotTeacherIds,
  pickTeacherIds,
  teachersFromSlots,
  mergeTeacherLists,
  groupsOfTeacher,
  subjectsOfTeacher,
  teachersAtBranchFromSlots,
  teacherIdsOfSlot,
  mergeTeacher,
} from "./crm-teachers-core";

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

export function teachersAtBranch(branchId: number, list = loadTeachers(), slots?: CrmSlot[]) {
  if (slots) return teachersAtBranchFromSlots(branchId, slots, list);
  if (!branchId) return list;
  return list.filter((t) => (t.branchIds || []).includes(branchId));
}

export function teacherAllowed(id: number, branchId: number, list = loadTeachers()) {
  if (!id || !branchId) return false;
  return list.some((t) => t.id === id && (t.branchIds || []).includes(branchId));
}

export function listTeachers(slots: CrmSlot[]) {
  const { items, changed } = mergeTeacherLists(loadTeachers(), teachersFromSlots(slots));
  if (changed && items.length) saveTeachers(items);
  return items;
}
