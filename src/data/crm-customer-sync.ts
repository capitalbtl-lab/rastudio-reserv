/** Штамп входа ученика: полная история один раз, дальше только новое. */

import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { bumpAlfaFromLanded } from "./crm-inbound-core.ts";

export const CUSTOMER_SYNC_TTL_MS = 10 * 60 * 1000;
export const LESSON_INBOUND_RUN = 8;
export const LESSON_STATUSES = [3, 1, 2] as const;
export const LESSON_RECENT_DAYS = -21;

export type LessonFillCursor = { bid: number; statusIdx: number; page: number; done?: boolean; from?: string };

export type CustomerSyncStamp = {
  lessonsAt?: string;
  lessonsFull?: boolean;
  /** Детали явки (is_attend) за весь период уже сняты с Alfa. */
  lessonsAttend?: boolean;
  lessonFill?: LessonFillCursor;
  paysAt?: string;
  lessonsRecheckAt?: string;
  paysRecheckAt?: string;
  /** Дырка журнала принята человеком. Проба/Добрать/синяя не ставят и не снимают. */
  journalHoleApprovedAt?: string;
  /** Сколько занятий Alfa отдаёт по customer_id (сверка с диском). */
  lessonsAlfa?: number;
  lessonsAlfaAt?: string;
  /** Сколько занятий на диске после последней загрузки/перепроверки. */
  lessonsDisk?: number;
  /** Номера уроков, которые видели в Alfa за этот проход перепроверки. */
  lessonsSeenIds?: number[];
};

type Store = { at: string; byId: Record<string, CustomerSyncStamp> };

let mem: Store | null = null;
let memMtime = 0;

function fileOf() {
  return join(process.cwd(), "storage", "crm-customer-sync.json");
}

function load(): Store {
  try {
    const p = fileOf();
    if (!existsSync(p)) return mem || { at: "", byId: {} };
    const mtime = statSync(p).mtimeMs;
    if (mem && memMtime === mtime) return mem;
    const raw = JSON.parse(readFileSync(p, "utf8")) as Partial<Store>;
    mem = { at: String(raw.at || ""), byId: raw.byId && typeof raw.byId === "object" ? raw.byId : {} };
    memMtime = mtime;
    return mem;
  } catch {
    return mem || { at: "", byId: {} };
  }
}

function save(store: Store) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify({ at: new Date().toISOString(), byId: store.byId }, null, 0), "utf8");
  mem = store;
  try {
    memMtime = statSync(fileOf()).mtimeMs;
  } catch {
    memMtime = Date.now();
  }
}

export function isSyncFresh(atIso?: string, now = Date.now(), ttl = CUSTOMER_SYNC_TTL_MS) {
  const t = Date.parse(String(atIso || ""));
  if (!Number.isFinite(t) || t <= 0) return false;
  return now - t < ttl;
}

export function customerSyncOf(customerId: number): CustomerSyncStamp {
  const id = Number(customerId) || 0;
  if (!id) return {};
  return load().byId[String(id)] || {};
}

export function stampCustomerSync(customerId: number, patch: CustomerSyncStamp) {
  const id = Number(customerId) || 0;
  if (!id) return customerSyncOf(0);
  const store = load();
  const prev = store.byId[String(id)] || {};
  const next: CustomerSyncStamp = { ...prev, ...patch };
  if (patch.lessonFill === undefined && "lessonFill" in patch) delete next.lessonFill;
  if (patch.paysRecheckAt === "") delete next.paysRecheckAt;
  if (patch.lessonsRecheckAt === "") delete next.lessonsRecheckAt;
  if (patch.journalHoleApprovedAt === "") delete next.journalHoleApprovedAt;
  if (patch.lessonsAlfaAt === "") {
    delete next.lessonsAlfaAt;
    if (!("lessonsAlfa" in patch)) delete next.lessonsAlfa;
  }
  store.byId[String(id)] = next;
  save(store);
  return next;
}

