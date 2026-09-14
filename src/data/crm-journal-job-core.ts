/** Состояние фоновой «Истории из Alfa»: диск, без Alfa. */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Закон «История из Alfa»: только по одному, пауза 5 с. Пакетом нельзя. */
export const JOURNAL_ONE_GAP_MS = 5000;
export const PEOPLE_SLOW_MS = 10 * 60 * 1000;
export const PEOPLE_JOB_GAP_MS = JOURNAL_ONE_GAP_MS;
export const CATALOG_JOB_GAP_MS = JOURNAL_ONE_GAP_MS;
export const AUDIT_JOB_GAP_MS = JOURNAL_ONE_GAP_MS;

export type RecheckWave = "" | "right" | "left" | "right2";

export type JournalJobMode =
  | "people"
  | "people-recheck"
  | "people-slow"
  | "groups"
  | "groups-recheck"
  | "group-one"
  | "catalog"
  | "audit"
  | "probe"
  | "person"
  | "life"
  | "archives"
  | "archivesPupils"
  | "details"
  | "count"
  | "roster"
  | "roster-recheck";

export type JournalJobItem = {
  cid?: number;
  branchId?: number;
  groupId?: number;
  name: string;
  periodKey?: string;
  periodLabel?: string;
};

/** Очередь с экрана: массив или объект с индексами — иначе шаг 3 «слетает». */
export function parseJobItems(raw: unknown): JournalJobItem[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw as Record<string, unknown>) : [];
  return list
    .map((row) => {
      const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      const cid = Number(r.cid) || 0;
      const groupId = Number(r.groupId) || 0;
      return {
        cid,
        branchId: Number(r.branchId) || 1,
        groupId,
        name: String(r.name || ""),
        periodKey: String(r.periodKey || ""),
        periodLabel: String(r.periodLabel || ""),
      };
    })
    .filter((r) => r.cid || r.groupId);
}

export type JournalJobFill = {
  groupId?: number;
  branchId?: number;
  periodKey?: string;
  label?: string;
  kind?: string;
  customerId?: number;
};

export type JournalJob = {
  id: string;
  running: boolean;
  stop: boolean;
  mode: JournalJobMode | "";
  kind: string;
  study: "1" | "2";
  recheck: boolean;
  dateFrom: string;
  recheckDays: number;
  grain: "quarter" | "half" | "year";
  school: string;
  groupId: number;
  branchId: number;
  customerId: number;
  take: number;
  filter: string;
  catalogFirst: boolean;
  items: JournalJobItem[];
  idx: number;
  waits: number;
  cur: string;
  n: number;
  total: number;
  msg: string;
  fill: JournalJobFill | null;
  startedAt: string;
  lastAt: string;
  wave: RecheckWave;
  follow: JournalJobItem[];
  archived: boolean;
};

export function emptyJournalJob(): JournalJob {
  return {
    id: "",
    running: false,
    stop: false,
    mode: "",
    kind: "",
    study: "1",
    recheck: false,
    dateFrom: "",
    recheckDays: 32,
    grain: "quarter",
    school: "",
    groupId: 0,
    branchId: 0,
    customerId: 0,
    take: 0,
    filter: "",
    catalogFirst: false,
    items: [],
    idx: 0,
    waits: 0,
    cur: "",
    n: 0,
    total: 0,
    msg: "",
    fill: null,
    startedAt: "",
    lastAt: "",
    wave: "",
    follow: [],
    archived: false,
  };
}

function fileOf() {
  return join(process.cwd(), "storage", "crm-journal-job.json");
}

export function loadJournalJob(): JournalJob {
  try {
    if (!existsSync(fileOf())) return emptyJournalJob();
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<JournalJob>;
    const follow = Array.isArray(raw.follow) ? raw.follow : [];
    const wave: RecheckWave = raw.wave === "right" || raw.wave === "left" || raw.wave === "right2" ? raw.wave : "";
    return { ...emptyJournalJob(), ...raw, items: Array.isArray(raw.items) ? raw.items : [], follow, wave, archived: Boolean(raw.archived) };
  } catch {
    return emptyJournalJob();
  }
}

