import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isLocalId, nextLocalId } from "./crm-local-id";
import {
  balanceOf,
  displayedBalance,
  mergePayInbound,
  nextPayStamp,
  payAfterStamp,
  payEffect,
  payKindOf,
  payPollAllowed,
  payPollFirstFill,
  payPollHitsInWindow,
  payPollStampOrEmpty,
  payCustomerIdOf,
  ruDateIso,
  alfaPayIndexDate,
  kindFromAlfaPay,
  snapshotBalance,
  OPENING_NOTE,
  PAY_POLL_MAX_PER_HOUR,
  PAY_INBOUND_PAGE,
  PAY_INBOUND_RUN,
  payAccountLabel,
  CASH_PAGE_SIZES,
  cashPageSlice,
  type PayKind,
  type PayPollStamp,
  type PayRow,
} from "./crm-pay-core";
import { pendingExportIds } from "./crm-export-queue";
import { logAdmin } from "./admin-settings";
import { ledgerMoney, uniqueBranches } from "./crm-ledger-core";

export type { PayKind, PayRow };
export { displayedBalance, balanceOf, payKindOf, payEffect, snapshotBalance, OPENING_NOTE, payAccountLabel, CASH_PAGE_SIZES, cashPageSlice };

type PayPollState = { hits: string[]; branches: Record<string, PayPollStamp>; lastNote?: string };
type PayFill = { bid: number; page: number };
type Store = { at: string; items: PayRow[]; poll?: PayPollState; complete?: number[]; payFill?: Record<string, PayFill> };

let mem: Store | null = null;
let memMtime = 0;
let byCustomer: Map<number, PayRow[]> | null = null;

function fileOf() {
  return join(process.cwd(), "storage", "crm-pays.json");
}

function index(store: Store) {
  const m = new Map<number, PayRow[]>();
  for (const x of store.items) {
    const id = Number(x.customerId) || 0;
    if (!id) continue;
    const list = m.get(id);
    if (list) list.push(x);
    else m.set(id, [x]);
  }
  byCustomer = m;
}

function emptyPoll(): PayPollState {
  return { hits: [], branches: {} };
}

function load(): Store {
  try {
    const p = fileOf();
    const mtime = existsSync(p) ? statSync(p).mtimeMs : 0;
    if (mem && memMtime === mtime && byCustomer) return mem;
    const raw = JSON.parse(readFileSync(p, "utf8")) as Store;
    mem = {
      at: String(raw.at || ""),
      items: Array.isArray(raw.items) ? raw.items : [],
      poll: raw.poll && typeof raw.poll === "object" ? { hits: Array.isArray(raw.poll.hits) ? raw.poll.hits : [], branches: raw.poll.branches || {}, lastNote: raw.poll.lastNote || "" } : emptyPoll(),
      complete: Array.isArray(raw.complete) ? raw.complete.map(Number).filter((n) => n) : [],
      payFill: raw.payFill && typeof raw.payFill === "object" ? raw.payFill : {},
    };
    memMtime = mtime;
    index(mem);
    return mem;
  } catch {
    mem = { at: "", items: [], poll: emptyPoll(), complete: [], payFill: {} };
    memMtime = 0;
    byCustomer = new Map();
    return mem;
  }
}

function save(store: Store) {
  mem = store;
  index(store);
  mkdirSync(dirname(fileOf()), { recursive: true });
  const poll = store.poll || emptyPoll();
  poll.hits = payPollHitsInWindow(poll.hits).slice(-24);
  writeFileSync(
    fileOf(),
    JSON.stringify({ at: new Date().toISOString(), items: store.items.slice(-40000), poll, complete: (store.complete || []).slice(-4000), payFill: store.payFill || {} }, null, 0),
    "utf8",
  );
  try {
    memMtime = statSync(fileOf()).mtimeMs;
  } catch {
    memMtime = Date.now();
  }
}

function numOpt(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) && n ? n : undefined;
}

