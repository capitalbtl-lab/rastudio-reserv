/** Фон «Истории из Alfa»: один шаг, пауза, следующий. Вкладка только смотрит. В Alfa не пишет. */

import { journalPullGroups, groupFillRow, journalPeopleSide, liveAdminGroups } from "./crm-journal-pull";
import { historyLoadOne, historyPullKind } from "./crm-history-load";
import { journalChunks, clampGrain, type Grain } from "./crm-journal-periods";
import {
  emptyJournalJob,
  jobGapMs,
  loadJournalJob,
  mergeJobPatch,
  peopleJobQueue,
  saveJournalJob,
  shouldRetryCash,
  tryHistoryTickLock,
  touchHistoryTickLock,
  releaseHistoryTickLock,
  historyWorkerSilent,
  stoppedJobMsg,
  shouldResumeStalledJob,
  jobRetryGapMs,
  RECHECK_STALL_MS,
  JOB_WAIT_CAP,
  type JournalJob,
  type JournalJobItem,
  type JournalJobMode,
  type PeopleJobRow,
} from "./crm-journal-job-core";

export {
  journalJobSnapshot,
  loadJournalJob,
  PEOPLE_JOB_GAP_MS,
  CATALOG_JOB_GAP_MS,
  AUDIT_JOB_GAP_MS,
  peopleJobQueue,
  peopleJobFinished,
  shouldRetryCash,
  jobGapMs,
  mergeJobPatch,
  parseJobItems,
  JOB_WAIT_CAP,
} from "./crm-journal-job-core";

const g = globalThis as { __raJournalJobTick?: boolean; __raJournalWatch?: ReturnType<typeof setInterval> };

const STALE_LOCK_MS = 180_000;

/** Только процесс rastudio-history крутит очередь. Сайт пишет файл и читает статус. */
export function isHistoryWorker() {
  return process.env.RA_HISTORY_WORKER === "1";
}

function nowIso() {
  return new Date().toISOString();
}

function patch(extra: Partial<JournalJob>) {
  const cur = loadJournalJob();
  const next = { ...mergeJobPatch(cur, extra), lastAt: nowIso() };
  return saveJournalJob(next);
}

async function sleepGap(ms: number, id = "") {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const j = loadJournalJob();
    if (j.stop || (id && j.id !== id)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** Стоп не ждёт ответ Alfa: шаг бросает ожидание, запрос догорает вхолостую. */
async function awaitWhileJob<T>(id: string, task: Promise<T>): Promise<{ stopped: true } | { value: T }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearInterval(iv);
      fn();
    };
    const iv = setInterval(() => {
      const j = loadJournalJob();
      if (j.stop || (id && j.id !== id)) finish(() => resolve({ stopped: true }));
    }, 250);
    task.then(
      (value) => finish(() => resolve({ value })),
      (err) => finish(() => reject(err)),
    );
  });
}

function stoppedMsg(job?: JournalJob) {
  const j = job || loadJournalJob();
  return stoppedJobMsg(Number(j.n) || 0, Number(j.total) || 0);
}

function packGrain(parts: { key: string; label: string; from: string; to: string; done: boolean; weak?: boolean; rechecked?: boolean; lessons?: number; needDetails?: number; conducted?: number; at?: string; err?: string }[], grain: Grain) {
  const list = parts || [];
  const byKey = new Map(list.map((p) => [p.key, p]));
  const have = new Set(list.map((p) => p.key));
  return journalChunks(grain)
    .filter((c) => c.keys.some((k) => have.has(k)))
    .map((c) => {
      const present = c.keys.filter((k) => have.has(k));
      const done = present.every((k) => byKey.get(k)?.done);
      const weak = present.some((k) => byKey.get(k)?.weak);
      const rechecked = present.length > 0 && present.every((k) => byKey.get(k)?.rechecked);
      return { key: c.key, label: c.label, done, weak, rechecked };
    });
}

