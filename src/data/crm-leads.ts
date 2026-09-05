import { request, token as alfaToken, pagedIndex } from "./alfacrm";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CRM_BRANCH } from "./ids";
import {
  LEAD_PIPELINE as PIPELINE,
  LEAD_STAGES,
  colorPatch,
  mapCrmLeadStatuses,
  mergeStages,
  leadStatusSortForm,
  leadStatusSortPayload,
  parseCrmStageOrder,
  applyStageOrder,
  pinUnsorted,
  crmBranchIds,
  crmLeadStatusId,
  LEAD_INDEX_QUERY,
  leadMoveFields,
  isCrmLeadRecord,
  parseCrmLeadBoardPayload,
  parseCrmLeadBoard,
  parseCrmBoardColumnUrls,
  applyCrmBoardRows,
  applyLeadDelta,
  leadDeltaDrops,
  crmUpdatedAtFrom,
  mergeBranchLeadCards,
  filterLeadCards,
  reorderLeads,
  leadYears,
  leadAgeBand,
  leadCardFromView,
  type LeadStage,
  type LeadCard,
} from "./crm-leads-stages";
import { crmHost, crmWebLogin, csrfOf, mergeCookies, setCookieList } from "./crm-web";

export type { LeadStage, LeadCard } from "./crm-leads-stages";
export {
  CRM_STAGE_COLORS,
  LEAD_STAGES,
  colorPatch,
  leadStatusSortPayload,
  mapCrmLeadStatuses,
  mergeStages,
  orderedStages,
  parseCrmStageOrder,
  applyStageOrder,
  pinUnsorted,
  crmBranchIds,
  crmLeadStatusId,
  leadVisibleInBranch,
  stageOf,
  LEAD_INDEX_QUERY,
  leadMoveFields,
  filterLeadCards,
  reorderLeads,
  leadYears,
  leadAgeBand,
  mergeBranchLeadCards,
  isCrmLeadRecord,
  leadCardFromView,
} from "./crm-leads-stages";

type Bag = { at: number; stages: LeadStage[]; items: LeadCard[]; note?: string };
const g = globalThis as { __raLeads?: Map<string, Bag> };

function fileOf() {
  return join(process.cwd(), "storage", "crm-leads-board.json");
}

function hydrateLeads() {
  try {
    if (!existsSync(fileOf())) return;
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as { keys?: Record<string, Bag> };
    for (const [k, v] of Object.entries(raw.keys || {})) {
      if (Array.isArray(v?.items) && v.items.length) g.__raLeads!.set(k, v);
    }
  } catch {
    /* диск */
  }
}

function persistLeads() {
  try {
    mkdirSync(dirname(fileOf()), { recursive: true });
    const keys: Record<string, Bag> = {};
    for (const [k, v] of bag()) keys[k] = v;
    writeFileSync(fileOf(), JSON.stringify({ keys }), "utf8");
  } catch {
    /* диск */
  }
}

function bag() {
  if (!g.__raLeads) {
    g.__raLeads = new Map();
    hydrateLeads();
  }
  return g.__raLeads;
}

function localStageId() {
  const used = new Set<number>();
  for (const v of bag().values()) for (const s of v.stages) used.add(s.id);
  let id = -Math.abs((Date.now() % 1_000_000_000) || 1);
  while (used.has(id) || id === 0) id -= 1;
  return id;
}

export function cachedLeadBoard(branchId = 0) {
  const hit = bag().get(String(branchId || 0)) || bag().get("0");
  if (hit) return hit;
  const empty: Bag = { at: Date.now(), stages: LEAD_STAGES.map((s) => ({ ...s })), items: [] };
  bag().set("0", empty);
  persistLeads();
  return empty;
}

function touchStages(mut: (stages: LeadStage[], items: LeadCard[]) => void) {
  const maps = bag();
  if (!maps.size) maps.set("0", { at: Date.now(), stages: LEAD_STAGES.map((s) => ({ ...s })), items: [] });
  for (const v of maps.values()) {
    mut(v.stages, v.items);
    v.at = Date.now();
  }
  persistLeads();
}

