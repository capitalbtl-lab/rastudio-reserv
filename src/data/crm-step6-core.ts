import type { GroupCalLesson } from "./crm-slots-core";

export function isApiLeadStudy(raw: unknown) {
  return raw === false || raw === 0 || raw === "0";
}

export function isApiClientStudy(raw: unknown) {
  return raw === true || raw === 1 || raw === "1";
}

/** Номер колонки. null — в колонку не класть. Пустой этап — «Не разобрано». */
export function step6ColumnId(leadStatusIds: unknown, stages: { id: number; name: string }[], leadStatusId?: unknown): number | null {
  if (!(leadStatusIds == null || leadStatusIds === "")) {
    const list = idList(leadStatusIds);
    if (list.length > 1) return null;
    if (list.length === 1) return list[0];
  }
  if (leadStatusId != null && leadStatusId !== "" && leadStatusId !== false) {
    const n = Number(leadStatusId);
    if (Number.isFinite(n) && n > 0) return n;
    if (!Number.isFinite(n)) return null;
  }
  return unsortedColumn(stages);
}

function idList(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  if (raw && typeof raw === "object") {
    return Object.values(raw as Record<string, unknown>).map((x) => Number(x)).filter((n) => Number.isFinite(n));
  }
  const n = Number(raw);
  return Number.isFinite(n) ? [n] : [];
}

function unsortedColumn(stages: { id: number; name: string }[]): number | null {
  const named = stages.filter((s) => String(s.name || "").trim() === "Не разобрано");
  if (named.length > 1) return null;
  if (named.length === 1) return named[0].id;
  return 0;
}

function lessonDate(raw: unknown) {
  const s = String(raw || "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (ru) return `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}`;
  return "";
}

function posId(raw: unknown) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function detailOfCustomer(row: Record<string, unknown>, customerId: number) {
  const details = Array.isArray(row.details) ? (row.details as Record<string, unknown>[]) : [];
  return details.find((d) => Number(d.customer_id || d.customerId) === customerId);
}

/** Строка календаря из уже посчитанного урока шага 6. Новую сумму не считает. Без даты — null. */
export function step6LessonDisk(row: Record<string, unknown>, customerId: number, commission: number, branch: number): GroupCalLesson | null {
  const lessonId = posId(row.id);
  const date = lessonDate(row.date);
  if (!lessonId || !date || !Number.isFinite(commission)) return null;
  const detail = detailOfCustomer(row, customerId);
  const cttRaw = detail ? detail.ctt_id ?? detail.cttId : undefined;
  const cttId = Number(cttRaw) > 0 ? Number(cttRaw) : undefined;
  let attend: boolean | undefined;
  if (detail && Object.prototype.hasOwnProperty.call(detail, "is_attend")) {
    const v = detail.is_attend;
    if (v === true || v === 1 || v === "1") attend = true;
    else if (v === false || v === 0 || v === "0") attend = false;
  }
  const ids = new Set<number>();
  if (Array.isArray(row.customer_ids)) {
    for (const x of row.customer_ids) {
      const n = Number(x) || 0;
      if (n > 0) ids.add(n);
    }
  }
  if (customerId > 0) ids.add(customerId);
  const groupIds = Array.isArray(row.group_ids) ? row.group_ids.map(Number).filter((n) => n > 0) : [];
  const lesson: GroupCalLesson = {
    date,
    from: row.time_from == null ? "" : String(row.time_from),
    to: row.time_to == null ? "" : String(row.time_to),
    status: 3,
    type: "",
    group: "",
    teacher: "",
    subject: "",
    lessonId,
    branchId: posId(row.branch_id) || branch,
    groupIds,
    customerIds: [...ids],
    amount: commission,
    cttId,
  };
  if (attend !== undefined) {
    lesson.pupils = [{ customerId, attend, amount: commission, cttId }];
  }
  return lesson;
}
