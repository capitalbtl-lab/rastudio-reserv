/** Штамп входа ученика: полная история один раз, дальше только новое. */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const CUSTOMER_SYNC_TTL_MS = 10 * 60 * 1000;
export const LESSON_INBOUND_RUN = 8;
export const LESSON_STATUSES = [3, 1, 2] as const;
export const LESSON_RECENT_DAYS = -21;

export type LessonFillCursor = { bid: number; statusIdx: number; page: number; done?: boolean };

export type CustomerSyncStamp = {
  lessonsAt?: string;
  lessonsFull?: boolean;
  /** Детали явки (is_attend) за весь период уже сняты с Alfa. */
  lessonsAttend?: boolean;
  lessonFill?: LessonFillCursor;
  paysAt?: string;
  lessonsRecheckAt?: string;
  paysRecheckAt?: string;
  /** Сколько занятий Alfa отдаёт по customer_id (сверка с диском). */
  lessonsAlfa?: number;
  lessonsAlfaAt?: string;
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
  store.byId[String(id)] = next;
  save(store);
  return next;
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

export function lessonFillStart(branch: number): LessonFillCursor {
  return { bid: Number(branch) || 1, statusIdx: 0, page: 0 };
}

export function lessonFillOf(raw?: unknown): LessonFillCursor | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as { bid?: unknown; statusIdx?: unknown; page?: unknown; done?: unknown };
  const bid = Number(o.bid) || 0;
  if (!bid) return undefined;
  return {
    bid,
    statusIdx: Math.max(0, Math.min(LESSON_STATUSES.length - 1, Number(o.statusIdx) || 0)),
    page: Math.max(0, Number(o.page) || 0),
    done: Boolean(o.done) || undefined,
  };
}

/** Короткая страница — следующий статус, потом филиал. После последнего — done. */
export function lessonFillAdvance(cur: LessonFillCursor, lastShort: boolean, branches: number[]): LessonFillCursor {
  if (cur.done) return { bid: cur.bid, statusIdx: cur.statusIdx, page: cur.page, done: true };
  if (!lastShort) return { bid: cur.bid, statusIdx: cur.statusIdx, page: cur.page + 1 };
  if (cur.statusIdx < LESSON_STATUSES.length - 1) return { bid: cur.bid, statusIdx: cur.statusIdx + 1, page: 0 };
  const ids = branches.map(Number).filter((n) => n);
  const i = ids.indexOf(Number(cur.bid) || 0);
  const next = i >= 0 ? ids[i + 1] : undefined;
  if (!next) return { bid: cur.bid, statusIdx: cur.statusIdx, page: cur.page, done: true };
  return { bid: next, statusIdx: 0, page: 0 };
}

const g = globalThis as { __raLessonFill?: Set<number> };

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
