/** Состояние фоновой «Истории из Alfa»: диск, без Alfa. */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const PEOPLE_JOB_GAP_MS = 5000;
export const CATALOG_JOB_GAP_MS = 1000;
export const AUDIT_JOB_GAP_MS = 1000;

export type JournalJobMode =
  | "people"
  | "people-recheck"
  | "groups"
  | "groups-recheck"
  | "group-one"
  | "catalog"
  | "audit"
  | "probe"
  | "person";

export type JournalJobItem = {
  cid?: number;
  branchId?: number;
  groupId?: number;
  name: string;
  periodKey?: string;
  periodLabel?: string;
};

export type JournalJobFill = {
  groupId?: number;
  branchId?: number;
  periodKey?: string;
  label?: string;
  kind?: string;
  customerId?: number;
};

export type JournalJob = {
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
  writeFileSync(fileOf(), JSON.stringify(job), "utf8");
  return job;
}

export function journalJobSnapshot() {
  const j = loadJournalJob();
  return {
    running: j.running,
    stop: j.stop,
    mode: j.mode,
    kind: j.kind,
    study: j.study,
    cur: j.cur,
    n: j.n,
    total: j.total,
    msg: j.msg,
    fill: j.fill,
    startedAt: j.startedAt,
    lastAt: j.lastAt,
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
  if (row.short) return false;
  if (kind === "balance") return Boolean(row.journal && row.pays);
  return Boolean(row.journal);
}

export function peopleJobQueue(people: PeopleJobRow[], kind: "students" | "balance", recheck: boolean) {
  const needLoad = people.filter((r) => !peopleJobFinished(r, kind));
  const needRecheck = people.filter((r) => peopleJobFinished(r, kind) && (kind === "balance" ? !r.paysRechecked : !r.rechecked));
  if (recheck) return needRecheck.length ? needRecheck : people.filter((r) => peopleJobFinished(r, kind));
  return needLoad;
}

export function shouldRetryCash(
  kind: string,
  recheck: boolean,
  res: { ok?: boolean; error?: string; extra?: string; student?: { paysMore?: boolean; paysOk?: boolean } } | null,
) {
  if (kind !== "balance" || recheck) {
    if (!res || res.ok === false) return /уже грузим|нет ответа|нет входа|429|502|ответила/i.test(String(res?.error || res?.extra || ""));
    return false;
  }
  if (!res || res.ok === false) return true;
  return Boolean(res.student?.paysMore) || res.student?.paysOk === false || /не ответила|ещё страницы/i.test(String(res.extra || res.error || ""));
}

export function jobGapMs(mode: JournalJobMode | "") {
  if (mode === "catalog" || mode === "audit") return mode === "catalog" ? CATALOG_JOB_GAP_MS : AUDIT_JOB_GAP_MS;
  return PEOPLE_JOB_GAP_MS;
}