function nextGroupPart(
  parts: { key: string; label: string; done: boolean; weak?: boolean; rechecked?: boolean; at?: string }[],
  grain: Grain,
  age?: string,
) {
  const chunks = packGrain(parts, clampGrain(age, grain));
  const hole = chunks.find((c) => !c.done || c.weak);
  if (hole) return hole;
  const unverified = chunks.find((c) => !c.rechecked);
  if (unverified) return unverified;
  return chunks[0] || null;
}

function fillFinished(parts: { done: boolean; weak?: boolean }[], grain: Grain, age?: string) {
  const chunks = packGrain(parts, clampGrain(age, grain));
  return chunks.length > 0 && chunks.every((c) => c.done && !c.weak);
}

function fillNeedsRecheck(parts: { done: boolean; weak?: boolean; rechecked?: boolean }[], grain: Grain, age?: string) {
  const chunks = packGrain(parts, clampGrain(age, grain));
  return fillFinished(parts, grain, age) && chunks.some((c) => !c.rechecked);
}

export type StartJournalJobOpts = {
  mode: JournalJobMode;
  kind?: string;
  study?: "1" | "2";
  recheck?: boolean;
  dateFrom?: string;
  grain?: Grain;
  school?: string;
  groupId?: number;
  branchId?: number;
  customerId?: number;
  take?: number;
  filter?: string;
  probe?: boolean;
  name?: string;
  periodKey?: string;
  periodLabel?: string;
  items?: JournalJobItem[];
  archived?: boolean;
};

function emptyMsg(mode: JournalJobMode, recheck: boolean) {
  if (mode === "people" || mode === "people-recheck") {
    return recheck || mode === "people-recheck"
      ? "Справа никого перепроверять. Сначала красная «Загрузить по одному»."
      : "Слева пусто. Нажмите «Перепроверить по одному» — пройдёт тех, кто справа.";
  }
  if (mode === "groups") return "Слева пусто. Нажмите «Перепроверить по одному» — пройдёт тех, кто справа.";
  if (mode === "groups-recheck") return "Справа никого перепроверять. Сначала красная «Загрузить по одному».";
  if (mode === "audit") return "Нет текущих учеников на диске.";
  if (mode === "catalog") return "Архив клиентов: некого писать.";
  if (mode === "life") return "Сначала загрузите группы.";
  if (mode === "archives") return "Архивных групп нет.";
  if (mode === "archivesPupils") return "Новых архивных групп по карточкам нет.";
  if (mode === "probe") return "Нет текущих учеников в списке.";
  if (mode === "details") return "ДЗ грузить нечего.";
  if (mode === "count") return "Некого считать.";
  if (mode === "roster") return "Слева пусто. Состав групп уже на диске. «Перепроверить» — сверка cgi.";
  if (mode === "roster-recheck") return "Справа нечего перепроверять. Сначала красная «Загрузить по одному».";
  return "грузить нечего";
}