/** Календарь с Alfa: диск всегда. Счёт += новые id; если уже перекачали (диск > keep, новых нет) — догнать диск. keep=0 не выдумывать. Журнал не закрывать. */
export function noteAlfaLessonsLanded(customerId: number, disk: number, newIds: Iterable<number>) {
  const id = Number(customerId) || 0;
  if (!id) return customerSyncOf(0);
  const fresh: number[] = [];
  const seen = new Set<number>();
  for (const n of newIds) {
    const lid = Number(n) || 0;
    if (lid > 0 && !seen.has(lid)) {
      seen.add(lid);
      fresh.push(lid);
    }
  }
  const prev = customerSyncOf(id);
  const keep = Number(prev.lessonsAlfa) || 0;
  const diskN = Math.max(0, Number(disk) || 0);
  const gap = keep > 0 ? Math.max(0, diskN - keep) : 0;
  const add = fresh.length > 0 ? fresh.length : gap;
  const nextAlfa = bumpAlfaFromLanded(keep, add);
  const held = nextAlfa !== keep && keep > 0;
  const at = new Date().toISOString();
  const seenIds = [...new Set([...(prev.lessonsSeenIds || []).map(Number).filter((n) => n > 0), ...fresh])];
  return stampCustomerSync(id, {
    lessonsDisk: diskN,
    lessonsAt: at,
    lessonsSeenIds: seenIds,
    ...(held ? { lessonsAlfa: nextAlfa, lessonsAlfaAt: at, lessonsFull: false } : {}),
  });
}

export function lessonsCountShort(disk: number, alfa: number, probed: boolean) {
  return Boolean(probed) && Number(alfa) > 0 && Number(disk) < Number(alfa);
}

export function lessonsCountExtra(disk: number, alfa: number, probed: boolean) {
  return Boolean(probed) && Number(disk) > Number(alfa);
}

/** Счёт сошёлся — журнал готов. Диск больше Alfa — не готово. */
export function lessonsJournalReady(sync: CustomerSyncStamp) {
  const probed = Boolean(sync.lessonsAlfaAt);
  const alfaN = probed ? Number(sync.lessonsAlfa) || 0 : 0;
  const diskN = Number(sync.lessonsDisk) || 0;
  if (lessonsCountShort(diskN, alfaN, probed)) return false;
  if (lessonsCountExtra(diskN, alfaN, probed)) return false;
  if (sync.lessonsFull && sync.lessonsAttend) return !probed || diskN === alfaN;
  return probed && diskN === alfaN;
}

/** Уже сходился без extra — синяя не крутит 2015. Extra (диск > Alfa) окно не берёт. */
export function wasLessonGreen(sync: CustomerSyncStamp) {
  const probed = Boolean(sync.lessonsAlfaAt);
  const alfa = Number(sync.lessonsAlfa) || 0;
  const disk = Number(sync.lessonsDisk) || 0;
  if (lessonsCountExtra(disk, alfa, probed)) return false;
  if (sync.lessonsRecheckAt) return true;
  if (sync.lessonsFull) return true;
  return probed && alfa > 0 && disk === alfa;
}

export function customerLessonsFresh(customerId: number, now = Date.now()) {
  const s = customerSyncOf(customerId);
  return Boolean(s.lessonsFull) && Boolean(s.lessonsAttend) && isSyncFresh(s.lessonsAt, now);
}

export function customerLessonsNeedAttend(customerId: number) {
  const s = customerSyncOf(customerId);
  return !s.lessonsAttend;
}

/** Полный круг явки заново: «Загрузить клиентов» и принудительное обновление. */
export function clearLessonsAttendStamps() {
  const store = load();
  let n = 0;
  for (const id of Object.keys(store.byId)) {
    const s = store.byId[id];
    if (!s) continue;
    if (!s.lessonsAttend && !s.lessonsFull && !s.lessonFill) continue;
    s.lessonsAttend = false;
    s.lessonsFull = false;
    delete s.lessonFill;
    n += 1;
  }
  if (n) save(store);
  return n;
}

export function lessonFillStart(branch: number, from?: string): LessonFillCursor {
  return { bid: Number(branch) || 1, statusIdx: 0, page: 0, ...(from ? { from } : {}) };
}

export function lessonFillOf(raw?: unknown): LessonFillCursor | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as { bid?: unknown; statusIdx?: unknown; page?: unknown; done?: unknown; from?: unknown };
  const bid = Number(o.bid) || 0;
  if (!bid) return undefined;
  const from = String(o.from || "").trim();
  return {
    bid,
    statusIdx: Math.max(0, Math.min(LESSON_STATUSES.length - 1, Number(o.statusIdx) || 0)),
    page: Math.max(0, Number(o.page) || 0),
    done: Boolean(o.done) || undefined,
    ...(from ? { from } : {}),
  };
}

/** Если окно ушло в прошлое (7 лет → 2015) — курсор с нуля, иначе продолжаем. */
export function lessonFillForWindow(cur: LessonFillCursor | undefined, askedFrom: string, startBid: number): LessonFillCursor {
  const from = String(askedFrom || "").trim();
  if (!cur) return lessonFillStart(startBid, from);
  const prev = String(cur.from || "");
  if (from && prev && from < prev) return lessonFillStart(startBid, from);
  if (from && !prev && /^2015/.test(from)) return lessonFillStart(startBid, from);
  return { ...cur, from: prev || from || undefined };
}

