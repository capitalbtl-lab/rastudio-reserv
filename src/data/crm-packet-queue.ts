import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { emptyCrmQueue, mergeCrmPacket, overlayStale, overlayEnqueueOffset, pickNextPacket, type CrmPacket, type CrmPacketDraft, type CrmQueueState } from "./crm-packet-queue-core";
import { loadCachePolicy, stampOverlay, stampJournalCursor, journalStale } from "./crm-cache-policy";
import { logAdmin } from "./admin-settings";
import { alfaLinkedNow } from "./crm-alfa-link";

export type { CrmPacket, CrmQueueState };

function fileOf() {
  return join(process.cwd(), "storage", "crm-packet-queue.json");
}

const g = globalThis as { __raCrmQueueBusy?: boolean; __raCrmLastKind?: string };

function loadQueue(): CrmQueueState {
  try {
    if (!existsSync(fileOf())) return emptyCrmQueue();
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as CrmQueueState;
    return { packets: Array.isArray(raw.packets) ? raw.packets : [], lastAt: String(raw.lastAt || ""), lastNote: String(raw.lastNote || "") };
  } catch {
    return emptyCrmQueue();
  }
}

function saveQueue(q: CrmQueueState) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify({ packets: q.packets.slice(0, 80), lastAt: q.lastAt, lastNote: q.lastNote }, null, 0), "utf8");
  return q;
}

export function crmQueueSnapshot() {
  const q = loadQueue();
  const pol = loadCachePolicy();
  return {
    pending: q.packets.length,
    lastAt: q.lastAt,
    lastNote: q.lastNote,
    overlayNext: pol.overlayNext,
    overlayTotal: pol.overlayTotal,
    overlayAt: pol.overlayAt,
    busy: Boolean(g.__raCrmQueueBusy),
    packets: q.packets.map((p) => p.kind),
  };
}

export function enqueueCrmPacket(incoming: CrmPacketDraft) {
  const q = loadQueue();
  q.packets = mergeCrmPacket(q.packets, incoming);
  q.lastAt = new Date().toISOString();
  saveQueue(q);
  return crmQueueSnapshot();
}

export function enqueueCrmOverlay(fromStart = false) {
  if (!alfaLinkedNow()) return crmQueueSnapshot();
  const pol = loadCachePolicy();
  const rule = pol.rules.pupilTariffs;
  const stale = overlayStale({
    cache: rule.cache,
    ttlMin: rule.ttlMin,
    overlayAt: pol.overlayAt,
    overlayNext: pol.overlayNext,
    overlayTotal: pol.overlayTotal,
  });
  const plan = overlayEnqueueOffset({
    fromStart,
    overlayNext: pol.overlayNext,
    overlayTotal: pol.overlayTotal,
    stale,
  });
  if (plan.skip) return crmQueueSnapshot();
  if (plan.restart) stampOverlay(0, pol.overlayTotal || 0);
  return enqueueCrmPacket({ kind: "overlay", offset: plan.offset });
}

export function enqueueJournalOverlay(fromStart = false) {
  if (!alfaLinkedNow()) return crmQueueSnapshot();
  if (!fromStart) {
    const q = loadQueue();
    if (q.packets.some((p) => p.kind === "journal")) return crmQueueSnapshot();
  }
  const pol = loadCachePolicy();
  const stale = fromStart || journalStale();
  const plan = overlayEnqueueOffset({
    fromStart,
    overlayNext: pol.journalNext || 0,
    overlayTotal: pol.journalTotal || 0,
    stale,
  });
  if (plan.skip) return crmQueueSnapshot();
  if (plan.restart) stampJournalCursor(0, pol.journalTotal || 0);
  return enqueueCrmPacket({ kind: "journal", offset: plan.offset });
}

export function enqueueGroupPacket(branchId: number, groupId: number, name?: string) {
  if (!branchId || !groupId) return crmQueueSnapshot();
  return enqueueCrmPacket({ kind: "group", branchId, groupId, name });
}

export function enqueueCustomerPacket(branchId: number, ids: number[]) {
  const list = [...new Set(ids.map(Number).filter((n) => n > 0))];
  if (!branchId || !list.length) return crmQueueSnapshot();
  return enqueueCrmPacket({ kind: "customers", branchId, ids: list });
}

function dropPacket(id: string) {
  const q = loadQueue();
  q.packets = q.packets.filter((p) => p.id !== id);
  saveQueue(q);
}