function extrasOf(row: Partial<PayRow>): Partial<PayRow> {
  const out: Partial<PayRow> = {};
  const ctt = numOpt(row.cttId);
  if (ctt) out.cttId = ctt;
  const tariff = numOpt(row.tariffId);
  if (tariff) out.tariffId = tariff;
  const item = numOpt(row.payItemId);
  if (item) out.payItemId = item;
  const acc = numOpt(row.payAccountId);
  if (acc) out.payAccountId = acc;
  const loc = numOpt(row.locationId);
  if (loc) out.locationId = loc;
  const man = numOpt(row.managerId);
  if (man) out.managerId = man;
  const gid = numOpt(row.groupId);
  if (gid) out.groupId = gid;
  const method = String(row.payMethod || "").trim();
  if (method) out.payMethod = method;
  if (row.deleted) out.deleted = true;
  return out;
}

export function paysOf(customerId: number) {
  const id = Number(customerId) || 0;
  if (!id) return [] as PayRow[];
  load();
  return byCustomer?.get(id) || [];
}

export function cardPays(customerId: number) {
  return filterCashPays(paysOf(customerId))
    .map((x) => ({
      id: Number(x.id) || 0,
      kind: String(x.kind || "income"),
      income: Number(x.income) || 0,
      expenditure: Number(x.expenditure) || 0,
      note: String(x.note || ""),
      documentDate: String(x.documentDate || ""),
      branchId: Number(x.branchId) || 0,
      cttId: Number(x.cttId) || 0,
      tariffId: Number(x.tariffId) || 0,
      payItemId: Number(x.payItemId) || 0,
      payMethod: String(x.payMethod || ""),
      groupId: Number(x.groupId) || 0,
    }));
}

export function customerBalance(customerId: number, fallback?: number | string, writeoffSum = 0) {
  const id = Number(customerId) || 0;
  const rows = paysOf(id);
  const complete = Boolean(id && (load().complete || []).includes(id));
  const opened = rows.some((x) => String(x.note || "") === OPENING_NOTE);
  const paySum = displayedBalance(rows, undefined, true);
  const snap = fallback == null || fallback === "" ? Number.NaN : Number(fallback);
  return ledgerMoney({ paySum, writeoffSum, snap, complete: opened || complete });
}

export function isPayJournalComplete(customerId: number) {
  const id = Number(customerId) || 0;
  return Boolean(id && (load().complete || []).includes(id));
}

export function markPayJournalComplete(customerId: number) {
  const id = Number(customerId) || 0;
  if (!id) return;
  const store = load();
  const set = new Set(store.complete || []);
  if (set.has(id)) return;
  set.add(id);
  store.complete = [...set];
  save(store);
}

export type CashListOpts = {
  branchId?: number;
  kind?: string;
  customerId?: number;
  includeDeleted?: boolean;
  limit?: number;
};

export type CashPollInfo = { lastNote: string; hits: number; max: number; allowed: boolean };

/** Диск. Alfa не ходим. Новые сверху. */
export function filterCashPays(items: PayRow[], opts: CashListOpts = {}) {
  const branchId = Number(opts.branchId) || 0;
  const kind = String(opts.kind || "").trim();
  const customerId = Number(opts.customerId) || 0;
  const includeDeleted = Boolean(opts.includeDeleted);
  const out = items.filter((x) => {
    if (!includeDeleted && x.deleted) return false;
    if (branchId && Number(x.branchId) !== branchId) return false;
    if (kind && payKindOf(x.kind) !== payKindOf(kind)) return false;
    if (customerId && Number(x.customerId) !== customerId) return false;
    return true;
  });
  out.sort(
    (a, b) =>
      ruDateIso(b.documentDate).localeCompare(ruDateIso(a.documentDate)) ||
      String(b.at).localeCompare(String(a.at)) ||
      Number(b.id) - Number(a.id),
  );
  return out;
}

