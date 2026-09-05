/** Журнал денег. Остаток = сумма строк, не касса Alfa и не paid_till. */

export type PayKind = "income" | "product" | "refund" | "correct";

export const PAY_KINDS: { id: PayKind; name: string }[] = [
  { id: "income", name: "Доход" },
  { id: "product", name: "Продажа товара" },
  { id: "refund", name: "Возврат средств" },
  { id: "correct", name: "Корректировка" },
];

export const OPENING_NOTE = "остаток на диске";

export type PayRow = {
  id: number;
  customerId: number;
  branchId: number;
  kind: PayKind;
  income: number;
  expenditure: number;
  note: string;
  documentDate: string;
  at: string;
};

export function payKindOf(raw?: string | null): PayKind {
  return PAY_KINDS.some((k) => k.id === raw) ? (raw as PayKind) : "income";
}

export function payEffect(kind: PayKind, sum: number, prev: number) {
  const n = Math.abs(Number(sum) || 0);
  if (kind === "refund") return { income: 0, expenditure: n, next: prev - n };
  if (kind === "product") return { income: n, expenditure: 0, next: prev };
  if (kind === "correct") {
    const delta = n - prev;
    return { income: delta > 0 ? delta : 0, expenditure: delta < 0 ? -delta : 0, next: n };
  }
  return { income: n, expenditure: 0, next: prev + n };
}

export function rowDelta(row: Pick<PayRow, "kind" | "income" | "expenditure">) {
  if (row.kind === "product") return 0;
  return Number(row.income || 0) - Number(row.expenditure || 0);
}

export function balanceOf(rows: PayRow[]) {
  let n = 0;
  for (const r of rows) n += rowDelta(r);
  return n;
}

export function displayedBalance(rows: PayRow[], fallback?: number | string) {
  if (rows.length) return balanceOf(rows);
  return Number(fallback || 0) || 0;
}

export function isOpeningRow(row: Pick<PayRow, "note">) {
  return String(row.note || "") === OPENING_NOTE;
}

export function mergePayInbound(pulled: PayRow[], prev: PayRow[] | undefined, holdIds: Iterable<number> = []) {
  const hold = new Set([...holdIds].map(Number).filter((n) => n));
  const map = new Map<string, PayRow>();
  const base = pulled.length ? (prev || []).filter((x) => !isOpeningRow(x)) : prev || [];
  for (const x of base) {
    const lid = Number(x.id) || 0;
    map.set(lid ? `id:${lid}` : `t:${x.at}|${x.income}|${x.expenditure}`, x);
  }
  for (const p of pulled) {
    const lid = Number(p.id) || 0;
    if (lid < 0 || hold.has(lid)) continue;
    const k = lid ? `id:${lid}` : `t:${p.at}|${p.income}|${p.expenditure}`;
    const cur = map.get(k);
    if (cur && (Number(cur.id) < 0 || hold.has(Number(cur.id)))) continue;
    map.set(k, p);
  }
  return [...map.values()].sort((a, b) => String(a.documentDate).localeCompare(String(b.documentDate)) || String(a.at).localeCompare(String(b.at)));
}
