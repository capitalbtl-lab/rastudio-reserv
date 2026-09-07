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

export function packCustomerRegular(
  it: Record<string, unknown>,
  ctx: { groupName?: string; teacher?: string; subject?: string; branchId?: number },
): DiskRegular | null {
  if (Number(it.disabled || it.is_disabled || 0) === 1) return null;
  const id = Number(it.id || 0);
  const groupId = Number(it.related_id || it.group_id || it.groupId || 0);
  const day = Number(it.day || 0);
  const from = hm(String(it.time_from_v || it.time_from || it.timeFrom || ""));
  if (!id || !from) return null;
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