export function listCashPays(opts: CashListOpts = {}) {
  const store = load();
  const all = filterCashPays(store.items, opts);
  const cap = Number(opts.limit);
  const limit = Number.isFinite(cap) && cap > 0 ? Math.min(Math.floor(cap), 8000) : 8000;
  const hits = store.poll?.hits || [];
  return {
    items: all.slice(0, limit),
    total: all.length,
    poll: {
      lastNote: store.poll?.lastNote || "",
      hits: payPollHitsInWindow(hits).length,
      max: PAY_POLL_MAX_PER_HOUR,
      allowed: payPollAllowed(hits),
    } satisfies CashPollInfo,
  };
}

function ruToday() {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
}

export function appendPay(row: Omit<PayRow, "id" | "at"> & { id?: number; at?: string }) {
  const store = load();
  const used = store.items.map((x) => Number(x.id) || 0);
  const id = Number(row.id) || nextLocalId(used);
  const next: PayRow = {
    id,
    customerId: Number(row.customerId) || 0,
    branchId: Number(row.branchId) || 1,
    kind: payKindOf(row.kind),
    income: Number(row.income) || 0,
    expenditure: Number(row.expenditure) || 0,
    note: String(row.note || ""),
    documentDate: String(row.documentDate || ruToday()),
    at: row.at || new Date().toISOString(),
    ...extrasOf(row),
  };
  store.items.push(next);
  save(store);
  return next;
}

export function ensureOpening(customerId: number, branchId: number, fallback?: number | string) {
  const rows = paysOf(customerId);
  if (rows.length) return rows;
  const open = Number(fallback || 0) || 0;
  if (!open) return rows;
  const fx = payEffect("correct", open, 0);
  appendPay({
    customerId,
    branchId,
    kind: "correct",
    income: fx.income,
    expenditure: fx.expenditure,
    note: OPENING_NOTE,
    documentDate: ruToday(),
  });
  return paysOf(customerId);
}

export function applyCreatedPay(localId: number, crmId: number) {
  const from = Number(localId) || 0;
  const to = Number(crmId) || 0;
  if (!from || !to || from === to) return;
  const store = load();
  let n = 0;
  store.items = store.items.map((x) => {
    if (Number(x.id) !== from) return x;
    n += 1;
    return { ...x, id: to };
  });
  if (n) save(store);
}

export function applyDeletedPay(payId: number) {
  const id = Number(payId) || 0;
  if (!id) return;
  const store = load();
  const next = store.items.filter((x) => Number(x.id) !== id);
  if (next.length === store.items.length) return;
  store.items = next;
  save(store);
}

export function deletePay(payId: number) {
  const id = Number(payId) || 0;
  if (!id) return { ok: false as const, error: "нет id платежа" };
  const store = load();
  const row = store.items.find((x) => Number(x.id) === id);
  if (!row) return { ok: false as const, error: "платёж не на диске" };
  if (isLocalId(id) || id < 0) {
    store.items = store.items.filter((x) => Number(x.id) !== id);
    save(store);
  } else {
    store.items = store.items.map((x) => (Number(x.id) === id ? { ...x, deleted: true } : x));
    save(store);
  }
  void import("./crm-export-queue").then(({ enqueueExport }) => {
    enqueueExport({
      op: "pay.delete",
      branchId: Number(row.branchId) || 1,
      entityId: id,
      body: { id, customer_id: Number(row.customerId) || 0, localId: id },
    });
  });
  return { ok: true as const, local: isLocalId(id) || id < 0 };
}

export function replaceCustomerPays(customerId: number, rows: PayRow[]) {
  const id = Number(customerId) || 0;
  const prev = paysOf(id);
  const print = (list: PayRow[]) => list.map((x) => `${x.id}|${x.income}|${x.expenditure}|${x.documentDate}|${x.cttId || 0}|${x.deleted ? 1 : 0}`).join(";");
  if (print(prev) === print(rows)) return;
  const store = load();
  store.items = [...store.items.filter((x) => Number(x.customerId) !== id), ...rows];
  save(store);
}

