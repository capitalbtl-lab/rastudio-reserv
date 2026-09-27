/** Шаг 7. Архивные клиенты, которых нет в живых группах. Касса — тот же проход, что шаг 6. */

import { request, token as alfaToken, dropAlfaIndex } from "./alfacrm";
import { crmUnwrapIndex, crmIndexAccumTotal, crmIndexShouldStop } from "./crm-leads-stages";
import { replaceStep7List, peekStep7Board } from "./crm-leads";
import { liveAdminGroups } from "./crm-journal-pull";
import { dossiersInGroup, step7DiskRows } from "./dossiers";
import { cgiCustomerId, cgiRecordLive } from "./crm-membership";
import { step7ArchiveDay, step7AttendedIds, step7DiskFrom, step7DiskKeep, step7Dob, step7KeepAny, step7KeepFailedBranch, step7ListStudy, step7RejectId, type Step7DiskMonths } from "./crm-step7-core";
import { dossierCardArchive } from "./crm-archive-policy";
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

/** Явка на проведённом уроке группы с 2015-01-01. Запись в CGI сюда не входит. */
async function attendedCustomers(tok: string) {
  const ids = new Set<number>();
  const seen = new Set<string>();
  const lessonTo = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  for (const branch of BRANCHES) {
    for (const removed of [0, 2] as const) {
      const groups = await readPages(`/v2api/${branch}/group/index`, { removed }, tok);
      for (const g of groups) {
        const gid = Number(g.id);
        if (!gid) continue;
        if (removed === 0 && Number(g.removed) === 2) continue;
        const key = `${branch}:${gid}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const rows = await readPages(`/v2api/${branch}/lesson/index`, { group_id: gid, status: 3, date_from: "2015-01-01", date_to: lessonTo }, tok);
        for (const row of rows) for (const cid of step7AttendedIds(row)) ids.add(cid);
      }
    }
  }
  return ids;
}

export async function syncStep7List() {
  dropAlfaIndex();
  const tok = await alfaToken();
  const clientReasons = await rejectNames(tok, "customer-reject");
  const leadReasons = await rejectNames(tok, "lead-reject");
  const byId = new Map<number, LeadCard>();
  const notes: string[] = [];
  const failed = new Set<number>();
  for (const branch of BRANCHES) {
    try {
      const branchCards = new Map<number, LeadCard>();
      let n = 0;
      for (const studyFilter of [1, 0] as const) {
        const rows = await readPages(`/v2api/${branch}/customer/index`, { is_study: studyFilter, removed: 2 }, tok);
        for (const row of rows) {
          if (!step7KeepAny({ ...row, is_study: step7ListStudy(row, studyFilter) }, new Set())) continue;
          const id = Number(row.id);
          if (byId.has(id) || branchCards.has(id)) continue;
          const study = step7ListStudy(row, studyFilter);
          const rejectId = step7RejectId(row, study);
          const names = study === 0 ? leadReasons : clientReasons;
          branchCards.set(id, {
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
            hadGroups: false,
            archivedAt: step7ArchiveDay(row),
          });
          n += 1;
        }
      }
      for (const [id, card] of branchCards) if (!byId.has(id)) byId.set(id, card);
      notes.push(`${branch}: ${n}`);
      replaceStep7List(step7KeepFailedBranch([...byId.values()], peekStep7Board()?.items || [], failed));
    } catch (e) {
      failed.add(branch);
      notes.push(`${branch}: оставлено · ${e instanceof Error ? e.message : "обрыв"}`);
    }
  }
  let live = new Set<number>();
  let dropped = 0;
  try {
    live = (await membershipSets(tok)).live;
  } catch (e) {
    notes.push(`группы: ${e instanceof Error ? e.message : "обрыв"}`);
  }
  if (live.size) {
    for (const [id, card] of byId) {
      if (!live.has(id)) continue;
      byId.delete(id);
      dropped += 1;
      void card;
    }
    replaceStep7List(step7KeepFailedBranch([...byId.values()], peekStep7Board()?.items || [], failed));
  }
  let attended = new Set<number>();
  try {
    attended = await attendedCustomers(tok);
  } catch (e) {
    notes.push(`явки: ${e instanceof Error ? e.message : "обрыв"}`);
  }
  if (attended.size) {
    for (const card of byId.values()) card.hadGroups = attended.has(card.id);
  }
  const kept = step7KeepFailedBranch([...byId.values()], peekStep7Board()?.items || [], failed);
  const board = replaceStep7List(kept);
  let clients = 0;
  let leads = 0;
  for (const card of board.items) {
    if (card.study === 0) leads += 1;
    else if (card.study === 1) clients += 1;
  }
  return { ok: true as const, note: `Шаг 7 · архив ${board.items.length} · клиенты ${clients} · лиды ${leads} · учился в группах ${board.items.filter((x) => x.hadGroups).length} · в живых группах снято ${dropped} · ${notes.join(" · ")}` };
}

/** Перепроверка с диска: окно 1, 3 или 6 месяцев. Живые группы не входят. Касса — только новые клиенты. */
export function syncStep7FromDisk(months: Step7DiskMonths) {
  const from = step7DiskFrom(months);
  const prevIds = new Set((peekStep7Board()?.items || []).map((x) => x.id));
  const cards: LeadCard[] = [];
  const newClientIds: number[] = [];
  for (const row of step7DiskRows()) {
    const archivedAt = step7ArchiveDay({ e_date: row.eDate });
    const archived = dossierCardArchive(row.cardStatus, row.removed, "");
    if (!step7DiskKeep({ archived, archivedAt, live: row.live }, from)) continue;
    const study = row.studyRaw === "0" ? 0 : 1;
    cards.push({
      id: row.id,
      customerId: row.id,
      branchId: row.branchId || 1,
      branches: [row.branchId || 1],
      name: row.name || (study === 0 ? `лид ${row.id}` : `клиент ${row.id}`),
      age: "",
      phone: "",
      email: "",
      note: "",
      assigned: "",
      statusId: 0,
      at: new Date().toISOString(),
      chats: 0,
      cashState: "wait",
      study,
      dob: step7Dob(row.dob),
      hadGroups: row.hadGroup,
      archivedAt,
    });
    if (!prevIds.has(row.id) && study === 1) newClientIds.push(row.id);
  }
  const prev = peekStep7Board()?.items || [];
  const fresh = new Map(cards.map((c) => [c.id, c]));
  const keptIds = new Set<number>();
  const merged = prev.map((old) => {
    const next = fresh.get(old.id);
    if (!next) return old;
    keptIds.add(old.id);
    return { ...old, ...next, cashState: old.cashState, cashSort: old.cashSort };
  });
  for (const card of cards) if (!keptIds.has(card.id)) merged.push(card);
  const board = replaceStep7List(merged);
  return {
    ok: true as const,
    months,
    cards: cards.length,
    newClientIds,
    note: `Шаг 7 · с диска за ${months} мес. ${cards.length} · новых клиентов ${newClientIds.length} · на доске ${board.items.length}`,
  };
}

export function clearStep7Board() {
  const board = replaceStep7List([]);
  return { ok: true as const, note: `Шаг 7 · список очищен · ${board.items.length}` };
}
