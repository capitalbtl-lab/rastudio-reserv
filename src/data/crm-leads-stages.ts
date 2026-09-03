export type LeadStage = { id: number; name: string; color: string; weight?: number; pipelineId?: number };

export const LEAD_PIPELINE = 1;

/** Цвета как в AlfaCRM LeadStatus[color_id] 0..6. */
export const CRM_STAGE_COLORS = [
  { id: 0, hex: "#6a6a6a" },
  { id: 1, hex: "#c26629" },
  { id: 2, hex: "#1a7bb9" },
  { id: 3, hex: "#3C578C" },
  { id: 4, hex: "#00aa00" },
  { id: 5, hex: "#006600" },
  { id: 6, hex: "#9e0505" },
];

export const LEAD_STAGES: LeadStage[] = [
  { id: 0, name: "Не разобрано", color: "#6a6a6a", weight: 0, pipelineId: 1 },
  { id: 1, name: "Разбирается", color: "#c26629", weight: 1, pipelineId: 1 },
  { id: 2, name: "Ожидает старта", color: "#1a7bb9", weight: 2, pipelineId: 1 },
  { id: 7, name: "Отложен", color: "#6b7280", weight: 3, pipelineId: 1 },
  { id: 4, name: "Оплатил", color: "#00aa00", weight: 4, pipelineId: 1 },
];

export function stageColor(s: Record<string, unknown>) {
  const hex = String(s.color || "").trim();
  if (/^#?[0-9a-fA-F]{3,8}$/.test(hex) && hex.replace("#", "").length >= 3) {
    return hex.startsWith("#") ? hex : `#${hex}`;
  }
  const id = Number(s.color_id ?? (typeof s.color === "number" ? s.color : NaN));
  if (Number.isFinite(id) && CRM_STAGE_COLORS[id]) return CRM_STAGE_COLORS[id].hex;
  return "";
}