export function saveJournalJob(job: JournalJob) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  const dest = fileOf();
  const tmp = `${dest}.tmp`;
  writeFileSync(tmp, JSON.stringify(job), "utf8");
  renameSync(tmp, dest);
  return job;
}

const TICK_LOCK = () => join(process.cwd(), "storage", "crm-history-tick.lock");
export const HISTORY_WORKER_SILENT_MS = 30_000;
export const RECHECK_STALL_MS = 30_000;
export const RECHECK_429_GAP_MS = 120_000;

export function historyWorkerSilent(job = loadJournalJob(), ms = HISTORY_WORKER_SILENT_MS) {
  if (!job.running) return false;
  const age = Date.now() - Date.parse(job.lastAt || job.startedAt || "");
  return !Number.isFinite(age) || age > ms;
}

export function jobRetryGapMs(err?: string) {
  if (/429/i.test(String(err || ""))) return RECHECK_429_GAP_MS;
  return JOURNAL_ONE_GAP_MS;
}

export function shouldResumeStalledJob(job = loadJournalJob(), now = Date.now()) {
  if (job.stop || !job.id) return false;
  const age = now - Date.parse(job.lastAt || job.startedAt || "");
  if (!Number.isFinite(age) || age < RECHECK_STALL_MS) return false;
  const total = Number(job.total) || job.items.length || 0;
  const n = Number(job.n) || 0;
  if (total > 0 && n >= total) return false;
  if ((Number(job.waits) || 0) > JOB_WAIT_CAP) return false;
  if (/готово/i.test(String(job.msg || "")) && n >= total) return false;
  if (job.running) return true;
  return total > 0 && n < total;
}

export function tryHistoryTickLock() {
  const dest = TICK_LOCK();
  mkdirSync(dirname(dest), { recursive: true });
  try {
    if (existsSync(dest)) {
      const raw = JSON.parse(readFileSync(dest, "utf8")) as { pid?: number; at?: string };
      const pid = Number(raw.pid) || 0;
      if (pid && pid !== process.pid) {
        try {
          process.kill(pid, 0);
          return false;
        } catch {
          /* процесс умер */
        }
      }
    }
  } catch {
    /* */
  }
  writeFileSync(dest, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), "utf8");
  return true;
}

export function touchHistoryTickLock() {
  try {
    writeFileSync(TICK_LOCK(), JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), "utf8");
  } catch {
    /* */
  }
}

export function releaseHistoryTickLock() {
  try {
    const dest = TICK_LOCK();
    if (!existsSync(dest)) return;
    const raw = JSON.parse(readFileSync(dest, "utf8")) as { pid?: number };
    if (Number(raw.pid) === process.pid) unlinkSync(dest);
  } catch {
    /* */
  }
}

export function journalJobSnapshot() {
  const j = loadJournalJob();
  const curItem = j.items[j.idx];
  const nextItem = j.items[j.idx + 1];
  const stop = Boolean(j.stop);
  const n = Number(j.n) || 0;
  const total = Number(j.total) || 0;
  const nextName = nextItem?.name || (curItem && curItem.name !== j.cur ? curItem.name : "") || "";
  return {
    id: j.id,
    running: stop ? false : Boolean(j.running),
    stop,
    mode: j.mode,
    kind: j.kind,
    study: j.study,
    recheck: j.recheck,
    cur: stop ? "" : j.cur,
    n: j.n,
    total: j.total,
    msg: stop ? stoppedJobMsg(n, total) : j.msg,
    fill: stop ? null : j.fill,
    startedAt: j.startedAt,
    lastAt: j.lastAt,
    idx: j.idx,
    waits: j.waits,
    itemsN: j.items.length,
    next: stop ? "" : nextName,
    workerSilent: stop ? false : historyWorkerSilent(j),
  };
}

export type PeopleJobRow = {
  cid: number;
  branchId: number;
  name: string;
  journal: boolean;
  pays: boolean;
  short?: boolean;
  dups?: boolean;
  rechecked?: boolean;
  paysRechecked?: boolean;
  holeApproved?: boolean;
  paysScanned?: boolean;
  paysEmpty?: boolean;
  cashRows?: number;
};