/** Этап воронки на диск сразу. Alfa — очередь lead-status.create. */
export function diskCreateLeadStage(name: string, color = "#2563eb") {
  const title = name.trim() || "Новый этап";
  const id = localStageId();
  let made: LeadStage = { id, name: title, color, pipelineId: PIPELINE };
  touchStages((stages) => {
    if (stages.some((s) => s.id === id)) return;
    const maxW = Math.max(0, ...stages.map((s) => Number(s.weight) || 0));
    made = { ...made, weight: maxW + 1 };
    stages.push(made);
  });
  return made;
}

export function diskSaveLeadStage(id: number, patch: { name?: string; color?: string }) {
  if (!Number.isFinite(id)) return;
  touchStages((stages) => {
    const hit = stages.find((s) => s.id === id);
    if (!hit) return;
    if (patch.name) hit.name = patch.name.trim();
    if (patch.color) hit.color = patch.color;
  });
}

export function diskDeleteLeadStage(id: number) {
  if (id === 0) throw new Error("Системный столбец «Не разобрано» нельзя удалить.");
  touchStages((stages, items) => {
    const i = stages.findIndex((s) => s.id === id);
    if (i >= 0) stages.splice(i, 1);
    for (const it of items) if (it.statusId === id) it.statusId = 0;
  });
}

export function applyCreatedLeadStage(localId: number, crmId: number) {
  const from = Number(localId) || 0;
  const to = Number(crmId) || 0;
  if (!from || !to || from === to) return;
  touchStages((stages, items) => {
    for (const s of stages) if (s.id === from) s.id = to;
    for (const it of items) if (it.statusId === from) it.statusId = to;
  });
}

function asPhone(v: unknown) {
  if (Array.isArray(v)) return String(v[0] || "").trim();
  return String(v || "").trim();
}

function asAge(it: Record<string, unknown>) {
  const raw = it.age || it.age_str || "";
  if (raw) return String(raw).trim();
  const dob = String(it.dob || "");
  const m = dob.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const birth = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return "";
  let years = new Date().getFullYear() - birth.getFullYear();
  const md = new Date().getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && new Date().getDate() < birth.getDate())) years -= 1;
  const months = (md + 12) % 12;
  if (years < 0) return "";
  return months ? `${years} лет +${months}мес` : `${years} лет`;
}

