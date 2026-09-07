/** Остаток = оплаты − списания проведённых. Не путать со снимком customer.balance. */

export const ALFA_BRANCH_IDS = [1, 2, 3, 4] as const;

export function lessonWriteoffAmount(item: Record<string, unknown>) {
  const keys = ["commission", "cost", "sum", "paid", "price", "lesson_cost", "amount"];
  for (const k of keys) {
    const n = Number(item[k]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const det = Array.isArray(item.details) ? item.details : [];
  for (const d of det) {
    const n = Number((d as Record<string, unknown>)?.commission || (d as Record<string, unknown>)?.cost || 0);
    if (n > 0) return n;
  }
  return 0;
}

export function ledgerMoney(opts: { paySum: number; writeoffSum: number; snap?: number; complete?: boolean }) {
  const pay = Number(opts.paySum) || 0;
  const wo = Number(opts.writeoffSum) || 0;
  const snap = opts.snap == null || opts.snap === undefined ? Number.NaN : Number(opts.snap);
  if (wo > 0) return pay - wo;
  if (Number.isFinite(snap)) return snap;
  return pay;
}

export function uniqueBranches(primary?: number) {
  const first = Number(primary) || 1;
  return [first, ...ALFA_BRANCH_IDS.filter((b) => b !== first)];
}
