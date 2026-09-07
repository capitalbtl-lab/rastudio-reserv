/** Журнал денег. Остаток = сумма строк, не касса Alfa и не paid_till. */

export type PayKind = "income" | "product" | "refund" | "correct";

export const PAY_KINDS: { id: PayKind; name: string }[] = [
  { id: "income", name: "Доход" },
  { id: "product", name: "Продажа товара" },
  { id: "refund", name: "Возврат средств" },
  { id: "correct", name: "Корректировка" },
];

export const OPENING_NOTE = "остаток на диске";

export const PAY_POLL_MAX_PER_HOUR = 10;
export const PAY_POLL_WINDOW_MS = 60 * 60 * 1000;
export const CASH_PAGE_SIZES = [50, 100, 500] as const;
export const PAY_INBOUND_PAGE = 50;
export const PAY_INBOUND_RUN = 4;
export const PAY_STORE_CAP = 40000;
export const PAY_FILL_BRANCHES = [1, 2, 3, 4] as const;

export type PayFillCursor = { bid: number; page: number; done?: boolean };

/** Базовый счет — без абонемента (ctt −1/0). Раздельный — с абонементом (ctt > 0). */
export function payAccountLabel(cttId?: number | null) {
  return (Number(cttId) || 0) > 0 ? "Раздельный счет" : "Базовый счет";
}

export function cashTakeOf(n: unknown) {
  const v = Number(n) || 0;
  return (CASH_PAGE_SIZES as readonly number[]).includes(v) ? v : 50;
}

export function cashPageSlice<T>(items: T[], page: number, size: number) {
  const s = cashTakeOf(size);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / s) || 1);
  const p = Math.min(Math.max(0, Number(page) || 0), pages - 1);
  return { items: items.slice(p * s, p * s + s), page: p, pages, size: s, total };
}

export function payFillStart(branches: readonly number[] = PAY_FILL_BRANCHES): PayFillCursor {
  return { bid: Number(branches[0]) || 1, page: 0 };
}

export function payFillOf(raw?: unknown): PayFillCursor | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as { bid?: unknown; page?: unknown; done?: unknown };
  const bid = Number(o.bid) || 0;
  if (!bid) return undefined;
  return { bid, page: Math.max(0, Number(o.page) || 0), done: Boolean(o.done) || undefined };
}

/** Короткая страница — следующий филиал. После последнего — done. Ошибка вызывающий не двигает. */
export function payFillAdvance(cur: PayFillCursor, lastShort: boolean, branches: readonly number[] = PAY_FILL_BRANCHES): PayFillCursor {
  if (cur.done) return { bid: cur.bid, page: cur.page, done: true };
  if (!lastShort) return { bid: cur.bid, page: cur.page + 1 };
  const ids = branches.map(Number).filter((n) => n);
  const i = ids.indexOf(Number(cur.bid) || 0);
  const next = i >= 0 ? ids[i + 1] : undefined;
  if (!next) return { bid: cur.bid, page: cur.page, done: true };
  return { bid: next, page: 0 };
}

export function payFillNote(cur?: PayFillCursor | null) {
  if (!cur) return "история кассы ещё не выгружалась";
  if (cur.done) return "вся касса на диске";
  return `тянем историю: филиал ${cur.bid}, стр. ${cur.page + 1}`;
}

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
  cttId?: number;
  tariffId?: number;
  payItemId?: number;
  payAccountId?: number;
  locationId?: number;
  managerId?: number;
  payMethod?: string;
  groupId?: number;
  deleted?: boolean;
};

export type PayPollStamp = { lastId: number; lastDate: string };