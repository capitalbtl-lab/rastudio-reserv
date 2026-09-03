import { request, token as alfaToken } from "./alfacrm";
import { CRM_BRANCH } from "./ids";

export type LeadStage = { id: number; name: string; color: string };
export type LeadCard = {
  id: number;
  customerId: number;
  branchId: number;
  name: string;
  age: string;
  phone: string;
  email: string;
  note: string;
  assigned: string;
  statusId: number;
  sort?: number;
  at: string;
  chats: number;
};

export const LEAD_STAGES: LeadStage[] = [
  { id: 0, name: "Не разобрано", color: "#6a6a6a" },
  { id: 1, name: "Разбирается", color: "#c26629" },
  { id: 2, name: "Ожидает старта", color: "#2563eb" },
  { id: 7, name: "Отложен", color: "#6b7280" },
  { id: 4, name: "Оплатил", color: "#16a34a" },
];

const STAGE_ORDER = [0, 1, 2, 7, 4];

type Bag = { at: number; stages: LeadStage[]; items: LeadCard[] };
const g = globalThis as { __raLeads?: Map<string, Bag> };

function bag() {
  if (!g.__raLeads) g.__raLeads = new Map();
  return g.__raLeads;
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

function isGone(it: Record<string, unknown>) {
  if (Number(it.removed) === 1 || String(it.removed) === "1") return true;
  const study = Number(it.is_study);
  return study === 1 || study === 2;
}

function packLead(it: Record<string, unknown>, branchId: number): LeadCard | null {
  const id = Number(it.id || 0);
  if (!id || isGone(it)) return null;
  const name = String(it.name || it.legal_name || "").trim() || asPhone(it.phone) || `лид ${id}`;
  const assigned = Array.isArray(it.assigned_ids)
    ? ""
    : String(it.assigned_name || it.user_name || it.manager_name || "").trim();
  return {
    id,
    customerId: Number(it.customer_id || it.customerId || id) || id,
    branchId,
    name,
    age: asAge(it),
    phone: asPhone(it.phone),
    email: asPhone(it.email),
    note: String(it.note || it.comment || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim(),
    assigned,
    statusId: Number(it.lead_status_id ?? it.status_id ?? 0),
    sort: Number(it.sort ?? it.weight ?? it.ordering ?? 0) || 0,
    at: String(it.updated_at || it.created_at || it.date_add || it.datetime || ""),
    chats: Number(it.chat_count || it.comments_count || 0),
  };
}

export function mergeStages(api: LeadStage[] = [], extraIds: number[] = []) {
  const byId = new Map<number, LeadStage>();
  byId.set(0, { ...LEAD_STAGES[0] });
  for (const s of api) {
    if (!Number.isFinite(s.id)) continue;
    const seed = LEAD_STAGES.find((x) => x.id === s.id);
    byId.set(s.id, {
      id: s.id,
      name: String(s.name || seed?.name || `этап ${s.id}`).trim() || `этап ${s.id}`,
      color: String(s.color || seed?.color || "#6a6a6a"),
    });
  }
  if (!api.length) for (const s of LEAD_STAGES) byId.set(s.id, { ...s });
  for (const id of extraIds) {
    if (byId.has(id)) continue;
    const seed = LEAD_STAGES.find((x) => x.id === id);
    byId.set(id, seed || { id, name: `этап ${id}`, color: "#6a6a6a" });
  }
  const list = [...byId.values()];
  list.sort((a, b) => {
    const ia = STAGE_ORDER.indexOf(a.id);
    const ib = STAGE_ORDER.indexOf(b.id);
    return (ia < 0 ? 80 + a.id : ia) - (ib < 0 ? 80 + b.id : ib);
  });
  return list;
}

export function orderedStages(api: LeadStage[] = []) {
  return mergeStages(api);
}

async function fetchStages(t: string, branch: number): Promise<LeadStage[]> {
  const json = await request<{ items?: { id?: number; name?: string; color?: string }[] }>(
    `/v2api/${branch}/lead-status/index`,
    { page: 0, pageSize: 50 },
    t,
  ).catch(() => ({ items: [] as { id?: number; name?: string; color?: string }[] }));
  return mergeStages(
    (json.items || [])
      .map((s) => ({ id: Number(s.id), name: String(s.name || ""), color: String(s.color || "") }))
      .filter((s) => Number.isFinite(s.id)),
  );
}

async function fetchBranchLeads(t: string, branch: number, stages: LeadStage[]) {
  const out: LeadCard[] = [];
  const seen = new Set<number>();
  async function pull(extra: Record<string, unknown>) {
    for (let page = 0; page < 8; page += 1) {
      const json = await request<{ items?: Record<string, unknown>[] }>(
        `/v2api/${branch}/lead/index`,
        { page, pageSize: 50, removed: 0, is_study: 0, ...extra },
        t,
      ).catch(() => ({ items: [] as Record<string, unknown>[] }));
      const items = json.items || [];
      for (const it of items) {
        const packed = packLead(it, branch);
        if (!packed || seen.has(packed.id)) continue;
        seen.add(packed.id);
        out.push(packed);
      }
      if (items.length < 50) break;
    }
  }
  await pull({});
  await pull({ lead_status_id: 0 });
  for (const stage of stages) {
    if (stage.id === 0 || out.some((x) => x.statusId === stage.id)) continue;
    await pull({ lead_status_id: stage.id });
  }
  return out;
}

export async function loadLeadsBoard(branchId = 0, force = false) {
  const key = String(branchId || 0);
  const hit = bag().get(key);
  if (!force && hit && Date.now() - hit.at < 45 * 1000) return hit;
  const t = await alfaToken();
  const branches = branchId ? [branchId] : [1, 2, 3, 4];
  const rawStages = await fetchStages(t, branches[0] || 1);
  const packs = await Promise.all(branches.map((b) => fetchBranchLeads(t, b, rawStages)));
  const seen = new Set<string>();
  const items: LeadCard[] = [];
  for (const pack of packs) {
    for (const it of pack) {
      const k = `${it.branchId}:${it.id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      items.push(it);
    }
  }
  const stages = mergeStages(
    rawStages,
    items.map((x) => x.statusId),
  );
  const next = { at: Date.now(), stages, items };
  bag().set(key, next);
  if (!branchId) {
    for (const b of branches) {
      bag().set(String(b), { at: next.at, stages, items: items.filter((x) => x.branchId === b) });
    }
  }
  return next;
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

export async function moveLead(branchId: number, leadId: number, statusId: number, sort?: number) {
  const t = await alfaToken();
  const branch = branchId || 1;
  const id = Number(leadId) || 0;
  if (!id) throw new Error("Нет номера лида.");
  if (!Number.isFinite(Number(statusId))) throw new Error("Нет этапа воронки.");
  const fields: Record<string, unknown> = { lead_status_id: Number(statusId), is_study: 0 };
  await patchLead(branch, id, fields, t);
  if (Number.isFinite(Number(sort))) {
    try {
      await patchLead(branch, id, { sort: Number(sort) }, t);
    } catch {
      /* поле sort в филиале может отсутствовать */
    }
  }
  for (const v of bag().values()) {
    const hit = v.items.find((x) => x.id === id && x.branchId === branch);
    if (hit) {
      hit.statusId = Number(statusId);
      if (Number.isFinite(Number(sort))) hit.sort = Number(sort);
    }
  }
  return { ok: true as const };
}

export function reorderLeads(list: LeadCard[], lead: LeadCard, statusId: number, beforeId?: number): LeadCard[] {
  const keyOf = (x: LeadCard) => `${x.branchId}:${x.id}`;
  const moving = keyOf(lead);
  const rest = list.filter((x) => keyOf(x) !== moving);
  const item: LeadCard = { ...(list.find((x) => keyOf(x) === moving) || lead), statusId };
  const byCol = new Map<number, LeadCard[]>();
  for (const x of rest) {
    const arr = byCol.get(x.statusId) || [];
    arr.push(x);
    byCol.set(x.statusId, arr);
  }
  const col = byCol.get(statusId) || [];
  let at = col.length;
  if (beforeId) {
    const bi = col.findIndex((x) => x.id === beforeId);
    if (bi >= 0) at = bi;
  }
  col.splice(at, 0, item);
  byCol.set(statusId, col);
  const out: LeadCard[] = [];
  const seen = new Set<number>();
  for (const x of list) {
    const sid = keyOf(x) === moving ? statusId : x.statusId;
    if (seen.has(sid)) continue;
    seen.add(sid);
    out.push(...(byCol.get(sid) || []));
  }
  for (const [sid, arr] of byCol) if (!seen.has(sid)) out.push(...arr);
  return out;
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
  for (const v of bag().values()) {
    v.items = v.items.filter((x) => !(x.id === id && x.branchId === branch));
  }
  return { ok: true as const };
}

export async function createLeadStage(name: string, color = "#2563eb") {
  const t = await alfaToken();
  const title = name.trim() || "Новый этап";
  const json = await request<{ success?: boolean; model?: { id?: number }; id?: number; errors?: unknown }>(
    `/v2api/1/lead-status/create`,
    { name: title, color, is_enabled: 1 },
    t,
  );
  if (json.success === false) throw new Error(JSON.stringify(json.errors || json));
  bag().clear();
  return { ok: true as const, id: Number(json.model?.id || json.id || 0), name: title, color };
}

export async function saveLeadStage(id: number, patch: { name?: string; color?: string }) {
  const t = await alfaToken();
  const body: Record<string, unknown> = { id };
  if (patch.name) body.name = patch.name.trim();
  if (patch.color) body.color = patch.color;
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

export function stageOf(id: number, stages: LeadStage[]) {
  return stages.find((s) => s.id === id) || stages[0] || LEAD_STAGES[0];
}

export { CRM_BRANCH };
