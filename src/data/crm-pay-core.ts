/** Журнал денег. Остаток = сумма строк, не касса Alfa и не paid_till. */

export type PayKind = "income" | "product" | "refund" | "correct";

export const PAY_KINDS: { id: PayKind; name: string }[] = [
  { id: "income", name: "Доход" },
  { id: "product", name: "Продажа товара" },
  { id: "refund", name: "Возврат средств" },
  { id: "correct", name: "Корректировка" },
];

export const OPENING_NOTE = "остаток на диске";

export const PAY_POLL_MAX_PER_HOUR = 4;
export const PAY_POLL_WINDOW_MS = 60 * 60 * 1000;
export const PAY_POLL_LOOKBACK_DAYS = 3;
export const CASH_PAGE_SIZES = [3, 50, 100, 500] as const;
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
  payerName?: string;
  customerName?: string;
  deleted?: boolean;
  payTypeId?: number;
  refundOfGoods?: boolean;
};

export type PayPollStamp = { lastId: number; lastDate: string };

export function payKindOf(raw?: string | null): PayKind {
  return PAY_KINDS.some((k) => k.id === raw) ? (raw as PayKind) : "income";
}

export function payNum(v: unknown) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Alfa PayType: 1 доход, 9 товар (старый 2), 5 возврат (старый 3), 6 корректировка. Тип, не комментарий. */
export function alfaPayTypeIdOf(item: Record<string, unknown>) {
  return Number(item.pay_type_id || item.payTypeId || item.type_id || 0) || 0;
}

export function isGoodsArticle(item: Record<string, unknown>) {
  if (Number(item.commodity_id || item.commodityId)) return true;
  const name = String(item.pay_item || item.pay_item_name || item.item_name || item.article || item.category || "").toLowerCase();
  return /физическ/.test(name) && /товар/.test(name);
}

