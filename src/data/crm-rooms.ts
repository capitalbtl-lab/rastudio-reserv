/** Аудитория карточки занятия — только филиал группы, без архива и без «всех подряд». */

export type CrmRoom = { id: number; name: string; branchId: number };

/** Имена из модалки Alfa calendar/create (company/2). Остальные филиалы — с слотов, подпись «аудитория N». */
export const SEED_ROOMS: CrmRoom[] = [
  { id: 19, name: "Ауд.1", branchId: 2 },
  { id: 20, name: "Ауд.1.1", branchId: 2 },
  { id: 21, name: "Ауд.2", branchId: 2 },
  { id: 22, name: "Ауд.3", branchId: 2 },
  { id: 27, name: "Ауд.3.1", branchId: 2 },
];

const LOCATION_LABEL: Record<number, string> = {
  1: 'Студия "Развивайся" (г.Коломна, ул.Гражданская, д.2)',
  2: 'ЦМИТ "Развивайся" (г.Коломна, ул.Октябрьской революции, д. 340, 2 этаж)',
  3: 'Студия "Развивайся" (г.Луховицы, ул.Пушкина, д.202А)',
  4: 'Летние программы от Студии "Развивайся"',
};

export function roomArchived(x: Record<string, unknown>) {
  if ([x.removed, x.is_removed, x.archived, x.is_archived, x.is_delete].some((v) => Number(v) === 1 || v === true)) return true;
  if (x.is_active === 0 || x.enabled === 0 || x.is_enabled === 0 || x.state === 0) return true;
  const blob = `${x.name || ""} ${x.note || ""}`.toLowerCase();
  return /архив/.test(blob);
}

export function roomBranchIds(x: Record<string, unknown>) {
  const ids: number[] = [];
  if (Array.isArray(x.branch_ids)) for (const v of x.branch_ids) if (Number(v)) ids.push(Number(v));
  if (Number(x.branch_id)) ids.push(Number(x.branch_id));
  const loc = Number(x.location_id || x.filial_id || 0);
  if (loc >= 1 && loc <= 4) ids.push(loc);
  return [...new Set(ids)];
}

/** Филиал только по ID. Имя аудитории не ключ. Нет ID — не этого филиала. */
export function roomBelongsToBranch(x: Record<string, unknown>, branch: number) {
  const ids = roomBranchIds(x);
  if (!ids.length) return false;
  return ids.includes(Number(branch));
}

export function roomsOfBranchList(raw: Record<string, unknown>[], branch: number) {
  const seen = new Set<number>();
  const out: { id: number; name: string }[] = [];
  for (const x of raw) {
    const id = Number(x.id || 0);
    if (!id || seen.has(id) || roomArchived(x)) continue;
    if (!roomBelongsToBranch(x, branch)) continue;
    seen.add(id);
    const name = String(x.name || "").trim() || `аудитория ${id}`;
    out.push({ id, name });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return out;
}

function prettyName(name: string) {
  const s = String(name || "").trim();
  if (!s || /^аудитория\s+\d+$/i.test(s)) return "";
  return s;
}

export function mergeRooms(...lists: CrmRoom[][]) {
  const map = new Map<string, CrmRoom>();
  for (const list of lists) {
    for (const r of list) {
      const id = Number(r.id) || 0;
      const branchId = Number(r.branchId) || 0;
      if (!id || !branchId) continue;
      const k = `${branchId}:${id}`;
      const prev = map.get(k);
      const name = prettyName(r.name) || prev?.name || `аудитория ${id}`;
      map.set(k, { id, name, branchId });
    }
  }
  return [...map.values()].sort(
    (a, b) => a.branchId - b.branchId || a.name.localeCompare(b.name, "ru") || a.id - b.id,
  );
}

export function roomsFromSlots(slots: { roomId?: number; branchId?: number }[]): CrmRoom[] {
  const out: CrmRoom[] = [];
  for (const s of slots) {
    const id = Number(s.roomId) || 0;
    const branchId = Number(s.branchId) || 0;
    if (!id || !branchId) continue;
    out.push({ id, name: `аудитория ${id}`, branchId });
  }
  return out;
}

export function roomsCatalog(slots: { roomId?: number; branchId?: number }[] = [], extra: CrmRoom[] = []) {
  return mergeRooms(SEED_ROOMS, roomsFromSlots(slots), extra);
}

export function roomsOfBranchCatalog(rooms: CrmRoom[], branchId: number) {
  const b = Number(branchId) || 0;
  return rooms.filter((r) => r.branchId === b);
}

export function roomsSelectGroups(rooms: CrmRoom[], branchId: number) {
  const list = roomsOfBranchCatalog(rooms, branchId);
  const label = LOCATION_LABEL[branchId] || "Аудитории";
  return [
    {
      label,
      options: list.map((r) => ({ value: String(r.id), label: r.name })),
    },
  ].filter((g) => g.options.length);
}
