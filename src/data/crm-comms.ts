import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { nextLocalId } from "./crm-local-id";
import {
  asCustomerComm,
  commChannelOf,
  commsFingerprint,
  mergeCommsInbound,
  packAlfaComm,
  type DiskComm,
} from "./crm-comms-core";
import type { CrmActorId } from "./crm-actors";

export type { DiskComm };
export { asCustomerComm, commChannelOf, commsPrompt } from "./crm-comms-core";

type Store = { at: string; items: DiskComm[] };

let mem: Store | null = null;
let memMtime = 0;
let byCustomer: Map<number, DiskComm[]> | null = null;

function fileOf() {
  return join(process.cwd(), "storage", "crm-comms.json");
}

function index(store: Store) {
  const m = new Map<number, DiskComm[]>();
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
  writeFileSync(fileOf(), JSON.stringify({ at: new Date().toISOString(), items: store.items.slice(-12000) }, null, 0), "utf8");
  try {
    memMtime = statSync(fileOf()).mtimeMs;
  } catch {
    memMtime = Date.now();
  }
}

export function commsOf(customerId: number) {
  const id = Number(customerId) || 0;
  if (!id) return [] as DiskComm[];
  load();
  return byCustomer?.get(id) || [];
}

export function appendComms(rows: (Omit<DiskComm, "id" | "at"> & { id?: number; at?: string })[]) {
  const store = load();
  const used = store.items.map((x) => Number(x.id) || 0);
  const out: DiskComm[] = [];
  let added = 0;
  for (const row of rows) {
    const text = String(row.text || "").trim().slice(0, 4000);
    const customerId = Number(row.customerId) || 0;
    if (!customerId || !text) continue;
    const prev = byCustomer?.get(customerId);
    const last = (prev && prev[prev.length - 1]) || out.filter((x) => x.customerId === customerId).pop();
    if (last && last.text === text && Date.parse(last.at || "") > Date.now() - 120_000) {
      out.push(last);
      continue;
    }
    const id = Number(row.id) || nextLocalId(used);
    used.push(id);
    const next: DiskComm = {
      id,
      customerId,
      branchId: Number(row.branchId) || 1,
      channel: commChannelOf(row.channel),
      actor: row.actor || "human",
      who: String(row.who || "").slice(0, 80),
      text,
      incoming: Boolean(row.incoming),
      at: row.at || new Date().toISOString(),
    };
    store.items.push(next);
    out.push(next);
    added += 1;
  }
  if (added) save(store);
  return out;
}

export function appendComm(row: Omit<DiskComm, "id" | "at"> & { id?: number; at?: string }) {
  return appendComms([row])[0] || null;
}

export function applyCreatedCommCustomer(localId: number, crmId: number) {
  const from = Number(localId) || 0;
  const to = Number(crmId) || 0;
  if (!from || !to || from === to) return;
  const store = load();
  let n = 0;
  store.items = store.items.map((x) => {
    if (Number(x.customerId) !== from) return x;
    n += 1;
    return { ...x, customerId: to };
  });
  if (n) save(store);
}

export function replaceCustomerComms(customerId: number, rows: DiskComm[]) {
  const id = Number(customerId) || 0;
  const prev = commsOf(id);
  if (commsFingerprint(prev) === commsFingerprint(rows)) return;
  const store = load();
  store.items = [...store.items.filter((x) => Number(x.customerId) !== id), ...rows];
  save(store);
}

export async function inboundCustomerComms(
  request: (path: string, body: Record<string, unknown>, token: string) => Promise<unknown>,
  token: string,
  branchId: number,
  customerId: number,
) {
  const tries: [string, Record<string, unknown>][] = [
    [`/v2api/${branchId}/communication/index`, { page: 0, pageSize: 40, class: "Customer", related_id: customerId }],
    [`/v2api/${branchId}/communication/index`, { page: 0, pageSize: 40, customer_id: customerId }],
  ];
  let pulled: DiskComm[] = [];
  for (let i = 0; i < tries.length; i++) {
    const [path, body] = tries[i];
    const json = (await request(path, body, token).catch(() => null)) as { items?: Record<string, unknown>[] } | null;
    if (!json) continue;
    pulled = (json.items || []).map((it) => packAlfaComm(it, customerId, branchId)).filter((x): x is DiskComm => Boolean(x));
    if (pulled.length || i === tries.length - 1) break;
  }
  const merged = mergeCommsInbound(pulled, commsOf(customerId));
  replaceCustomerComms(customerId, merged);
  return merged;
}

export function rememberConsultantTurn(opts: {
  customerId?: number;
  branchId?: number;
  channel?: string;
  phone?: string;
  parent?: string;
  incoming?: string;
  reply?: string;
  actor?: CrmActorId;
}) {
  const incoming = String(opts.incoming || "").trim();
  const reply = String(opts.reply || "").trim();
  if (!incoming && !reply) return;
  const run = (customerId: number, branchId: number, parent: string) => {
    if (!customerId) return;
    const channel = commChannelOf(opts.channel || "site");
    const actor = opts.actor || "consultant";
    const rows: (Omit<DiskComm, "id" | "at">)[] = [];
    if (incoming) {
      rows.push({
        customerId,
        branchId,
        channel,
        actor,
        who: parent || "родитель",
        text: incoming,
        incoming: true,
      });
    }
    if (reply) {
      rows.push({
        customerId,
        branchId,
        channel,
        actor,
        who: "консультант",
        text: reply,
        incoming: false,
      });
    }
    appendComms(rows);
  };
  const known = Number(opts.customerId) || 0;
  if (known) {
    run(known, Number(opts.branchId) || 1, String(opts.parent || ""));
    return;
  }
  const phone = String(opts.phone || "").replace(/\D/g, "");
  if (phone.length < 10) return;
  return import("./dossiers")
    .then(({ findDossier }) => {
      const d = findDossier({ phone });
      run(Number(d?.crmId) || 0, Number(d?.branchId || opts.branchId) || 1, String(opts.parent || d?.parent.fio || ""));
    })
    .catch(() => null);
}