export function peopleJobFinished(row: PeopleJobRow, kind: "students" | "balance") {
  if (kind === "balance") return Boolean(row.paysScanned || row.pays);
  if (row.short && row.holeApproved) return true;
  if (row.short) return false;
  if (row.dups) return true;
  return Boolean(row.journal);
}

export function peopleNeedCashLoad(row: PeopleJobRow) {
  if (row.pays) return false;
  if (row.paysScanned && ((Number(row.cashRows) || 0) > 0 || row.paysEmpty)) return false;
  return true;
}

export function peopleJobQueue(people: PeopleJobRow[], kind: "students" | "balance", recheck: boolean) {
  const needLoad = people.filter((r) => (kind === "balance" ? peopleNeedCashLoad(r) : !peopleJobFinished(r, kind)));
  const needRecheck = people.filter((r) => {
    if (!peopleJobFinished(r, kind)) return false;
    if (kind === "students" && r.short && r.holeApproved) return false;
    return r.dups || (kind === "balance" ? !r.paysRechecked : !r.rechecked);
  });
  if (recheck) return needRecheck.length ? needRecheck : people.filter((r) => peopleJobFinished(r, kind) && !(kind === "students" && r.short && r.holeApproved));
  return needLoad;
}

function asPeopleItem(r: PeopleJobRow): JournalJobItem {
  return { cid: r.cid, branchId: r.branchId, name: r.name };
}

/** Синяя «Перепроверить по одному»: справа → жёлтые слева → снова справа те же (даже если ещё short). */
export function peopleRecheckAdvance(
  people: PeopleJobRow[],
  kind: "students" | "balance",
  finishedWave: RecheckWave,
  follow: JournalJobItem[],
): { done: boolean; wave: RecheckWave; items: JournalJobItem[]; follow: JournalJobItem[]; recheck: boolean } {
  if (finishedWave === "right2") {
    return { done: true, wave: "right2", items: [], follow, recheck: true };
  }
  if (finishedWave === "left") {
    const want = new Set(follow.map((f) => Number(f.cid) || 0).filter(Boolean));
    const items = people
      .filter((r) => want.has(r.cid) && !(kind === "students" && r.short && r.holeApproved))
      .map(asPeopleItem);
    if (!items.length) return { done: true, wave: "right2", items: [], follow, recheck: true };
    return { done: false, wave: "right2", items, follow, recheck: true };
  }
  if (finishedWave === "") {
    const right = peopleJobQueue(people, kind, true).map(asPeopleItem);
    if (right.length) return { done: false, wave: "right", items: right, follow: [], recheck: true };
  }
  const left = peopleJobQueue(people, kind, false).map(asPeopleItem);
  if (left.length) return { done: false, wave: "left", items: left, follow: left, recheck: false };
  return { done: true, wave: finishedWave || "right", items: [], follow: [], recheck: true };
}

export type GroupWaveRow = { groupId: number; branchId: number; name: string; finished: boolean; needRecheck: boolean; roster?: boolean };

export function groupsRecheckAdvance(
  rows: GroupWaveRow[],
  finishedWave: RecheckWave,
  follow: JournalJobItem[],
  roster = false,
): { done: boolean; wave: RecheckWave; items: JournalJobItem[]; follow: JournalJobItem[]; recheck: boolean } {
  const toItem = (r: GroupWaveRow): JournalJobItem => ({ groupId: r.groupId, branchId: r.branchId, name: r.name });
  const onRight = (r: GroupWaveRow) => (roster ? Boolean(r.roster) : r.finished);
  const onLeft = (r: GroupWaveRow) => !onRight(r);
  if (finishedWave === "right2") {
    return { done: true, wave: "right2", items: [], follow, recheck: true };
  }
  if (finishedWave === "left") {
    const want = new Set(follow.map((f) => Number(f.groupId) || 0).filter(Boolean));
    const items = rows.filter((r) => want.has(r.groupId) && onRight(r)).map(toItem);
    if (!items.length) return { done: true, wave: "right2", items: [], follow, recheck: true };
    return { done: false, wave: "right2", items, follow, recheck: true };
  }
  if (finishedWave === "") {
    const need = rows.filter((r) => (roster ? Boolean(r.roster) : r.needRecheck));
    const right = (need.length ? need : rows.filter(onRight)).map(toItem);
    if (right.length) return { done: false, wave: "right", items: right, follow: [], recheck: true };
  }
  const left = rows.filter(onLeft).map(toItem);
  if (left.length) return { done: false, wave: "left", items: left, follow: left, recheck: false };
  return { done: true, wave: finishedWave || "right", items: [], follow: [], recheck: true };
}