export function colorPatch(hex: string) {
  const h = String(hex || "")
    .trim()
    .toLowerCase();
  const hit = CRM_STAGE_COLORS.find((c) => c.hex.toLowerCase() === h);
  if (hit) return { color_id: hit.id, color: hit.hex };
  if (/^#[0-9a-f]{3,8}$/.test(h)) return { color: hex, color_id: "" };
  return { color: hex };
}

export function pinUnsorted(ids: number[]) {
  const rest = ids.filter((id) => id !== 0);
  if (ids.includes(0)) return [0, ...rest];
  return rest;
}

export function leadStatusSortPayload(ids: number[]) {
  return ids.filter((id) => id !== 0).map((id, i) => ({ id, weight: i + 1 }));
}

export function leadStatusSortForm(data: { id: number; weight: number }[], csrf: string) {
  const body = new URLSearchParams();
  body.set("_csrf", csrf);
  data.forEach((row, i) => {
    body.set(`data[${i}][id]`, String(row.id));
    body.set(`data[${i}][weight]`, String(row.weight));
  });
  return body;
}

export function parseCrmStageOrder(html: string): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const m of html.matchAll(/sortable-item[^>]*data-id=["']?(\d+)/gi)) {
    const id = Number(m[1]);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function applyStageOrder(stages: LeadStage[], ids: number[]): LeadStage[] {
  const byId = new Map(stages.map((s) => [s.id, s]));
  const ordered: LeadStage[] = [];
  const seen = new Set<number>();
  ordered.push(byId.get(0) || LEAD_STAGES[0]);
  seen.add(0);
  for (const id of ids) {
    if (id === 0 || seen.has(id)) continue;
    const s = byId.get(id);
    if (!s) continue;
    seen.add(id);
    ordered.push({ ...s, weight: ordered.length });
  }
  for (const s of stages) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    ordered.push({ ...s, weight: ordered.length });
  }
  return ordered;
}

export function mapCrmLeadStatuses(items: Record<string, unknown>[]): LeadStage[] {
  const byId = new Map<number, LeadStage>();
  byId.set(0, { ...LEAD_STAGES[0] });
  for (const s of items) {
    const id = Number(s.id);
    if (!Number.isFinite(id) || id === 0) continue;
    const on = s.is_enabled == null || s.is_enabled === "" ? 1 : Number(s.is_enabled);
    if (on === 0) continue;
    const color = stageColor(s) || LEAD_STAGES.find((x) => x.id === id)?.color || "#6a6a6a";
    const weight = Number(s.weight ?? s.sort ?? s.ordering ?? 0) || 0;
    const name = String(s.name || "").trim() || LEAD_STAGES.find((x) => x.id === id)?.name || `этап ${id}`;
    byId.set(id, { id, name, color, weight, pipelineId: Number(s.pipeline_id ?? 1) || 1 });
  }
  return [...byId.values()].sort(
    (a, b) => (a.id === 0 ? -1 : b.id === 0 ? 1 : (a.weight || 0) - (b.weight || 0) || a.id - b.id),
  );
}

export function mergeStages(api: LeadStage[] = [], extraIds: number[] = []) {
  const byId = new Map<number, LeadStage>();
  byId.set(0, { ...(api.find((s) => s.id === 0) || LEAD_STAGES[0]) });
  const src = api.length ? api : LEAD_STAGES;
  for (const s of src) {
    if (s.id === 0) continue;
    byId.set(s.id, { ...s });
  }
  for (const id of extraIds) {
    if (byId.has(id)) continue;
    const seed = LEAD_STAGES.find((s) => s.id === id);
    byId.set(id, seed ? { ...seed } : { id, name: `этап ${id}`, color: "#6a6a6a", weight: 99, pipelineId: 1 });
  }
  return [...byId.values()].sort(
    (a, b) => (a.id === 0 ? -1 : b.id === 0 ? 1 : (a.weight || 0) - (b.weight || 0) || a.id - b.id),
  );
}

export function orderedStages(stages: LeadStage[]) {
  return [...stages].sort(
    (a, b) => (a.id === 0 ? -1 : b.id === 0 ? 1 : (a.weight || 0) - (b.weight || 0) || a.id - b.id),
  );
}

export function stageOf(id: number, stages: LeadStage[]) {
  return stages.find((s) => s.id === id) || stages[0] || LEAD_STAGES[0];
}

/** Филиалы карточки: в CRM это чекбоксы Customer[branch_ids][], не одно число. */
export function crmBranchIds(it: Record<string, unknown>): number[] {
  const raw = it.branch_ids ?? it.branchIds ?? it.branches;
  if (Array.isArray(raw)) return [...new Set(raw.map((n) => Number(n)).filter((n) => n > 0))];
  if (raw && typeof raw === "object") return [...new Set(Object.keys(raw as object).map(Number).filter((n) => n > 0))];
  const n = Number(it.branch_id ?? it.branchId ?? 0);
  return n > 0 ? [n] : [];
}

export function leadVisibleInBranch(branches: number[], branchId: number) {
  if (!branchId) return true;
  if (!branches.length) return true;
  return branches.includes(branchId);
}

/** «Не разобрано» в кабинете пишет val(null), не 0. */
export function crmLeadStatusId(it: Record<string, unknown>): number {
  const raw = it.lead_status_id ?? it.status_id ?? it.leadStatusId;
  if (raw == null || raw === "" || raw === false) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Карточки колонки воронки: li.lead-element[data-id] как в /company/{branch}/lead/board. */
export function parseCrmLeadColumn(html: string, statusId = 0): { id: number; name: string; statusId: number }[] {
  const names = new Map<number, string>();
  for (const m of html.matchAll(/\/lead\/(?:view|update)\?id=(\d+)[^>]*>\s*([^<(]{2,120})/gi)) {
    names.set(Number(m[1]), m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
  }
  const out: { id: number; name: string; statusId: number }[] = [];
  const seen = new Set<number>();
  for (const m of html.matchAll(/lead-element[^>]*data-id=["'](\d+)["']/gi)) {
    const id = Number(m[1]);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: names.get(id) || "", statusId });
  }
  if (!out.length) {
    for (const [id, name] of names) out.push({ id, name, statusId });
  }
  return out;
}

/** Снимок всей доски /company/{branch}/lead/index: колонки lead-items-N. */
export function parseCrmLeadBoard(html: string): { id: number; name: string; statusId: number }[] {
  const parts = html.split(/lead-items lead-items-(\d+)/);
  if (parts.length > 2) {
    const out: { id: number; name: string; statusId: number }[] = [];
    const seen = new Set<number>();
    for (let i = 1; i < parts.length; i += 2) {
      const statusId = Number(parts[i]) || 0;
      for (const row of parseCrmLeadColumn(parts[i + 1] || "", statusId)) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        out.push(row);
      }
    }
    return out;
  }
  return parseCrmLeadColumn(html, 0);
}

export function parseCrmScrollPagerUrl(html: string) {
  const m = html.match(/crm-scroll-pager[^>]*data-url=["']([^"']+)/i);
  return m ? m[1].replace(/&/g, "&") : "";
}

/** Ответ /lead/board — JSON {content} как в initBoard, либо HTML колонки. */
export function parseCrmLeadBoardPayload(raw: string, statusId = 0) {
  let html = raw;
  const t = raw.trim();
  if (t.startsWith("{")) {
    try {
      const j = JSON.parse(t) as { content?: string };
      if (typeof j.content === "string") html = j.content;
    } catch {
      /* html */
    }
  }
  return { cards: parseCrmLeadColumn(html, statusId), nextUrl: parseCrmScrollPagerUrl(html), html };
}

export function parseCrmBoardCounts(html: string) {
  return [...html.matchAll(/board-count[^>]*>(\d+)<\/span>\s*<span class="status_column[^>]*title="([^"]+)"/gi)].map((m) => ({
    count: Number(m[1]),
    name: m[2],
  }));
}

export function applyCrmBoardRows<T extends { id: number; name: string; statusId: number }>(
  items: T[],
  board: { id: number; name: string; statusId: number }[],
  make: (row: { id: number; name: string; statusId: number }) => T,
): T[] {
  const byId = new Map(items.map((x) => [x.id, { ...x }]));
  for (const row of board) {
    const hit = byId.get(row.id);
    if (hit) {
      hit.statusId = row.statusId;
      if (row.name && !hit.name) hit.name = row.name;
      continue;
    }
    byId.set(row.id, make(row));
  }
  return [...byId.values()];
}

/** «Не разобрано» в CRM = 0, в JSON это null. 0 нельзя терять через ||. */
export function crmBoardStatusField(statusId: number) {
  return statusId > 0 ? statusId : null;
}

/** Тело index для лидов. Без removed и без lead_status_id — иначе «Не разобрано» (null) пропадает. */
export const LEAD_INDEX_QUERY = { is_study: 0 };

export function leadMoveFields(statusId: number, sort?: number) {
  const fields: Record<string, unknown> = { lead_status_id: Number(statusId), is_study: 0 };
  if (Number.isFinite(Number(sort))) fields.sort = Number(sort);
  return fields;
}

export function isCrmLeadRecord(it: Record<string, unknown>) {
  if (!Number(it.id || 0)) return false;
  if (Number(it.removed) === 1) return false;
  const study = Number(it.is_study);
  if (study === 2) return false;
  if (study === 1) return crmLeadStatusId(it) > 0;
  return true;
}

/** total первой страницы, равный pageSize, нельзя принимать за полное число записей. */
export function crmIndexAccumTotal(page: number, pageSize: number, batchLen: number, rawTotal: unknown, prev: number) {
  const n = Number(rawTotal);
  if (Number.isFinite(n) && n >= 0 && !(page === 0 && n === batchLen && n === pageSize)) return n;
  return prev;
}

export function crmIndexShouldStop(pageSize: number, batchLen: number, count: unknown, loaded: number, total: number) {
  const n = Number.isFinite(Number(count)) ? Number(count) : batchLen;
  if (!batchLen || n === 0) return true;
  if (n < pageSize || batchLen < pageSize) return true;
  if (Number.isFinite(total) && loaded >= total) return true;
  return false;
}
