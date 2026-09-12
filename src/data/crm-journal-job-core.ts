/** Состояние фоновой «Истории из Alfa»: диск, без Alfa. */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Закон «История из Alfa»: только по одному, пауза 5 с. Пакетом нельзя. */
export const JOURNAL_ONE_GAP_MS = 5000;
export const PEOPLE_JOB_GAP_MS = JOURNAL_ONE_GAP_MS;
export const CATALOG_JOB_GAP_MS = JOURNAL_ONE_GAP_MS;
export const AUDIT_JOB_GAP_MS = JOURNAL_ONE_GAP_MS;

export type JournalJobMode =
  | "people"
  | "people-recheck"
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
  };
}

function fileOf() {
  return join(process.cwd(), "storage", "crm-journal-job.json");
}

export function loadJournalJob(): JournalJob {
  try {
    if (!existsSync(fileOf())) return emptyJournalJob();
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<JournalJob>;
    return { ...emptyJournalJob(), ...raw, items: Array.isArray(raw.items) ? raw.items : [] };
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
export const HISTORY_WORKER_SILENT_MS = 12_000;

export function historyWorkerSilent(job = loadJournalJob(), ms = HISTORY_WORKER_SILENT_MS) {
  if (!job.running) return false;
  const age = Date.now() - Date.parse(job.lastAt || job.startedAt || "");
  return !Number.isFinite(age) || age > ms;
}

export function tryHistoryTickLock() {
  const dest = TICK_LOCK();
  mkdirSync(dirname(dest), { recursive: true });
  try {
    if (existsSync(dest)) {
      const raw = JSON.parse(readFileSync(dest, "utf8")) as { pid?: number; at?: string };
      const pid = Number(raw.pid) || 0;
      const age = Date.now() - Date.parse(String(raw.at || ""));
      if (pid && pid !== process.pid) {
        try {
          process.kill(pid, 0);
          if (Number.isFinite(age) && age < 90_000) return false;
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
  rechecked?: boolean;
  paysRechecked?: boolean;
};

export function peopleJobFinished(row: PeopleJobRow, kind: "students" | "balance") {
  if (kind === "balance") return Boolean(row.pays);
  if (row.short) return false;
  return Boolean(row.journal);
}

export function peopleJobQueue(people: PeopleJobRow[], kind: "students" | "balance", recheck: boolean) {
  const needLoad = people.filter((r) => !peopleJobFinished(r, kind));
  const needRecheck = people.filter((r) => peopleJobFinished(r, kind) && (kind === "balance" ? !r.paysRechecked : !r.rechecked));
  if (recheck) return needRecheck.length ? needRecheck : people.filter((r) => peopleJobFinished(r, kind));
  return needLoad;
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
    fill: stop ? null : extra.fill === undefined ? cur.fill : extra.fill,
    cur: stop ? "" : extra.cur === undefined ? cur.cur : extra.cur,
    msg: stop ? stoppedJobMsg(Number(n) || 0, Number(total) || 0) : extra.msg === undefined ? cur.msg : extra.msg,
  };
}

export const JOB_WAIT_CAP = 8;

export function shouldRetryCash(
  kind: string,
  recheck: boolean,
  res: { ok?: boolean; error?: string; extra?: string; student?: { paysMore?: boolean; paysOk?: boolean } } | null,
) {
  const err = String(res?.error || res?.extra || "");
  const busy = /уже грузим|нет входа|429|502|нет ответа/i.test(err);
  if (kind === "balance" && !recheck) {
    if (res?.student?.paysOk) return false;
    if (!res || res.ok === false) return busy || /не ответила|ещё страницы/i.test(err);
    return Boolean(res.student?.paysMore) || /ещё страницы/i.test(err);
  }
  if (!res || res.ok === false) return busy;
  return false;
}

export function jobGapMs(_mode?: JournalJobMode | "") {
  return JOURNAL_ONE_GAP_MS;
}
