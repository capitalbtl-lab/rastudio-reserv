/** Аудитории на диске. Alfa догоняет. Клиент читает catalog.rooms. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CrmRoom } from "./crm-rooms";
import { mergeRooms } from "./crm-rooms";

function fileOf() {
  return join(process.cwd(), "storage", "crm-rooms.json");
}

export function loadRooms(): CrmRoom[] {
  try {
    if (!existsSync(fileOf())) return [];
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as { items?: CrmRoom[] } | CrmRoom[];
    const items = Array.isArray(raw) ? raw : raw.items || [];
    return items.filter((r) => Number(r.id) && Number(r.branchId));
  } catch {
    return [];
  }
}

export function saveRooms(items: CrmRoom[]) {
  const packed = mergeRooms(items);
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify({ at: new Date().toISOString(), items: packed }, null, 0), "utf8");
  return packed;
}

export function rememberRooms(extra: CrmRoom[]) {
  if (!extra.length) return loadRooms();
  return saveRooms(mergeRooms(loadRooms(), extra));
}
