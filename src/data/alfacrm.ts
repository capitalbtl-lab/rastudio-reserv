import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { serverEnv } from "./server-env";
import { formatRuPhone } from "./ru-phone";
import { crmIndexAccumTotal, crmIndexShouldStop, crmUnwrapIndex } from "./crm-leads-stages";
import { lessonAllowsGroup, lessonOmitsRoom } from "./lesson-type-rules";
import { wantAlfaPipe } from "./crm-alfa-link";

const HOST = () => (serverEnv("ALFACRM_HOST") || "https://studiyarazvivaysya.s20.online").replace(/\/$/, "");
const EMAIL = () => serverEnv("ALFACRM_EMAIL") || process.env.ALFACRM_EMAIL || "";
const API_KEY = () => serverEnv("ALFACRM_API_KEY") || process.env.ALFACRM_API_KEY || "";

const SOURCE_SITE = 2;
const STATUS_NEW = 1;
const PIPELINE = 1;
const BRANCHES = [1, 2, 3, 4];

/** Типы занятий AlfaCRM — как в справочнике студии. */
export const LESSON_TYPES = [
  { id: 1, key: "individual", name: "Индивидуальное" },
  { id: 2, key: "group", name: "Групповое" },
  { id: 3, key: "trial", name: "Пробное" },
  { id: 4, key: "makeup", name: "Отработка" },
  { id: 5, key: "intro", name: "Вводное" },
  { id: 6, key: "master", name: "Мастер-класс" },
  { id: 7, key: "open", name: "Открытый урок" },
  { id: 8, key: "excursion", name: "Экскурсия" },
  { id: 9, key: "camp", name: "Летний лагерь" },
  { id: 10, key: "extra", name: "Дополнительное" },
  { id: 11, key: "overtime", name: "Сверхурочное" },
  { id: 12, key: "event", name: "Мероприятие" },
  { id: 13, key: "interview", name: "Собеседование" },
  { id: 14, key: "aftercare", name: "Продленка" },
  { id: 15, key: "summer", name: "Летняя программа" },
] as const;

export type LessonTypeKey = (typeof LESSON_TYPES)[number]["key"];

const LESSON_ALIASES: Record<string, LessonTypeKey> = {
  "1": "individual",
  индивидуальное: "individual",
  индивидуал: "individual",
  individual: "individual",
  "2": "group",
  групповое: "group",
  группа: "group",
  group: "group",
  "3": "trial",
  пробное: "trial",
  проба: "trial",
  trial: "trial",
  "4": "makeup",
  отработка: "makeup",
  "групповая отработка": "makeup",
  makeup: "makeup",
  "5": "intro",
  вводное: "intro",
  intro: "intro",
  "6": "master",
  "мастер-класс": "master",
  мастеркласс: "master",
  master: "master",
  "7": "open",
  "открытый урок": "open",
  open: "open",
  "8": "excursion",
  экскурсия: "excursion",
  excursion: "excursion",
  "9": "camp",
  лагерь: "camp",
  "летний лагерь": "camp",
  camp: "camp",
  "10": "extra",
  дополнительное: "extra",
  extra: "extra",
  "11": "overtime",
  сверхурочное: "overtime",
  overtime: "overtime",
  "12": "event",
  мероприятие: "event",
  event: "event",
  "13": "interview",
  собеседование: "interview",
  interview: "interview",
  "14": "aftercare",
  продленка: "aftercare",
  aftercare: "aftercare",
  "15": "summer",
  "летняя программа": "summer",
  лето: "summer",
  summer: "summer",
};

export function resolveLessonType(raw?: string) {
  const s = String(raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!s || s === "consult" || s === "консультация") return null;
  const key = LESSON_ALIASES[s] || (LESSON_TYPES.some((t) => t.key === s) ? (s as LessonTypeKey) : "trial");
  return LESSON_TYPES.find((t) => t.key === key) || LESSON_TYPES.find((t) => t.key === "trial")!;
}