export function stoppedJobMsg(n: number, total: number) {
  const nn = Number(n) || 0;
  const tt = Number(total) || nn;
  return `Остановили · прошло ${nn} из ${tt}.`;
}

export function mergeJobPatch(cur: JournalJob, extra: Partial<JournalJob>) {
  if (extra.id && cur.id && extra.id !== cur.id) return cur;
  const stop = Boolean(cur.stop || extra.stop);
  const n = extra.n === undefined ? cur.n : extra.n;
  const total = extra.total === undefined ? cur.total : extra.total;
  return {
    ...cur,
    ...extra,
    id: cur.id || extra.id || "",
    stop,
    running: stop ? false : extra.running === undefined ? cur.running : extra.running,
    items: Array.isArray(extra.items) ? extra.items : cur.items,
    follow: Array.isArray(extra.follow) ? extra.follow : cur.follow,
    fill: stop ? null : extra.fill === undefined ? cur.fill : extra.fill,
    cur: stop ? "" : extra.cur === undefined ? cur.cur : extra.cur,
    msg: stop ? stoppedJobMsg(Number(n) || 0, Number(total) || 0) : extra.msg === undefined ? cur.msg : extra.msg,
  };
}

export const JOB_WAIT_CAP = 8;

export function rotateUnfinished(items: JournalJobItem[], idx: number) {
  const list = items.slice();
  if (idx < 0 || idx >= list.length || list.length < 2) return { items: list, idx: Math.max(0, Math.min(idx, Math.max(0, list.length - 1))) };
  const cur = list.splice(idx, 1)[0];
  if (cur) list.push(cur);
  return { items: list, idx: idx >= list.length ? 0 : idx };
}

export function shouldRetryCash(
  kind: string,
  recheck: boolean,
  res: { ok?: boolean; error?: string; extra?: string; student?: { paysMore?: boolean; paysOk?: boolean } } | null,
) {
  const err = String(res?.error || res?.extra || "");
  const busy = /уже грузим|нет входа|429|502|нет ответа/i.test(err);
  if (kind === "balance" && !recheck) {
    if (res?.student?.paysOk) return false;
    if (!res || res.ok === false) return busy || /не ответила/i.test(err);
    return false;
  }
  if (!res || res.ok === false) return busy;
  return false;
}

/** Синяя: человек не закрыт — не брать следующего. Красная этим не пользуется. */
export function shouldRetryOpenRecheck(
  recheck: boolean,
  kind: string,
  res: { ok?: boolean; student?: { rechecked?: boolean; paysRechecked?: boolean; holeApproved?: boolean; dups?: boolean } } | null,
) {
  if (!recheck) return false;
  if (kind !== "students" && kind !== "balance") return false;
  if (!res?.ok) return false;
  const s = res.student;
  if (!s) return false;
  if (s.holeApproved) return false;
  if (kind === "balance") return !s.paysRechecked;
  if (s.dups) return true;
  return !s.rechecked;
}

/** Красная: дырка жива и этот шаг что-то посадил — не брать следующего. */
export function shouldRetryShortPeople(
  mode: string,
  recheck: boolean,
  kind: string,
  res: { ok?: boolean; student?: { short?: boolean; seated?: number; dropped?: number; holeApproved?: boolean } } | null,
) {
  if (recheck) return false;
  if (mode !== "people" && mode !== "person" && mode !== "people-slow" && mode !== "people-recheck") return false;
  if (kind !== "students") return false;
  if (!res?.ok) return false;
  if (res.student?.holeApproved) return false;
  if (!res.student?.short) return false;
  if (mode === "people-slow") return false;
  return (Number(res.student.seated) || 0) > 0 || (Number(res.student.dropped) || 0) > 0;
}

export function jobGapMs(_mode?: JournalJobMode | "") {
  return JOURNAL_ONE_GAP_MS;
}
