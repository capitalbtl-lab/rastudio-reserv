import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isLocalId, nextLocalId } from "./crm-local-id";
import {
  balanceOf,
  displayedBalance,
  mergePayInbound,
  pruneWindowCorrections,
  collapsePayRows,
  nextPayStamp,
  payAfterStamp,
  payEffect,
  payKindOf,
  payPollAllowed,
  payPollFirstFill,
  payPollHitsInWindow,
  payPollStampOrEmpty,
  payCustomerIdOf,
  payCustomerNameOf,
  ruDateIso,
  alfaPayIndexDate,
  payFillRange,
  kindFromAlfaPay,
  snapshotBalance,
  payNum,
  paySumForCtt,
  payCountForCtt,
  cttIdOfPay,
  accountSnapOf,
  liveCttOf,
  cttRestSum,
  markRefundOfGoods,
  alfaPayTypeIdOf,
  rememberPayTypes,
  extraPayTypeIds,
  isGoodsArticle,
  OPENING_NOTE,
  isOpeningRow,
  PAY_POLL_MAX_PER_HOUR,
  PAY_INBOUND_PAGE,
  PAY_CUSTOMER_PAGE,
  PAY_INBOUND_RUN,
  PAY_INBOUND_BUDGET_MS,
  PAY_INBOUND_EXTRA_TYPES,
  PAY_STORE_CAP,
  payAccountLabel,
  CASH_PAGE_SIZES,
  cashPageSlice,
  cashTakeOf,
  payFillStart,
  payFillOf,
  payFillAdvance,
  payFillNote,
  payPollLookbackDates,
  type PayKind,
  type PayPollStamp,
  type PayRow,
  type PayFillCursor,
} from "./crm-pay-core";
import { pendingExportIds } from "./crm-export-queue";
import { stampCustomerSync, customerSyncOf } from "./crm-customer-sync";
import { logAdmin } from "./admin-settings";
import { ledgerMoney, uniqueBranches, payCttIdOf, writeoffSumOf } from "./crm-ledger-core";
import { displayPersonName, isPhoneLike } from "./client-display";
import { findDossier } from "./dossiers";
import { parseDossierCtt } from "./pupil-tariffs";

export type { PayKind, PayRow };
export { displayedBalance, balanceOf, payKindOf, payEffect, snapshotBalance, accountSnapOf, liveCttOf, cttRestSum, paySumForCtt, payCountForCtt, cttIdOfPay, OPENING_NOTE, payAccountLabel, CASH_PAGE_SIZES, cashPageSlice, cashTakeOf, payFillNote, payCustomerNameOf };

/** Подпись клиента в кассе: карточка, затем имя из платежа Alfa, иначе «клиент N». */
export function cashPayLabel(row: Pick<PayRow, "customerId" | "customerName">, person?: { name?: string; parent?: string }) {
  const titled = displayPersonName(person?.name, person?.parent);
  if (titled && titled !== "Без имени") return titled;
  const fromPay = String(row.customerName || "").trim();
  if (fromPay && !isPhoneLike(fromPay)) return fromPay;
  const cid = Number(row.customerId) || 0;
  return cid ? `клиент ${cid}` : "клиент";
}

type PayPollState = { hits: string[]; branches: Record<string, PayPollStamp>; lastNote?: string; fill?: PayFillCursor };
type PayFill = { bid: number; page: number; extra?: number; done?: boolean; empty?: boolean; full?: boolean; mode?: "full" | "window"; from?: string; to?: string };
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
      poll: raw.poll && typeof raw.poll === "object"
        ? {
            hits: Array.isArray(raw.poll.hits) ? raw.poll.hits : [],
            branches: raw.poll.branches || {},
            lastNote: raw.poll.lastNote || "",
            fill: payFillOf(raw.poll.fill),
          }
        : emptyPoll(),
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

function save(store: Store, opts?: { keepAll?: boolean }) {
  mem = store;
  index(store);
  mkdirSync(dirname(fileOf()), { recursive: true });
  const poll = store.poll || emptyPoll();
  poll.hits = payPollHitsInWindow(poll.hits).slice(-24);
  const rawItems = store.items || [];
  const items = opts?.keepAll || rawItems.length <= PAY_STORE_CAP ? rawItems : rawItems.slice(-PAY_STORE_CAP);
  writeFileSync(
    fileOf(),
    JSON.stringify({ at: new Date().toISOString(), items, poll, complete: [], payFill: store.payFill || {} }, null, 0),
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
  const payer = String(row.payerName || "").trim();
  if (payer) out.payerName = payer.slice(0, 2000);
  const customerName = String(row.customerName || "").trim();
  if (customerName) out.customerName = customerName.slice(0, 200);
  const payTypeId = Number(row.payTypeId) || 0;
  if (payTypeId) out.payTypeId = payTypeId;
  if (row.refundOfGoods) out.refundOfGoods = true;
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
      payAccountId: Number(x.payAccountId) || 0,
      locationId: Number(x.locationId) || 0,
      managerId: Number(x.managerId) || 0,
      payMethod: String(x.payMethod || ""),
      groupId: Number(x.groupId) || 0,
      payerName: String(x.payerName || ""),
      customerName: String(x.customerName || ""),
    }));
}

