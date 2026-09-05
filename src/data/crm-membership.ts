/**
 * Членство в группе = cgi (строка клиент↔группа).
 * group_ids на карточке клиента — спутник, не состав.
 * taken = живые cgi, не quantity и не group_ids.
 */

export type CrmRequest = <T = { success?: boolean; errors?: unknown }>(
  path: string,
  body?: unknown,
  t?: string,
) => Promise<T>;

export type CgiRow = {
  id: number;
  customerId: number;
  groupId: number;
  branchId: number;
  name: string;
  live: boolean;
  raw: Record<string, unknown>;
};

export type MembershipResult = {
  ok: boolean;
  already?: boolean;
  confirmed?: boolean;
  error?: string;
};

export function todayIsoMsk() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });
}

export function cgiCustomerId(it: Record<string, unknown>) {
  const nested =
    it.customer && typeof it.customer === "object" ? Number((it.customer as { id?: unknown }).id || 0) : Number(it.customer || 0);
  return Number(it.customer_id || it.customerId || nested || 0) || 0;
}

export function cgiRecordLive(it: Record<string, unknown>, today = todayIsoMsk()) {
  if (Number(it.removed || it.is_removed || 0)) return false;
  const raw = String(it.e_date || it.date_to || "").trim();
  if (!raw || raw.startsWith("0000")) return true;
  const iso = raw.includes(".") ? raw.split(".").reverse().join("-").slice(0, 10) : raw.slice(0, 10);
  return iso >= today;
}

function unwrapItems(json: unknown): Record<string, unknown>[] {
  if (!json || typeof json !== "object") return [];
  const o = json as Record<string, unknown>;
  const inner = o.data && typeof o.data === "object" && !Array.isArray(o.data) ? (o.data as Record<string, unknown>) : o;
  let raw: unknown = inner.items ?? o.items ?? o.models;
  if (Array.isArray(o.data)) raw = Array.isArray(raw) && raw.length ? raw : o.data;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) raw = Object.values(raw as Record<string, unknown>);
  if (!Array.isArray(raw) && Array.isArray(inner)) raw = inner;
  return Array.isArray(raw) ? raw.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object") : [];
}

function cgiGroupId(it: Record<string, unknown>) {
  const nested = it.group && typeof it.group === "object" ? Number((it.group as { id?: unknown }).id || 0) : 0;
  return Number(it.group_id || it.groupId || nested || 0) || 0;
}

function cgiRowId(it: Record<string, unknown>) {
  return Number(it.id || it.cgi_id || 0) || 0;
}

export function packCgiRow(it: Record<string, unknown>, branchId = 0, today?: string): CgiRow | null {
  if (!it || typeof it !== "object") return null;
  const customerId = cgiCustomerId(it);
  const groupId = cgiGroupId(it);
  if (!customerId && !groupId) return null;
  const rec = it as { group?: { name?: string } };
  return {
    id: cgiRowId(it),
    customerId,
    groupId,
    branchId: Number(it.branch_id || it.branchId || branchId) || branchId,
    name: String(it.group_name || rec.group?.name || ""),
    live: cgiRecordLive(it, today),
    raw: it,
  };
}

export function liveCgiRows(items: Record<string, unknown>[], branchId = 0, today?: string) {
  return items.map((it) => packCgiRow(it, branchId, today)).filter((x): x is CgiRow => Boolean(x?.live && x.groupId));
}

/** Уникальные живые ученики по группам. */
export function takenByGroupFromCgi(items: Record<string, unknown>[], today?: string) {
  const map = new Map<number, Set<number>>();
  let orphan = -1;
  for (const row of liveCgiRows(items, 0, today)) {
    const set = map.get(row.groupId) || new Set<number>();
    set.add(row.customerId || orphan--);
    map.set(row.groupId, set);
  }
  const taken = new Map<number, number>();
  for (const [gid, set] of map) taken.set(gid, set.size);
  return taken;
}

export function customerLiveInCgi(items: Record<string, unknown>[], customerId: number, groupId?: number, today?: string) {
  if (!customerId) return false;
  return liveCgiRows(items, 0, today).some((r) => r.customerId === customerId && (!groupId || r.groupId === groupId));
}

export function groupsOfCustomerFromCgi(items: Record<string, unknown>[], customerId: number, branchId: number, today?: string) {
  const out: { id: number; name: string; branchId: number }[] = [];
  const seen = new Set<number>();
  for (const row of liveCgiRows(items, branchId, today)) {
    if (row.customerId !== customerId || !row.groupId || seen.has(row.groupId)) continue;
    seen.add(row.groupId);
    out.push({ id: row.groupId, name: row.name, branchId: row.branchId || branchId });
  }
  return out;
}