export function kindFromAlfaPay(item: Record<string, unknown>): PayKind {
  const typeId = alfaPayTypeIdOf(item);
  if (typeId === 1) return "income";
  if (typeId === 9 || typeId === 2) return "product";
  if (typeId === 5 || typeId === 3) return "refund";
  if (typeId === 6) return "correct";
  const itemId = Number(item.pay_item_id || item.payItemId) || 0;
  const income = payNum(item.income);
  if (itemId === 7 || income < 0) return "correct";
  if (Number(item.commodity_id || item.commodityId)) return "product";
  const label = String(item.pay_type || item.type_name || "").toLowerCase();
  if (/коррект/.test(label)) return "correct";
  if (/товар|продаж/.test(label)) return "product";
  if (/возврат/.test(label)) return "refund";
  const expenditure = payNum(item.expenditure);
  if (expenditure && !income) return "refund";
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

export function rowDelta(row: Pick<PayRow, "kind" | "income" | "expenditure" | "deleted" | "refundOfGoods">) {
  if (row.deleted) return 0;
  if (row.kind === "product") return 0;
  if (row.kind === "refund" && row.refundOfGoods) return 0;
  return payNum(row.income) - payNum(row.expenditure);
}

export function refundAbs(row: Pick<PayRow, "income" | "expenditure">) {
  return Math.abs(payNum(row.expenditure) || payNum(row.income));
}

export function goodsNetOf(rows: PayRow[]) {
  let n = 0;
  for (const r of rows) {
    if (r.deleted) continue;
    if (r.kind === "product") n += payNum(r.income);
    if (r.kind === "refund" && r.refundOfGoods) n -= refundAbs(r);
  }
  return n;
}

export function refundGoodsSumOf(rows: PayRow[]) {
  let n = 0;
  for (const r of rows) {
    if (r.deleted || r.kind !== "refund" || !r.refundOfGoods) continue;
    n += refundAbs(r);
  }
  return n;
}

export function corrLooksGoods(row: Pick<PayRow, "kind" | "note">) {
  if (row.kind !== "correct") return false;
  const t = String(row.note || "").toLowerCase();
  return /физическ/.test(t) && /товар/.test(t);
}

/** Возврат товара: статья, тот же item, или тип 9 на ту же |сумму|. Не слово «робот». */
export function markRefundOfGoods(rows: PayRow[]): PayRow[] {
  const live = rows.filter((r) => !r.deleted);
  const products = live.filter((r) => r.kind === "product");
  return rows.map((r) => {
    if (r.deleted || r.kind !== "refund") return r;
    const abs = refundAbs(r);
    const byItem = Boolean(r.payItemId) && products.some((p) => Number(p.payItemId) === Number(r.payItemId));
    const bySum = products.some((p) => Math.abs(payNum(p.income) - abs) <= 1);
    return { ...r, refundOfGoods: Boolean(r.refundOfGoods || byItem || bySum) };
  });
}

export function remainderClose(cash: number, alfa: number, hasRows: boolean) {
  const a = Number(cash) || 0;
  const b = Number(alfa) || 0;
  if (!hasRows && Math.abs(a) <= 1 && Math.abs(b) <= 1) return false;
  return Math.abs(a - b) <= 1;
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

/** Снимок для карточки: extras.balance / шапка. Rest абонемента общий остаток не заменяет. */
export function snapshotBalance(extra?: number | string | null, cttRest?: number, hasCtt?: boolean) {
  if (extra != null && extra !== "") {
    const a = Number(extra);
    if (Number.isFinite(a)) return a;
  }
  const raw = Number(cttRest);
  const rest = Number.isFinite(raw) ? raw : 0;
  if (hasCtt) return rest;
  return rest;
}

export function cttIdOfPay(cttId?: number | null) {
  return (Number(cttId) || 0) > 0 ? Number(cttId) : 0;
}

/** Живые раздельные счета (ctt > 0). Базовый (id 0) не считается. */
export function liveCttOf<T extends { id?: number; archived?: boolean }>(tariffs?: T[] | null) {
  return (tariffs || []).filter((t) => !t.archived && cttIdOfPay(t.id) > 0);
}

export function cttRestSum(tariffs?: { rest?: number; archived?: boolean; id?: number }[] | null) {
  return liveCttOf(tariffs).reduce((n, t) => n + (Number(t.rest) || 0), 0);
}

/** Снимок карточки: шапка extras.balance. Rest живых CTT не подменяет общее число. extras.paid не подставлять. */
export function accountSnapOf(extraBalance?: number | string | null, tariffs?: { rest?: number; archived?: boolean; id?: number }[] | null) {
  const live = liveCttOf(tariffs);
  return snapshotBalance(extraBalance, cttRestSum(live), live.length > 0);
}

/** Сумма строк кассы на счёт: 0 — базовый, иначе cttId абонемента. */
export function paySumForCtt(rows: { kind?: string; income?: number; expenditure?: number; deleted?: boolean; cttId?: number | null; refundOfGoods?: boolean }[], cttId: number) {
  const want = cttIdOfPay(cttId);
  let n = 0;
  for (const r of rows) {
    if (r.deleted) continue;
    if (cttIdOfPay(r.cttId) !== want) continue;
    if (r.kind === "product") continue;
    if (r.kind === "refund" && r.refundOfGoods) continue;
    n += payNum(r.income) - payNum(r.expenditure);
  }
  return n;
}

export function payCountForCtt(rows: { deleted?: boolean; cttId?: number | null }[], cttId: number) {
  const want = cttIdOfPay(cttId);
  let n = 0;
  for (const r of rows) {
    if (r.deleted) continue;
    if (cttIdOfPay(r.cttId) !== want) continue;
    n += 1;
  }
  return n;
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
  const base = pulled.length
    ? (prev || []).filter((x) => !(isOpeningRow(x) || (Number(x.id) < 0 && x.kind === "correct")))
    : prev || [];
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
      payerName: String(p.payerName || cur?.payerName || "") || undefined,
      customerName: String(p.customerName || cur?.customerName || "") || undefined,
      payTypeId: Number(p.payTypeId || cur?.payTypeId) || undefined,
      refundOfGoods: Boolean(p.refundOfGoods || cur?.refundOfGoods) || undefined,
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

export function shiftMskDate(days: number, now = new Date()) {
  const iso = now.toLocaleString("sv-SE", { timeZone: "Europe/Moscow" }).slice(0, 10);
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() + (Number(days) || 0));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Окно автоопроса кассы: последние N дней МСК, формат Alfa yyyy.mm.dd. */
export function payPollLookbackDates(days = PAY_POLL_LOOKBACK_DAYS, now = new Date()) {
  const n = Math.max(1, Number(days) || PAY_POLL_LOOKBACK_DAYS);
  return { date_from: alfaPayIndexDate(shiftMskDate(-n, now)), date_to: alfaPayIndexDate(shiftMskDate(0, now)) };
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

/** ФИО ученика из pay/index. Не путать с payer_name (заказчик). */
export function payCustomerNameOf(item: Record<string, unknown>) {
  const nested = item.customer && typeof item.customer === "object" ? (item.customer as Record<string, unknown>) : null;
  for (const v of [item.customer_name, item.customerName, nested?.name, nested?.fio, nested?.customer_name]) {
    const s = String(v || "").replace(/\s+/g, " ").trim();
    if (s.length >= 2) return s.slice(0, 200);
  }
  return "";
}

/** Найти уже созданный платёж в ответе pay/index, чтобы не слать create повторно. */
export function matchAlfaPayId(
  items: Record<string, unknown>[],
  want: { customerId?: number; income?: number; expenditure?: number; documentDate?: string; note?: string },
) {
  const cid = Number(want.customerId) || 0;
  const date = want.documentDate ? ruDateIso(String(want.documentDate)) : "";
  const note = String(want.note || "").trim();
  const hasIncome = want.income != null;
  const hasExp = want.expenditure != null;
  for (const it of items || []) {
    const id = Number(it.id) || 0;
    if (id <= 0) continue;
    if (cid && payCustomerIdOf(it) !== cid) continue;
    if (hasIncome && Number(it.income || 0) !== Number(want.income)) continue;
    if (hasExp && Number(it.expenditure || 0) !== Number(want.expenditure)) continue;
    if (date && ruDateIso(String(it.document_date || it.date || "")) !== date) continue;
    if (note && String(it.note || "").trim() !== note) continue;
    return id;
  }
  return 0;
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