async function runCustomersPacket(branchId: number, ids: number[]) {
  const { request, token } = await import("./alfacrm");
  const { listCgiByCustomer, groupsOfCustomerFromCgi } = await import("./crm-membership");
  const { tariffRowLive, tariffRowCustomerId } = await import("./crm-tariff-row");
  const { crmUnwrapIndex } = await import("./crm-leads-stages");
  const { stampDossierLiveTariff, upsertDossier, findDossier, liveTariffIdsFromStore } = await import("./dossiers");
  const { mergeCgiGroupLinks } = await import("./crm-group-disk");
  const t = await token();
  let liveN = 0;
  for (const cid of ids.slice(0, 40)) {
    const cgi = await listCgiByCustomer(request, t, branchId, cid);
    const groups = groupsOfCustomerFromCgi(cgi, cid, branchId);
    const json = await request(`/v2api/${branchId}/customer-tariff/index?customer_id=${cid}`, { page: 0, pageSize: 30, customer_id: cid }, t).catch(
      () => ({}),
    );
    const live = crmUnwrapIndex(json).items.some((it) => tariffRowLive(it) && tariffRowCustomerId(it) === cid);
    if (live) liveN += 1;
    stampDossierLiveTariff([cid], live);
    if (groups.length) {
      const d = findDossier({ crmId: cid });
      upsertDossier({
        crmId: cid,
        branchId,
        groupLinks: mergeCgiGroupLinks(
          d?.groupLinks,
          groups.map((g) => ({
            id: g.id,
            name: g.name || `группа ${g.id}`,
            branchId: g.branchId,
            school: "",
            active: true,
          })),
        ),
        source: "alfacrm",
        crmWins: true,
      });
    }
  }
  const all = liveTariffIdsFromStore();
  return { ok: true as const, done: false, ids: all, live: all.length, extra: `проверка ${ids.length} учеников, живых в пакете ${liveN}`, next: 0, total: 0, scanned: ids.length };
}

export async function tickCrmQueue(take = 3, opts?: { skipJournal?: boolean }) {
  if (!alfaLinkedNow()) {
    const { liveTariffIdsFromStore } = await import("./dossiers");
    const ids = liveTariffIdsFromStore();
    const pol = loadCachePolicy();
    return {
      ok: true as const,
      done: true,
      ids,
      live: ids.length,
      next: pol.overlayNext,
      total: pol.overlayTotal,
      extra: "без Alfa",
      fromCache: true,
    };
  }
  if (g.__raCrmQueueBusy) return { ok: true as const, busy: true, done: false, ids: [] as number[], next: 0, total: 0, extra: "пакет уже идёт" };
  g.__raCrmQueueBusy = true;
  try {
    const q = loadQueue();
    const packets = opts?.skipJournal ? q.packets.filter((p) => p.kind !== "journal") : q.packets;
    const picked =
      g.__raCrmLastKind === "journal" && packets.some((p) => p.kind === "overlay")
        ? packets.find((p) => p.kind === "overlay") || pickNextPacket(packets)
        : pickNextPacket(packets);
    const { overlayMembershipChunk, overlayAdminGroups, liveTariffIdsFromStore } = await import("./dossiers");
    if (!picked) {
      const ids = liveTariffIdsFromStore();
      const pol = loadCachePolicy();
      return { ok: true as const, done: true, ids, live: ids.length, next: pol.overlayNext, total: pol.overlayTotal, extra: "очередь пуста", fromCache: true };
    }
    let res: { ok: true; done: boolean; ids: number[]; live?: number; extra?: string; next?: number; total?: number; scanned?: number };
    if (picked.kind === "group") {
      res = await overlayMembershipChunk(0, 1, [{ groupId: picked.groupId, branchId: picked.branchId, name: picked.name || `группа ${picked.groupId}` }]);
    } else if (picked.kind === "customers") {
      res = await runCustomersPacket(picked.branchId, picked.ids);
    } else if (picked.kind === "journal") {
      const { inboundJournalChunk } = await import("./crm-journal-inbound");
      const offset = Math.max(0, picked.offset || 0);
      res = await inboundJournalChunk(offset, 2);
      if (!res.done) {
        const nq = loadQueue();
        nq.packets = mergeCrmPacket(
          nq.packets.filter((p) => p.id !== picked.id),
          { kind: "journal", offset: Number(res.next) || offset + 2 },
        );
        nq.lastAt = new Date().toISOString();
        nq.lastNote = res.extra || "";
        saveQueue(nq);
        g.__raCrmLastKind = picked.kind;
        return { ...res, busy: false };
      }
    } else {
      const total = overlayAdminGroups().length;
      const offset = Math.max(0, picked.offset || 0);
      res = await overlayMembershipChunk(offset, take);
      if (!res.done) {
        const nq = loadQueue();
        nq.packets = mergeCrmPacket(
          nq.packets.filter((p) => p.id !== picked.id),
          { kind: "overlay", offset: Number(res.next) || offset + take },
        );
        nq.lastAt = new Date().toISOString();
        nq.lastNote = res.extra || "";
        saveQueue(nq);
        g.__raCrmLastKind = picked.kind;
        return { ...res, busy: false };
      }
    }
    dropPacket(picked.id);
    g.__raCrmLastKind = picked.kind;
    const nq = loadQueue();
    nq.lastAt = new Date().toISOString();
    nq.lastNote = res.extra || picked.kind;
    saveQueue(nq);
    return { ...res, busy: false, total: res.total || overlayAdminGroups().length };
  } catch (e) {
    const nq = loadQueue();
    nq.lastAt = new Date().toISOString();
    nq.lastNote = e instanceof Error ? e.message : "пакет не прошёл";
    saveQueue(nq);
    logAdmin(`Очередь CRM: ${nq.lastNote}`, "sync");
    return { ok: false as const, error: nq.lastNote, done: false, ids: [] as number[], next: 0, total: 0, extra: nq.lastNote };
  } finally {
    g.__raCrmQueueBusy = false;
    void import("./crm-export-queue").then((m) => m.tickExportQueue(2)).catch(() => null);
  }
}

