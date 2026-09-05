import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { nextLocalId } from "./crm-local-id";
import {
  balanceOf,
  displayedBalance,
  mergePayInbound,
  payEffect,
  payKindOf,
  OPENING_NOTE,
  type PayKind,
  type PayRow,
} from "./crm-pay-core";
import { pendingExportIds } from "./crm-export-queue";

export type { PayKind, PayRow };
export { displayedBalance, balanceOf, payKindOf, payEffect, OPENING_NOTE };

type Store = { at: string; items: PayRow[] };

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

function load(): Store {
  try {
    const p = fileOf();
    const mtime = existsSync(p) ? statSync(p).mtimeMs : 0;
    if (mem && memMtime === mtime && byCustomer) return mem;
    const raw = JSON.parse(readFileSync(p, "utf8")) as Store;
    mem = { at: String(raw.at || ""), items: Array.isArray(raw.items) ? raw.items : [] };
    memMtime = mtime;
    index(mem);
    return mem;
  } catch {
    mem = { at: "", items: [] };
    memMtime = 0;
    byCustomer = new Map();
    return mem;
  }
}

function save(store: Store) {
  mem = store;
  index(store);
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify({ at: new Date().toISOString(), items: store.items.slice(-8000) }, null, 0), "utf8");
  try {
    memMtime = statSync(fileOf()).mtimeMs;
  } catch {
    memMtime = Date.now();
  }
}

export function paysOf(customerId: number) {
  const id = Number(customerId) || 0;
  if (!id) return [] as PayRow[];
  load();
  return byCustomer?.get(id) || [];
}

export function cardPays(customerId: number) {
  return paysOf(customerId)
    .slice(-12)
    .map((x) => ({
      id: Number(x.id) || 0,
      kind: String(x.kind || "income"),
      income: Number(x.income) || 0,
      expenditure: Number(x.expenditure) || 0,
      note: String(x.note || ""),
      documentDate: String(x.documentDate || ""),
    }));
}

export function customerBalance(customerId: number, fallback?: number | string) {
  return displayedBalance(paysOf(customerId), fallback);
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

export function replaceCustomerPays(customerId: number, rows: PayRow[]) {
  const id = Number(customerId) || 0;
  const prev = paysOf(id);
  const print = (list: PayRow[]) => list.map((x) => `${x.id}|${x.income}|${x.expenditure}|${x.documentDate}`).join(";");
  if (print(prev) === print(rows)) return;
  const store = load();
  store.items = [...store.items.filter((x) => Number(x.customerId) !== id), ...rows];
  save(store);
}

function packPay(item: Record<string, unknown>, customerId: number, branchId: number): PayRow | null {
  const id = Number(item.id || 0) || 0;
  const income = Number(item.income || 0) || 0;
  const expenditure = Number(item.expenditure || 0) || 0;
  if (!id && !income && !expenditure) return null;
  const kind: PayKind = expenditure && !income ? "refund" : "income";
  return {
    id: id || 0,
    customerId,
    branchId,
    kind,
    income,
    expenditure,
    note: String(item.note || "").trim(),
    documentDate: String(item.document_date || item.date || ruToday()),
    at: new Date().toISOString(),
  };
}

export async function inboundCustomerPays(
  request: (path: string, body: Record<string, unknown>, token: string) => Promise<unknown>,
  token: string,
  branchId: number,
  customerId: number,
) {
  if (pendingExportIds(["pay.create"]).has(customerId)) return paysOf(customerId);
  const json = (await request(`/v2api/${branchId}/pay/index`, { page: 0, pageSize: 50, customer_id: customerId }, token).catch(
    () => ({ items: [] }),
  )) as { items?: Record<string, unknown>[] };
  const pulled = (json.items || [])
    .map((it) => packPay(it, customerId, branchId))
    .filter((x): x is PayRow => Boolean(x));
  const hold = pendingExportIds(["pay.create"]);
  const merged = mergePayInbound(pulled, paysOf(customerId), hold);
  replaceCustomerPays(customerId, merged);
  return merged;
}