type TokenCache = { token: string; exp: number };
let cache: TokenCache | null = null;
let lastAt = 0;
let gate: Promise<void> = Promise.resolve();
function gapMs() {
  const rps = Number(process.env.ALFACRM_RPS || 0);
  if (Number.isFinite(rps) && rps > 0) return Math.max(200, Math.round(1000 / rps));
  return 400;
}
const INDEX_TTL = 45_000;
const indexCache = new Map<string, { at: number; json: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
let tokenFlight: Promise<string> | null = null;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function rpsFile() {
  return join(process.cwd(), "storage", "alfa-rps.json");
}
function rpsLock() {
  return join(process.cwd(), "storage", "alfa-rps.lock");
}

function pidAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function pipeOn(ch: "sharedLimiter" | "keepToken" | "verifyCreate" | "retry401") {
  try {
    return wantAlfaPipe(ch);
  } catch {
    return true;
  }
}

function readRpsAt() {
  try {
    return Number(JSON.parse(readFileSync(rpsFile(), "utf8")).at) || 0;
  } catch {
    return 0;
  }
}

function writeRpsAt(at: number) {
  mkdirSync(dirname(rpsFile()), { recursive: true });
  writeFileSync(rpsFile(), JSON.stringify({ at }), "utf8");
}

async function acquireRpsLock() {
  const file = rpsLock();
  mkdirSync(dirname(file), { recursive: true });
  for (let i = 0; i < 50; i += 1) {
    let busy = false;
    try {
      if (existsSync(file)) {
        const raw = JSON.parse(readFileSync(file, "utf8")) as { pid?: number; at?: string };
        const age = Date.now() - Date.parse(String(raw.at || "")) || 9e9;
        if (Number(raw.pid) && pidAlive(Number(raw.pid)) && age < 8000) busy = true;
      }
    } catch {
      busy = false;
    }
    if (!busy) {
      writeFileSync(file, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), "utf8");
      return;
    }
    await sleep(40);
  }
}

function releaseRpsLock() {
  try {
    if (existsSync(rpsLock())) unlinkSync(rpsLock());
  } catch {
    /* */
  }
}

async function waitSharedGap() {
  if (!pipeOn("sharedLimiter")) return;
  await acquireRpsLock();
  try {
    const wait = gapMs() - (Date.now() - readRpsAt());
    if (wait > 0) await sleep(wait);
    writeRpsAt(Date.now());
  } finally {
    releaseRpsLock();
  }
}

function stableBody(body: unknown) {
  try {
    return JSON.stringify(body ?? {});
  } catch {
    return "";
  }
}

function indexKey(path: string, body: unknown) {
  if (!/\/index(\?|$)/.test(path)) return "";
  return `${path}|${stableBody(body)}`;
}

function dropIndexCache(path?: string) {
  if (!path) {
    indexCache.clear();
    return;
  }
  const stem = path.replace(/\?.*$/, "").replace(/\/(create|update|delete).*$/, "/index");
  for (const k of [...indexCache.keys()]) {
    if (k.startsWith(stem) || k.includes(stem)) indexCache.delete(k);
  }
}

async function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const prev = gate;
  let release!: () => void;
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  const wait = gapMs() - (Date.now() - lastAt);
  if (wait > 0) await sleep(wait);
  lastAt = Date.now();
  try {
    await waitSharedGap();
    lastAt = Date.now();
    return await fn();
  } finally {
    release();
  }
}

async function throttle() {
  await enqueue(async () => undefined);
}

export async function pace() {
  await throttle();
}

export { formatRuPhone };