/** Короткая страница — следующий статус, потом филиал. После последнего — done. */
export function lessonFillAdvance(cur: LessonFillCursor, lastShort: boolean, branches: number[]): LessonFillCursor {
  const from = cur.from ? { from: cur.from } : {};
  if (cur.done) return { bid: cur.bid, statusIdx: cur.statusIdx, page: cur.page, done: true, ...from };
  if (!lastShort) return { bid: cur.bid, statusIdx: cur.statusIdx, page: cur.page + 1, ...from };
  if (cur.statusIdx < LESSON_STATUSES.length - 1) return { bid: cur.bid, statusIdx: cur.statusIdx + 1, page: 0, ...from };
  const ids = branches.map(Number).filter((n) => n);
  const i = ids.indexOf(Number(cur.bid) || 0);
  const next = i >= 0 ? ids[i + 1] : undefined;
  if (!next) return { bid: cur.bid, statusIdx: cur.statusIdx, page: cur.page, done: true, ...from };
  return { bid: next, statusIdx: 0, page: 0, ...from };
}

const g = globalThis as { __raLessonFill?: Set<number>; __raStudentAlfa?: number; __raStudentAlfaSet?: Set<number> };
const STUDENT_LOCK_STALE_MS = 10 * 60 * 1000;

export function lessonFillBusy(customerId: number) {
  const id = Number(customerId) || 0;
  if (!id) return false;
  return Boolean(g.__raLessonFill?.has(id));
}

export function markLessonFillBusy(customerId: number, on: boolean) {
  const id = Number(customerId) || 0;
  if (!id) return;
  if (!g.__raLessonFill) g.__raLessonFill = new Set();
  if (on) g.__raLessonFill.add(id);
  else g.__raLessonFill.delete(id);
}

function studentLockFile(id: number) {
  return join(process.cwd(), "storage", "locks", `crm-student-${id}.lock`);
}

function pidAlive(pid: number) {
  if (!(pid > 0)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function fileHoldsStudent(id: number) {
  const dest = studentLockFile(id);
  try {
    if (!existsSync(dest)) return false;
    const raw = JSON.parse(readFileSync(dest, "utf8")) as { pid?: number; at?: string };
    const pid = Number(raw.pid) || 0;
    const age = Date.now() - Date.parse(String(raw.at || ""));
    if (!Number.isFinite(age) || age > STUDENT_LOCK_STALE_MS) return false;
    if (pid === process.pid) return false;
    return pidAlive(pid);
  } catch {
    return false;
  }
}

export function ownsStudentAlfa(customerId: number) {
  const id = Number(customerId) || 0;
  return Boolean(id && g.__raStudentAlfaSet?.has(id));
}

export function studentAlfaOwner() {
  return Number(g.__raStudentAlfa) || 0;
}

export function tryLockStudentAlfa(customerId: number) {
  const id = Number(customerId) || 0;
  if (!id) return false;
  if (ownsStudentAlfa(id)) return true;
  const dest = studentLockFile(id);
  const payload = JSON.stringify({ pid: process.pid, cid: id, at: new Date().toISOString() });
  mkdirSync(dirname(dest), { recursive: true });
  const take = () => {
    writeFileSync(dest, payload, { flag: "wx" });
    if (!g.__raStudentAlfaSet) g.__raStudentAlfaSet = new Set();
    g.__raStudentAlfaSet.add(id);
    g.__raStudentAlfa = id;
    return true;
  };
  try {
    return take();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") return false;
    if (fileHoldsStudent(id)) return false;
    try {
      unlinkSync(dest);
    } catch {
      return false;
    }
    try {
      return take();
    } catch {
      return false;
    }
  }
}

export async function waitLockStudentAlfa(customerId: number, ms = 20000) {
  const id = Number(customerId) || 0;
  if (!id) return false;
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (tryLockStudentAlfa(id)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return tryLockStudentAlfa(id);
}

export function unlockStudentAlfa(customerId: number) {
  const id = Number(customerId) || 0;
  if (!id || !ownsStudentAlfa(id)) return;
  g.__raStudentAlfaSet?.delete(id);
  if (Number(g.__raStudentAlfa) === id) {
    const next = g.__raStudentAlfaSet?.values().next();
    g.__raStudentAlfa = Number(next?.value) || 0;
  }
  try {
    const dest = studentLockFile(id);
    if (!existsSync(dest)) return;
    const raw = JSON.parse(readFileSync(dest, "utf8")) as { pid?: number };
    if (Number(raw.pid) === process.pid) unlinkSync(dest);
  } catch {
    /* */
  }
}
