/**
 * Ночной inbound групп: каталог → diff → cgi/абонементы только у hit.
 * Не syncAllFromCrm. Приоритет и курс не угадывает.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { nightGroupDiff, nightLockBusy, nightOnSiteReason, type NightGroupHit, type NightGroupRow } from "./crm-inbound-core.ts";

export type NightGroupLog = {
  at: string;
  ok: boolean;
  skipped?: string;
  ms: number;
  branches: number[];
  pages: number;
  added: number;
  revived: number;
  prolonged: number;
  updated: number;
  pickup: number;
  customerIds: number;
  liveTariffs: number;
  onSite: { groupId: number; branchId: number; kind: string; onSite: boolean; reason: string }[];
  note: string;
};

const g = globalThis as { __raCrmQueueBusy?: boolean; __raNightGroups?: boolean };

function lockFile() {
  return join(process.cwd(), "storage", "crm-night-groups.lock");
}

function logFile() {
  return join(process.cwd(), "storage", "crm-night-groups.json");
}

function pidAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readNightGroupLog(): NightGroupLog | null {
  try {
    if (!existsSync(logFile())) return null;
    return JSON.parse(readFileSync(logFile(), "utf8")) as NightGroupLog;
  } catch {
    return null;
  }
}

function writeLog(row: NightGroupLog) {
  mkdirSync(dirname(logFile()), { recursive: true });
  writeFileSync(logFile(), JSON.stringify(row, null, 0), "utf8");
}

export function tryNightLock(now = Date.now()) {
  let raw: { pid?: number; at?: string } | null = null;
  try {
    if (existsSync(lockFile())) raw = JSON.parse(readFileSync(lockFile(), "utf8"));
  } catch {
    raw = null;
  }
  if (nightLockBusy(raw, now, pidAlive)) return false;
  mkdirSync(dirname(lockFile()), { recursive: true });
  writeFileSync(lockFile(), JSON.stringify({ pid: process.pid, at: new Date(now).toISOString() }), "utf8");
  return true;
}

export function releaseNightLock() {
  try {
    if (existsSync(lockFile())) unlinkSync(lockFile());
  } catch {
    /* */
  }
}

export function nightHourMoscow(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", hour: "2-digit", hour12: false, minute: "2-digit" }).formatToParts(
    new Date(now),
  );
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  return { hour, minute };
}

export function nightWindowOpen(now = Date.now(), force = process.env.NIGHT_GROUPS_FORCE === "1") {
  if (force) return true;
  const { hour, minute } = nightHourMoscow(now);
  return hour === 4 && minute < 20;
}

function asRow(s: { branchId?: number; groupId?: number; statusId?: number; bDate?: string; eDate?: string; groupName?: string; name?: string }): NightGroupRow | null {
  const groupId = Number(s.groupId) || 0;
  const branchId = Number(s.branchId) || 0;
  if (!groupId || !branchId) return null;
  return {
    branchId,
    groupId,
    statusId: Number(s.statusId) || 0,
    bDate: String(s.bDate || ""),
    eDate: String(s.eDate || ""),
    name: String(s.groupName || s.name || ""),
  };
}