export async function ensureAndTick(opts?: { force?: boolean; offset?: number | null; take?: number }) {
  const { liveTariffIdsFromStore, overlayAdminGroups } = await import("./dossiers");
  const pol = loadCachePolicy();
  const total = overlayAdminGroups().length;
  const ids = liveTariffIdsFromStore();
  if (!alfaLinkedNow()) {
    return {
      ok: true as const,
      ids,
      total,
      live: ids.length,
      fromCache: true,
      done: true,
      next: pol.overlayNext,
      scanned: ids.length,
      extra: "без Alfa",
    };
  }
  const rule = pol.rules.pupilTariffs;
  const stale = overlayStale({
    cache: rule.cache,
    ttlMin: rule.ttlMin,
    overlayAt: pol.overlayAt,
    overlayNext: pol.overlayNext,
    overlayTotal: pol.overlayTotal || total,
  });
  if (opts?.offset == null && !opts?.force && !stale && ids.length) {
    kickBackground();
    return {
      ok: true as const,
      ids,
      total,
      live: ids.length,
      fromCache: true,
      done: true,
      next: pol.overlayNext,
      scanned: ids.length,
      extra: "из хранилища сайта",
    };
  }
  if (opts?.force) {
    enqueueCrmOverlay(true);
    enqueueJournalOverlay(true);
  } else if (stale || opts?.offset != null) {
    const q = loadQueue();
    if (!q.packets.some((p) => p.kind === "overlay")) {
      enqueueCrmPacket({ kind: "overlay", offset: opts?.offset ?? pol.overlayNext ?? 0 });
    }
  }
  if (journalStale() && !opts?.force) enqueueJournalOverlay(false);
  const take = Number(opts?.take) || 3;
  const res = await tickCrmQueue(take, { skipJournal: true });
  kickBackground();
  return { ...res, fromCache: false, total: Number(res.total) || total };
}

function kickBackground() {
  const pol = loadCachePolicy();
  const rule = pol.rules.pupilTariffs;
  const cgiStale = overlayStale({
    cache: rule.cache,
    ttlMin: rule.ttlMin,
    overlayAt: pol.overlayAt,
    overlayNext: pol.overlayNext,
    overlayTotal: pol.overlayTotal,
  });
  const needJournal = journalStale();
  if (!cgiStale && !needJournal) return;
  if (cgiStale) enqueueCrmOverlay(false);
  if (needJournal) enqueueJournalOverlay(false);
  if (g.__raCrmQueueBusy) return;
  void tickCrmQueue(3);
}
