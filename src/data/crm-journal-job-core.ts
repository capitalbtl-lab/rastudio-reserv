/** Состояние фоновой «Истории из Alfa»: диск, без Alfa. */

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Закон пауз Alfa (История + Фон). Между заходами / людьми, не между страницами одного.
 * Красная «Загрузить по одному»: всегда 5 с (2015 / 7 лет / 3 года / 1 год). Быстрее нельзя.
 * Синяя «Перепроверить по одному»:
 *   ± неделя и ± 2 недели — 2 с; ± месяц — 2,5 с; ± 3 мес — 3 с; ± 6 мес — 4 с;
 *   3 года / 7 лет / с начала · 2015 — 5 с.
 */
export const JOURNAL_ONE_GAP_MS = 5000;
export const JOURNAL_FORTNIGHT_GAP_MS = 2000;
export const JOURNAL_WINDOW_GAP_MS = 2000;
export const JOURNAL_MONTH_GAP_MS = 2500;
export const JOURNAL_QUARTER_GAP_MS = 3000;
export const JOURNAL_HALF_GAP_MS = 4000;
export const JOURNAL_WINDOW_DAYS = 31;
export const PEOPLE_SLOW_MS = 10 * 60 * 1000;
export const PEOPLE_JOB_GAP_MS = JOURNAL_ONE_GAP_MS;
export const CATALOG_JOB_GAP_MS = JOURNAL_ONE_GAP_MS;
export const AUDIT_JOB_GAP_MS = JOURNAL_ONE_GAP_MS;

export type RecheckWave = "" | "preleft" | "right" | "left" | "right2" | "left2";

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
  dateTo?: string;
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
  wait429: number;
  waitOther: number;
  cur: string;
  n: number;
  total: number;
  msg: string;
  fill: JournalJobFill | null;
  startedAt: string;
  lastAt: string;
  wave: RecheckWave;
  follow: JournalJobItem[];
  defer: JournalJobItem[];
  skip: JournalJobItem[];
  archived: boolean;
  pipe: string[];
  skipLeads: boolean;
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
    dateTo: "",
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
    wait429: 0,
    waitOther: 0,
    cur: "",
    n: 0,
    total: 0,
    msg: "",
    fill: null,
    startedAt: "",
    lastAt: "",
    wave: "",
    follow: [],
    defer: [],
    skip: [],
    archived: false,
    pipe: [],
    skipLeads: false,
  };
}

function fileOf() {
  return join(process.cwd(), "storage", "crm-journal-job.json");
}

let haltPeekMtime = -1;
let haltPeek = { stop: false, id: "" };

