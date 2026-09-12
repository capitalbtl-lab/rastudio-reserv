/** Шаг 1 «История из Alfa»: состав группы с cgi. В Alfa не пишет. */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { alfaToken, pagedIndex, request } from "./alfacrm";
import { cgiCustomerId, cgiRecordLive } from "./crm-membership";
import { applyCrmCustomer, dossiersInGroup, findDossier, upsertDossier } from "./dossiers";
import { CRM_READ_GAP_MS } from "./pupil-tariffs";

export type RosterAttendDays = 0 | 15 | 30 | 150;

export type RosterPolicy = {
  leads: boolean;
  archiveInLive: boolean;
  attendDays: RosterAttendDays;
};

const DEFAULT_POLICY: RosterPolicy = { leads: false, archiveInLive: true, attendDays: 0 };

function policyFile() {
  return join(process.cwd(), "storage", "crm-roster-policy.json");
}

export function loadRosterPolicy(): RosterPolicy {
  try {
    if (!existsSync(policyFile())) return { ...DEFAULT_POLICY };
    const raw = JSON.parse(readFileSync(policyFile(), "utf8")) as Partial<RosterPolicy>;
    const days = Number(raw.attendDays) || 0;
    return {
      leads: Boolean(raw.leads),
      archiveInLive: raw.archiveInLive !== false,
      attendDays: days === 15 || days === 30 || days === 150 ? days : 0,
    };
  } catch {
    return { ...DEFAULT_POLICY };
  }
}

export function saveRosterPolicy(next: Partial<RosterPolicy>) {
  const cur = loadRosterPolicy();
  const days = Number(next.attendDays ?? cur.attendDays) || 0;
  const data: RosterPolicy = {
    leads: next.leads != null ? Boolean(next.leads) : cur.leads,
    archiveInLive: next.archiveInLive != null ? Boolean(next.archiveInLive) : cur.archiveInLive,
    attendDays: days === 15 || days === 30 || days === 150 ? days : 0,
  };
  mkdirSync(dirname(policyFile()), { recursive: true });
  writeFileSync(policyFile(), JSON.stringify(data), "utf8");
  return data;
}

export function parseRosterFilter(raw: string): Partial<RosterPolicy> {
  const q = String(raw || "");
  const out: Partial<RosterPolicy> = {};
  if (/leads=1/.test(q)) out.leads = true;
  if (/leads=0/.test(q)) out.leads = false;
  if (/arch=0/.test(q)) out.archiveInLive = false;
  if (/arch=1/.test(q)) out.archiveInLive = true;
  const m = q.match(/days=(\d+)/);
  if (m) {
    const n = Number(m[1]);
    if (n === 0 || n === 15 || n === 30 || n === 150) out.attendDays = n as RosterAttendDays;
  }
  return out;
}

async function hydrateCustomer(branchId: number, cid: number, t: string) {
  const one = await request<{ items?: Record<string, unknown>[] }>(`/v2api/${branchId}/customer/index`, { page: 0, pageSize: 1, id: cid }, t).catch(
    () => ({ items: [] as Record<string, unknown>[] }),
  );
  const full = (one.items || []).find((x) => Number(x.id) === cid);
  if (!full) return false;
  applyCrmCustomer(full, branchId, Number(full.is_study) === 2, {}, { persist: true, quiet: true, byCrmOnly: true });
  return true;
}

function stampLink(cid: number, branchId: number, groupId: number, name: string, active: boolean) {
  const d = findDossier({ crmId: cid });
  const prev = (d?.groupLinks || []).find((l) => Number(l.id) === groupId && (!l.branchId || Number(l.branchId) === branchId));
  upsertDossier({
    crmId: cid,
    branchId,
    groupLink: {
      id: groupId,
      branchId,
      name: name || prev?.name || `группа ${groupId}`,
      active,
      school: prev?.school || "",
      subjectId: prev?.subjectId,
      courseId: prev?.courseId,
    },
    source: "alfacrm",
    quiet: true,
    byCrmOnly: true,
    persist: true,
  });
}

export async function pullGroupRoster(opts: { groupId: number; branchId: number; name?: string; force?: boolean }) {
  const gid = Number(opts.groupId) || 0;
  const bid = Number(opts.branchId) || 0;
  const name = String(opts.name || `группа ${gid}`);
  const force = Boolean(opts.force);
  if (!gid || !bid) return { ok: false as const, error: "Нет номера группы.", cgi: 0, added: 0, disk: 0, extra: "Нет номера группы." };
  const t = await alfaToken().catch(() => "");
  if (!t) return { ok: false as const, error: "Нет входа в AlfaCRM.", cgi: 0, added: 0, disk: 0, extra: "Нет входа в AlfaCRM." };
  const live = new Set<number>();
  await pagedIndex(
    `/v2api/${bid}/cgi/index?group_id=${gid}`,
    { group_id: gid },
    t,
    (it: Record<string, unknown>) => {
      if (!cgiRecordLive(it)) return;
      const cid = cgiCustomerId(it);
      if (cid) live.add(cid);
    },
    { pageSize: 100, pages: 8 },
  );
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let added = 0;
  let n = 0;
  for (const cid of live) {
    const d = findDossier({ crmId: cid });
    const need = !d || (force && !String(d.child?.fio || "").trim());
    if (!need) continue;
    if (n) await wait(CRM_READ_GAP_MS);
    n += 1;
    if (await hydrateCustomer(bid, cid, t)) added += 1;
  }
  for (const cid of live) stampLink(cid, bid, gid, name, true);
  for (const d of dossiersInGroup(bid, gid)) {
    const cid = Number(d.crmId) || 0;
    if (!cid || live.has(cid)) continue;
    stampLink(cid, bid, gid, name, false);
  }
  const disk = dossiersInGroup(bid, gid).filter((d) => (d.groupLinks || []).some((l) => Number(l.id) === gid && l.active !== false)).length;
  const extra = `${name} · в Alfa ${live.size} · на диске ${disk}${added ? ` · новых карточек ${added}` : ""}`;
  return { ok: true as const, error: "", cgi: live.size, added, disk, extra };
}