export function packPay(item: Record<string, unknown>, customerId: number, branchId: number): PayRow | null {
  const id = Number(item.id || 0) || 0;
  const income = Number(item.income || 0) || 0;
  const expenditure = Number(item.expenditure || 0) || 0;
  if (!id && !income && !expenditure) return null;
  const cid = payCustomerIdOf(item, customerId);
  const kind = kindFromAlfaPay(item);
  return {
    id: id || 0,
    customerId: cid,
    branchId: Number(item.branch_id || branchId) || branchId,
    kind,
    income,
    expenditure,
    note: String(item.note || "").trim(),
    documentDate: String(item.document_date || item.date || ruToday()),
    at: new Date().toISOString(),
    ...extrasOf({
      cttId: Number(item.ctt_id || item.cttId) || 0,
      tariffId: Number(item.tariff_id || item.tariffId) || 0,
      payItemId: Number(item.pay_item_id || item.payItemId) || 0,
      payAccountId: Number(item.pay_account_id || item.payAccountId) || 0,
      locationId: Number(item.location_id || item.locationId) || 0,
      managerId: Number(item.manager_id || item.managerId) || 0,
      groupId: Number(item.group_id || item.groupId) || 0,
      payMethod: String(item.pay_method || item.payMethod || ""),
    }),
  };
}

function holdPayIds() {
  return pendingExportIds(["pay.create", "pay.delete"]);
}

export async function inboundCustomerPays(
  request: (path: string, body: Record<string, unknown>, token: string) => Promise<unknown>,
  token: string,
  branchId: number,
  customerId: number,
) {
  if (pendingExportIds(["pay.create"]).has(customerId)) return paysOf(customerId);
  const { crmUnwrapIndex } = await import("./crm-leads-stages");
  const raw: Record<string, unknown>[] = [];
  let done = true;
  for (const bid of uniqueBranches(branchId)) {
    let branchDone = false;
    for (let page = 0; page < 10; page += 1) {
      try {
        const json = await request(`/v2api/${bid}/pay/index`, { page, pageSize: 50, customer_id: customerId }, token);
        const pack = crmUnwrapIndex(json);
        raw.push(...pack.items.map((it) => ({ ...it, branch_id: Number(it.branch_id || bid) || bid })));
        if (pack.items.length < 50) {
          branchDone = true;
          break;
        }
      } catch {
        branchDone = page === 0;
        break;
      }
    }
    if (!branchDone) done = false;
  }
  const pulled = raw.map((it) => packPay(it, customerId, branchId)).filter((x): x is PayRow => Boolean(x));
  const hold = holdPayIds();
  const merged = mergePayInbound(pulled, paysOf(customerId), hold);
  replaceCustomerPays(customerId, merged);
  if (done) markPayJournalComplete(customerId);
  return merged;
}

export type PayPollResult = {
  ok: boolean;
  skipped?: string;
  branches: number[];
  newCount: number;
  pages: number;
  hit429: boolean;
  note: string;
};

function payIndexDates(stamp: PayPollStamp): Record<string, string> {
  if (!stamp.lastDate) return {};
  return { date_from: alfaPayIndexDate(stamp.lastDate), date_to: alfaPayIndexDate() };
}

function is429(e: unknown) {
  const s = e instanceof Error ? e.message : String(e);
  return /\b429\b/.test(s) || /too many requests/i.test(s);
}