function buildItems(opts: StartJournalJobOpts): JournalJobItem[] {
  const mode = opts.mode;
  if (mode === "person") {
    const cid = Number(opts.customerId) || 0;
    if (!cid) return [];
    return [{ cid, branchId: Number(opts.branchId) || 1, name: opts.name || `№${cid}` }];
  }
  if (mode === "count") return [{ name: "отбор архива" }];
  if (mode === "people" || mode === "people-recheck" || mode === "probe" || mode === "audit") {
    const given = (opts.items || [])
      .map((r) => ({ cid: Number(r.cid) || 0, branchId: Number(r.branchId) || 1, name: String(r.name || "") }))
      .filter((r) => r.cid);
    if (given.length && mode !== "audit") return given;
    const study = opts.study === "2" ? "2" : "1";
    const side = journalPeopleSide(study);
    const people = (side.people || []) as PeopleJobRow[];
    const kind = opts.kind === "balance" ? "balance" : "students";
    if (mode === "audit") {
      let queue = [...people];
      const one = Number(opts.customerId) || 0;
      if (one) queue = queue.filter((r) => r.cid === one);
      return queue.map((r) => ({ cid: r.cid, branchId: r.branchId, name: r.name }));
    }
    if (mode === "probe") {
      const unseen = people.filter((r) => (r as { alfa?: number }).alfa == null);
      const hole = people.filter((r) => r.short || r.dups);
      const seen = new Set(unseen.map((r) => r.cid));
      const queue = [...unseen, ...hole.filter((r) => !seen.has(r.cid))];
      return queue.map((r) => ({ cid: r.cid, branchId: r.branchId, name: r.name }));
    }
    const queue = peopleJobQueue(people, kind, mode === "people-recheck" || Boolean(opts.recheck));
    return queue.map((r) => ({ cid: r.cid, branchId: r.branchId, name: r.name }));
  }
  if (mode === "details") {
    const groups = journalPullGroups();
    const hit =
      groups.find((g) => g.groupId === Number(opts.groupId) && (!opts.branchId || g.branchId === Number(opts.branchId))) ||
      groups.find((g) => g.groupId === Number(opts.groupId));
    if (!hit) return [];
    if (opts.periodKey) {
      return [{ groupId: hit.groupId, branchId: hit.branchId, name: hit.name, periodKey: opts.periodKey, periodLabel: opts.periodLabel || opts.periodKey }];
    }
    const row = groupFillRow(hit);
    return (row.parts || [])
      .filter((p) => (Number(p.needDetails) || 0) > 0)
      .map((p) => ({ groupId: hit.groupId, branchId: hit.branchId, name: hit.name, periodKey: p.key, periodLabel: p.label }));
  }
  if (mode === "groups" || mode === "groups-recheck" || mode === "group-one") {
    const grain = (opts.grain || "quarter") as Grain;
    const school = String(opts.school || "");
    const wantArch = Boolean(opts.archived);
    const groups = journalPullGroups().filter((g) => {
      if (school && g.school !== school) return false;
      return wantArch ? Boolean(g.archived) : !g.archived;
    });
    const givenG = (opts.items || [])
      .map((r) => ({
        groupId: Number(r.groupId) || 0,
        branchId: Number(r.branchId) || 0,
        name: String(r.name || ""),
        periodKey: r.periodKey,
        periodLabel: r.periodLabel,
      }))
      .filter((r) => r.groupId);
    if (givenG.length && mode !== "group-one") return givenG;
    if (mode === "group-one") {
      const all = journalPullGroups();
      const hit = all.find((g) => g.groupId === Number(opts.groupId) && (!opts.branchId || g.branchId === Number(opts.branchId))) || all.find((g) => g.groupId === Number(opts.groupId));
      if (!hit) return [];
      if (opts.periodKey) {
        return [{ groupId: hit.groupId, branchId: hit.branchId, name: hit.name, periodKey: opts.periodKey, periodLabel: opts.periodLabel || opts.periodKey }];
      }
      const row = groupFillRow(hit);
      const chunks = packGrain(row.parts || [], clampGrain(row.age, grain));
      return chunks.map((c) => ({ groupId: hit.groupId, branchId: hit.branchId, name: hit.name, periodKey: c.key, periodLabel: c.label }));
    }
    const rows = groups.map((g) => groupFillRow(g));
    const need = rows.filter((r) => (mode === "groups-recheck" ? fillNeedsRecheck(r.parts || [], grain, r.age) : !fillFinished(r.parts || [], grain, r.age) || (r.parts || []).some((p) => p.weak)));
    const done = rows.filter((r) => fillFinished(r.parts || [], grain, r.age));
    const queue = mode === "groups-recheck" ? (need.length ? need : done) : need;
    return queue.map((r) => ({ groupId: r.groupId, branchId: r.branchId, name: r.name }));
  }
  if (mode === "catalog") return [{ name: "архив клиентов" }];
  if (mode === "life") return [{ name: "сроки групп" }];
  if (mode === "archives") return [{ name: "архивные группы" }];
  if (mode === "archivesPupils") return [{ name: "архив групп учеников" }];
  if (mode === "roster" || mode === "roster-recheck") {
    const school = String(opts.school || "");
    const wantArch = Boolean(opts.archived);
    const groups = wantArch
      ? journalPullGroups().filter((g) => g.archived && (!school || g.school === school))
      : liveAdminGroups(school);
    const given = (opts.items || [])
      .map((r) => ({ groupId: Number(r.groupId) || 0, branchId: Number(r.branchId) || 0, name: String(r.name || "") }))
      .filter((r) => r.groupId);
    if (given.length) return given;
    const rows = groups.map((g) => groupFillRow(g));
    const need = rows.filter((r) => (mode === "roster-recheck" ? Boolean(r.roster) : !r.roster));
    const done = rows.filter((r) => Boolean(r.roster));
    const queue = mode === "roster-recheck" ? (need.length ? need : done) : need;
    return queue.map((r) => ({ groupId: r.groupId, branchId: r.branchId, name: r.name }));
  }
  return [];
}

