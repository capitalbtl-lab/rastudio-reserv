/** Шаг 7. Архивные клиенты, которых нет в живых группах. Касса — тот же проход, что шаг 6. */

import { request, token as alfaToken, dropAlfaIndex } from "./alfacrm";
import { crmUnwrapIndex, crmIndexAccumTotal, crmIndexShouldStop } from "./crm-leads-stages";
import { replaceStep7List } from "./crm-leads";
import { liveAdminGroups } from "./crm-journal-pull";
import { dossiersInGroup } from "./dossiers";
import { cgiCustomerId, cgiRecordLive } from "./crm-membership";
import { step7ArchiveDay, step7Dob, step7HadGroups, step7KeepAny, step7ListStudy, step7RejectId } from "./crm-step7-core";
import { recheckStep7Cash } from "./crm-step6";
import type { LeadCard } from "./crm-leads-stages";

export { recheckStep7Cash };

const PAGE = 100;
const BRANCHES = [1, 2, 3, 4];

function diskLive(branch: number, gid: number, ids: Set<number>) {
  for (const d of dossiersInGroup(branch, gid)) {
    const cid = Number(d.crmId) || 0;
    if (!cid) continue;
    const link = (d.groupLinks || []).find((x) => Number(x.id) === gid);
    if (link && link.active === false) continue;
    ids.add(cid);
  }
}

/** Живые — cgi с e_date не в прошлом. Учился — любой cgi, в том числе архивная группа и уже закрытое участие. */
async function membershipSets(tok: string) {
  const live = new Set<number>();
  const studied = new Set<number>();
  for (const branch of BRANCHES) {
    const active = await groupIds(branch, 0, tok);
    const archived = await groupIds(branch, 2, tok);
    for (const gid of active) await readCgi(branch, gid, tok, live, studied, true);
    for (const gid of archived) {
      if (active.has(gid)) continue;
      await readCgi(branch, gid, tok, live, studied, false);
    }
  }
  return { live, studied };
}

async function groupIds(branch: number, removed: 0 | 2, tok: string) {
  const ids = new Set<number>();
  try {
    const groups = await readPages(`/v2api/${branch}/group/index`, { removed }, tok);
    for (const g of groups) {
      const gid = Number(g.id);
      if (!gid) continue;
      if (removed === 0 && Number(g.removed) === 2) continue;
      ids.add(gid);
    }
  } catch {
    /* ниже — диск только для живых */
  }
  if (removed === 0 && !ids.size) {
    for (const g of liveAdminGroups()) if (g.branchId === branch) ids.add(g.groupId);
  }
  return ids;
}

async function readCgi(branch: number, gid: number, tok: string, live: Set<number>, studied: Set<number>, markLive: boolean) {
  try {
    const rows = await readPages(`/v2api/${branch}/cgi/index?group_id=${gid}`, { group_id: gid }, tok);
    for (const row of rows) {
      const cid = cgiCustomerId(row);
      if (!cid) continue;
      studied.add(cid);
      if (markLive && cgiRecordLive(row)) live.add(cid);
    }
  } catch {
    if (markLive) diskLive(branch, gid, live);
  }
}

async function readPages(path: string, body: Record<string, unknown>, tok: string) {
  const items: Record<string, unknown>[] = [];
  let loaded = 0;
  let total = Number.POSITIVE_INFINITY;
  for (let page = 0; page < 200; page += 1) {
    const json = await request<unknown>(path, { ...body, page, pageSize: PAGE }, tok);
    const pack = crmUnwrapIndex(json);
    const batch = pack.items;
    const count = Number.isFinite(Number(pack.count)) ? Number(pack.count) : batch.length;
    total = crmIndexAccumTotal(page, PAGE, batch.length, pack.total, total);
    if (count === 0 || batch.length === 0) return items;
    items.push(...batch);
    loaded += count || batch.length;
    if (crmIndexShouldStop(PAGE, batch.length, pack.count, loaded, total)) return items;
  }
  throw new Error("список не кончился");
}

async function rejectNames(tok: string, kind: "customer-reject" | "lead-reject") {
  const byBranch = new Map<string, string>();
  for (const branch of BRANCHES) {
    try {
      const rows = await readPages(`/v2api/${branch}/${kind}/index`, {}, tok);
      for (const row of rows) {
        const id = Number(row.id);
        const name = String(row.name || "").trim();
        if (!Number.isFinite(id) || id <= 0 || !name) continue;
        byBranch.set(`${branch}:${id}`, name);
      }
    } catch {
      /* имя останется «причина N» */
    }
  }
  return byBranch;
}

function dobOf(row: Record<string, unknown>) {
  return step7Dob(row.dob);
}

export async function syncStep7List() {
  dropAlfaIndex();
  const tok = await alfaToken();
  const { live, studied } = await membershipSets(tok);
  const clientReasons = await rejectNames(tok, "customer-reject");
  const leadReasons = await rejectNames(tok, "lead-reject");
  const byId = new Map<number, LeadCard>();
  const notes: string[] = [];
  let dropped = 0;
  let clients = 0;
  let leads = 0;
  for (const branch of BRANCHES) {
    try {
      let n = 0;
      for (const studyFilter of [1, 0] as const) {
        const rows = await readPages(`/v2api/${branch}/customer/index`, { is_study: studyFilter, removed: 2 }, tok);
        for (const row of rows) {
          if (!step7KeepAny({ ...row, is_study: step7ListStudy(row, studyFilter) }, live)) {
            if (live.has(Number(row.id))) dropped += 1;
            continue;
          }
          const id = Number(row.id);
          if (byId.has(id)) continue;
          const study = step7ListStudy(row, studyFilter);
          const rejectId = step7RejectId(row, study);
          const names = study === 0 ? leadReasons : clientReasons;
          byId.set(id, {
            id,
            customerId: id,
            branchId: branch,
            branches: [branch],
            name: String(row.name || "").trim() || (study === 0 ? `лид ${id}` : `клиент ${id}`),
            age: "",
            phone: "",
            email: "",
            note: "",
            assigned: "",
            statusId: 0,
            at: new Date().toISOString(),
            chats: 0,
            cashState: "wait",
            rejectId,
            rejectName: rejectId ? names.get(`${branch}:${rejectId}`) || `причина ${rejectId}` : "",
            study,
            dob: dobOf(row),
            hadGroups: studied.has(id) || step7HadGroups(row),
            archivedAt: step7ArchiveDay(row),
          });
          n += 1;
          if (study === 0) leads += 1;
          else clients += 1;
        }
      }
      notes.push(`${branch}: ${n}`);
    } catch (e) {
      notes.push(`${branch}: ${e instanceof Error ? e.message : "обрыв"}`);
    }
  }
  const board = replaceStep7List([...byId.values()]);
  return { ok: true as const, note: `Шаг 7 · архив ${board.items.length} · клиенты ${clients} · лиды ${leads} · в живых группах снято ${dropped} · ${notes.join(" · ")}` };
}