/** Авто и кнопка D кассы. Карточка одного клиента — inboundCustomerPays, не сюда. */
export async function pollPaysFromAlfa(opts?: { via?: "auto" | "button" }) {
  const store = load();
  const poll = store.poll || emptyPoll();
  const now = Date.now();
  const firstFill = payPollFirstFill(poll.branches);
  if (!payPollAllowed(poll.hits, now) && !firstFill && opts?.via !== "button") {
    const note = `касса poll: лимит ${payPollHitsInWindow(poll.hits, now).length}/10 за час`;
    poll.lastNote = note;
    store.poll = poll;
    save(store);
    logAdmin(note, "sync");
    return { ok: false, skipped: "rate", branches: [] as number[], newCount: 0, pages: 0, hit429: false, note };
  }
  poll.hits = [...payPollHitsInWindow(poll.hits, now), new Date(now).toISOString()];
  const { token, request, dropAlfaAuth } = await import("./alfacrm");
  dropAlfaAuth();
  const { crmUnwrapIndex } = await import("./crm-leads-stages");
  const t = await token();
  const branches = [1, 2, 3, 4];
  let newCount = 0;
  let pulledCount = 0;
  let pages = 0;
  let hit429 = false;
  const errs: string[] = [];
  const hold = holdPayIds();
  const typeCounts = new Map<string, number>();
  for (const branchId of branches) {
    const stamp = payPollStampOrEmpty(poll.branches[String(branchId)]);
    try {
      const dates = payIndexDates(stamp);
      const firstBody: Record<string, unknown> = { page: 0, ...dates };
      let lastBody = firstBody;
      let json: unknown = await request(`/v2api/${branchId}/pay/index`, firstBody, t);
      pages += 1;
      let pack = crmUnwrapIndex(json);
      if (!pack.items.length) {
        lastBody = { page: 0 };
        json = await request(`/v2api/${branchId}/pay/index`, lastBody, t);
        pages += 1;
        pack = crmUnwrapIndex(json);
      }
      if (opts?.via === "button" || firstFill) {
        try {
          const corrJson = await request(`/v2api/${branchId}/pay/index`, { page: 0, pay_type_id: 6 }, t);
          pages += 1;
          const extra = crmUnwrapIndex(corrJson).items;
          if (extra.length) pack = { ...pack, items: [...pack.items, ...extra] };
        } catch (e) {
          if (is429(e)) throw e;
        }
      }
      for (const it of pack.items) {
        const t = String(it.pay_type_id ?? it.payTypeId ?? "?");
        typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
      }
      if (!pack.items.length) {
        const raw = JSON.stringify(json).slice(0, 120);
        errs.push(`ф${branchId} пусто body=${JSON.stringify(lastBody)} total=${pack.total ?? "?"} ${raw}`);
      }
      const pulled = pack.items
        .map((it) => packPay(it, payCustomerIdOf(it), branchId))
        .filter((x): x is PayRow => Boolean(x));
      pulledCount += pulled.length;
      const fresh = pulled.filter((x) => payAfterStamp(x, stamp));
      const byCid = new Map<number, PayRow[]>();
      for (const row of pulled) {
        const list = byCid.get(row.customerId) || [];
        list.push(row);
        byCid.set(row.customerId, list);
      }
      for (const [cid, rows] of byCid) {
        const merged = mergePayInbound(rows, paysOf(cid), hold);
        replaceCustomerPays(cid, merged);
      }
      newCount += fresh.length;
      if (fresh.length) poll.branches[String(branchId)] = nextPayStamp(fresh, stamp);
      else poll.branches[String(branchId)] = stamp;
    } catch (e) {
      if (is429(e)) {
        hit429 = true;
        break;
      }
      errs.push(`ф${branchId}: ${e instanceof Error ? e.message.slice(0, 80) : String(e).slice(0, 80)}`);
    }
  }
  const types = [...typeCounts.entries()].map(([k, n]) => `${k}×${n}`).join(",") || "нет";
  const note = `${new Date().toLocaleString("sv-SE", { timeZone: "Europe/Moscow" })} Касса inbound: филиалы ${branches.join(",")}, пришло ${pulledCount}, новых ${newCount}, страниц ${pages}${hit429 ? ", 429" : ", без 429"} (${opts?.via || "auto"}), типы ${types}${errs.length ? `. ${errs.join("; ")}` : ""}`;
  poll.lastNote = note;
  const freshStore = load();
  freshStore.poll = poll;
  save(freshStore);
  logAdmin(note, "sync");
  return { ok: !hit429, branches, newCount, pages, hit429, note } satisfies PayPollResult;
}