/** Карточка: только cgi. group_ids не добавляют «действующую» группу. */
export function activeGroupsForCard(opts: {
  cgi: { id: number; name: string; branchId: number }[];
  dossier?: { id: number; name?: string; branchId?: number; active?: boolean; school?: string; subjectId?: number; courseId?: string }[];
}) {
  const byId = new Map<string, { id: number; name: string; branchId: number; school?: string; subjectId?: number; courseId?: string; active: boolean }>();
  for (const g of opts.cgi) {
    if (!g.id) continue;
    byId.set(`${Number(g.branchId) || 0}:${g.id}`, { id: g.id, name: g.name, branchId: g.branchId, active: true });
  }
  for (const g of opts.dossier || []) {
    if (!g.id) continue;
    const key = `${Number(g.branchId) || 0}:${g.id}`;
    const cur = byId.get(key);
    if (cur) {
      byId.set(key, {
        ...cur,
        name: cur.name || g.name || "",
        school: g.school,
        subjectId: g.subjectId,
        courseId: g.courseId,
        branchId: cur.branchId || g.branchId || 0,
      });
      continue;
    }
    if (opts.cgi.length) continue;
    if (g.active === false) continue;
    byId.set(key, {
      id: g.id,
      name: g.name || "",
      branchId: g.branchId || 0,
      school: g.school,
      subjectId: g.subjectId,
      courseId: g.courseId,
      active: true,
    });
  }
  return [...byId.values()];
}