export function packLead(it: Record<string, unknown>, branchId: number): LeadCard | null {
  if (!isCrmLeadRecord(it)) return null;
  const id = Number(it.id || 0);
  const branches = crmBranchIds(it);
  const name = String(it.name || it.legal_name || "").trim() || asPhone(it.phone) || `лид ${id}`;
  const assigned = Array.isArray(it.assigned_ids)
    ? ""
    : String(it.assigned_name || it.user_name || it.manager_name || "").trim();
  return {
    id,
    customerId: Number(it.customer_id || it.customerId || id) || id,
    branchId,
    branches: branches.length ? branches : [branchId],
    name,
    age: asAge(it),
    phone: asPhone(it.phone),
    email: asPhone(it.email),
    note: String(it.note || it.comment || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim(),
    assigned,
    statusId: crmLeadStatusId(it),
    sort: Number(it.sort ?? it.weight ?? it.ordering ?? 0) || 0,
    at: String(it.updated_at || it.created_at || it.date_add || it.datetime || ""),
    chats: Number(it.chat_count || it.comments_count || 0),
  };
}

async function fetchStages(t: string, branch: number): Promise<LeadStage[]> {
  const json = await request<{ items?: Record<string, unknown>[] }>(
    `/v2api/${branch}/lead-status/index`,
    { page: 0, pageSize: 50 },
    t,
  ).catch(() => ({ items: [] as Record<string, unknown>[] }));
  return mapCrmLeadStatuses(json.items || []);
}

async function fetchStageOrderFromSettings(branchId: number): Promise<number[]> {
  const host = crmHost();
  const login = await crmWebLogin();
  if (!login.cookie) return [];
  const tries = [...new Set([Number(branchId) || 2, 2, 1].filter((n) => n > 0))];
  for (const br of tries) {
    const res = await fetch(`${host}/settings/${br}/pipeline/index`, {
      headers: {
        Cookie: login.cookie,
        Accept: "text/html,application/json",
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${host}/`,
      },
      redirect: "manual",
    });
    const html = await res.text();
    if (/LoginForm/i.test(html) && !/sortable-item/i.test(html)) continue;
    const ids = parseCrmStageOrder(html);
    if (ids.length) return ids;
  }
  return [];
}

async function fetchCrmLeadColumns(branch: number, statusIds: number[], cookie: string, token = "") {
  const host = crmHost();
  const found: { id: number; name: string; statusId: number }[] = [];
  const seen = new Set<number>();
  const take = (rows: { id: number; name: string; statusId: number }[]) => {
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      found.push(row);
    }
  };
  const headers: Record<string, string> = {
    Accept: "application/json, text/html",
    "X-Requested-With": "XMLHttpRequest",
    Referer: `${host}/company/${branch}/lead/index`,
  };
  if (cookie) headers.Cookie = cookie;
  if (token) headers["X-ALFACRM-TOKEN"] = token;
  const get = async (path: string) => {
    const url = path.startsWith("http") ? path : `${host}${path.startsWith("/") ? "" : "/"}${path}`;
    const res = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(15000) });
    return res.text();
  };
  let indexHtml = "";
  try {
    indexHtml = await get(`/company/${branch}/lead/index`);
  } catch {
    indexHtml = "";
  }
  if (/LoginForm/i.test(indexHtml) && !/lead-items-/i.test(indexHtml)) return found;
  if (indexHtml) take(parseCrmLeadBoard(indexHtml));
  const colUrls = parseCrmBoardColumnUrls(indexHtml);
  const query = encodeURIComponent(JSON.stringify({ branch: String(branch) }));
  const rid = (indexHtml.match(/resource_id=(\d+)/) || [])[1] || "";
  const fallback = (statusIds.length ? statusIds : colUrls.map((c) => c.id)).filter((id, i, a) => a.indexOf(id) === i);
  const jobs: { id: number; url: string }[] = colUrls.length
    ? colUrls
    : fallback.map((id) => ({
        id,
        url: `/company/${branch}/lead/board?id=${id}&query=${query}${rid ? `&resource_id=${rid}` : ""}`,
      }));
  async function follow(start: string, statusId: number) {
    let path = start;
    for (let page = 0; page < 40; page++) {
      let raw = "";
      try {
        raw = await get(path);
      } catch {
        break;
      }
      if (/LoginForm/i.test(raw) && !/lead-element/i.test(raw) && !/"content"/i.test(raw)) return;
      const parsed = parseCrmLeadBoardPayload(raw, statusId);
      take(parsed.cards);
      if (parsed.nextUrl) {
        path = parsed.nextUrl;
        continue;
      }
      break;
    }
  }
  const queue = jobs.slice();
  const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
    while (queue.length) {
      const job = queue.shift();
      if (!job) return;
      await follow(job.url, job.id);
    }
  });
  await Promise.all(workers);
  return found;
}

async function fetchBranchLeads(t: string, branch: number, stages: { id: number }[] = []) {
  const out: LeadCard[] = [];
  const seen = new Set<number>();
  const take = (it: Record<string, unknown>, forceLead = false) => {
    const packed = packLead(forceLead ? { ...it, is_study: 0 } : it, branch);
    if (!packed || seen.has(packed.id)) return;
    seen.add(packed.id);
    out.push(packed);
  };
  const statusIds = [0, ...stages.map((s) => s.id)].filter((id, i, a) => a.indexOf(id) === i);
  const loginP = crmWebLogin().catch(() => ({ cookie: "", error: "вход в кабинет не удался" }));
  const apiP = pagedIndex(`/v2api/${branch}/customer/index`, { ...LEAD_INDEX_QUERY }, t, (it) => take(it), {
    pageSize: 100,
    pages: 8,
  }).catch(() => undefined);
  const login = await loginP;
  const board = await fetchCrmLeadColumns(branch, statusIds, login.cookie || "", t).catch(() => []);
  await apiP;
  let fromBoard = 0;
  if (board.length) {
    fromBoard = board.length;
    const byApi = new Map(out.map((x) => [x.id, x]));
    const merged = applyCrmBoardRows([], board, (row) => {
      const api = byApi.get(row.id);
      if (api) return { ...api, statusId: row.statusId, branchId: branch, name: api.name || row.name };
      return {
        id: row.id,
        customerId: row.id,
        branchId: branch,
        branches: [branch],
        name: row.name || `лид ${row.id}`,
        age: "",
        phone: "",
        email: "",
        note: "",
        assigned: "",
        statusId: row.statusId,
        sort: 0,
        at: "",
        chats: 0,
      };
    });
    out.length = 0;
    seen.clear();
    for (const card of merged) {
      seen.add(card.id);
      out.push(card);
    }
  } else {
    await Promise.all(
      stages
        .filter((s) => s.id)
        .map((s) =>
          pagedIndex(`/v2api/${branch}/customer/index`, { lead_status_id: s.id }, t, (it) => take(it, true), {
            pageSize: 100,
            pages: 6,
          }).catch(() => undefined),
        ),
    );
  }
  return { items: out, fromBoard, boardError: board.length ? "" : login.error || "доска CRM не открылась" };
}

export async function syncLeadsDelta(branchId = 0) {
  const key = String(branchId || 0);
  const hit = bag().get(key);
  if (!hit?.items.length) return loadLeadsBoard(branchId, true);
  const t = await alfaToken();
  const since = crmUpdatedAtFrom(hit.at);
  const branches = branchId ? [branchId] : [1, 2, 3, 4];
  const incoming: LeadCard[] = [];
  const dropped: number[] = [];
  const seen = new Set<number>();
  const onBoard = new Set(hit.items.map((x) => x.id));
  await Promise.all(
    branches.map((b) =>
      pagedIndex(
        `/v2api/${b}/customer/index`,
        { updated_at_from: since },
        t,
        (it) => {
          const id = Number(it.id || 0);
          if (!id || seen.has(id)) return;
          seen.add(id);
          if (leadDeltaDrops(it)) {
            dropped.push(id);
            return;
          }
          const force = Number(it.is_study) === 0 || crmLeadStatusId(it) > 0 || onBoard.has(id);
          if (!force) return;
          const packed = packLead({ ...it, is_study: 0 }, b);
          if (packed) incoming.push(packed);
        },
        { pageSize: 100, pages: 4 },
      ).catch(() => undefined),
    ),
  );
  const merged = applyLeadDelta(hit.items, incoming, dropped);
  const note =
    merged.added || merged.updated || merged.removed
      ? `с CRM: ${merged.updated} изменённых, ${merged.added} новых, ${merged.removed} снятых`
      : "изменений в CRM нет";
  const next = { at: Date.now(), stages: hit.stages, items: merged.items, note, delta: true as const };
  bag().set(key, next);
  persistLeads();
  try {
    const { stampFunnelOnDossiers } = await import("./dossiers");
    stampFunnelOnDossiers(next.items.map((x) => x.id));
  } catch {
    /* диск */
  }
  return next;
}

export async function boardFromDisk(branchId = 0): Promise<Bag> {
  const stages = mergeStages(
    bag().get(String(branchId || 0))?.stages || bag().get("0")?.stages || LEAD_STAGES,
  );
  try {
    const { searchClientViews } = await import("./dossiers");
    const local = searchClientViews("", 5000, "лид", branchId || 0);
    const items: LeadCard[] = [];
    const seen = new Set<number>();
    for (const row of local.items) {
      const packed = leadCardFromView(row);
      if (!packed || seen.has(packed.id)) continue;
      seen.add(packed.id);
      items.push(packed);
    }
    const nextStages = mergeStages(
      stages,
      items.map((x) => x.statusId),
    );
    return {
      at: Date.now(),
      stages: nextStages,
      items,
      note: items.length ? `${items.length} с диска сайта` : "Пустая воронка на сайте. Alfa — кнопка «Обновить».",
    };
  } catch {
    return { at: Date.now(), stages, items: [], note: "Пустая воронка на сайте. Alfa — кнопка «Обновить»." };
  }
}

export async function loadLeadsBoard(branchId = 0, force = false, delta = false) {
  const key = String(branchId || 0);
  const hit = bag().get(key);
  if (!force && hit?.items.length) {
    if (delta || Date.now() - hit.at >= 10 * 60 * 1000) void syncLeadsDelta(branchId);
    return hit;
  }
  if ((!force || delta) && hit?.items.length) return syncLeadsDelta(branchId);
  if (!force) {
    const disk = await boardFromDisk(branchId);
    if (disk.items.length) {
      bag().set(key, disk);
      persistLeads();
      if (delta) void syncLeadsDelta(branchId);
    }
    return disk;
  }
  const work = async () => {
    const t = await alfaToken();
    const rawStages = await fetchStages(t, branchId || 2);
    const branches = branchId ? [branchId] : [1, 2, 3, 4];
    const packs = await Promise.all(branches.map((b) => fetchBranchLeads(t, b, rawStages)));
    const seen = new Set<number>();
    const items: LeadCard[] = [];
    let fromBoard = 0;
    const boardErrors: string[] = [];
    for (const pack of packs) {
      fromBoard += pack.fromBoard;
      if (pack.boardError) boardErrors.push(pack.boardError);
      for (const it of pack.items) {
        if (seen.has(it.id)) continue;
        if (branchId && it.branchId !== branchId && !(it.branches || []).includes(branchId)) continue;
        seen.add(it.id);
        items.push(branchId && it.branchId !== branchId ? { ...it, branchId } : it);
      }
    }
    const stages = mergeStages(
      rawStages,
      items.map((x) => x.statusId),
    );
    try {
      const { searchClientViews } = await import("./dossiers");
      const local = searchClientViews("", 5000, "все", branchId || 0);
      const have = new Map(items.map((x) => [x.id, x]));
      for (const row of local.items) {
        const id = Number(row.crmId || 0);
        const hitRow = have.get(id);
        if (!hitRow) continue;
        if (!hitRow.phone && row.phone) hitRow.phone = String(row.phone || "");
        if (!hitRow.note && row.note) hitRow.note = String(row.note || "");
        if (!hitRow.age && row.age) hitRow.age = `${row.age} лет`;
      }
    } catch {
      /* API board is enough */
    }
    const byCol = new Map<number, number>();
    for (const it of items) byCol.set(it.statusId, (byCol.get(it.statusId) || 0) + 1);
    const colText = stages.map((s) => `${s.name} ${byCol.get(s.id) || 0}`).join(" · ");
    const note = fromBoard
      ? `${items.length} с воронки CRM (${colText})`
      : `${items.length} из API is_study=0 (${colText}). Доска CRM не открылась: ${[...new Set(boardErrors)].join("; ") || "нет сессии кабинета"}`;
    const built = { at: Date.now(), stages, items, note };
    bag().set(key, built);
    persistLeads();
    try {
      const { stampFunnelOnDossiers } = await import("./dossiers");
      stampFunnelOnDossiers(items.map((x) => x.id));
    } catch {
      /* диск */
    }
    return built;
  };
  try {
    const next = await Promise.race([
      work(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("CRM не ответила вовремя")), 60000)),
    ]);
    const prev = bag().get(key);
    if (prev?.items.length && next.items.length && next.items.length < prev.items.length * 0.7) {
      const ids = new Set(next.items.map((x) => x.id));
      const extra = prev.items.filter((x) => !ids.has(x.id));
      if (extra.length) {
        next.items = [...next.items, ...extra];
        next.note = `${next.note || ""} · добраны ${extra.length} с прошлой загрузки`;
      }
    }
    bag().set(key, next);
    persistLeads();
    return next;
  } catch (e) {
    if (hit) return { ...hit, note: "CRM отвечает медленно — показана предыдущая доска." };
    throw e;
  }
}

export function rememberCustomerAsLead(it: Record<string, unknown>, branchId: number) {
  const packed = packLead({ ...it, is_study: it.is_study ?? 0 }, branchId);
  if (!packed) return packed;
  const maps = bag();
  for (const key of ["0", String(branchId)]) {
    const cur = maps.get(key);
    if (!cur) {
      maps.set(key, { at: Date.now(), stages: LEAD_STAGES, items: [packed] });
      continue;
    }
    const items = cur.items.filter((x) => !(x.id === packed.id && x.branchId === packed.branchId));
    items.push(packed);
    maps.set(key, { ...cur, items, at: Date.now() });
  }
  return packed;
}

export function forgetLead(id: number, branchId: number) {
  const maps = bag();
  for (const [key, cur] of maps) {
    maps.set(key, {
      ...cur,
      items: cur.items.filter((x) => !(x.id === id && (key === "0" || x.branchId === branchId))),
      at: Date.now(),
    });
  }
}

async function patchLead(branch: number, id: number, fields: Record<string, unknown>, t: string) {
  const paths = [`/v2api/${branch}/customer/update`, `/v2api/${branch}/lead/update`];
  let last = "";
  for (const path of paths) {
    try {
      const json = await request<{ success?: boolean; errors?: unknown }>(path, { id, ...fields }, t);
      if (json && json.success === false) {
        last = JSON.stringify(json.errors || json);
        continue;
      }
      return json;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(last || "AlfaCRM не приняла смену этапа воронки.");
}

export function cacheMoveLead(branchId: number, leadId: number, statusId: number, sort?: number) {
  const branch = branchId || 1;
  const id = Number(leadId) || 0;
  for (const v of bag().values()) {
    const hit = v.items.find((x) => x.id === id && x.branchId === branch);
    if (hit) {
      hit.statusId = Number(statusId);
      if (Number.isFinite(Number(sort))) hit.sort = Number(sort);
    }
  }
  persistLeads();
}

export function cachePutLead(card: LeadCard) {
  if (!card?.id || !card.branchId) return;
  const stamp = (key: string) => {
    const cur = bag().get(key) || { at: Date.now(), stages: LEAD_STAGES, items: [] as LeadCard[] };
    const i = cur.items.findIndex((x) => x.id === card.id && x.branchId === card.branchId);
    if (i >= 0) cur.items[i] = { ...cur.items[i], ...card };
    else cur.items.unshift(card);
    cur.at = Date.now();
    bag().set(key, cur);
  };
  stamp(String(card.branchId));
  stamp("0");
  persistLeads();
}

export function cacheReplaceLeadId(branchId: number, localId: number, crmId: number) {
  const from = Number(localId);
  const to = Number(crmId);
  if (!from || !to || from === to) return;
  for (const v of bag().values()) {
    for (const it of v.items) {
      if (it.id === from && (!branchId || it.branchId === branchId)) {
        it.id = to;
        it.customerId = to;
      }
    }
  }
  persistLeads();
}

export function cacheArchiveLead(branchId: number, leadId: number) {
  const branch = branchId || 1;
  const id = Number(leadId) || 0;
  for (const v of bag().values()) {
    v.items = v.items.filter((x) => !(x.id === id && x.branchId === branch));
  }
  persistLeads();
}

export async function moveLead(branchId: number, leadId: number, statusId: number, sort?: number) {
  const t = await alfaToken();
  const branch = branchId || 1;
  const id = Number(leadId) || 0;
  if (!id) throw new Error("Нет номера лида.");
  if (!Number.isFinite(Number(statusId))) throw new Error("Нет этапа воронки.");
  const fields = leadMoveFields(statusId);
  await patchLead(branch, id, fields, t);
  if (Number.isFinite(Number(sort))) {
    try {
      await patchLead(branch, id, { sort: Number(sort) }, t);
    } catch {
      /* поле sort в филиале может отсутствовать */
    }
  }
  cacheMoveLead(branch, id, statusId, sort);
  return { ok: true as const };
}

export async function archiveLead(branchId: number, leadId: number) {
  const t = await alfaToken();
  const branch = branchId || 1;
  const id = Number(leadId) || 0;
  if (!id) throw new Error("Нет номера лида.");
  try {
    await patchLead(branch, id, { removed: 1 }, t);
  } catch {
    await patchLead(branch, id, { is_study: 2, removed: 1 }, t);
  }
  cacheArchiveLead(branch, id);
  return { ok: true as const };
}

export async function createLeadStage(name: string, color = "#1a7bb9") {
  const t = await alfaToken();
  const title = name.trim() || "Новый этап";
  const json = await request<{ success?: boolean; model?: { id?: number }; id?: number; errors?: unknown }>(
    `/v2api/1/lead-status/create`,
    { name: title, pipeline_id: PIPELINE, is_enabled: 1, ...colorPatch(color) },
    t,
  );
  if (json.success === false) throw new Error(JSON.stringify(json.errors || json));
  bag().clear();
  return { ok: true as const, id: Number(json.model?.id || json.id || 0), name: title, color };
}

export async function saveLeadStage(id: number, patch: { name?: string; color?: string }) {
  const t = await alfaToken();
  const body: Record<string, unknown> = { id, pipeline_id: PIPELINE };
  if (patch.name) body.name = patch.name.trim();
  if (patch.color) Object.assign(body, colorPatch(patch.color));
  const json = await request<{ success?: boolean; errors?: unknown }>(`/v2api/1/lead-status/update`, body, t);
  if (json.success === false) throw new Error(JSON.stringify(json.errors || json));
  for (const v of bag().values()) {
    const hit = v.stages.find((s) => s.id === id);
    if (hit) {
      if (patch.name) hit.name = patch.name.trim();
      if (patch.color) hit.color = patch.color;
    }
  }
  return { ok: true as const };
}

export async function sortLeadStages(ids: number[], branchId = 2) {
  const data = leadStatusSortPayload(ids);
  if (!data.length) return { ok: true as const };
  await postCrmLeadStatusSort(data, branchId);
  const t = await alfaToken();
  for (const row of data) {
    await request(`/v2api/1/lead-status/update`, { id: row.id, weight: row.weight, sort: row.weight, pipeline_id: PIPELINE }, t).catch(
      () => null,
    );
  }
  const order = pinUnsorted(ids);
  for (const v of bag().values()) {
    const by = new Map(v.stages.map((s) => [s.id, s]));
    const next: LeadStage[] = [];
    const seen = new Set<number>();
    for (const id of order) {
      const s = by.get(id);
      if (!s || seen.has(id)) continue;
      seen.add(id);
      next.push({ ...s, weight: id === 0 ? 0 : data.find((row) => row.id === id)?.weight });
    }
    for (const s of v.stages) if (!seen.has(s.id)) next.push(s);
    v.stages = next;
  }
  return { ok: true as const };
}

async function postCrmLeadStatusSort(data: { id: number; weight: number }[], branchId: number) {
  const host = crmHost();
  const login = await crmWebLogin();
  if (!login.cookie) throw new Error(login.error || "Нет пароля кабинета CRM — порядок этапов в AlfaCRM не записан.");
  let cookie = login.cookie;
  const tries = [...new Set([Number(branchId) || 2, 2, 1].filter((n) => n > 0))];
  let last = "";
  for (const branch of tries) {
    const pageUrl = `${host}/settings/${branch}/pipeline/index`;
    const page = await fetch(pageUrl, {
      headers: {
        Cookie: cookie,
        Accept: "text/html,application/json",
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${host}/`,
      },
      redirect: "manual",
    });
    cookie = mergeCookies(cookie, setCookieList(page));
    const html = await page.text();
    if (/LoginForm/i.test(html) && !/lead-status/i.test(html)) {
      last = "Сессия CRM сбросилась. Войдите в AlfaCRM.";
      continue;
    }
    const csrf = csrfOf(html);
    const sortUrl = `${host}/settings/${branch}/lead-status/sort`;
    const res = await fetch(sortUrl, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        Origin: host,
        Referer: pageUrl,
      },
      body: leadStatusSortForm(data, csrf),
      redirect: "manual",
    });
    cookie = mergeCookies(cookie, setCookieList(res));
    const text = await res.text();
    const loc = res.headers.get("location") || "";
    if (res.status === 302 && /login/i.test(loc)) {
      last = "CRM сбросила сессию при сортировке этапов.";
      continue;
    }
    if (res.status === 400 || /Не удалось проверить переданные данные/i.test(text)) {
      last = "CRM отклонила запрос сортировки этапов.";
      continue;
    }
    if (res.ok || res.status === 204 || res.status === 302) return;
    last = `CRM не приняла порядок этапов (${res.status}).`;
  }
  throw new Error(last || "AlfaCRM не записала порядок этапов.");
}

export async function deleteLeadStage(id: number) {
  if (id === 0) throw new Error("Системный столбец «Не разобрано» нельзя удалить.");
  const t = await alfaToken();
  const json = await request<{ success?: boolean; errors?: unknown }>(`/v2api/1/lead-status/delete`, { id }, t);
  if (json.success === false) throw new Error(JSON.stringify(json.errors || json));
  for (const v of bag().values()) {
    v.stages = v.stages.filter((s) => s.id !== id);
    for (const it of v.items) if (it.statusId === id) it.statusId = 0;
  }
  return { ok: true as const };
}

export { CRM_BRANCH };