export function formatRuDob(raw?: string) {
  const s = String(raw || "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const ru = s.match(/^(\d{1,2})[.](\d{1,2})[.](\d{4})$/);
  if (ru) return `${ru[1].padStart(2, "0")}.${ru[2].padStart(2, "0")}.${ru[3]}`;
  return s;
}

export function leadUrl(branch: number, id: number) {
  return `https://studiyarazvivaysya.s20.online/company/${branch}/lead/view?id=${id}`;
}

export async function request<T>(path: string, body: unknown, tok?: string): Promise<T> {
  let url = path;
  if (body && typeof body === "object" && /\/(update|delete)(\?|$)/.test(url) && !/[?&]id=/.test(url)) {
    const id = Number((body as { id?: unknown }).id);
    if (id) url += `${url.includes("?") ? "&" : "?"}id=${id}`;
  }
  const write = /\/(create|update|delete)(\?|$)/.test(url);
  const key = write ? "" : indexKey(url, body);
  if (key) {
    const hit = indexCache.get(key);
    if (hit && Date.now() - hit.at < INDEX_TTL) return hit.json as T;
    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;
  }
  const run = enqueue(async () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (tok) headers["X-ALFACRM-TOKEN"] = tok;
    const send = () =>
      fetch(`${HOST()}${url}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(18000),
      });
    let res: Response;
    try {
      res = await send();
    } catch {
      await sleep(700);
      lastAt = Date.now();
      res = await send();
    }
    if (res.status === 401 && tok && pipeOn("retry401") && !/\/auth\/login/.test(url)) {
      cache = null;
      const fresh = await loginFetch();
      headers["X-ALFACRM-TOKEN"] = fresh;
      lastAt = Date.now();
      res = await send();
      if (res.status === 401) throw new Error("alfacrm 401 ключ API или пользователь");
    }
    if (res.status === 429 || res.status === 503) {
      await sleep(2000);
      lastAt = Date.now();
      res = await send();
    }
    const text = await res.text();
    let json: unknown = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { message: text.slice(0, 200) };
    }
    if (!res.ok) {
      throw new Error(`alfacrm ${res.status} ${path} ${text.slice(0, 240)}`);
    }
    return json as T;
  });
  if (key) {
    inflight.set(key, run);
    try {
      const json = await run;
      indexCache.set(key, { at: Date.now(), json });
      return json;
    } finally {
      inflight.delete(key);
    }
  }
  const json = await run;
  if (write) dropIndexCache(url);
  return json;
}

/** AlfaCRM index: page с 0, pageSize до 500, в ответе total (все) и count (страница). */
export async function pagedIndex<T extends Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
  tok: string,
  onItem: (item: T) => void,
  opts?: { pageSize?: number; pages?: number },
) {
  const pageSize = Math.min(500, Math.max(1, opts?.pageSize ?? 50));
  const maxPages = opts?.pages ?? 40;
  let total = Number.POSITIVE_INFINITY;
  let loaded = 0;
  let prev = "";
  for (let page = 0; page < maxPages; page += 1) {
    const res = await request<unknown>(path, { ...body, page, pageSize }, tok).catch(() => ({ items: [] }));
    const pack = crmUnwrapIndex(res);
    const batch = pack.items as T[];
    total = crmIndexAccumTotal(page, pageSize, batch.length, pack.total ?? (res as { total?: unknown }).total, total);
    const key = batch.map((x) => String(x.id ?? "")).join(",");
    if (key && key === prev) break;
    prev = key;
    for (const it of batch) onItem(it);
    loaded += batch.length;
    if (crmIndexShouldStop(pageSize, batch.length, pack.count, loaded, total)) break;
  }
  return { loaded, total: Number.isFinite(total) ? total : loaded };
}

export function dropAlfaIndex() {
  dropIndexCache();
}

export function dropAlfaAuth() {
  cache = null;
  dropIndexCache();
}

async function loginFetch() {
  const email = EMAIL();
  const apiKey = API_KEY();
  if (!email || !apiKey) throw new Error("no-alfacrm");
  const res = await fetch(`${HOST()}/v2api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, api_key: apiKey }),
    signal: AbortSignal.timeout(18000),
  });
  const text = await res.text();
  let json: { token?: string } = {};
  try {
    json = text ? (JSON.parse(text) as { token?: string }) : {};
  } catch {
    json = {};
  }
  if (!json.token) throw new Error("no-alfacrm-token");
  cache = { token: json.token, exp: Date.now() + 50 * 60 * 1000 };
  return json.token;
}

export async function token() {
  if (cache && cache.exp > Date.now()) return cache.token;
  if (tokenFlight) return tokenFlight;
  tokenFlight = enqueue(async () => {
    if (cache && cache.exp > Date.now()) return cache.token;
    return loginFetch();
  }).finally(() => {
    tokenFlight = null;
  });
  return tokenFlight;
}