let completeMem: { arr: number[] | undefined; set: Set<number> } | null = null;

function completeSetOf(store: { complete?: number[] }) {
  const arr = store.complete;
  if (completeMem && completeMem.arr === arr) return completeMem.set;
  const set = new Set(arr || []);
  completeMem = { arr, set };
  return set;
}

export function payIdComplete(customerId: number) {
  return payFillFull(customerId);
}

export function payFillPending(customerId: number) {
  const id = Number(customerId) || 0;
  if (!id) return false;
  const cur = load().payFill?.[String(id)];
  if (!cur || cur.done) return false;
  return (Number(cur.bid) || 0) > 0;
}

/** done текущего захода. Не А. А = payFill.full. */
export function payFillScanned(customerId: number) {
  const id = Number(customerId) || 0;
  if (!id) return false;
  return Boolean(load().payFill?.[String(id)]?.done);
}

export function payFillEmpty(customerId: number) {
  const id = Number(customerId) || 0;
  if (!id) return false;
  const cur = load().payFill?.[String(id)];
  return Boolean(cur?.full && cur.empty);
}

export function clearPayFill(customerId: number) {
  const id = Number(customerId) || 0;
  if (!id) return;
  const store = load();
  if (!store.payFill?.[String(id)]) return;
  delete store.payFill[String(id)];
  save(store, { keepAll: true });
}

/** Шаг 4 «С нуля»: платежи с диска, complete и курсор. Очередь pay.* не трогает. Alfa не ходим. */
export function resetStudentPayDisk(customerId: number) {
  const id = Number(customerId) || 0;
  if (!id) return { ok: false as const, n: 0 };
  const hold = holdPayIds();
  const kept = paysOf(id).filter((x) => hold.has(Number(x.id)) || Number(x.id) < 0);
  replaceCustomerPays(id, kept, { keepAll: true });
  markPayJournalIncomplete(id);
  clearPayFill(id);
  stampCustomerSync(id, {
    paysAt: "",
    paysRecheckAt: "",
    paysResetAt: new Date().toISOString(),
  });
  return { ok: true as const, n: kept.length };
}

/** А канона 4: payFill.full. complete[] не закон шага 4. */
export function payFillFull(customerId: number) {
  const id = Number(customerId) || 0;
  if (!id) return false;
  return load().payFill?.[String(id)]?.full === true;
}

export function payCustomerFilled(customerId: number) {
  return payFillFull(customerId);
}

export function customerBalance(customerId: number, fallback?: number | string, writeoffSum?: number) {
  const id = Number(customerId) || 0;
  const rows = paysOf(id);
  const paySum = displayedBalance(rows, undefined, true);
  const snap = fallback == null || fallback === "" ? Number.NaN : Number(fallback);
  const liveCtt = liveCttOf(parseDossierCtt(findDossier({ crmId: id })?.extras)).length > 0;
  const pending =
    localPaysPending().some((x) => Number(x.customerId) === id) ||
    pendingExportIds(["pay.create", "pay.update", "pay.delete"]).has(id);
  let wo = writeoffSum;
  if (wo == null || !Number.isFinite(Number(wo))) {
    try {
      const { loadCustomerCalendar } = require("./group-cards") as typeof import("./group-cards");
      wo = writeoffSumOf(loadCustomerCalendar(id), id);
    } catch {
      wo = 0;
    }
  }
  return ledgerMoney({ paySum, writeoffSum: Number(wo) || 0, snap, complete: payCustomerFilled(id), liveCtt, pending });
}

export function isPayJournalComplete(customerId: number) {
  return payFillFull(customerId);
}

export function markPayJournalComplete(customerId: number) {
  const id = Number(customerId) || 0;
  if (!id) return;
  const store = load();
  const prev = store.payFill?.[String(id)];
  const liveN = paysOf(id).filter((x) => !x.deleted).length;
  store.payFill = {
    ...(store.payFill || {}),
    [String(id)]: {
      bid: Number(prev?.bid) || 1,
      page: Number(prev?.page) || 0,
      extra: prev?.extra,
      done: true,
      empty: prev?.empty ?? liveN === 0,
      full: true,
      mode: prev?.mode || "full",
      from: prev?.from,
      to: prev?.to,
    },
  };
  save(store);
}