export async function runNightGroupInbound(opts?: { force?: boolean; now?: number }): Promise<NightGroupLog> {
  const t0 = Date.now();
  const empty = (patch: Partial<NightGroupLog>): NightGroupLog => ({
    at: new Date().toISOString(),
    ok: true,
    ms: Date.now() - t0,
    branches: [1, 2, 3, 4],
    pages: 0,
    added: 0,
    revived: 0,
    prolonged: 0,
    updated: 0,
    pickup: 0,
    customerIds: 0,
    liveTariffs: 0,
    onSite: [],
    note: "",
    ...patch,
  });

  if (!nightWindowOpen(opts?.now, opts?.force || process.env.NIGHT_GROUPS_FORCE === "1")) {
    const row = empty({ skipped: "не 04:00 Europe/Moscow", ok: true, note: "окно закрыто" });
    return row;
  }
  if (g.__raNightGroups || !tryNightLock(opts?.now)) {
    const row = empty({ skipped: "уже идёт", ok: true, note: "второй экземпляр не стартовал" });
    writeLog(row);
    try {
      const { logAdmin } = await import("./admin-settings");
      logAdmin("Ночной inbound групп: уже идёт, выход", "sync");
    } catch {
      /* */
    }
    return row;
  }
  g.__raNightGroups = true;
  const prevBusy = g.__raCrmQueueBusy;
  g.__raCrmQueueBusy = true;
  try {
    const { listAdminSlots, refreshCrmSchedule, bindSubjectsOnSite } = await import("./alfacrm-schedule");
    const { loadVersions, pushVersion } = await import("./crm-slots");
    const { loadSiteSignup } = await import("./site-signup");
    const { overlayMembershipChunk, dossiersInGroup } = await import("./dossiers");
    const { runCustomersPacket } = await import("./crm-packet-queue");
    const { logAdmin } = await import("./admin-settings");
    const { CRM_READ_GAP_MS } = await import("./pupil-tariffs");

    const disk = listAdminSlots().map(asRow).filter((x): x is NightGroupRow => Boolean(x));
    const prev = (loadVersions()[0]?.slots || []).map(asRow).filter((x): x is NightGroupRow => Boolean(x));

    const cat = await refreshCrmSchedule({ mode: "night" });
    bindSubjectsOnSite();
    try {
      pushVersion("Ночной inbound групп", cat.slots);
    } catch {
      /* */
    }

    const incoming = (cat.inbound || []).map((g) => ({
      branchId: g.branchId,
      groupId: g.groupId,
      statusId: g.statusId,
      bDate: g.bDate,
      eDate: g.eDate,
      name: g.name,
    }));
    const hits = nightGroupDiff({ disk, prev, incoming });
    const pub = loadSiteSignup().statusPublish;
    const after = listAdminSlots();
    const onSite: NightGroupLog["onSite"] = [];
    for (const hit of hits) {
      const slot = after.find((s) => s.groupId === hit.groupId && s.branchId === hit.branchId) || after.find((s) => s.groupId === hit.groupId);
      const why = nightOnSiteReason(slot || hit, pub);
      onSite.push({ groupId: hit.groupId, branchId: hit.branchId, kind: hit.kind, onSite: why.onSite, reason: why.reason });
    }

    const customerIds = new Set<number>();
    let liveTariffs = 0;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < hits.length; i += 1) {
      if (i) await wait(CRM_READ_GAP_MS);
      const hit = hits[i];
      const mem = await overlayMembershipChunk(0, 1, [{ groupId: hit.groupId, branchId: hit.branchId, name: hit.name }], {
        forceCgi: true,
        skipTariffs: true,
      });
      const fromCgi = (mem.customerIds || []).filter((n) => n > 0);
      const fromDisk = dossiersInGroup(hit.branchId, hit.groupId)
        .filter((d) => (d.groupLinks || []).some((x) => Number(x.id) === hit.groupId && Number(x.branchId || hit.branchId) === hit.branchId && x.active !== false))
        .map((d) => Number(d.crmId) || 0)
        .filter((n) => n > 0);
      const ids = [...new Set([...fromCgi, ...fromDisk])];
      for (const id of ids) customerIds.add(id);
      const byBranch = new Map<number, number[]>();
      byBranch.set(hit.branchId, ids);
      for (const [branchId, list] of byBranch) {
        for (let p = 0; p < list.length; p += 40) {
          const chunk = list.slice(p, p + 40);
          if (!chunk.length) continue;
          if (p) await wait(CRM_READ_GAP_MS);
          const tar = await runCustomersPacket(branchId, chunk);
          liveTariffs += Number(tar.liveInPacket || 0);
        }
      }
    }

    const added = hits.filter((h) => h.kind === "added").length;
    const revived = hits.filter((h) => h.kind === "revived").length;
    const prolonged = hits.filter((h) => h.kind === "prolonged").length;
    const row = empty({
      ok: true,
      pages: Number(cat.pages) || 0,
      added,
      revived,
      prolonged,
      updated: Number(cat.updated) || 0,
      pickup: hits.length,
      customerIds: customerIds.size,
      liveTariffs,
      onSite,
      note: `филиалы 1–4, страницы ${Number(cat.pages) || 0}, добор ${hits.length}`,
    });
    writeLog(row);
    logAdmin(
      `Ночной inbound групп: added ${added}, revived ${revived}, prolonged ${prolonged}, updated ${row.updated}, добор ${hits.length}, учеников ${customerIds.size}, ${row.ms}мс`,
      "sync",
    );
    return row;
  } catch (e) {
    const row = empty({
      ok: false,
      note: e instanceof Error ? e.message : "ночной inbound не прошёл",
    });
    writeLog(row);
    try {
      const { logAdmin } = await import("./admin-settings");
      logAdmin(`Ночной inbound групп: ${row.note}`, "sync");
    } catch {
      /* */
    }
    return row;
  } finally {
    g.__raNightGroups = false;
    g.__raCrmQueueBusy = prevBusy;
    releaseNightLock();
    void import("./crm-export-queue")
      .then((m) => m.tickExportQueue(2))
      .catch(() => null);
  }
}

export function nightPickupKeys(hits: NightGroupHit[]) {
  return hits.map((h) => `${h.branchId}:${h.groupId}`);
}