type Customer = {
  id: number;
  name?: string;
  note?: string | null;
  is_study?: number;
};

type Regular = {
  id?: number;
  related_id?: number | null;
  subject_id?: number;
  day?: number;
  time_from_v?: string;
  time_to_v?: string;
  teacher_ids?: number[];
  room_id?: number;
};

function moscowParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    day: map[parts.weekday] || 1,
    date: `${parts.day}.${parts.month}.${parts.year}`,
  };
}

function nextDateForCrmDay(crmDay: number) {
  const now = moscowParts();
  let add = (Number(crmDay) - now.day + 7) % 7;
  if (add === 0) add = 7;
  const ms = Date.now() + add * 86400000;
  return moscowParts(new Date(ms)).date;
}

function durationOf(from?: string, to?: string, fallback = 90) {
  const a = String(from || "").split(":");
  const b = String(to || "").split(":");
  if (a.length < 2 || b.length < 2) return fallback;
  const mins = Number(b[0]) * 60 + Number(b[1]) - (Number(a[0]) * 60 + Number(a[1]));
  return mins > 0 && mins <= 240 ? mins : fallback;
}

async function findByPhone(phone: string): Promise<{ branch: number; customer: Customer } | null> {
  const t = await token();
  const variants = [phone, phone.replace(/\D/g, "")];
  let order = [...BRANCHES];
  try {
    const { findDossier } = await import("./dossiers");
    const d = findDossier({ phone });
    if (d?.branchId) order = [d.branchId, ...BRANCHES.filter((b) => b !== d.branchId)];
    if (d?.crmId && d.branchId) {
      const data = await request<{ items?: Customer[] }>(
        `/v2api/${d.branchId}/customer/index`,
        { page: 0, pageSize: 1, id: d.crmId },
        t,
      );
      const hit = data.items?.find((x) => Number(x.id) === d.crmId) || data.items?.[0];
      if (hit?.id) return { branch: d.branchId, customer: hit };
    }
  } catch {
    /* живой индекс CRM */
  }
  for (const branch of order) {
    for (const q of variants) {
      const data = await request<{ items?: Customer[] }>(
        `/v2api/${branch}/customer/index`,
        { page: 0, pageSize: 5, phone: q },
        t,
      );
      const hit = data.items?.[0];
      if (hit?.id) return { branch, customer: hit };
    }
  }
  return null;
}

async function slotFromGid(branch: number, gid: number, t: string): Promise<Regular | null> {
  try {
    const { listAdminSlots } = await import("./alfacrm-schedule");
    const local = listAdminSlots().find((s) => Number(s.groupId) === gid && Number(s.branchId) === branch)
      || listAdminSlots().find((s) => Number(s.groupId) === gid);
    if (local?.subjectId) {
      return {
        related_id: gid,
        subject_id: local.subjectId,
        time_from_v: local.timeFrom,
        time_to_v: local.timeTo,
        teacher_ids: local.teacherIds?.length ? local.teacherIds : local.teacherId ? [local.teacherId] : [],
        room_id: local.roomId,
      } as Regular;
    }
  } catch {
    /* диск пуст — один запрос Alfa */
  }
  const res = await request<{ items?: Regular[] }>(
    `/v2api/${branch}/regular-lesson/index`,
    { page: 0, pageSize: 20, group_id: gid },
    t,
  );
  const list = res.items || [];
  return list.find((item) => Number(item.related_id) === gid) || list[0] || null;
}