export function markPayJournalIncomplete(customerId: number) {
  const id = Number(customerId) || 0;
  if (!id) return;
  const store = load();
  const set = new Set(store.complete || []);
  set.delete(id);
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

export type CashPollInfo = { lastNote: string; hits: number; max: number; allowed: boolean; fillDone: boolean; fillNote: string };

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
  const limit = Number.isFinite(cap) && cap > 0 ? Math.min(Math.floor(cap), PAY_STORE_CAP) : PAY_STORE_CAP;
  const hits = store.poll?.hits || [];
  return {
    items: all.slice(0, limit),
    total: all.length,
    poll: {
      lastNote: store.poll?.lastNote || "",
      hits: payPollHitsInWindow(hits).length,
      max: PAY_POLL_MAX_PER_HOUR,
      allowed: payPollAllowed(hits),
      fillDone: Boolean(store.poll?.fill?.done),
      fillNote: payFillNote(store.poll?.fill),
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

/** Свои платежи (id < 0), которые ещё не ушли в Alfa. Не «остаток на диске». */
export function localPaysPending() {
  return load().items.filter((x) => isLocalId(x.id) && !x.deleted && !isOpeningRow(x) && Number(x.customerId) > 0);
}

/** Кнопка «Обновить кассу» и авто: сначала свои платежи в Alfa одним create, потом опрос. */
export async function flushLocalPaysToAlfa() {
  const { enqueueExport, tickExportQueue, pendingExportIds, crmExportSnapshot } = await import("./crm-export-queue");
  const { packAlfaPayCreate, locationIdForBranch } = await import("./crm-pay-alfa");
  const { alfaLinkedNow, wantAlfaPush } = await import("./crm-alfa-link");
  if (!alfaLinkedNow()) return { ok: false as const, local: 0, queued: 0, note: "без Alfa" };
  const local = localPaysPending();
  let queued = 0;
  for (const row of local) {
    if (!wantAlfaPush("pay.create", { customer_id: row.customerId })) continue;
    enqueueExport({
      op: "pay.create",
      branchId: Number(row.branchId) || 1,
      entityId: Number(row.customerId),
      body: packAlfaPayCreate({
        customerId: Number(row.customerId),
        branchId: Number(row.branchId) || 1,
        documentDate: String(row.documentDate || ""),
        income: Number(row.income) || 0,
        expenditure: Number(row.expenditure) || 0,
        note: String(row.note || ""),
        localId: Number(row.id),
        kind: row.kind,
        payAccountId: Number(row.payAccountId) || 1,
        payItemId: Number(row.payItemId) || 0,
        locationId: Number(row.locationId) || locationIdForBranch(Number(row.branchId) || 1),
        managerId: Number(row.managerId) || 0,
        cttId: Number(row.cttId) > 0 ? Number(row.cttId) : 0,
        groupId: Number(row.groupId) || 0,
        payerName: String(row.payerName || ""),
        payMethod: String(row.payMethod || ""),
      }),
    });
    queued += 1;
  }
  if (local.length) {
    for (let i = 0; i < 12; i += 1) {
      if (!crmExportSnapshot().busy) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    await tickExportQueue(8, "pay.create", { lean: true });
  }
  const left = localPaysPending().length;
  const note = local.length ? `касса исходящая: своих ${local.length}, в очередь ${queued}, ждут ${left}` : "касса исходящая: своих нет";
  logAdmin(note, "sync");
  return { ok: true as const, local: local.length, queued, left, note };
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

export function updatePay(payId: number, patch: Partial<PayRow> & { sum?: number }) {
  const id = Number(payId) || 0;
  if (!id) return { ok: false as const, error: "нет id платежа" };
  const store = load();
  const i = store.items.findIndex((x) => Number(x.id) === id);
  if (i < 0) return { ok: false as const, error: "платёж не на диске" };
  const prev = store.items[i];
  const kind = payKindOf(patch.kind || prev.kind);
  const sum = patch.sum != null ? Number(patch.sum) : NaN;
  const fx = Number.isFinite(sum) && sum ? payEffect(kind, sum, 0) : null;
  const next: PayRow = {
    ...prev,
    kind,
    income: fx ? fx.income : patch.income != null ? Number(patch.income) || 0 : prev.income,
    expenditure: fx ? fx.expenditure : patch.expenditure != null ? Number(patch.expenditure) || 0 : prev.expenditure,
    note: patch.note != null ? String(patch.note) : prev.note,
    documentDate: patch.documentDate != null ? String(patch.documentDate) : prev.documentDate,
    ...extrasOf({ ...prev, ...patch, cttId: patch.cttId != null ? patch.cttId : prev.cttId }),
  };
  store.items[i] = next;
  save(store);
  return { ok: true as const, row: next };
}

export async function pushPayToAlfa(payId: number) {
  const id = Number(payId) || 0;
  const row = load().items.find((x) => Number(x.id) === id);
  if (!row || row.deleted) return { ok: false as const, error: "нет платежа" };
  if (Number(row.customerId) <= 0) return { ok: false as const, error: "нет клиента Alfa" };
  const { packAlfaPayCreate, locationIdForBranch } = await import("./crm-pay-alfa");
  const { enqueueExport, tickExportQueue, crmExportSnapshot } = await import("./crm-export-queue");
  const { alfaLinkedNow, wantAlfaPush } = await import("./crm-alfa-link");
  if (!alfaLinkedNow()) return { ok: false as const, error: "нет связи с Alfa" };
  const local = isLocalId(row.id) || row.id < 0;
  const op = local ? ("pay.create" as const) : ("pay.update" as const);
  const body = packAlfaPayCreate({
    customerId: Number(row.customerId),
    branchId: Number(row.branchId) || 1,
    documentDate: String(row.documentDate || ""),
    income: Number(row.income) || 0,
    expenditure: Number(row.expenditure) || 0,
    note: String(row.note || ""),
    localId: Number(row.id),
    kind: row.kind,
    payAccountId: Number(row.payAccountId) || 1,
    payItemId: Number(row.payItemId) || 0,
    locationId: Number(row.locationId) || locationIdForBranch(Number(row.branchId) || 1),
    managerId: Number(row.managerId) || 0,
    cttId: Number(row.cttId) > 0 ? Number(row.cttId) : 0,
    groupId: Number(row.groupId) || 0,
    payerName: String(row.payerName || ""),
    payMethod: String(row.payMethod || ""),
  });
  if (!wantAlfaPush(op, body)) return { ok: false as const, error: "выгрузка кассы выключена в настройках" };
  enqueueExport({
    op,
    branchId: Number(row.branchId) || 1,
    entityId: local ? Number(row.customerId) : Number(row.id),
    body: local ? body : { ...body, id: Number(row.id) },
  });
  for (let i = 0; i < 15; i += 1) {
    if (!crmExportSnapshot().busy) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  const snap = await tickExportQueue(1, op, { lean: true });
  const after = load().items.find((x) => Number(x.id) === id);
  const note = String(snap.lastNote || "");
  if (local && after && (isLocalId(after.id) || after.id < 0)) {
    return { ok: false as const, error: note && !/ ok/.test(note) ? note : "Alfa не приняла платёж. Смотрите текст ошибки — часто статья или счёт.", queued: true, local: true, note };
  }
  if (/канал выгрузки выключен|без Alfa/.test(note)) {
    return { ok: false as const, error: note, queued: true, local, note };
  }
  if (note.includes(`${op} `) && note.includes(":") && !note.includes(" ok")) {
    return { ok: false as const, error: note, queued: true, local, note };
  }
  return { ok: true as const, queued: true, local: Boolean(after && (isLocalId(after.id) || after.id < 0)), note };
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

export function replaceCustomerPays(customerId: number, rows: PayRow[], opts?: { keepAll?: boolean }) {
  const id = Number(customerId) || 0;
  const collapsed = collapsePayRows(rows);
  const prev = paysOf(id);
  const print = (list: PayRow[]) => list.map((x) => `${x.id}|${x.income}|${x.expenditure}|${x.documentDate}|${x.cttId || 0}|${x.deleted ? 1 : 0}`).join(";");
  if (print(prev) === print(collapsed)) return;
  const store = load();
  store.items = [...store.items.filter((x) => Number(x.customerId) !== id), ...collapsed];
  save(store, { keepAll: Boolean(opts?.keepAll) });
}

export function packPay(item: Record<string, unknown>, customerId: number, branchId: number): PayRow | null {
  const id = Number(item.id || 0) || 0;
  let income = payNum(item.income);
  let expenditure = payNum(item.expenditure);
  const rawDate = String(item.document_date || "").trim();
  if (!rawDate || !ruDateIso(rawDate)) return null;
  if (!id && !income && !expenditure) return null;
  const cid = payCustomerIdOf(item, customerId);
  const kind = kindFromAlfaPay(item);
  const typeId = alfaPayTypeIdOf(item);
  return {
    id: id || 0,
    customerId: cid,
    branchId: Number(item.branch_id || branchId) || branchId,
    kind,
    income,
    expenditure,
    note: String(item.note || "").trim(),
    documentDate: rawDate,
    at: new Date().toISOString(),
    ...extrasOf({
      cttId: payCttIdOf(item),
      tariffId: Number(item.tariff_id || item.tariffId) || 0,
      payItemId: Number(item.pay_item_id || item.payItemId) || 0,
      payAccountId: Number(item.pay_account_id || item.payAccountId) || 0,
      locationId: Number(item.location_id || item.locationId) || 0,
      managerId: Number(item.manager_id || item.managerId) || 0,
      groupId: Number(item.group_id || item.groupId) || 0,
      payMethod: String(item.pay_method || item.payMethod || ""),
      payerName: String(item.payer_name || item.payerName || ""),
      customerName: payCustomerNameOf(item),
      payTypeId: typeId,
      refundOfGoods: kind === "refund" && isGoodsArticle(item),
    }),
  };
}

async function stampPayCustomerNames(rows: PayRow[]) {
  const { findDossier, upsertDossier } = await import("./dossiers");
  let last: PayRow | null = null;
  for (const row of rows) {
    const cid = Number(row.customerId) || 0;
    const name = String(row.customerName || "").trim();
    if (!cid || !name) continue;
    const d = findDossier({ crmId: cid });
    if (String(d?.child?.fio || "").trim()) continue;
    last = row;
    upsertDossier({
      crmId: cid,
      branchId: Number(row.branchId) || 1,
      child: name,
      parent: String(row.payerName || ""),
      source: "pay",
      quiet: true,
      persist: false,
    });
  }
  if (last) {
    upsertDossier({
      crmId: Number(last.customerId),
      branchId: Number(last.branchId) || 1,
      child: String(last.customerName || ""),
      source: "pay",
      quiet: true,
    });
  }
}

/** Карточек нет на диске — один customer/index по id. Лимит, чтобы не словить 429. */
export async function hydrateMissingPayCustomers(rows: { customerId?: number; branchId?: number }[], limit = 8) {
  const { findDossier, syncDossierFromCrm } = await import("./dossiers");
  const seen = new Set<number>();
  let n = 0;
  for (const row of rows) {
    if (n >= limit) break;
    const cid = Number(row.customerId) || 0;
    if (!cid || seen.has(cid)) continue;
    seen.add(cid);
    const d = findDossier({ crmId: cid });
    if (String(d?.child?.fio || d?.parent?.fio || "").trim()) continue;
    try {
      await syncDossierFromCrm(cid, Number(row.branchId || d?.branchId) || 1);
      n += 1;
    } catch {
      /* нет карточки или 429 */
    }
  }
  return n;
}

function holdPayIds() {
  return pendingExportIds(["pay.create", "pay.delete"]);
}

/** Платежи Alfa этого клиента дописать на диск. Чужие и без даты не берём. Уже лежащие не дублируем и не стираем. В Alfa не пишем. */
export function absorbAlfaPays(customerId: number, branchId: number, items: Record<string, unknown>[]) {
  const id = Number(customerId) || 0;
  if (!id) return 0;
  const pulled = items
    .map((it) => {
      const explicit = payCustomerIdOf(it, 0);
      if (explicit && explicit !== id) return null;
      return packPay(it, id, branchId);
    })
    .filter((x): x is PayRow => x != null && Number(x.customerId) === id && Number(x.id) > 0);
  if (!pulled.length) return 0;
  const before = new Set(paysOf(id).map((x) => Number(x.id) || 0));
  const merged = markRefundOfGoods(mergePayInbound(pulled, paysOf(id), holdPayIds()));
  replaceCustomerPays(id, merged, { keepAll: true });
  let added = 0;
  for (const row of pulled) if (!before.has(Number(row.id))) added += 1;
  return added;
}

function mergePulledPays(pulled: PayRow[], hold: Iterable<number>) {
  const byCid = new Map<number, PayRow[]>();
  for (const row of pulled) {
    const cid = Number(row.customerId) || 0;
    if (!cid) continue;
    const list = byCid.get(cid) || [];
    list.push(row);
    byCid.set(cid, list);
  }
  for (const [cid, rows] of byCid) {
    replaceCustomerPays(cid, markRefundOfGoods(mergePayInbound(rows, paysOf(cid), hold)));
  }
  return [...byCid.keys()];
}

async function stampPayBalances(_cids: number[]) {
  /* extras.balance не затираем кассой: шапка остаётся шапкой, rest абонемента — строка. */
}

/** Синяя касса: уже дочитанные не начинаем с page 0. Окно дат, done не снимаем. */
async function inboundPayWindow(
  request: (path: string, body: Record<string, unknown>, token: string) => Promise<unknown>,
  token: string,
  branchId: number,
  customerId: number,
  dateFrom: string,
  dateTo: string,
  reset0: string,
) {
  const { crmUnwrapIndex } = await import("./crm-leads-stages");
  const resetGone = () => String(customerSyncOf(customerId).paysResetAt || "") !== reset0;
  const branches = uniqueBranches(branchId);
  const from = alfaPayIndexDate(dateFrom);
  const to = alfaPayIndexDate(dateTo);
  const raw: Record<string, unknown>[] = [];
  const pageSize = PAY_CUSTOMER_PAGE;
  for (const bid of branches) {
    if (resetGone()) return paysOf(customerId);
    try {
      const json = await request(`/v2api/${bid}/pay/index`, {
        page: 0,
        customer_id: customerId,
        date_from: from,
        date_to: to,
      }, token);
      const pack = crmUnwrapIndex(json);
      raw.push(...pack.items.map((it) => ({ ...it, branch_id: Number(it.branch_id || bid) || bid })));
    } catch {
      /* филиал окна — не валим done */
    }
    for (const typeId of extraPayTypeIds()) {
      if (resetGone()) return paysOf(customerId);
      try {
        for (let extraPage = 0; extraPage < 20; extraPage += 1) {
          const extra = await request(`/v2api/${bid}/pay/index`, {
            page: extraPage,
            customer_id: customerId,
            pay_type_id: typeId,
            date_from: from,
            date_to: to,
          }, token);
          const packT = crmUnwrapIndex(extra);
          raw.push(...packT.items.map((it) => ({ ...it, branch_id: Number(it.branch_id || bid) || bid })));
          if (!packT.items.length || packT.items.length < 30) break;
        }
      } catch {
        /* тип окна — не валим done */
      }
    }
  }
  if (resetGone()) return paysOf(customerId);
  const pulled = raw
    .map((it) => {
      const explicit = payCustomerIdOf(it, 0);
      if (explicit && explicit !== customerId) return null;
      return packPay(it, customerId, branchId);
    })
    .filter((x): x is PayRow => x != null && Number(x.customerId) === customerId);
  const hold = holdPayIds();
  const merged0 = markRefundOfGoods(mergePayInbound(pulled, paysOf(customerId), hold));
  const pulledIds = pulled.map((x) => Number(x.id) || 0);
  const merged = pruneWindowCorrections(merged0, pulledIds, { from: dateFrom, to: dateTo }, hold);
  const gone = merged.filter((x, i) => x.deleted && !merged0[i]?.deleted).map((x) => x.id);
  if (gone.length) logAdmin(`Касса окно: cid=${customerId} сняли корректировки ${gone.join(",")}`, "sync");
  replaceCustomerPays(customerId, merged, { keepAll: true });
  const liveN = merged.filter((x) => !x.deleted).length;
  const next = load();
  const prev = next.payFill?.[String(customerId)];
  next.payFill = {
    ...(next.payFill || {}),
    [String(customerId)]: {
        bid: Number(prev?.bid) || branches[0],
        page: Number(prev?.page) || 0,
        extra: prev?.extra,
        done: true,
        empty: liveN === 0,
        full: prev?.full === true || String(dateFrom || "") <= "2015-01-01",
        mode: String(dateFrom || "") <= "2015-01-01" ? "full" : "window",
        from: dateFrom || prev?.from,
        to: dateTo || prev?.to,
      },
  };
  save(next, { keepAll: true });
  return merged;
}

export async function inboundCustomerPays(
  request: (path: string, body: Record<string, unknown>, token: string) => Promise<unknown>,
  token: string,
  branchId: number,
  customerId: number,
  opts?: { force?: boolean; dateFrom?: string; dateTo?: string },
) {
  if (pendingExportIds(["pay.create"]).has(customerId) && !opts?.force && payCustomerFilled(customerId)) return paysOf(customerId);
  const { crmUnwrapIndex } = await import("./crm-leads-stages");
  try {
    const types = crmUnwrapIndex(await request(`/v2api/${branchId}/pay-type/index`, { page: 0 }, token));
    rememberPayTypes(types.items);
  } catch {
    /* справочник типов — без него остаются 1/5/6 */
  }
  const reset0 = String(customerSyncOf(customerId).paysResetAt || "");
  const resetGone = () => String(customerSyncOf(customerId).paysResetAt || "") !== reset0;
  if (opts?.force && !payFillPending(customerId)) {
    return inboundPayWindow(request, token, branchId, customerId, String(opts.dateFrom || ""), String(opts.dateTo || ""), reset0);
  }
  const fillDates = payFillRange(opts?.dateFrom, opts?.dateTo);
  const store = load();
  const branches = uniqueBranches(branchId);
  const raw: Record<string, unknown>[] = [];
  let bidIdx = 0;
  let page = 0;
  const cur = store.payFill?.[String(customerId)];
  const filled = payCustomerFilled(customerId);
  const have = paysOf(customerId).some((x) => !x.deleted);
  if (!opts?.force && filled) return paysOf(customerId);
  if (!opts?.force && payFillScanned(customerId) && !have && !filled) {
    if (store.payFill) delete store.payFill[String(customerId)];
  }
  if (cur && !cur.done) {
    const i = branches.indexOf(cur.bid);
    bidIdx = i >= 0 ? i : 0;
    page = Number(cur.page) || 0;
  }
  let ran = 0;
  let done = false;
  let lastShort = false;
  let failed = false;
  let fillBid = branches[bidIdx] || branches[0];
  let fillPage = page;
  const maxRun = PAY_INBOUND_RUN;
  const started = Date.now();
  const overBudget = () => Date.now() - started > PAY_INBOUND_BUDGET_MS;
  const pageSize = PAY_CUSTOMER_PAGE;
  const extraResume = Boolean(Number(cur?.extra) && !cur?.done);
  if (!extraResume) {
  outer: for (let b = bidIdx; b < branches.length; b += 1) {
    const bid = branches[b];
    let p = b === bidIdx ? page : 0;
    fillBid = bid;
    fillPage = p;
    let received = 0;
    let total = 0;
    for (;;) {
      if (ran >= maxRun || overBudget() || resetGone()) {
        done = false;
        if (!resetGone()) {
        store.payFill = { ...(store.payFill || {}), [String(customerId)]: { bid, page: p } };
        save(store, { keepAll: true });
        }
        break outer;
      }
      try {
        const json = await request(`/v2api/${bid}/pay/index`, {
          page: p,
          customer_id: customerId,
          ...fillDates,
        }, token);
        const pack = crmUnwrapIndex(json);
        console.warn(`pay inbound cid=${customerId} branch=${bid} page=${p} n=${pack.items.length} total=${pack.total ?? "?"}`);
        raw.push(...pack.items.map((it) => ({ ...it, branch_id: Number(it.branch_id || bid) || bid })));
        ran += 1;
        received += Number(pack.count != null ? pack.count : pack.items.length) || pack.items.length;
        if (Number(pack.total) > total) total = Number(pack.total);
        const mine = pack.items.filter((it) => payCustomerIdOf(it, 0) === customerId).length;
        lastShort = !pack.items.length || (total > 0 && received >= total) || (total <= 0 && pack.items.length < 30);
        if (!mine && pack.items.length) lastShort = true;
        fillBid = bid;
        fillPage = p;
        if (lastShort) break;
        p += 1;
      } catch {
        failed = true;
        done = false;
        store.payFill = { ...(store.payFill || {}), [String(customerId)]: { bid, page: p } };
        save(store, { keepAll: true });
        break outer;
      }
    }
    if (!failed && b === branches.length - 1 && lastShort) done = true;
  }
  }
  const extraStart = Number(cur?.extra) || 0;
  if (!failed && (done || extraResume) && !overBudget()) {
    done = false;
    const types = extraPayTypeIds();
    let typeIdx = extraResume ? types.findIndex((n) => n === extraStart) : 0;
    if (typeIdx < 0) typeIdx = 0;
    let extraBidIdx = extraResume ? Math.max(0, branches.indexOf(Number(cur?.bid) || 0)) : 0;
    let extraFinished = true;
    extraLoop: for (let ti = typeIdx; ti < types.length; ti += 1) {
      const typeId = types[ti];
      const b0 = ti === typeIdx ? extraBidIdx : 0;
      for (let bi = b0; bi < branches.length; bi += 1) {
        const extraBid = branches[bi];
        if (ran >= maxRun || overBudget() || resetGone()) {
          extraFinished = false;
          if (!resetGone()) {
          store.payFill = { ...(store.payFill || {}), [String(customerId)]: { bid: extraBid, page: 0, extra: typeId } };
          save(store, { keepAll: true });
          }
          break extraLoop;
        }
        try {
          let extraPage = extraResume && extraBid === (Number(cur?.bid) || extraBid) && typeId === extraStart ? (Number(cur?.page) || 0) : 0;
          for (;;) {
            if (ran >= maxRun || overBudget() || resetGone()) {
              extraFinished = false;
              if (!resetGone()) {
                store.payFill = { ...(store.payFill || {}), [String(customerId)]: { bid: extraBid, page: extraPage, extra: typeId } };
                save(store, { keepAll: true });
              }
              break extraLoop;
            }
            console.warn(`pay inbound cid=${customerId} branch=${extraBid} type=${typeId} page=${extraPage}`);
            const extra = await request(
              `/v2api/${extraBid}/pay/index`,
              { page: extraPage, customer_id: customerId, pay_type_id: typeId, ...fillDates },
              token,
            );
            const packT = crmUnwrapIndex(extra);
            raw.push(...packT.items.map((it) => ({ ...it, branch_id: Number(it.branch_id || extraBid) || extraBid })));
            ran += 1;
            extraPage += 1;
            if (!packT.items.length || packT.items.length < 30) break;
          }
        } catch {
          /* типы филиала — не валим весь прогон */
        }
      }
    }
    if (!failed && extraFinished) done = true;
  }
  if (resetGone()) return paysOf(customerId);
  const pulled = raw
    .map((it) => {
      const explicit = payCustomerIdOf(it, 0);
      if (explicit && explicit !== customerId) return null;
      return packPay(it, customerId, branchId);
    })
    .filter((x): x is PayRow => x != null && Number(x.customerId) === customerId);
  const hold = holdPayIds();
  const merged = markRefundOfGoods(mergePayInbound(pulled, paysOf(customerId), hold));
  replaceCustomerPays(customerId, merged, { keepAll: true });
  await stampPayCustomerNames(pulled).catch(() => null);
  if (failed) throw new Error("Alfa не ответила, нажмите снова");
  if (done) {
    const next = load();
    const prevFill = next.payFill?.[String(customerId)];
    const liveN = merged.filter((x) => !x.deleted).length;
    next.payFill = {
      ...(next.payFill || {}),
      [String(customerId)]: {
        bid: Number(fillBid) || branches[0],
        page: Number(fillPage) || 0,
        extra: prevFill?.extra,
        done: true,
        empty: liveN === 0,
        full: true,
        mode: "full",
        from: prevFill?.from,
        to: prevFill?.to,
      },
    };
    save(next, { keepAll: true });
  }
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
  fill?: PayFillCursor;
};

function payIndexDates(stamp: PayPollStamp): Record<string, string> {
  if (!stamp.lastDate) return {};
  return { date_from: alfaPayIndexDate(stamp.lastDate), date_to: alfaPayIndexDate() };
}

function is429(e: unknown) {
  const s = e instanceof Error ? e.message : String(e);
  return /\b429\b/.test(s) || /too many requests/i.test(s);
}

/** Авто каждые 15 мин — окно дней из настроек, все типы. Кнопка D ещё дочитывает историю. Карточка — inboundCustomerPays. */
export async function pollPaysFromAlfa(opts?: { via?: "auto" | "button" }) {
  const store = load();
  const poll = store.poll || emptyPoll();
  const now = Date.now();
  const { wantAlfaPullChannel, wantAlfaPipe, alfaPayDays, alfaLinkedNow } = await import("./crm-alfa-link");
  const flush = await flushLocalPaysToAlfa();
  if (!alfaLinkedNow() || (opts?.via !== "button" && !wantAlfaPullChannel("pay"))) {
    const note = flush.note || "касса poll: канал кассы выключен";
    poll.lastNote = note;
    store.poll = poll;
    save(store);
    return { ok: false, skipped: "channel", branches: [] as number[], newCount: 0, pages: 0, hit429: false, note, fill: poll.fill };
  }
  const firstFill = payPollFirstFill(poll.branches);
  if (!payPollAllowed(poll.hits, now) && !firstFill && opts?.via !== "button") {
    const note = `касса poll: лимит ${payPollHitsInWindow(poll.hits, now).length}/${PAY_POLL_MAX_PER_HOUR} за час`;
    poll.lastNote = note;
    store.poll = poll;
    save(store);
    logAdmin(note, "sync");
    return { ok: false, skipped: "rate", branches: [] as number[], newCount: 0, pages: 0, hit429: false, note, fill: poll.fill };
  }
  poll.hits = [...payPollHitsInWindow(poll.hits, now), new Date(now).toISOString()];
  const { token, request, dropAlfaAuth, dropAlfaIndex } = await import("./alfacrm");
  if (!wantAlfaPipe("keepToken")) dropAlfaAuth();
  else dropAlfaIndex();
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
  const touched: number[] = [];
  const named: PayRow[] = [];
  const windowDates = payPollLookbackDates(alfaPayDays());
  const windowPages = opts?.via === "button" ? 6 : 4;

  async function pullPages(branchId: number, extra: Record<string, unknown>, take: number) {
    const items: Record<string, unknown>[] = [];
    for (let page = 0; page < take; page += 1) {
      const json = await request(
        `/v2api/${branchId}/pay/index`,
        { page, ...windowDates, ...extra },
        t,
      );
      pages += 1;
      const pack = crmUnwrapIndex(json);
      items.push(...pack.items.map((it) => ({ ...it, branch_id: Number(it.branch_id || branchId) || branchId })));
      if (pack.items.length < PAY_INBOUND_PAGE) break;
    }
    return items;
  }

  for (const branchId of branches) {
    const stamp = payPollStampOrEmpty(poll.branches[String(branchId)]);
    try {
      const extraItems: Record<string, unknown>[] = [];
      for (const typeId of extraPayTypeIds()) {
        extraItems.push(...(await pullPages(branchId, { pay_type_id: typeId }, 2)));
      }
      const raw = [...(await pullPages(branchId, {}, windowPages)), ...extraItems];
      const seen = new Set<number>();
      const unique: Record<string, unknown>[] = [];
      for (const it of raw) {
        const id = Number(it.id || 0);
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        unique.push(it);
      }
      for (const it of unique) {
        const typ = String(it.pay_type_id ?? it.payTypeId ?? "?");
        typeCounts.set(typ, (typeCounts.get(typ) || 0) + 1);
      }
      if (!unique.length) errs.push(`ф${branchId} пусто window=${JSON.stringify(windowDates)}`);
      const pulled = unique.map((it) => packPay(it, payCustomerIdOf(it), branchId)).filter((x): x is PayRow => Boolean(x));
      pulledCount += pulled.length;
      named.push(...pulled);
      const fresh = pulled.filter((x) => payAfterStamp(x, stamp));
      touched.push(...mergePulledPays(pulled, hold));
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
  let fill = payFillOf(poll.fill) || payFillStart();
  if (opts?.via === "button" && !hit429 && !fill.done) {
    let ran = 0;
    while (ran < PAY_INBOUND_RUN && !fill.done) {
      try {
        const json = await request(`/v2api/${fill.bid}/pay/index`, { page: fill.page }, t);
        pages += 1;
        ran += 1;
        const pack = crmUnwrapIndex(json);
        const pulled = pack.items
          .map((it) => packPay(it, payCustomerIdOf(it), fill.bid))
          .filter((x): x is PayRow => Boolean(x));
        pulledCount += pulled.length;
        named.push(...pulled);
        touched.push(...mergePulledPays(pulled, hold));
        fill = payFillAdvance(fill, pack.items.length < PAY_INBOUND_PAGE);
      } catch (e) {
        if (is429(e)) {
          hit429 = true;
          break;
        }
        errs.push(`история ф${fill.bid}стр${fill.page}: ${e instanceof Error ? e.message.slice(0, 60) : String(e).slice(0, 60)}`);
        break;
      }
    }
  }
  await stampPayCustomerNames(named).catch(() => null);
  if (opts?.via === "button" && !hit429) {
    await hydrateMissingPayCustomers(named, 12).catch(() => null);
  }
  await stampPayBalances(touched).catch(() => null);
  poll.fill = fill;
  const types = [...typeCounts.entries()].map(([k, n]) => `${k}×${n}`).join(",") || "нет";
  const note = `${flush.note ? `${flush.note}. ` : ""}${new Date().toLocaleString("sv-SE", { timeZone: "Europe/Moscow" })} Касса inbound: филиалы ${branches.join(",")}, окно ${windowDates.date_from}…${windowDates.date_to}, пришло ${pulledCount}, новых/изменённых ${newCount}, страниц ${pages}${hit429 ? ", 429" : ", без 429"} (${opts?.via || "auto"}), ${payFillNote(fill)}, типы ${types}${errs.length ? `. ${errs.join("; ")}` : ""}`;
  poll.lastNote = note;
  const freshStore = load();
  freshStore.poll = poll;
  save(freshStore);
  logAdmin(note, "sync");
  return { ok: !hit429, branches, newCount, pages, hit429, note, fill } satisfies PayPollResult;
}
