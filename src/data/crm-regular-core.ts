/** Постоянное расписание ученика с диска (копия regular-lesson Alfa). */

export type DiskRegular = {
  id: number;
  groupId: number;
  groupName: string;
  day: number;
  dayLabel: string;
  from: string;
  to: string;
  teacher: string;
  teacherId?: number;
  subject: string;
  subjectId?: number;
  roomId?: number;
  branchId: number;
};

const DAYS = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function regularDayLabel(day: number) {
  return DAYS[Number(day) || 0] || "";
}

function hm(raw?: string) {
  const m = String(raw || "").match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

export function regularGroupIdOf(it: Record<string, unknown>, customerId = 0) {
  const cid = Number(customerId) || 0;
  const g = Number(it.group_id || it.groupId || 0);
  const r = Number(it.related_id || 0);
  if (g && g !== cid) return g;
  if (r && r !== cid) return r;
  return 0;
}

/** Слот ученика: его группа. Чужой subjectId при том же groupId — яд (подставили первую группу). */
export function regularBelongsToGroups(
  row: { groupId?: number; groupName?: string; subjectId?: number },
  groups: { id: number; name?: string; subjectId?: number }[],
) {
  if (!groups.length) return true;
  const gid = Number(row.groupId) || 0;
  const g =
    (gid && groups.find((x) => Number(x.id) === gid)) ||
    groups.find((x) => x.name && row.groupName && x.name === row.groupName);
  if (!g) return false;
  const sid = Number(row.subjectId) || 0;
  const gs = Number(g.subjectId) || 0;
  if (sid && gs && sid !== gs) return false;
  return true;
}
  it: Record<string, unknown>,
  ctx: { groupName?: string; teacher?: string; subject?: string; branchId?: number; customerId?: number; fallbackGroupId?: number },
): DiskRegular | null {
  if (Number(it.disabled || it.is_disabled || 0) === 1) return null;
  const cid = Number(ctx.customerId || 0);
  const id = Number(it.id || 0);
  let groupId = regularGroupIdOf(it, cid);
  if (!groupId) groupId = Number(ctx.fallbackGroupId || 0) || 0;
  const day = Number(it.day || 0);
  const from = hm(String(it.time_from_v || it.time_from || it.timeFrom || ""));
  if (!id || !from) return null;
  if (cid && groupId === cid) return null;
  const teacherId = Array.isArray(it.teacher_ids) ? Number(it.teacher_ids[0] || 0) : Number(it.teacher_id || 0);
  return {
    id,
    groupId,
    groupName: String(it.group_name || ctx.groupName || "").trim(),
    day,
    dayLabel: regularDayLabel(day),
    from,
    to: hm(String(it.time_to_v || it.time_to || it.timeTo || "")),
    teacher: String(ctx.teacher || it.teacher_name || "").trim(),
    teacherId: teacherId || undefined,
    subject: String(ctx.subject || it.subject_name || "").trim(),
    subjectId: Number(it.subject_id || 0) || undefined,
    roomId: Number(it.room_id || 0) || undefined,
    branchId: Number(it.branch_id || ctx.branchId || 0) || 0,
  };
}

export function parseDossierRegular(extras?: Record<string, string> | null): DiskRegular[] {
  try {
    const raw = JSON.parse(String(extras?.regular || "[]")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((row) => {
        const it = row as Record<string, unknown>;
        const id = Number(it.id || 0);
        const from = String(it.from || "");
        if (!id || !from) return null;
        const day = Number(it.day || 0);
        return {
          id,
          groupId: Number(it.groupId || 0),
          groupName: String(it.groupName || ""),
          day,
          dayLabel: String(it.dayLabel || regularDayLabel(day)),
          from,
          to: String(it.to || ""),
          teacher: String(it.teacher || ""),
          teacherId: Number(it.teacherId || 0) || undefined,
          subject: String(it.subject || ""),
          subjectId: Number(it.subjectId || 0) || undefined,
          roomId: Number(it.roomId || 0) || undefined,
          branchId: Number(it.branchId || 0) || 0,
        } satisfies DiskRegular;
      })
      .filter((x): x is DiskRegular => Boolean(x));
  } catch {
    return [];
  }
}

export function regularItemForCustomer(it: Record<string, unknown>, customerId: number): Record<string, unknown> {
  const cid = Number(customerId) || 0;
  const list = Array.isArray(it.customers)
    ? it.customers
    : Array.isArray(it.streaming)
      ? it.streaming
      : [];
  const mine = list.find((row) => {
    if (!row || typeof row !== "object") return false;
    const rec = row as Record<string, unknown>;
    return Number(rec.id || rec.customer_id || rec.customerId || 0) === cid;
  }) as Record<string, unknown> | undefined;
  if (!mine) return it;
  return {
    ...it,
    time_from_v: mine.time_from_v || mine.time_from || it.time_from_v,
    time_to_v: mine.time_to_v || mine.time_to || it.time_to_v,
    teacher_ids: mine.teacher_ids || it.teacher_ids,
    day: mine.day || it.day,
    customer_ids: [cid],
  };
}

export function customerIdsOfRegular(it: Record<string, unknown>) {
  return Array.isArray(it.customer_ids) ? it.customer_ids.map(Number).filter((n) => n > 0) : [];
}

/** Копии ученика. Пустой состав — только слоты его групп, не вся студия. */
export function pickCustomerRegularItems(items: Record<string, unknown>[], customerId: number, groupIds: number[] = []) {
  const cid = Number(customerId) || 0;
  const allowed = new Set(groupIds.map(Number).filter((n) => n && n !== cid));
  const mapped = (items || []).map((it) => regularItemForCustomer(it, cid));
  const hit = mapped.filter((it) => {
    if (Number(it.disabled || it.is_disabled || 0) === 1) return false;
    const ids = customerIdsOfRegular(it);
    const gid = regularGroupIdOf(it, cid);
    if (ids.includes(cid)) return !allowed.size || !gid || allowed.has(gid);
    if (ids.length) return false;
    return Boolean(gid && allowed.has(gid));
  });
  const personal = hit.filter((it) => {
    const ids = customerIdsOfRegular(it);
    return ids.length > 0 && ids.length <= 3 && ids.includes(cid);
  });
  const chosen = personal.length ? personal : hit.filter((it) => customerIdsOfRegular(it).includes(cid));
  const list = chosen.length ? chosen : hit;
  const map = new Map<string, Record<string, unknown>>();
  for (const it of list) {
    const from = String(it.time_from_v || it.time_from || "");
    const key = `${Number(it.day || 0)}|${from}|${regularGroupIdOf(it, cid)}`;
    const prev = map.get(key);
    const n = customerIdsOfRegular(it).length;
    if (!prev || n < customerIdsOfRegular(prev).length || n === 1) map.set(key, it);
  }
  return [...map.values()];
}