export function loadJournalJob(): JournalJob {
  try {
    if (!existsSync(fileOf())) return emptyJournalJob();
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<JournalJob>;
    const follow = Array.isArray(raw.follow) ? raw.follow : [];
    const defer = Array.isArray(raw.defer) ? raw.defer : [];
    const skip = Array.isArray(raw.skip) ? raw.skip : [];
    const pipe = Array.isArray(raw.pipe) ? raw.pipe.map((x) => String(x || "")).filter(Boolean) : [];
    const wave: RecheckWave =
      raw.wave === "preleft" || raw.wave === "right" || raw.wave === "left" || raw.wave === "right2" || raw.wave === "left2" ? raw.wave : "";
    return {
      ...emptyJournalJob(),
      ...raw,
      items: Array.isArray(raw.items) ? raw.items : [],
      follow,
      defer,
      skip,
      pipe,
      wave,
      wait429: Number(raw.wait429) || 0,
      waitOther: Number(raw.waitOther) || 0,
      archived: Boolean(raw.archived),
      skipLeads: Boolean(raw.skipLeads),
    };
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
  try {
    haltPeekMtime = statSync(dest).mtimeMs;
    haltPeek = { stop: Boolean(job.stop), id: job.id };
  } catch {
    haltPeekMtime = -1;
  }
  return job;
}

/** Стоп/смена id без разбора всей очереди, если файл не менялся. Лок не жрёт карточки. */
export function jobShouldHalt(id = "") {
  try {
    const dest = fileOf();
    if (!existsSync(dest)) {
      haltPeekMtime = -1;
      return true;
    }
    const m = statSync(dest).mtimeMs;
    if (m === haltPeekMtime) return haltPeek.stop || Boolean(id && haltPeek.id !== id);
    haltPeekMtime = m;
  } catch {
    haltPeekMtime = -1;
  }
  const j = loadJournalJob();
  haltPeek = { stop: Boolean(j.stop), id: j.id };
  return haltPeek.stop || Boolean(id && haltPeek.id !== id);
}

const TICK_LOCK = () => join(process.cwd(), "storage", "crm-history-tick.lock");
const WORKER_BEAT = () => join(process.cwd(), "storage", "crm-history-worker.json");
export const HISTORY_WORKER_SILENT_MS = 30_000;
export const PLAN_WORKER_SILENT_MS = 120_000;
export const RECHECK_STALL_MS = 30_000;
export const RECHECK_429_GAP_MS = 120_000;
/** Замок тика без касания 3 мин = завис. 429 — 120 с, касание каждые 200 мс. */
export const TICK_LOCK_STALE_MS = 180_000;
/** Pid мёртв, пульс свежий — ждём рестарт процесса, сайт очередь не берёт. */
export const HISTORY_RESTART_GRACE_MS = 15_000;

function pidAlive(pid: number) {
  if (!(pid > 0)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function lockAtFresh(at?: string, now = Date.now()) {
  const raw = String(at || "");
  if (!raw) return true;
  const t = Date.parse(raw);
  return Number.isFinite(t) && now - t < TICK_LOCK_STALE_MS;
}

export function stampHistoryWorkerBeat() {
  try {
    mkdirSync(dirname(WORKER_BEAT()), { recursive: true });
    writeFileSync(WORKER_BEAT(), JSON.stringify({ at: new Date().toISOString(), pid: process.pid }) + "\n", "utf8");
  } catch {
    /* */
  }
}

export function historyWorkerBeat(now = Date.now()) {
  try {
    if (!existsSync(WORKER_BEAT())) return { at: "", pid: 0, ageMs: Number.POSITIVE_INFINITY, silent: true };
    const raw = JSON.parse(readFileSync(WORKER_BEAT(), "utf8")) as { at?: string; pid?: number };
    const at = String(raw.at || "");
    const pid = Number(raw.pid) || 0;
    const t = Date.parse(at);
    const ageMs = Number.isFinite(t) ? now - t : Number.POSITIVE_INFINITY;
    const alive = pidAlive(pid);
    return { at, pid, ageMs, silent: ageMs > PLAN_WORKER_SILENT_MS || !alive };
  } catch {
    return { at: "", pid: 0, ageMs: Number.POSITIVE_INFINITY, silent: true };
  }
}

/** Процесс истории жив по пульсу — сайт очередь не перехватывает. */
export function historyWorkerProcessAlive(now = Date.now()) {
  const beat = historyWorkerBeat(now);
  if (beat.pid && !beat.silent) return true;
  if (beat.pid && beat.ageMs < HISTORY_RESTART_GRACE_MS) return true;
  return false;
}

export function historyWorkerSilent(job = loadJournalJob(), ms = HISTORY_WORKER_SILENT_MS) {
  if (!job.running) return false;
  const age = Date.now() - Date.parse(job.lastAt || job.startedAt || "");
  return !Number.isFinite(age) || age > ms;
}

/**
 * Выкладка не рестартует историю, пока кто-то реально крутит прогон.
 * running на диске при мёртвом процессе — не busy: иначе загрузка не доходит.
 */
export function historyJobBusyOf(
  job: { running?: boolean; stop?: boolean },
  lockAlive = false,
  workerAlive = false,
) {
  if (lockAlive) return true;
  if (job.running && !job.stop && workerAlive) return true;
  return false;
}

export function historyTickLockPidAlive() {
  try {
    const dest = TICK_LOCK();
    if (!existsSync(dest)) return false;
    const raw = JSON.parse(readFileSync(dest, "utf8")) as { pid?: number; at?: string };
    const pid = Number(raw.pid) || 0;
    if (!pidAlive(pid)) return false;
    return lockAtFresh(raw.at);
  } catch {
    return false;
  }
}

export function historyJobBusy(job = loadJournalJob()) {
  return historyJobBusyOf(job, historyTickLockPidAlive(), historyWorkerProcessAlive());
}

/** Только pid/время. Не читать очередь — иначе лок жрёт карточки на перепроверке. */
function tickLockPayload() {
  return JSON.stringify({ pid: process.pid, at: new Date().toISOString() });
}

export function jobRetryGapMs(err?: string, periodDays?: number) {
  if (/429/i.test(String(err || ""))) return RECHECK_429_GAP_MS;
  return jobGapMs("", periodDays);
}

export function isRecheckWaveMode(mode?: string) {
  return mode === "people-recheck" || mode === "groups-recheck" || mode === "roster-recheck";
}

export function jobHasIce(job?: { recheck?: boolean; dateFrom?: string; dateTo?: string }) {
  return Boolean(job?.recheck && String(job.dateFrom || "").trim() && String(job.dateTo || "").trim());
}

export function shouldResumeStalledJob(
  job = loadJournalJob(),
  now = Date.now(),
  opts?: { wouldAdvance?: boolean },
) {
  if (job.stop || !job.id) return false;
  const age = now - Date.parse(job.lastAt || job.startedAt || "");
  if (!Number.isFinite(age) || age < RECHECK_STALL_MS) return false;
  const items = job.items || [];
  const idx = Number(job.idx) || 0;
  const wave = isRecheckWaveMode(job.mode);
  if (wave) {
    if (idx < items.length) return true;
    if (opts && "wouldAdvance" in opts) return Boolean(opts.wouldAdvance);
    return false;
  }
  const total = Number(job.total) || items.length || 0;
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
  const payload = tickLockPayload();
  const takeWx = () => {
    writeFileSync(dest, payload, { flag: "wx" });
    return true;
  };
  try {
    return takeWx();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") return false;
  }
  try {
    const raw = JSON.parse(readFileSync(dest, "utf8")) as { pid?: number; at?: string };
    const pid = Number(raw.pid) || 0;
    if (pid === process.pid) {
      writeFileSync(dest, payload, "utf8");
      return true;
    }
    if (pidAlive(pid)) return false;
    try {
      unlinkSync(dest);
    } catch {
      return false;
    }
    try {
      return takeWx();
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

export function touchHistoryTickLock() {
  try {
    const dest = TICK_LOCK();
    if (existsSync(dest)) {
      const raw = JSON.parse(readFileSync(dest, "utf8")) as { pid?: number };
      const pid = Number(raw.pid) || 0;
      if (pid && pid !== process.pid) return;
    }
    writeFileSync(dest, tickLockPayload(), "utf8");
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
    workerSilent: stop ? false : historyWorkerSilent(j) && !historyWorkerProcessAlive(),
    recheckDays: j.recheckDays,
    dateFrom: j.dateFrom,
    dateTo: j.dateTo,
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
  return Boolean(row.journal);
}

export function peopleNeedCashLoad(row: PeopleJobRow) {
  return !peopleJobFinished(row, "balance");
}

/** Порция или вся группа снята с этой кнопки. Без periodKey — вся группа. */
export function jobItemSkipped(item: JournalJobItem, skip: JournalJobItem[] = []) {
  const gid = Number(item.groupId) || 0;
  const cid = Number(item.cid) || 0;
  const pk = String(item.periodKey || "");
  return (skip || []).some((s) => {
    if (cid && Number(s.cid) === cid) return true;
    if (!gid || Number(s.groupId) !== gid) return false;
    const sp = String(s.periodKey || "");
    return !sp || sp === pk;
  });
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

/** «Сверить счёт»: все текущие, кроме галки. Зелёных тоже — иначе старый календарь Alfa не увидят. */
export function peopleNeedProbe(people: PeopleJobRow[]) {
  return people.filter((r) => !r.holeApproved);
}

function asPeopleItem(r: PeopleJobRow): JournalJobItem {
  return { cid: r.cid, branchId: r.branchId, name: r.name };
}

/** Медленный добор: снова слева, пока очередь не пустая. Курсор не сбрасываем. */
export function peopleSlowAdvance(people: PeopleJobRow[]): { done: boolean; items: JournalJobItem[] } {
  const items = peopleJobQueue(people, "students", false).map(asPeopleItem);
  return { done: !items.length, items };
}

/** Синяя: сначала дырки слева целиком, потом справа окном, снова дырки, кто уехал вправо — окно, ещё раз слева. После 5-й — стоп. */
export function peopleRecheckAdvance(
  people: PeopleJobRow[],
  kind: "students" | "balance",
  finishedWave: RecheckWave,
  follow: JournalJobItem[],
  defer: JournalJobItem[] = [],
  skip: JournalJobItem[] = [],
): { done: boolean; wave: RecheckWave; items: JournalJobItem[]; follow: JournalJobItem[]; recheck: boolean } {
  const leftBase = () => peopleJobQueue(people, kind, false).map(asPeopleItem);
  const skipSet = new Set((skip || []).map((d) => Number(d.cid) || 0).filter(Boolean));
  const deferSet = new Set((defer || []).map((d) => Number(d.cid) || 0).filter(Boolean));
  const leftNow = () => mergeDeferItems(leftBase(), defer).filter((x) => !skipSet.has(Number(x.cid) || 0));
  const rightNow = () =>
    people
      .filter(onRight)
      .map(asPeopleItem)
      .filter((x) => !skipSet.has(Number(x.cid) || 0) && !deferSet.has(Number(x.cid) || 0));
  const onRight = (r: PeopleJobRow) => peopleJobFinished(r, kind) && !(kind === "students" && r.short && r.holeApproved);
  if (finishedWave === "left2") {
    return { done: true, wave: "left2", items: [], follow, recheck: true };
  }
  if (finishedWave === "right2") {
    const left = leftNow();
    if (left.length) return { done: false, wave: "left2", items: left, follow: left, recheck: false };
    return { done: true, wave: "right2", items: [], follow, recheck: true };
  }
  if (finishedWave === "left") {
    const want = new Set(follow.map((f) => Number(f.cid) || 0).filter(Boolean));
    const items = people.filter((r) => want.has(r.cid) && onRight(r)).map(asPeopleItem);
    if (items.length) return { done: false, wave: "right2", items, follow, recheck: true };
    const leftover = leftNow();
    if (leftover.length) return { done: false, wave: "left2", items: leftover, follow: leftover, recheck: false };
    return { done: true, wave: "right2", items: [], follow, recheck: true };
  }
  if (finishedWave === "") {
    const left = leftNow();
    if (left.length) return { done: false, wave: "preleft", items: left, follow: left, recheck: false };
  }
  if (finishedWave === "" || finishedWave === "preleft") {
    const right = rightNow();
    if (right.length) return { done: false, wave: "right", items: right, follow: [], recheck: true };
  }
  const left = leftNow();
  if (left.length) return { done: false, wave: "left", items: left, follow: left, recheck: false };
  return { done: true, wave: finishedWave || "right", items: [], follow: [], recheck: true };
}

export function mergeDeferItems(left: JournalJobItem[], defer: JournalJobItem[] = []) {
  const out = left.slice();
  const seen = new Set(out.map((x) => Number(x.cid) || Number(x.groupId) || 0).filter(Boolean));
  for (const d of defer) {
    const k = Number(d.cid) || Number(d.groupId) || 0;
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(d);
  }
  return out;
}

export type GroupWaveRow = { groupId: number; branchId: number; name: string; finished: boolean; needRecheck: boolean; roster?: boolean };

export function groupsRecheckAdvance(
  rows: GroupWaveRow[],
  finishedWave: RecheckWave,
  follow: JournalJobItem[],
  roster = false,
  defer: JournalJobItem[] = [],
  skip: JournalJobItem[] = [],
): { done: boolean; wave: RecheckWave; items: JournalJobItem[]; follow: JournalJobItem[]; recheck: boolean } {
  const toItem = (r: GroupWaveRow): JournalJobItem => ({ groupId: r.groupId, branchId: r.branchId, name: r.name });
  const onRight = (r: GroupWaveRow) => (roster ? Boolean(r.roster) : r.finished);
  const onLeft = (r: GroupWaveRow) => !onRight(r);
  const skipSet = new Set((skip || []).map((d) => Number(d.groupId) || 0).filter(Boolean));
  const deferSet = new Set((defer || []).map((d) => Number(d.groupId) || 0).filter(Boolean));
  const leftNow = () => mergeDeferItems(rows.filter(onLeft).map(toItem), defer).filter((x) => !skipSet.has(Number(x.groupId) || 0));
  const rightNow = () => {
    if (roster) {
      const need = rows.filter((r) => Boolean(r.roster));
      return (need.length ? need : rows.filter(onRight))
        .map(toItem)
        .filter((x) => !skipSet.has(Number(x.groupId) || 0) && !deferSet.has(Number(x.groupId) || 0));
    }
    return rows
      .filter(onRight)
      .map(toItem)
      .filter((x) => !skipSet.has(Number(x.groupId) || 0) && !deferSet.has(Number(x.groupId) || 0));
  };
  if (finishedWave === "left2") {
    return { done: true, wave: "left2", items: [], follow, recheck: true };
  }
  if (finishedWave === "right2") {
    const left = leftNow();
    if (left.length) return { done: false, wave: "left2", items: left, follow: left, recheck: false };
    return { done: true, wave: "right2", items: [], follow, recheck: true };
  }
  if (finishedWave === "left") {
    const want = new Set(follow.map((f) => Number(f.groupId) || 0).filter(Boolean));
    const items = rows
      .filter((r) => want.has(r.groupId) && onRight(r))
      .map(toItem)
      .filter((x) => !skipSet.has(Number(x.groupId) || 0));
    if (items.length) return { done: false, wave: "right2", items, follow, recheck: true };
    const leftover = leftNow();
    if (leftover.length) return { done: false, wave: "left2", items: leftover, follow: leftover, recheck: false };
    return { done: true, wave: "right2", items: [], follow, recheck: true };
  }
  if (finishedWave === "") {
    const left = leftNow();
    if (left.length) return { done: false, wave: "preleft", items: left, follow: left, recheck: false };
  }
  if (finishedWave === "" || finishedWave === "preleft") {
    const right = rightNow();
    if (right.length) return { done: false, wave: "right", items: right, follow: [], recheck: true };
  }
  const left = leftNow();
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
    defer: Array.isArray(extra.defer) ? extra.defer : cur.defer,
    skip: Array.isArray(extra.skip) ? extra.skip : cur.skip,
    fill: stop ? null : extra.fill === undefined ? cur.fill : extra.fill,
    cur: stop ? "" : extra.cur === undefined ? cur.cur : extra.cur,
    msg: stop ? stoppedJobMsg(Number(n) || 0, Number(total) || 0) : extra.msg === undefined ? cur.msg : extra.msg,
    dateFrom: extra.dateFrom === undefined ? cur.dateFrom : extra.dateFrom,
    dateTo: extra.dateTo === undefined ? cur.dateTo || "" : extra.dateTo,
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

/** Синяя справа: один проход окна, до победы не крутим. Касса — как раньше. */
export function shouldRetryOpenRecheck(
  recheck: boolean,
  kind: string,
  res: { ok?: boolean; student?: { rechecked?: boolean; paysRechecked?: boolean; holeApproved?: boolean; dups?: boolean; paysMore?: boolean; short?: boolean } } | null,
) {
  if (!recheck) return false;
  if (kind === "students") return false;
  if (kind !== "balance") return false;
  if (!res?.ok) return false;
  const s = res.student;
  if (!s) return false;
  if (s.holeApproved) return false;
  return Boolean(s.paysMore) || !s.paysRechecked;
}

/** 429 / нет входа — считаем к cap. Дырка 2015 — нет. */
export function recheckBusyErr(err: string) {
  return /уже грузим|нет входа|429|502|нет ответа/i.test(String(err || ""));
}

/** 8 отказов: с этой волны снимаем, в хвост этой же не ставим. */
export function capRecheckAction(recheck: boolean, kind: string): "rotate" | "skip" {
  void recheck;
  void kind;
  return "skip";
}

export function is429Err(err?: string) {
  return /429/i.test(String(err || ""));
}

export function bumpJobWaits(wait429: number, waitOther: number, err?: string) {
  const hit429 = is429Err(err);
  const next429 = hit429 ? (Number(wait429) || 0) + 1 : Number(wait429) || 0;
  const nextOther = hit429 ? Number(waitOther) || 0 : (Number(waitOther) || 0) + 1;
  return {
    wait429: next429,
    waitOther: nextOther,
    waits: Math.max(next429, nextOther),
    cap: next429 >= JOB_WAIT_CAP || nextOther >= JOB_WAIT_CAP,
  };
}

export function resetJobWaits() {
  return { wait429: 0, waitOther: 0, waits: 0 };
}

/** Красная: дырка жива и этот шаг что-то посадил — не брать следующего. */
export function shouldRetryShortPeople(
  mode: string,
  recheck: boolean,
  kind: string,
  res: { ok?: boolean; student?: { short?: boolean; seated?: number; dropped?: number; holeApproved?: boolean; dups?: boolean } } | null,
) {
  if (recheck) return false;
  if (mode !== "people" && mode !== "person" && mode !== "people-slow" && mode !== "people-recheck") return false;
  if (kind !== "students") return false;
  if (!res?.ok) return false;
  if (res.student?.holeApproved) return false;
  if (mode === "people-slow") return false;
  const hole = Boolean(res.student?.short);
  const extra = Boolean(res.student?.dups);
  if (!hole && !extra) return false;
  return (Number(res.student?.seated) || 0) > 0 || (Number(res.student?.dropped) || 0) > 0;
}

export function jobPeriodDays(input?: { recheck?: boolean; recheckDays?: number; dateFrom?: string; dateTo?: string }): number {
  const d = Number(input?.recheckDays) || 0;
  if (d > 0) return d;
  if (input?.recheck) return 32;
  const from = String(input?.dateFrom || "").slice(0, 10);
  if (!from || from <= "2015-01-01") return 0;
  const t0 = Date.parse(`${from}T00:00:00Z`);
  if (!Number.isFinite(t0)) return 0;
  const now = new Date();
  const t1 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.floor((t1 - t0) / 86400000) + 1);
}

/** Синяя таблица по окну. Красная сюда не ходит — jobGapOf режет. Шаг 3 синяя — и слева по чипу. */
export function jobGapMs(_mode?: JournalJobMode | "", periodDays?: number) {
  const n = Number(periodDays) || 0;
  if (n > 0 && n <= 14) return JOURNAL_FORTNIGHT_GAP_MS;
  if (n === 32 || (n > 14 && n < 60)) return JOURNAL_MONTH_GAP_MS;
  if (n === 92 || (n >= 60 && n < 140)) return JOURNAL_QUARTER_GAP_MS;
  if (n === 182 || (n >= 140 && n < 300)) return JOURNAL_HALF_GAP_MS;
  return JOURNAL_ONE_GAP_MS;
}

export function jobGapOf(job?: { mode?: JournalJobMode | ""; recheck?: boolean; recheckDays?: number; dateFrom?: string; dateTo?: string }): number {
  if (job?.mode === "groups-recheck") return jobGapMs(job.mode, jobPeriodDays({ ...job, recheck: true }));
  if (!job?.recheck) return JOURNAL_ONE_GAP_MS;
  return jobGapMs(job.mode, jobPeriodDays(job));
}

export function jobGapLabel(ms: number): string {
  const n = Number(ms);
  const sec = Number.isFinite(n) && n > 0 ? n / 1000 : JOURNAL_ONE_GAP_MS / 1000;
  const s = Number.isInteger(sec) ? String(sec) : sec.toFixed(1).replace(/\.0$/, "");
  return `пауза ${s} с`;
}
