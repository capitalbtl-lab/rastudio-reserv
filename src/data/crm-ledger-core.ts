/** Остаток = оплаты − списания проведённых. Не путать со снимком customer.balance. */

import type { LessonPupil } from "./crm-slots-core";

export const ALFA_BRANCH_IDS = [1, 2, 3, 4] as const;

type LessonDetail = Record<string, unknown>;

export function lessonDetailsOf(item: Record<string, unknown>): LessonDetail[] {
  return Array.isArray(item.details) ? (item.details as LessonDetail[]) : [];
}

function numId(v: unknown) {
  const n = Number(v || 0);
  return n > 0 ? n : 0;
}

function detailFlag(v: unknown): boolean | null {
  if (v == null || v === "") return null;
  if (v === true || v === 1 || v === "1") return true;
  if (v === false || v === 0 || v === "0") return false;
  return Number(v) === 1;
}

function detailAmount(d: LessonDetail) {
  const n = Number(d.commission ?? d.commision ?? d.cost ?? d.sum ?? d.paid ?? d.price ?? d.lesson_cost ?? d.amount ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function detailName(d: LessonDetail) {
  const s = String(d.customer_name || d.customerName || d.name || d.fio || "").trim();
  return s || undefined;
}

/** Явка и списание — details[].customer_id. Пустой customer_ids не значит «чужой урок». */
export function lessonCustomerIds(item: Record<string, unknown>): number[] {
  const raw = item.customer_ids || item.customerIds;
  const fromArr = Array.isArray(raw) ? raw.map(Number).filter((n) => n > 0) : [];
  if (fromArr.length) return fromArr;
  const ids = new Set<number>();
  for (const d of lessonDetailsOf(item)) {
    const n = Number(d.customer_id || d.customerId || 0);
    if (n > 0) ids.add(n);
  }
  const one = Number(item.customer_id || item.customerId || 0);
  if (one > 0) ids.add(one);
  return [...ids];
}

export function lessonDetailOf(item: Record<string, unknown>, customerId?: number): LessonDetail | undefined {
  const det = lessonDetailsOf(item);
  const cid = Number(customerId) || 0;
  if (cid) {
    const hit = det.find((d) => Number(d.customer_id || d.customerId || 0) === cid);
    if (hit) return hit;
  }
  return det[0];
}

export function lessonWriteoffAmount(item: Record<string, unknown>, customerId?: number) {
  const d = lessonDetailOf(item, customerId);
  if (d) {
    const n = detailAmount(d);
    if (n > 0) return n;
  }
  const keys = ["commission", "commision", "cost", "sum", "paid", "price", "lesson_cost", "amount"];
  for (const k of keys) {
    const n = Number(item[k]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/** Абонемент списания: details[].ctt_id этого ученика, иначе урок. */
export function lessonWriteoffCtt(item: Record<string, unknown>, customerId?: number) {
  const d = lessonDetailOf(item, customerId);
  const n = Number(d?.ctt_id || d?.cttId || item.ctt_id || item.cttId || 0);
  return n > 0 ? n : 0;
}

/** Состав занятия из Alfa details[]: кто был и сколько списали. */
export function packLessonPupils(item: Record<string, unknown>): LessonPupil[] {
  const details = lessonDetailsOf(item);
  const ids = lessonCustomerIds(item);
  const out: LessonPupil[] = [];
  const seen = new Set<number>();
  for (const d of details) {
    const customerId = numId(d.customer_id || d.customerId);
    if (!customerId) continue;
    seen.add(customerId);
    const flag = detailFlag(d.is_attend ?? d.isAttend ?? d.attend);
    const attend = flag == null ? ids.includes(customerId) || ids.length === 0 : flag;
    const cttId = numId(d.ctt_id || d.cttId);
    const reasonId = numId(d.reason_id || d.reasonId);
    const reason = String(d.reason_name || d.reasonName || d.reason || "").trim();
    const grade = String(d.grade || d.mark || "").trim();
    const homeworkGrade = String(d.homework_grade || d.homeworkGrade || d.hw_grade || "").trim();
    const note = String(d.note || d.comment || "").trim();
    const amount = detailAmount(d);
    out.push({
      customerId,
      name: detailName(d),
      attend,
      amount: amount || undefined,
      cttId: cttId || undefined,
      reasonId: reasonId || undefined,
      reason: reason || undefined,
      grade: grade || undefined,
      homeworkGrade: homeworkGrade || undefined,
      note: note || undefined,
    });
  }
  for (const id of ids) {
    if (seen.has(id)) continue;
    const amount = lessonWriteoffAmount(item, id);
    const cttId = lessonWriteoffCtt(item, id);
    out.push({
      customerId: id,
      attend: true,
      amount: amount || undefined,
      cttId: cttId || undefined,
    });
  }
  return out;
}

export function pupilOf(pupils: LessonPupil[] | undefined, customerId: number) {
  const cid = Number(customerId) || 0;
  if (!cid) return undefined;
  return (pupils || []).find((p) => Number(p.customerId) === cid);
}

/** Списание этого ученика с занятия: сначала его строка в журнале педагога. */
export function chargeFromPupils(
  lesson: { pupils?: LessonPupil[]; amount?: number; cttId?: number },
  customerId: number,
) {
  const p = pupilOf(lesson.pupils, customerId);
  if (p) {
    return {
      amount: Number(p.amount) || 0,
      cttId: Number(p.cttId) || 0,
      attend: Boolean(p.attend),
    };
  }
  return {
    amount: Number(lesson.amount) || 0,
    cttId: Number(lesson.cttId) || 0,
    attend: true,
  };
}

export function lessonPupilsKey(
  lessons: { lessonId?: number; pupils?: { customerId?: number; amount?: number; attend?: boolean }[] }[],
) {
  return (lessons || [])
    .map((l) => {
      const bits = (l.pupils || [])
        .map((p) => `${Number(p.customerId) || 0}:${p.attend ? 1 : 0}:${Number(p.amount) || 0}`)
        .join(",");
      return `${Number(l.lessonId) || 0}:${bits}`;
    })
    .sort()
    .join(";");
}

export function payCttIdOf(item: Record<string, unknown>) {
  const nested = item.ctt && typeof item.ctt === "object" ? Number((item.ctt as { id?: unknown }).id) : 0;
  const nested2 =
    item.customer_tariff && typeof item.customer_tariff === "object"
      ? Number((item.customer_tariff as { id?: unknown }).id)
      : 0;
  const n = Number(item.ctt_id || item.cttId || item.customer_tariff_id || item.customerTariffId || nested || nested2 || 0);
  return n > 0 ? n : 0;
}

export function writeoffSumOf(lessons: { status?: number; amount?: number }[]) {
  let n = 0;
  for (const l of lessons || []) {
    if (Number(l.status) !== 3) continue;
    n += Number(l.amount) || 0;
  }
  return n;
}

export function writeoffSumForCtt(lessons: { status?: number; amount?: number; cttId?: number }[], cttId: number) {
  const want = Number(cttId) || 0;
  let n = 0;
  for (const l of lessons || []) {
    if (Number(l.status) !== 3) continue;
    if ((Number(l.cttId) || 0) !== want) continue;
    n += Number(l.amount) || 0;
  }
  return n;
}

export function ledgerMoney(opts: { paySum: number; writeoffSum: number; snap?: number; complete?: boolean }) {
  const pay = Number(opts.paySum) || 0;
  const wo = Number(opts.writeoffSum) || 0;
  const snap = opts.snap == null ? Number.NaN : Number(opts.snap);
  if (wo > 0) return pay - wo;
  if (Number.isFinite(snap)) return snap;
  return pay;
}

export function uniqueBranches(primary?: number) {
  const first = Number(primary) || 1;
  return [first, ...ALFA_BRANCH_IDS.filter((b) => b !== first)];
}