export function toCrmDay(raw?: string) {
  const s = String(raw || "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (ru) return `${ru[1].padStart(2, "0")}.${ru[2].padStart(2, "0")}.${ru[3]}`;
  if (!s) {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}.${mm}.${d.getFullYear()}`;
  }
  return s;
}

function okRes(res: { success?: boolean } | null | undefined) {
  return Boolean(res) && res?.success !== false;
}

async function pagedCgi(
  request: CrmRequest,
  t: string,
  path: string,
  body: Record<string, unknown>,
  pages = 8,
) {
  const items: Record<string, unknown>[] = [];
  for (let page = 0; page < pages; page += 1) {
    const json = await request(path, { page, pageSize: 100, ...body }, t).catch(() => ({}));
    const batch = unwrapItems(json);
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items;
}

export async function listCgiByGroup(request: CrmRequest, t: string, branch: number, groupId: number) {
  if (!branch || !groupId) return [] as Record<string, unknown>[];
  return pagedCgi(request, t, `/v2api/${branch}/cgi/index?group_id=${groupId}`, { group_id: groupId });
}

export async function listCgiByCustomer(request: CrmRequest, t: string, branch: number, customerId: number) {
  if (!branch || !customerId) return [] as Record<string, unknown>[];
  const tries: [string, Record<string, unknown>][] = [
    [`/v2api/${branch}/cgi/customer`, { customer_id: customerId }],
    [`/v2api/${branch}/cgi/customer?customer_id=${customerId}`, { customer_id: customerId }],
    [`/v2api/${branch}/cgi/index?customer_id=${customerId}`, { customer_id: customerId }],
  ];
  for (const [path, body] of tries) {
    const items = await pagedCgi(request, t, path, body, 4);
    const mine = items.filter((it) => {
      const cid = cgiCustomerId(it);
      return !cid || cid === customerId;
    });
    if (mine.length) return mine;
  }
  return [];
}

export async function listCgiBranch(request: CrmRequest, t: string, branch: number) {
  if (!branch) return [] as Record<string, unknown>[];
  return pagedCgi(request, t, `/v2api/${branch}/cgi/index`, {}, 20);
}

async function createCgiRow(
  request: CrmRequest,
  t: string,
  opts: { branch: number; groupId: number; customerId: number; bDate?: string; eDate?: string },
) {
  const bDate = toCrmDay(opts.bDate);
  const eDate = String(opts.eDate || "").trim() ? toCrmDay(opts.eDate) : "";
  const body: Record<string, unknown> = {
    customer_id: opts.customerId,
    group_id: opts.groupId,
    branch_id: opts.branch,
    b_date: bDate,
  };
  if (eDate) body.e_date = eDate;
  const tries: [string, Record<string, unknown>][] = [
    [`/v2api/${opts.branch}/cgi/create?group_id=${opts.groupId}`, body],
    [`/v2api/${opts.branch}/cgi/create`, body],
  ];
  let last = "";
  for (const [path, payload] of tries) {
    try {
      const res = await request(path, payload, t);
      if (okRes(res)) return { ok: true as const };
      last = JSON.stringify((res as { errors?: unknown }).errors || res);
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  return { ok: false as const, error: last || "AlfaCRM не создала cgi." };
}

async function dropCgiRow(request: CrmRequest, t: string, branch: number, row: CgiRow) {
  const today = toCrmDay("");
  const tries: [string, Record<string, unknown>][] = [];
  if (row.id) {
    tries.push([`/v2api/${branch}/cgi/delete?id=${row.id}`, { id: row.id }]);
    tries.push([`/v2api/${branch}/cgi/update?id=${row.id}`, { id: row.id, removed: 1 }]);
    tries.push([`/v2api/${branch}/cgi/update?id=${row.id}`, { id: row.id, e_date: today }]);
  }
  tries.push([
    `/v2api/${branch}/cgi/update`,
    { customer_id: row.customerId, group_id: row.groupId, removed: 1 },
  ]);
  let last = "";
  let ok = false;
  for (const [path, body] of tries) {
    try {
      const res = await request(path, body, t);
      if (okRes(res)) ok = true;
      else last = JSON.stringify((res as { errors?: unknown }).errors || res);
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  return ok ? { ok: true as const } : { ok: false as const, error: last || "AlfaCRM не сняла cgi." };
}

function groupIdsOf(current?: Record<string, unknown>) {
  const out = new Set<number>();
  const ids = current && Array.isArray(current.group_ids) ? current.group_ids : [];
  for (const x of ids) {
    const n = Number(x);
    if (n) out.add(n);
  }
  return out;
}

/** Пишет cgi, затем group_ids. Успех — только если cgi подтвердил. */
export async function applyGroupMembership(
  request: CrmRequest,
  t: string,
  opts: {
    customerId: number;
    groupId: number;
    branch: number;
    drop: boolean;
    bDate?: string;
    eDate?: string;
    current?: Record<string, unknown>;
  },
): Promise<MembershipResult> {
  const items = await listCgiByGroup(request, t, opts.branch, opts.groupId);
  const inCgi = customerLiveInCgi(items, opts.customerId, opts.groupId);
  if (!opts.drop && inCgi) return { ok: true, already: true, confirmed: true };
  if (opts.drop && !inCgi) return { ok: true, already: true, confirmed: true };

  if (!opts.drop) {
    const made = await createCgiRow(request, t, {
      branch: opts.branch,
      groupId: opts.groupId,
      customerId: opts.customerId,
      bDate: opts.bDate,
      eDate: opts.eDate,
    });
    if (!made.ok) return { ok: false, confirmed: false, error: made.error };
  } else {
    const rows = liveCgiRows(items, opts.branch).filter((r) => r.customerId === opts.customerId && r.groupId === opts.groupId);
    if (!rows.length) {
      const packed = items.map((it) => packCgiRow(it, opts.branch)).filter((x): x is CgiRow => Boolean(x && x.customerId === opts.customerId && x.groupId === opts.groupId));
      rows.push(...packed);
    }
    for (const row of rows) {
      const dropped = await dropCgiRow(request, t, opts.branch, row);
      if (!dropped.ok) return { ok: false, confirmed: false, error: dropped.error };
    }
  }

  const ids = groupIdsOf(opts.current);
  if (opts.drop) ids.delete(opts.groupId);
  else ids.add(opts.groupId);
  const next = [...ids];
  const companion: Record<string, unknown> = { id: opts.customerId, group_ids: next };
  if (!opts.drop) {
    if (opts.bDate) companion.b_date = opts.bDate;
    if (opts.eDate) companion.e_date = opts.eDate;
  }
  await request(`/v2api/${opts.branch}/customer/update?id=${opts.customerId}`, companion, t).catch(() => null);

  try {
    const les = (await request(`/v2api/${opts.branch}/regular-lesson/index`, { page: 0, pageSize: 20, group_id: opts.groupId }, t)) as {
      items?: Record<string, unknown>[];
    };
    for (const it of les.items || []) {
      const lid = Number(it.id || 0);
      if (!lid) continue;
      const cids = Array.isArray(it.customer_ids) ? it.customer_ids.map(Number).filter(Boolean) : [];
      if (opts.drop && cids.includes(opts.customerId)) {
        await request(`/v2api/${opts.branch}/regular-lesson/update?id=${lid}`, { id: lid, customer_ids: cids.filter((x) => x !== opts.customerId) }, t).catch(
          () => null,
        );
      } else if (!opts.drop && !cids.includes(opts.customerId)) {
        await request(`/v2api/${opts.branch}/regular-lesson/update?id=${lid}`, { id: lid, customer_ids: [...cids, opts.customerId] }, t).catch(() => null);
      }
    }
  } catch {
    /* regular-lesson — не состав */
  }

  const after = await listCgiByGroup(request, t, opts.branch, opts.groupId);
  const confirmed = customerLiveInCgi(after, opts.customerId, opts.groupId);
  if (!opts.drop && !confirmed) {
    return { ok: false, confirmed: false, error: "В cgi ученика в группе нет. group_ids не считаем составом." };
  }
  if (opts.drop && confirmed) {
    return { ok: false, confirmed: false, error: "cgi всё ещё держит ученика в группе." };
  }
  return { ok: true, already: false, confirmed: true };
}