function loopPullKind(mode: JournalJobMode | ""): "archiveCatalog" | "life" | "archives" | "archivesPupils" | "" {
  if (mode === "catalog") return "archiveCatalog";
  if (mode === "life" || mode === "archives" || mode === "archivesPupils") return mode;
  return "";
}

export function startJournalJob(opts: StartJournalJobOpts): JournalJob {
  const cur = loadJournalJob();
  if (cur.running && !cur.stop) {
    kickHistoryTick();
    return cur;
  }
  const mode = opts.mode;
  const kind =
    mode === "audit"
      ? "audit"
      : mode === "catalog"
        ? "archiveCatalog"
        : mode === "life"
          ? "life"
          : mode === "archives"
            ? "archives"
            : mode === "archivesPupils"
              ? "archivesPupils"
              : mode === "details"
                ? "details"
              : mode === "count"
                ? "archiveCount"
              : mode === "groups" || mode === "groups-recheck" || mode === "group-one"
                ? "group"
              : mode === "roster" || mode === "roster-recheck"
                ? "roster"
                : opts.kind || "students";
  const recheck = Boolean(opts.recheck) || mode === "people-recheck" || mode === "groups-recheck" || mode === "roster-recheck" || (mode === "group-one" && !opts.periodKey);
  const items = buildItems({ ...opts, kind, recheck });
  if (!items.length && !loopPullKind(mode)) {
    return saveJournalJob({
      ...emptyJournalJob(),
      id: `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      mode,
      kind,
      study: opts.study === "2" ? "2" : "1",
      msg: emptyMsg(mode, recheck),
      lastAt: nowIso(),
    });
  }
  const first = items[0];
  const job: JournalJob = {
    ...emptyJournalJob(),
    id: `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    running: true,
    stop: false,
    mode,
    kind,
    study: opts.study === "2" ? "2" : "1",
    recheck,
    dateFrom: String(opts.dateFrom || "").trim() || "2015-01-01",
    grain: opts.grain === "half" || opts.grain === "year" ? opts.grain : "quarter",
    school: String(opts.school || opts.filter || ""),
    groupId: Number(opts.groupId) || Number(first?.groupId) || 0,
    branchId: Number(opts.branchId) || Number(first?.branchId) || 0,
    customerId: Number(opts.customerId) || Number(first?.cid) || 0,
    take: Number(opts.take) || 0,
    filter: String(opts.filter || ""),
    catalogFirst: mode === "catalog",
    items,
    idx: 0,
    waits: 0,
    cur: first?.name || "",
    n: 0,
    total: loopPullKind(mode) ? 0 : items.length,
    msg: mode === "people-recheck" || (mode === "people" && recheck) ? `${first?.name}: перепроверяем. Потом пауза 5 с.` : mode === "audit" ? `${first?.name}: сверяем. Потом пауза 5 с.` : `${first?.name}: грузим. Потом пауза 5 с.`,
    fill: fillOf(mode, kind, first),
    startedAt: nowIso(),
    lastAt: nowIso(),
  };
  saveJournalJob(job);
  kickHistoryTick();
  return job;
}

export function stopJournalJob() {
  const j = loadJournalJob();
  return saveJournalJob({
    ...j,
    stop: true,
    running: false,
    cur: "",
    fill: null,
    lastAt: nowIso(),
    msg: stoppedMsg(j),
  });
}

export function startJournalJobWatch() {
  if (process.env.NODE_ENV === "test") return;
  if (!isHistoryWorker()) return;
  if (g.__raJournalWatch) return;
  g.__raJournalWatch = setInterval(() => {
    resumeJournalJobFromDisk();
    resumeStalledRecheck();
  }, 1000);
  setTimeout(() => {
    resumeJournalJobFromDisk();
    resumeStalledRecheck();
  }, 200);
}

function resumeStalledRecheck() {
  const j = loadJournalJob();
  if (!shouldResumeStalledJob(j)) return;
  if (j.stop) return;
  if (!j.running) {
    saveJournalJob({ ...j, running: true, lastAt: nowIso(), msg: j.msg || "Продолжаем с того же." });
  }
  void tickJob();
}

function kickHistoryTick() {
  if (process.env.NODE_ENV === "test") return;
  if (isHistoryWorker()) {
    startJournalJobWatch();
    if (!g.__raJournalJobTick) void tickJob();
    return;
  }
  setTimeout(() => {
    const j = loadJournalJob();
    if (!j.running || j.stop) return;
    if (historyWorkerSilent(j, 2500)) resumeJournalJobFromDisk();
  }, 3000);
}

function resumeJournalJobFromDisk() {
  const j = loadJournalJob();
  if (!j.running || j.stop) return;
  if (!isHistoryWorker() && !historyWorkerSilent(j)) return;
  const age = Date.now() - Date.parse(j.lastAt || j.startedAt || "");
  if (g.__raJournalJobTick && Number.isFinite(age) && age > STALE_LOCK_MS) g.__raJournalJobTick = false;
  void tickJob();
}

export function resumeJournalJob() {
  if (isHistoryWorker()) {
    startJournalJobWatch();
    resumeJournalJobFromDisk();
    return loadJournalJob();
  }
  if (historyWorkerSilent()) resumeJournalJobFromDisk();
  return loadJournalJob();
}

export async function runHistoryWorker() {
  process.env.RA_HISTORY_WORKER = "1";
  startJournalJobWatch();
  await new Promise(() => {});
}

function fillOf(mode: JournalJobMode | "", kind: string, item?: JournalJobItem | null) {
  if (!item) return null;
  if (mode === "catalog") return { kind: "archiveCatalog", label: item.name };
  if (mode === "count") return { kind: "archiveCount", label: item.name };
  if (mode === "life") return { kind: "life", label: item.name };
  if (mode === "archives") return { kind: "archives", label: item.name };
  if (mode === "archivesPupils") return { kind: "archivesPupils", label: item.name };
  if (mode === "audit") return { kind: "audit", label: item.name, customerId: item.cid };
  if (mode === "details") {
    return { kind: "details", groupId: item.groupId, branchId: item.branchId, periodKey: item.periodKey, label: item.periodLabel || item.name };
  }
  if (mode === "groups" || mode === "groups-recheck" || mode === "group-one") {
    return { kind: "group", groupId: item.groupId, branchId: item.branchId, periodKey: item.periodKey, label: item.periodLabel || item.name };
  }
  if (mode === "roster" || mode === "roster-recheck") {
    return { kind: "roster", groupId: item.groupId, branchId: item.branchId, label: item.name };
  }
  return { kind: kind === "balance" ? "balance" : "students", label: item.name, customerId: item.cid };
}

function loopLabel(
  pullKind: "archiveCatalog" | "life" | "archives" | "archivesPupils",
  res: {
    extra?: string;
    lastArchiveCatalog?: { name?: string; step?: string } | undefined;
    lastLife?: { left?: number } | undefined;
    lastArchives?: { branch?: string } | undefined;
    lastArchivesPupils?: { left?: number } | undefined;
  },
) {
  if (pullKind === "archiveCatalog") {
    const cat = res.lastArchiveCatalog;
    return cat?.name && cat.name !== "пропуск" ? cat.name : cat?.step || "архив";
  }
  if (pullKind === "life") {
    const left = Number(res.lastLife?.left) || 0;
    return left ? `сроки · ещё ${left}` : "сроки групп";
  }
  if (pullKind === "archives") {
    const branch = res.lastArchives?.branch;
    return branch ? `архив «${branch}»` : "архивные группы";
  }
  const left = Number(res.lastArchivesPupils?.left) || 0;
  return left ? `архив учеников · ещё ${left}` : "архив групп учеников";
}

async function runStep(job: JournalJob): Promise<{ done: boolean; gap: number; msg?: string }> {
  const id = job.id;
  const mode = job.mode;
  if (loadJournalJob().stop) return { done: true, gap: 0, msg: stoppedMsg() };
  if (mode === "count") {
    patch({ id, cur: "считаю отбор", fill: { kind: "archiveCount", label: "считаю отбор" } });
    const got = await awaitWhileJob(id, historyLoadOne({ kind: "archiveCount", school: job.school || job.filter }));
    if ("stopped" in got) return { done: true, gap: 0, msg: stoppedMsg() };
    const res = got.value;
    if (loadJournalJob().id !== id) return { done: true, gap: 0 };
    const msg = String(res.extra || res.error || "Отбор посчитан.");
    patch({ id, running: false, n: 1, total: 1, cur: "", fill: null, msg });
    return { done: true, gap: 0, msg };
  }
  const loopKind = loopPullKind(mode);
  if (loopKind) {
    const got = await awaitWhileJob(
      id,
      historyLoadOne({
        kind: loopKind,
        probe: job.catalogFirst && loopKind === "archiveCatalog",
        school: job.school || job.filter,
        study: job.study,
      }),
    );
    if ("stopped" in got) return { done: true, gap: 0, msg: stoppedMsg() };
    const res = got.value;
    if (loadJournalJob().id !== id) return { done: true, gap: 0 };
    const label = loopLabel(loopKind, res);
    const n = job.n + (res.ok ? 1 : 0);
    if (!res.ok) {
      const waits = (loadJournalJob().waits || 0) + 1;
      if (/уже грузим|нет ответа|нет входа|429|502/i.test(String(res.error || "")) && waits <= JOB_WAIT_CAP) {
        patch({ id, waits, cur: "пауза 5 с · Alfa", fill: { kind: loopKind, label: "пауза 5 с · Alfa" }, msg: String(res.error || res.extra || "") });
        return { done: false, gap: jobGapMs(mode) };
      }
      patch({ id, running: false, n, cur: "", fill: null, waits: 0, msg: String(res.error || "Alfa не ответила.") });
      return { done: true, gap: 0, msg: String(res.error || "") };
    }
    patch({
      id,
      catalogFirst: false,
      n,
      total: n,
      waits: 0,
      cur: label,
      fill: { kind: loopKind, label },
      msg: String(res.extra || ""),
    });
    if (!res.more) {
      patch({ id, running: false, cur: "", fill: null, msg: loadJournalJob().msg });
      return { done: true, gap: 0 };
    }
    patch({ id, cur: `пауза 5 с · ${label}`, fill: { kind: loopKind, label: `пауза 5 с · ${label}` } });
    return { done: false, gap: jobGapMs(mode) };
  }

  if (job.idx >= job.items.length) {
    return { done: true, gap: 0, msg: doneMsg(job) };
  }
  let item = job.items[job.idx];
  if ((mode === "groups" || mode === "groups-recheck") && item.groupId) {
    const g = journalPullGroups().find((x) => x.groupId === item.groupId && x.branchId === item.branchId) || journalPullGroups().find((x) => x.groupId === item.groupId);
    if (g) {
      const row = groupFillRow(g);
      const part = nextGroupPart(row.parts || [], job.grain, row.age);
      if (!part) {
        patch({ id, idx: job.idx + 1, n: job.n + 1, waits: 0 });
        return { done: false, gap: 0 };
      }
      item = { ...item, periodKey: part.key, periodLabel: part.label };
    }
  }
  const pullKind = historyPullKind(mode, job.kind);
  const curLabel =
    (pullKind === "group" || pullKind === "details") && item.periodLabel
      ? `${item.name} · ${item.periodLabel}`
      : pullKind === "balance"
        ? `касса · ${item.name}`
        : item.name;
  patch({
    id,
    cur: curLabel,
    fill: fillOf(mode, job.kind, item),
    msg: job.recheck ? `${item.name}: перепроверяем. Потом пауза 5 с.` : `${item.name}: грузим. Потом пауза 5 с.`,
  });
  if (loadJournalJob().stop) return { done: true, gap: 0, msg: stoppedMsg() };
  const got = await awaitWhileJob(
    id,
    historyLoadOne({
      kind: pullKind,
      study: job.study,
      customerId: Number(item.cid) || 0,
      branchId: Number(item.branchId) || job.branchId,
      groupId: Number(item.groupId) || 0,
      periodKey: item.periodKey || "",
      grain: job.grain,
      recheck: job.recheck || mode === "people-recheck" || mode === "groups-recheck" || mode === "roster-recheck" || (mode === "group-one" && !item.periodKey),
      dateFrom: job.dateFrom,
      probe: mode === "probe",
      school: job.school || job.filter,
      name: item.name,
    }),
  );
  if ("stopped" in got) return { done: true, gap: 0, msg: stoppedMsg() };
  const res = got.value;
  const live = loadJournalJob();
  if (live.id !== id) return { done: true, gap: 0 };
  if (live.stop) return { done: true, gap: 0, msg: `Остановили · прошло ${live.n} из ${live.total}.` };
  const retry = shouldRetryCash(pullKind, live.recheck, res);
  if (retry) {
    const err = String(res.extra || res.error || "");
    const busy = /уже грузим|нет входа|429|502|нет ответа/i.test(err);
    const waits = (live.waits || 0) + (busy ? 1 : 0);
    if (busy && waits > JOB_WAIT_CAP) {
      const idx = live.idx + 1;
      const more = idx < live.items.length;
      const nextName = more ? live.items[idx]?.name || "" : "";
      const msg = more
        ? `«${item.name}»: Alfa не отвечает, берём следующего.`
        : `Alfa не отвечает на «${item.name}». Остановились.`;
      patch({
        id,
        idx,
        n: live.n,
        waits: 0,
        running: more,
        cur: more ? `пауза 5 с · дальше ${nextName}` : "",
        fill: more ? fillOf(mode, job.kind, live.items[idx]) : null,
        msg,
      });
      return { done: !more, gap: more ? jobGapMs(mode === "audit" ? "audit" : "people") : 0, msg: more ? "" : msg };
    }
    const cur = pullKind === "balance" && !live.recheck && !busy ? `касса · ещё «${item.name}»` : `пауза 5 с · ещё «${item.name}»`;
    patch({
      id,
      waits,
      cur,
      fill: fillOf(mode, job.kind, item),
      msg: String(res.extra || res.error || `«${item.name}»: касса не дочитана.`),
    });
    return { done: false, gap: live.recheck ? jobRetryGapMs(err) : jobGapMs(mode === "audit" ? "audit" : "people") };
  }
  if (!res.ok) {
    const waits = (live.waits || 0) + 1;
    if (live.recheck && waits <= JOB_WAIT_CAP) {
      patch({
        id,
        waits,
        cur: `пауза 30 с · ещё «${item.name}»`,
        fill: fillOf(mode, job.kind, item),
        msg: `«${item.name}»: сбой · через 30 с с того же.`,
      });
      return { done: false, gap: RECHECK_STALL_MS };
    }
    if (live.recheck) {
      const idx = live.idx + 1;
      const more = idx < live.items.length;
      const nextName = more ? live.items[idx]?.name || "" : "";
      const msg = more
        ? `«${item.name}»: Alfa не отвечает, берём следующего.`
        : `Alfa не отвечает на «${item.name}». Остановились.`;
      patch({
        id,
        idx,
        n: live.n,
        waits: 0,
        running: more,
        cur: more ? `пауза 5 с · дальше ${nextName}` : "",
        fill: more ? fillOf(mode, job.kind, live.items[idx]) : null,
        msg,
      });
      return { done: !more, gap: more ? jobGapMs(mode) : 0, msg: more ? "" : msg };
    }
    const msg = res.error || `Остановились на «${item.name}». Нажмите ещё раз — продолжит с того же.`;
    patch({ id, running: false, cur: "", fill: null, msg });
    return { done: true, gap: 0, msg };
  }
  if (mode === "details" && res.more) {
    patch({
      id,
      waits: 0,
      cur: `пауза 5 с · ещё ДЗ «${item.name}»`,
      fill: fillOf(mode, job.kind, item),
      msg: String(res.extra || `«${item.name}»: ДЗ не дочитано.`),
    });
    return { done: false, gap: jobGapMs(mode) };
  }
  const n = live.n + 1;
  const idx = live.idx + 1;
  const more = idx < live.items.length;
  const nextName = more ? live.items[idx]?.name || "" : "";
  const gap = more ? jobGapMs(mode) : 0;
  const pauseCur = more ? `пауза 5 с · дальше ${nextName}` : "";
  const finished = { ...live, n };
  patch({
    id,
    n,
    idx,
    waits: 0,
    cur: pauseCur || "",
    fill: more ? live.fill : null,
    msg: more ? pauseCur : doneMsg(finished),
    running: more,
  });
  return { done: !more, gap, msg: more ? "" : doneMsg(finished) };
}

function doneMsg(job: JournalJob) {
  if (job.stop) return `Остановили · прошло ${job.n} из ${job.total}.`;
  if (job.mode === "people-recheck" || (job.mode === "people" && job.recheck)) return `${job.n} перепроверили.`;
  if (job.mode === "people") return `Готово · ${job.n} учеников. Кто слева — ещё жёлтые или без кассы.`;
  if (job.mode === "groups-recheck") return `${job.n} групп перепроверили.`;
  if (job.mode === "groups") return `Готово · ${job.n} порций. Кто слева — ещё не все кварталы.`;
  if (job.mode === "group-one") return job.recheck ? "Группа перепроверена." : "Порция группы записана.";
  if (job.mode === "details") return `${job.n} порций ДЗ.`;
  if (job.mode === "audit") return `Сверили ${job.n} текущих.`;
  if (job.mode === "probe") return job.msg || `${job.items[0]?.name || ""}: счёт.`;
  if (job.mode === "person") return job.msg || "Записали на сайт.";
  if (job.mode === "life") return job.msg || "Сроки групп уточнены.";
  if (job.mode === "archives") return job.msg || "Архивные группы на диске.";
  if (job.mode === "archivesPupils") return job.msg || "Архив групп учеников закрыт.";
  if (job.mode === "roster") return `Готово · ${job.n} групп. Состав с cgi на диске.`;
  if (job.mode === "roster-recheck") return `${job.n} групп перепроверили состав.`;
  return `Готово · ${job.n}.`;
}

async function tickJob() {
  if (g.__raJournalJobTick) return;
  if (!isHistoryWorker() && !historyWorkerSilent()) return;
  if (!tryHistoryTickLock()) return;
  g.__raJournalJobTick = true;
  let id = "";
  try {
    while (true) {
      touchHistoryTickLock();
      const j = loadJournalJob();
      if (id && j.id !== id) break;
      id = j.id;
      if (!j.running || j.stop) break;
      const step = await runStep(j);
      const now = loadJournalJob();
      if (now.id !== id) break;
      if (now.stop) {
        patch({ id, running: false, cur: "", fill: null, msg: `Остановили · прошло ${now.n} из ${now.total}.` });
        break;
      }
      if (step.done) {
        const end = loadJournalJob();
        if (end.id === id && end.running) patch({ id, running: false, cur: "", fill: null, msg: step.msg || end.msg });
        break;
      }
      if (step.gap) await sleepGap(step.gap, id);
    }
  } catch (e) {
    const now = loadJournalJob();
    if (now.id === id || !id) patch({ id: now.id || id, running: false, cur: "", fill: null, msg: e instanceof Error ? e.message : "Сбой фоновой загрузки." });
  } finally {
    g.__raJournalJobTick = false;
    releaseHistoryTickLock();
    const end = loadJournalJob();
    if (end.id === id && end.stop && end.running) patch({ id, running: false, cur: "", fill: null, msg: `Остановили · прошло ${end.n} из ${end.total}.` });
    else if (end.running && !end.stop && isHistoryWorker()) void tickJob();
  }
}
