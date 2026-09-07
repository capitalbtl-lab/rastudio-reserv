/** Остаток = оплаты − списания проведённых. Не путать со снимком customer.balance. */

export const ALFA_BRANCH_IDS = [1, 2, 3, 4] as const;

type LessonDetail = Record<string, unknown>;

export function lessonDetailsOf(item: Record<string, unknown>): LessonDetail[] {
  return Array.isArray(item.details) ? (item.details as LessonDetail[]) : [];
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
    const n = Number(d.commission ?? d.cost ?? 0);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const keys = ["commission", "cost", "sum", "paid", "price", "lesson_cost", "amount"];
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