export async function createAlfaLesson(opts: {
  branch: number;
  customerId: number;
  type?: string;
  subjectId?: number;
  gid?: string;
  date?: string;
  time?: string;
  duration?: number;
  note?: string;
  topic?: string;
  roomId?: number;
  teacherId?: number;
}) {
  const t = await token();
  const type = resolveLessonType(opts.type) || resolveLessonType("trial")!;
  let subjectId = Number(opts.subjectId) || 0;
  let date = formatRuDob(opts.date);
  let time = String(opts.time || "").replace(".", ":").slice(0, 5);
  let duration = Number(opts.duration) || 90;
  let teacherIds: number[] = Number(opts.teacherId) > 0 ? [Number(opts.teacherId)] : [];
  const hintGid = opts.gid && /^\d+$/.test(opts.gid) ? Number(opts.gid) : 0;
  const allowGroup = lessonAllowsGroup(type.id);
  const gid = allowGroup ? hintGid : 0;
  let roomId: number | undefined = lessonOmitsRoom(type.id) ? undefined : Number(opts.roomId) > 0 ? Number(opts.roomId) : undefined;
  if (hintGid) {
    const slot = await slotFromGid(opts.branch, hintGid, t).catch(() => null);
    if (slot) {
      if (!subjectId) subjectId = Number(slot.subject_id) || 0;
      if (!time) time = String(slot.time_from_v || "").slice(0, 5);
      if (!opts.duration) duration = durationOf(slot.time_from_v, slot.time_to_v, duration);
      if (!date && slot.day) date = nextDateForCrmDay(Number(slot.day));
      if (!teacherIds.length) teacherIds = slot.teacher_ids || [];
      if (!roomId && slot.room_id && !lessonOmitsRoom(type.id)) roomId = slot.room_id;
    }
  }
  if (!date) date = nextDateForCrmDay(moscowParts().day === 7 ? 1 : moscowParts().day + 1);
  if (!time) time = "16:00";
  if (!subjectId) return { ok: false as const, error: "no-subject" as const };
  const [hh, mm] = time.split(":").map(Number);
  const tot = (Number(hh) || 0) * 60 + (Number(mm) || 0) + duration;
  const timeTo = `${String(Math.floor((tot % (24 * 60)) / 60)).padStart(2, "0")}:${String((tot % (24 * 60)) % 60).padStart(2, "0")}`;
  const rooms = roomId ? [roomId, 0] : [0];
  let lastErr = "";
  for (const rid of rooms) {
    try {
      const created = await request<{ success?: boolean; errors?: unknown; model?: { id?: number }; id?: number; data?: { id?: number } }>(
        `/v2api/${opts.branch}/lesson/create`,
        {
          lesson_type_id: type.id,
          lesson_date: date,
          time_from: time,
          time_to: timeTo,
          duration,
          subject_id: subjectId,
          customer_ids: [opts.customerId],
          ...(gid ? { group_ids: [gid] } : {}),
          ...(teacherIds.length ? { teacher_ids: teacherIds } : {}),
          ...(rid ? { room_id: rid } : {}),
          ...(opts.topic ? { topic: opts.topic } : {}),
          note: opts.note || `${type.name} с сайта rastudio.org`,
        },
        t,
      );
      const id = Number(created.model?.id || created.id || created.data?.id) || 0;
      if (created.success !== false && id) {
        return { ok: true as const, id, date, time, duration, type: type.name, typeId: type.id, roomId: rid || undefined };
      }
      lastErr = JSON.stringify(created.errors || created);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    if (/аудитория занята/i.test(lastErr) || /нельзя добавить группу/i.test(lastErr)) continue;
    throw new Error(`alfacrm-lesson ${lastErr}`);
  }
  throw new Error(`alfacrm-lesson ${lastErr || "не создался"}`);
}

export type AlfaLead = {
  parent: string;
  child: string;
  phone: string;
  email?: string;
  dobRu?: string;
  branchId: string;
  courseName?: string;
  courseId?: string;
  subjectId?: number;
  gid?: string;
  groupName?: string;
  kind?: string;
  date?: string;
  time?: string;
  duration?: number;
};

export async function upsertAlfaLead(lead: AlfaLead) {
  const phone = formatRuPhone(lead.phone);
  const branch = Number(lead.branchId) || 2;
  const lessonType = resolveLessonType(lead.kind);
  const kindLabel = lessonType ? lessonType.name.toLowerCase() : "консультация";
  const child = (lead.child || "").trim() || lead.parent;
  const parent = lead.parent.trim();
  const dob = formatRuDob(lead.dobRu);
  const noteLine = [
    `Заказчик: ${parent}`,
    `Ребёнок: ${child}`,
    `Тип: ${kindLabel}`,
    lead.courseName ? `Курс: ${lead.courseName}` : "",
    lead.groupName ? `Группа: ${lead.groupName}` : "",
    lead.gid ? `gid=${lead.gid}` : "",
    lead.date || lead.time ? `Слот: ${lead.date || ""} ${lead.time || ""}`.trim() : "",
    "Источник: ИИ-администратор rastudio.org",
  ]
    .filter(Boolean)
    .join("\n");
  const t = await token();
  const existing = await findByPhone(phone);
  const groupIds = lead.gid && /^\d+$/.test(lead.gid) ? [Number(lead.gid)] : undefined;
  const taskText = `Сайт rastudio.org: ${kindLabel}. ${child}${lead.courseName ? `, ${lead.courseName}` : ""}${lead.gid ? `, группа ${lead.gid}` : ""}.`;
  let customerId = 0;
  let usedBranch = branch;
  let duplicate = false;
  if (existing) {
    const prev = existing.customer.note ? `${existing.customer.note}\n\n` : "";
    const upd = await request<{ success?: boolean; errors?: unknown; model?: Customer }>(
      `/v2api/${existing.branch}/customer/update?id=${existing.customer.id}`,
      {
        id: existing.customer.id,
        name: child,
        legal_name: parent,
        legal_type: 1,
        ...(lead.email ? { email: [lead.email] } : {}),
        ...(dob ? { dob } : {}),
        note: `${prev}${noteLine}`,
        ...(groupIds ? { group_ids: groupIds } : {}),
      },
      t,
    );
    if (upd.success === false) throw new Error(`alfacrm-update ${JSON.stringify(upd.errors || upd)}`);
    customerId = existing.customer.id;
    usedBranch = existing.branch;
    duplicate = true;
  } else {
    let newStatus = STATUS_NEW;
    try {
      const { loadFunnelAuto } = await import("./funnel-auto");
      const rules = loadFunnelAuto();
      if (rules.siteOn) newStatus = rules.siteStageId;
    } catch {
      /* заводской Разбирается */
    }
    const created = await request<{ success?: boolean; errors?: unknown; model?: Customer }>(
      `/v2api/${branch}/customer/create`,
      {
        name: child,
        legal_name: parent,
        legal_type: 1,
        phone: [phone],
        ...(lead.email ? { email: [lead.email] } : {}),
        ...(dob ? { dob } : {}),
        is_study: 0,
        lead_source_id: SOURCE_SITE,
        lead_status_id: newStatus,
        pipeline_id: PIPELINE,
        branch_ids: [branch],
        note: noteLine,
        ...(groupIds ? { group_ids: groupIds } : {}),
      },
      t,
    );
    const id = created.model?.id;
    if (created.success === false || !id) {
      throw new Error(`alfacrm-create ${JSON.stringify(created.errors || created)}`);
    }
    customerId = id;
  }
  await request(
    `/v2api/${usedBranch}/task/create`,
    {
      customer_ids: [customerId],
      branch_ids: [usedBranch],
      user_id: 1,
      title: `Сайт: ${kindLabel}`,
      text: taskText,
    },
    t,
  ).catch(() => null);

  let lesson: { id?: number; date?: string; time?: string; type?: string } | null = null;
  if (lessonType) {
    try {
      const booked = await createAlfaLesson({
        branch: usedBranch,
        customerId,
        type: lessonType.key,
        subjectId: Number(lead.subjectId) || undefined,
        gid: lead.gid,
        date: lead.date,
        time: lead.time,
        duration: lead.duration,
        note: noteLine,
      });
      if (booked.ok) lesson = { id: booked.id, date: booked.date, time: booked.time, type: booked.type };
    } catch (err) {
      console.error("alfa-lesson", err);
    }
  }
  return {
    ok: true as const,
    id: customerId,
    duplicate,
    branch: usedBranch,
    url: leadUrl(usedBranch, customerId),
    lesson,
  };
}
