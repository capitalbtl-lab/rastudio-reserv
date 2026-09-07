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

export function payKindOf(raw?: string | null): PayKind {
  return PAY_KINDS.some((k) => k.id === raw) ? (raw as PayKind) : "income";
}

/** Alfa PayType: 1 доход, 6 корректировка (форма pay/update). Сумма корректировки в income, может быть < 0. */
export function kindFromAlfaPay(item: Record<string, unknown>): PayKind {
  const typeId = Number(item.pay_type_id || item.payTypeId || item.type_id || 0) || 0;
  const income = Number(item.income || 0) || 0;
  const expenditure = Number(item.expenditure || 0) || 0;
  const itemId = Number(item.pay_item_id || item.payItemId) || 0;
  if (typeId === 6 || itemId === 7 || income < 0) return "correct";
  if (typeId === 2 || Number(item.commodity_id || item.commodityId)) return "product";
  if (typeId === 3 || typeId === 5) return "refund";
  const label = String(item.pay_type || item.type_name || item.note || "").toLowerCase();
  if (/коррект/.test(label)) return "correct";
  if (/товар|продаж/.test(label)) return "product";
  if (/возврат/.test(label) || (expenditure && !income)) return "refund";
  return "income";
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

export function rowDelta(row: Pick<PayRow, "kind" | "income" | "expenditure" | "deleted">) {
  if (row.deleted) return 0;
  if (row.kind === "product") return 0;
  return Number(row.income || 0) - Number(row.expenditure || 0);
}

export function balanceOf(rows: PayRow[]) {
  let n = 0;
  for (const r of rows) n += rowDelta(r);
  return n;
}

export function displayedBalance(rows: PayRow[], fallback?: number | string, complete?: boolean) {
  const live = rows.filter((x) => !x.deleted);
  const snap = fallback == null || fallback === "" ? Number.NaN : Number(fallback);
  if (!live.length) return Number.isFinite(snap) ? snap : 0;
  const opened = live.some((x) => String(x.note || "") === OPENING_NOTE);
  if (complete || opened) return balanceOf(live);
  if (Number.isFinite(snap)) return snap;
  return balanceOf(live);
}

export function isOpeningRow(row: Pick<PayRow, "note">) {
  return String(row.note || "") === OPENING_NOTE;
}

function payKey(x: Pick<PayRow, "id" | "at" | "income" | "expenditure">) {
  const lid = Number(x.id) || 0;
  return lid ? `id:${lid}` : `t:${x.at}|${x.income}|${x.expenditure}`;
}

/** Очередь create/delete старше входа. Удалённые с диска Alfa не воскрешает. */
export function mergePayInbound(pulled: PayRow[], prev: PayRow[] | undefined, holdIds: Iterable<number> = []) {
  const hold = new Set([...holdIds].map(Number).filter((n) => n));
  const map = new Map<string, PayRow>();
  const base = pulled.length ? (prev || []).filter((x) => !isOpeningRow(x)) : prev || [];
  for (const x of base) {
    map.set(payKey(x), x);
  }
  for (const p of pulled) {
    const lid = Number(p.id) || 0;
    if (lid < 0 || hold.has(lid)) continue;
    const k = payKey(p);
    const cur = map.get(k);
    if (cur && (Number(cur.id) < 0 || hold.has(Number(cur.id)) || cur.deleted)) continue;
    map.set(k, {
      ...(cur || {}),
      ...p,
      cttId: Number(p.cttId || cur?.cttId) || undefined,
      tariffId: Number(p.tariffId || cur?.tariffId) || undefined,
      payItemId: Number(p.payItemId || cur?.payItemId) || undefined,
      payAccountId: Number(p.payAccountId || cur?.payAccountId) || undefined,
      locationId: Number(p.locationId || cur?.locationId) || undefined,
      managerId: Number(p.managerId || cur?.managerId) || undefined,
      groupId: Number(p.groupId || cur?.groupId) || undefined,
      payMethod: String(p.payMethod || cur?.payMethod || "") || undefined,
      deleted: Boolean(cur?.deleted || p.deleted) || undefined,
    });
  }
  return [...map.values()].sort((a, b) => String(a.documentDate).localeCompare(String(b.documentDate)) || String(a.at).localeCompare(String(b.at)));
}

export function ruDateIso(raw: string) {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s.slice(0, 10);
}

/** Alfa pay/index фильтр: yyyy.mm.dd. Не DD.MM.YYYY — это document_date в pay/create. */
export function alfaPayIndexDate(raw?: string) {
  const iso = String(raw || "").trim() ? ruDateIso(String(raw)) : "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  const sv = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Moscow" }).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(sv) ? sv.replace(/-/g, ".") : "";
}

/** Касса UI / pay.create: dd.mm.yyyy. */
export function alfaPayDate(raw?: string) {
  const iso = String(raw || "").trim() ? ruDateIso(String(raw)) : "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  const sv = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Moscow" }).slice(0, 10);
  const n = sv.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return n ? `${n[3]}.${n[2]}.${n[1]}` : "";
}

export function payPollFirstFill(branches: Record<string, PayPollStamp | undefined> | undefined) {
  const b = branches || {};
  return [1, 2, 3, 4].every((id) => !Number(b[String(id)]?.lastId));
}

export function payCustomerIdOf(item: Record<string, unknown>, fallback = 0) {
  const nested = item.customer && typeof item.customer === "object" ? Number((item.customer as { id?: unknown }).id) : 0;
  return Number(item.customer_id || item.customerId || nested || fallback) || 0;
}

export function payPollStampOrEmpty(s?: PayPollStamp | null): PayPollStamp {
  if (!s || !Number(s.lastId)) return { lastId: 0, lastDate: "" };
  return { lastId: Number(s.lastId) || 0, lastDate: ruDateIso(s.lastDate) };
}

export function payAfterStamp(row: { id: number; documentDate: string }, stamp: PayPollStamp) {
  const d = ruDateIso(row.documentDate);
  const s = ruDateIso(stamp.lastDate);
  if (!s) return Number(row.id) > Number(stamp.lastId || 0);
  if (d > s) return true;
  if (d === s && Number(row.id) > Number(stamp.lastId || 0)) return true;
  return false;
}

export function nextPayStamp(rows: { id: number; documentDate: string }[], prev: PayPollStamp): PayPollStamp {
  let lastId = Number(prev.lastId) || 0;
  let lastDate = ruDateIso(prev.lastDate);
  for (const r of rows) {
    const d = ruDateIso(r.documentDate);
    if (!d) continue;
    if (!lastDate || d > lastDate || (d === lastDate && Number(r.id) > lastId)) {
      lastDate = d;
      lastId = Number(r.id) || lastId;
    }
  }
  return { lastId, lastDate };
}

export function payPollHitsInWindow(hits: string[], now = Date.now()) {
  const cut = now - PAY_POLL_WINDOW_MS;
  return (hits || []).filter((t) => {
    const n = Date.parse(t);
    return Number.isFinite(n) && n >= cut;
  });
}

export function payPollAllowed(hits: string[], now = Date.now()) {
  return payPollHitsInWindow(hits, now).length < PAY_POLL_MAX_PER_HOUR;
}