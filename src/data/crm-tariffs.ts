/**
 * Абонементы AlfaCRM.
 * Привязка к группе:
 *   1) slot.tariffId — явный выбор на карточке группы;
 *   2) tariff-map.json: tariffId → schoolId + courseId сайта (не CRM);
 *   3) fallback CRM: subjectId ∈ tariff.subjectIds, branchId ∈ tariff.branchIds,
 *      длительность ±5 мин, lessonType 2.
 * Имя абонемента не участвует в сопоставлении.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { serverEnv } from "./server-env";
import { LESSON_TYPES } from "./alfacrm";
import { loadSubjects, pullSubjectsFromCrm } from "./crm-subjects";
import { listAdminSlots } from "./alfacrm-schedule";
import { loadScheduleMap } from "./schedule-map";
import type { CrmSlot } from "./crm-slots-core";
import { guessTariffLinks, readTariffMap, saveTariffMap, type TariffLink } from "./tariff-map";
import { loadSiteTree, slotTreeKey } from "./site-tree";

export type CrmLessonType = { id: number; name: string };
export type CrmBranch = { id: number; name: string; short: string };
export type CrmTariff = {
  id: number;
  name: string;
  price: number;
  lessonsCount: number;
  duration: number;
  type: number;
  typeName: string;
  archive: boolean;
  branchIds: number[];
  subjectIds: number[];
  lessonTypeIds: number[];
  calculationType: number;
  calculationName: string;
  periodCount: number;
  periodType: number;
  periodLabel: string;
  pricePerLesson: number;
  bDate: string;
  eDate: string;
  added: string;
  cardOk: boolean;
};

type Store = { at: string; items: CrmTariff[]; lessonTypes: CrmLessonType[]; branches: CrmBranch[] };
let tariffMem: { mtime: number; store: Store } | null = null;

export const BRANCH_ORDER = [2, 1, 3, 4];

const BRANCH_SHORT: Record<number, string> = {
  1: "Гражданская",
  2: "ЦМИТ",
  3: "Луховицы",
  4: "Лето",
};

function defaultBranches(): CrmBranch[] {
  return [
    { id: 2, name: "ЦМИТ «Развивайся»", short: "ЦМИТ" },
    { id: 1, name: "Студия, Гражданская, 2", short: "Гражданская" },
    { id: 3, name: "Студия, Луховицы, Пушкина, 202А", short: "Луховицы" },
    { id: 4, name: "Летние программы", short: "Лето" },
  ];
}

function fileOf() {
  return join(process.cwd(), "storage", "crm-tariffs.json");
}

function emptyStore(): Store {
  return { at: "", items: [], lessonTypes: LESSON_TYPES.map((t) => ({ id: t.id, name: t.name })), branches: defaultBranches() };
}

export function loadTariffs(): Store {
  try {
    if (!existsSync(fileOf())) return emptyStore();
    const mtime = statSync(fileOf()).mtimeMs;
    if (tariffMem && tariffMem.mtime === mtime) return tariffMem.store;
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<Store>;
    const store = {
      at: String(raw.at || ""),
      items: Array.isArray(raw.items) ? raw.items : [],
      lessonTypes: Array.isArray(raw.lessonTypes) && raw.lessonTypes.length ? raw.lessonTypes : emptyStore().lessonTypes,
      branches: Array.isArray(raw.branches) && raw.branches.length ? raw.branches : defaultBranches(),
    };
    tariffMem = { mtime, store };
    return store;
  } catch {
    return tariffMem?.store || emptyStore();
  }
}

export function saveTariffs(store: Store) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  const packed: Store = {
    at: store.at || new Date().toISOString(),
    items: store.items,
    lessonTypes: store.lessonTypes.length ? store.lessonTypes : emptyStore().lessonTypes,
    branches: store.branches?.length ? store.branches : defaultBranches(),
  };
  writeFileSync(fileOf(), JSON.stringify(packed, null, 2));
  tariffMem = { mtime: Date.now(), store: packed };
  return packed;
}

export function branchLabel(id: number) {
  return BRANCH_SHORT[id] || `филиал ${id}`;
}

export function slotMinutes(slot: Pick<CrmSlot, "timeFrom" | "timeTo">) {
  const [h1, m1] = String(slot.timeFrom || "")
    .split(":")
    .map(Number);
  const [h2, m2] = String(slot.timeTo || "")
    .split(":")
    .map(Number);
  if (![h1, m1, h2, m2].every((n) => Number.isFinite(n))) return 0;
  const n = h2 * 60 + m2 - (h1 * 60 + m1);
  return n > 0 ? n : 0;
}

/**
 * «Подходит к группе» — не ИИ, жёсткий фильтр по ID:
 *   филиал, длительность ±5 мин, тип урока 2,
 *   курс сайта абонемента = курс группы (если курс у абонемента задан),
 *   иначе предмет CRM.
 * Имя и возраст из названия не смотрим.
 */
export function tariffFitsSlot(t: CrmTariff, slot: CrmSlot, link?: TariffLink | null) {
  if (t.archive) return false;
  if (t.branchIds.length && slot.branchId && !t.branchIds.includes(slot.branchId)) return false;
  const mins = slotMinutes(slot);
  if (mins && t.duration && Math.abs(mins - t.duration) > 5) return false;
  if (t.lessonTypeIds.length && !t.lessonTypeIds.includes(2)) return false;
  const bind = link === undefined ? guessTariffLinks([t])[0] : link;
  if (bind?.schoolId && slot.schoolId && bind.schoolId !== slot.schoolId) return false;
  if (bind?.courseId) return Boolean(slot.courseId) && bind.courseId === slot.courseId;
  if (!slot.subjectId || !t.subjectIds.includes(slot.subjectId)) return false;
  return true;
}

export function matchTariffs(slot: CrmSlot, list = loadTariffs().items) {
  const links = new Map(guessTariffLinks(list).map((x) => [x.tariffId, x]));
  return list.filter((t) => tariffFitsSlot(t, slot, links.get(t.id) || null)).sort((a, b) => a.price - b.price || a.name.localeCompare(b.name, "ru"));
}

export type GroupTariffOption = {
  id: number;
  name: string;
  price: number;
  lessonsCount: number;
  duration: number;
  fit: boolean;
};

/** Список для выбора на карточке группы: сначала подходящие, потом остальные. */
export function groupTariffPack(slot?: CrmSlot | null) {
  const all = loadTariffs().items.filter((t) => !t.archive);
  const matched = slot ? matchTariffs(slot, all) : [];
  const fit = new Set(matched.map((t) => t.id));
  const rest = all.filter((t) => !fit.has(t.id)).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const tariffs: GroupTariffOption[] = [...matched, ...rest].map((t) => ({
    id: t.id,
    name: t.name,
    price: t.price,
    lessonsCount: t.lessonsCount,
    duration: t.duration,
    fit: fit.has(t.id),
  }));
  const saved = Number(slot?.tariffId) || 0;
  const tariffId = saved && tariffs.some((t) => t.id === saved) ? saved : 0;
  return { tariffId, tariffs };
}

export function groupsForTariff(t: CrmTariff, slots = listAdminSlots()) {
  return slots.filter((s) => tariffFitsSlot(t, s));
}

/** Группы абонемента с ID: gid, branchId, subjectId, courseId. Имя — подпись. */
export function tariffGroupHits(t: CrmTariff, slots = listAdminSlots()) {
  return groupsForTariff(t, slots).map((s) => ({
    id: s.id,
    gid: s.groupId,
    name: s.groupName,
    branch: s.branch,
    branchId: s.branchId,
    age: s.age,
    mins: slotMinutes(s),
    subjectId: s.subjectId,
    courseId: s.courseId || "",
  }));
}

export function subjectTariffStats() {
  const store = loadTariffs();
  const bySubject = new Map<number, { total: number; byBranch: Record<number, number>; names: string[] }>();
  function row(id: number) {
    let r = bySubject.get(id);
    if (!r) {
      r = { total: 0, byBranch: {}, names: [] };
      bySubject.set(id, r);
    }
    return r;
  }
  for (const t of store.items) {
    if (t.archive) continue;
    const subjects = [...new Set(t.subjectIds.map(Number).filter(Boolean))];
    for (const sid of subjects) {
      const r = row(sid);
      r.total += 1;
      r.names.push(t.name);
      for (const b of t.branchIds) r.byBranch[b] = (r.byBranch[b] || 0) + 1;
    }
  }
  return { bySubject, branches: store.branches.length ? store.branches : defaultBranches() };
}

function crmHost() {
  return (serverEnv("ALFACRM_HOST") || "https://studiyarazvivaysya.s20.online").replace(/\/$/, "");
}

function webPassword() {
  return (
    serverEnv("ALFACRM_WEB_PASSWORD") ||
    serverEnv("ALFACRM_PASSWORD") ||
    serverEnv("ALFACRM_CRM_PASSWORD") ||
    ""
  );
}

function setCookieList(res: Response) {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === "function") {
    const list = h.getSetCookie();
    if (list?.length) return list;
  }
  const raw = res.headers.get("set-cookie");
  return raw ? [raw] : [];
}

function mergeCookies(prev: string, set: string[]) {
  const map = new Map<string, string>();
  for (const p of prev.split("; ").filter(Boolean)) {
    const i = p.indexOf("=");
    if (i > 0) map.set(p.slice(0, i), p.slice(i + 1));
  }
  for (const raw of set) {
    const part = raw.split(";")[0];
    const i = part.indexOf("=");
    if (i > 0) map.set(part.slice(0, i), part.slice(i + 1));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function fetchTimed(url: string, init: RequestInit = {}, ms = 25000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("AlfaCRM не ответила за 25 секунд.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function crmLogin() {
  const host = crmHost();
  const email = serverEnv("ALFACRM_EMAIL") || "";
  const pass = webPassword();
  if (!email || !pass) return { cookie: "", error: "Нет пароля кабинета CRM (ALFACRM_WEB_PASSWORD)." };
  const urls = [`${host}/site/login`, `${host}/login`];
  for (const loginUrl of urls) {
    try {
      const page = await fetchTimed(loginUrl, { redirect: "manual" });
      let cookie = mergeCookies("", setCookieList(page));
      const html = await page.text();
      const csrf =
        tagAttr(html.match(/<input\b[^>]*\bname="_csrf"[^>]*>/i)?.[0] || "", "value") ||
        (html.match(/meta name="csrf-token" content="([^"]+)"/i) || [])[1] ||
        "";
      const body = new URLSearchParams({
        ...(csrf ? { _csrf: csrf } : {}),
        "LoginForm[username]": email,
        "LoginForm[password]": pass,
        "LoginForm[rememberMe]": "1",
      });
      const res = await fetchTimed(loginUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookie,
          Origin: host,
          Referer: loginUrl,
        },
        body,
        redirect: "manual",
      });
      cookie = mergeCookies(cookie, setCookieList(res));
      const loc = res.headers.get("location") || "";
      if (res.status === 302 && loc && !/login/i.test(loc)) {
        const next = loc.startsWith("http") ? loc : `${host}${loc}`;
        const follow = await fetchTimed(next, { headers: { Cookie: cookie }, redirect: "manual" });
        cookie = mergeCookies(cookie, setCookieList(follow));
        return { cookie, error: "" };
      }
    } catch {
      /* next url */
    }
  }
  return { cookie: "", error: "Вход в кабинет CRM не удался — галочки филиалов и предметов не запишутся." };
}

function tagAttr(tag: string, key: string) {
  const m = tag.match(new RegExp(`\\b${key}="([^"]*)"`, "i")) || tag.match(new RegExp(`\\b${key}='([^']*)'`, "i"));
  return m ? m[1] : "";
}

function inputTag(html: string, name: string) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<input\\b[^>]*\\bname="${esc}"[^>]*>`, "i");
  return html.match(re)?.[0] || "";
}

function inputValue(html: string, name: string) {
  return tagAttr(inputTag(html, name), "value");
}

function checkedIds(html: string, field: string) {
  const re = new RegExp(`<input\\b[^>]*\\bname="Tariff\\[${field}\\]\\[\\]"[^>]*>`, "gi");
  const ids: number[] = [];
  for (const m of html.matchAll(re)) {
    const tag = m[0];
    if (!/\bchecked\b/i.test(tag)) continue;
    const v = Number(tagAttr(tag, "value"));
    if (v) ids.push(v);
  }
  return [...new Set(ids)];
}

function selectSelected(html: string, name: string) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = html.match(new RegExp(`<select\\b[^>]*name="${esc}"[^>]*>([\\s\\S]*?)</select>`, "i"));
  if (!block) return { value: 0, label: "" };
  const opts = [...block[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)];
  const picked = opts.find((o) => /\bselected\b/i.test(o[1])) || opts[0];
  if (!picked) return { value: 0, label: "" };
  const value = Number(tagAttr(`<x ${picked[1]}>`, "value") || 0);
  const label = picked[2].replace(/<[^>]+>/g, "").trim();
  return { value, label };
}

export const TYPE_NAMES: Record<number, string> = { 1: "Поурочная", 2: "Помесячная", 3: "Недельная" };
export const CALC_NAMES: Record<number, string> = { 0: "Любой", 1: "Базовый счет", 2: "Отдельный счет" };
export const PERIOD_TYPES: Record<number, string> = { 1: "дней", 2: "недель", 3: "месяцев", 4: "лет" };

function toIsoDate(s: string) {
  const v = String(s || "").trim();
  const iso = v.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru = v.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
  if (ru) return `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}`;
  return "";
}

function toCrmDate(s: string) {
  const iso = toIsoDate(s);
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function dateSpanLabel(from: string, to: string) {
  const a = toCrmDate(from);
  const b = toCrmDate(to);
  if (a && b) return `с ${a} до ${b}`;
  if (b) return `до ${b}`;
  if (a) return `с ${a}`;
  return "";
}

function periodLabel(count: number, type: number) {
  if (!count) return "";
  const u: Record<number, [string, string, string]> = {
    1: ["день", "дня", "дней"],
    2: ["неделя", "недели", "недель"],
    3: ["месяц", "месяца", "месяцев"],
    4: ["год", "года", "лет"],
  };
  const words = u[type];
  if (!words) return String(count);
  const n = count % 100;
  const word = n % 10 === 1 && n !== 11 ? words[0] : n % 10 >= 2 && n % 10 <= 4 && (n < 10 || n > 20) ? words[1] : words[2];
  return `${count} ${word}`;
}

function effectivePeriod(t: Pick<CrmTariff, "periodCount" | "periodType">) {
  const count = Number(t.periodCount || 0);
  return { count, type: count ? Number(t.periodType || 1) : 0 };
}

function radioOrHidden(html: string, name: string) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<input\\b[^>]*\\bname="${esc}"[^>]*>`, "gi");
  let hidden = "";
  for (const m of html.matchAll(re)) {
    const tag = m[0];
    const type = (tagAttr(tag, "type") || "text").toLowerCase();
    if (type === "radio" && /\bchecked\b/i.test(tag)) return tagAttr(tag, "value");
    if (type === "hidden") hidden = tagAttr(tag, "value") || hidden;
  }
  return hidden || inputValue(html, name);
}

function parseTariffForm(html: string, id: number) {
  if (!/Tariff\[name\]/.test(html)) return null;
  if (id && !new RegExp(`tariff/update\\?id=${id}\\b`).test(html) && !/tariff\/create/.test(html)) return null;
  const type = Number(radioOrHidden(html, "Tariff[type]") || 1);
  const calc = selectSelected(html, "Tariff[calculation_type]");
  const lessonsCount = Number(inputValue(html, "Tariff[lessons_count]") || 0);
  const duration = Number(inputValue(html, "Tariff[duration]") || 0);
  const price = Number(String(inputValue(html, "Tariff[price]") || "0").replace(",", "."));
  const periodCount = Number(inputValue(html, "Tariff[period_count]") || 0);
  const periodType = Number(inputValue(html, "Tariff[period_type]") || 0);
  return {
    name: inputValue(html, "Tariff[name]").trim(),
    type,
    typeName: TYPE_NAMES[type] || "Поурочная",
    lessonsCount,
    duration,
    price,
    pricePerLesson: lessonsCount ? Math.round((price / lessonsCount) * 100) / 100 : 0,
    calculationType: calc.value,
    calculationName: calc.label || CALC_NAMES[calc.value] || "Любой",
    periodCount,
    periodType,
    periodLabel: periodLabel(periodCount, periodType),
    bDate: toIsoDate(inputValue(html, "Tariff[b_date]")),
    eDate: toIsoDate(inputValue(html, "Tariff[e_date]")),
    subjectIds: checkedIds(html, "subject_ids"),
    lessonTypeIds: checkedIds(html, "lesson_type_ids"),
    branchIds: checkedIds(html, "branch_ids"),
    ok: true as const,
  };
}

async function fetchTariffCard(id: number, cookie: string) {
  const { pace } = await import("./alfacrm");
  await pace();
  const host = crmHost();
  const empty = {
    name: "",
    type: 1,
    typeName: "Поурочная",
    lessonsCount: 0,
    duration: 0,
    price: 0,
    pricePerLesson: 0,
    calculationType: 0,
    calculationName: "",
    periodCount: 0,
    periodType: 0,
    periodLabel: "",
    bDate: "",
    eDate: "",
    subjectIds: [] as number[],
    lessonTypeIds: [] as number[],
    branchIds: [] as number[],
    ok: false as const,
  };
  for (const company of [2, 1, 3, 4]) {
    const res = await fetchTimed(`${host}/company/${company}/tariff/update?id=${id}`, {
      headers: { Cookie: cookie, Accept: "text/html" },
      redirect: "manual",
    });
    const html = await res.text();
    if (res.status !== 200 || /LoginForm/i.test(html)) continue;
    const parsed = parseTariffForm(html, id);
    if (parsed) return parsed;
  }
  return empty;
}

async function mapPool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, () => worker()));
  return out;
}

type CrmTariffRow = {
  id?: number;
  name?: string;
  price?: string | number;
  lessons_count?: number;
  duration?: number;
  type?: number;
  is_archive?: number;
  branch_ids?: number[];
  b_date?: string;
  e_date?: string;
  added?: string;
};

export async function pullTariffsFromCrm(opts?: { reuseCards?: boolean; skipSubjects?: boolean }) {
  const { token, request } = await import("./alfacrm");
  const t = await token();
  if (!opts?.skipSubjects && loadSubjects().length < 20) {
    await pullSubjectsFromCrm().catch(() => loadSubjects());
  }

  const byId = new Map<number, CrmTariffRow>();
  const seenIn = new Map<number, number[]>();
  for (const branch of [1, 2, 3, 4]) {
    for (let page = 0; page < 20; page++) {
      const json = await request<{ items?: CrmTariffRow[] }>(
        `/v2api/${branch}/tariff/index`,
        { page, pageSize: 100 },
        t,
      );
      const chunk = json.items || [];
      if (!chunk.length) break;
      for (const row of chunk) {
        const id = Number(row.id);
        if (!id || Number(row.is_archive)) continue;
        const prev = byId.get(id);
        byId.set(id, { ...prev, ...row, id, is_archive: 0, branch_ids: row.branch_ids?.length ? row.branch_ids : prev?.branch_ids });
        const seen = seenIn.get(id) || [];
        if (!seen.includes(branch)) seen.push(branch);
        seenIn.set(id, seen);
      }
      if (chunk.length < 100) break;
    }
  }

  let branches = defaultBranches();
  try {
    const br = await request<{ items?: { id?: number; name?: string }[] }>("/v2api/branch/index", { page: 0, pageSize: 20 }, t);
    const got = (br.items || [])
      .map((x) => {
        const id = Number(x.id);
        const name = String(x.name || "").trim();
        if (!id || !name) return null;
        return { id, name, short: BRANCH_SHORT[id] || name.split("(")[0].replace(/["«»]/g, "").trim() };
      })
      .filter((x): x is CrmBranch => Boolean(x));
    if (got.length) {
      const ordered = BRANCH_ORDER.map((id) => got.find((b) => b.id === id)).filter((x): x is CrmBranch => Boolean(x));
      for (const b of got) if (!ordered.some((x) => x.id === b.id)) ordered.push(b);
      branches = ordered;
    }
  } catch {
    /* seed */
  }

  let lessonTypes: CrmLessonType[] = LESSON_TYPES.map((x) => ({ id: x.id, name: x.name }));
  try {
    const lt = await request<{ items?: { id?: number; name?: string }[] }>("/v2api/2/lesson-type/index", { page: 0, pageSize: 50 }, t);
    const got = (lt.items || [])
      .map((x) => ({ id: Number(x.id), name: String(x.name || "").trim() }))
      .filter((x) => x.id && x.name);
    if (got.length) lessonTypes = got;
  } catch {
    /* seed */
  }

  const login = await crmLogin();
  const rows = [...byId.values()].filter((row) => !Number(row.is_archive)).sort((a, b) => Number(a.id) - Number(b.id));
  const prev = loadTariffs().items.filter((x) => x.id > 0 && !x.archive);
  const prevById = new Map(prev.map((x) => [x.id, x]));
  const reuse = opts?.reuseCards !== false;
  const need = rows.filter((row) => {
    if (!reuse) return true;
    const old = prevById.get(Number(row.id));
    return !old?.cardOk || !old.subjectIds?.length;
  });
  const scraped = new Map<number, Awaited<ReturnType<typeof fetchTariffCard>>>();
  if (login.cookie && need.length) {
    const fresh = await mapPool(need, 1, (row) => fetchTariffCard(Number(row.id), login.cookie));
    need.forEach((row, i) => scraped.set(Number(row.id), fresh[i]));
  }

  const items: CrmTariff[] = rows.map((row) => {
    const card = scraped.get(Number(row.id));
    const old = prevById.get(Number(row.id));
    const fromCard = card?.ok ? card.branchIds : old?.branchIds || [];
    const fromApi = (row.branch_ids || []).map(Number).filter(Boolean);
    const fromIndex = seenIn.get(Number(row.id)) || [];
    const branchIds = [...new Set(fromCard.length ? fromCard : fromApi.length ? fromApi : fromIndex)];
    const name = (card?.ok && card.name) || String(row.name || old?.name || "").trim();
    const price = card?.ok && card.price ? card.price : Number(row.price || old?.price || 0);
    const lessonsCount = card?.ok && card.lessonsCount ? card.lessonsCount : Number(row.lessons_count || old?.lessonsCount || 0);
    const duration = card?.ok && card.duration ? card.duration : Number(row.duration || old?.duration || 0);
    const type = card?.ok && card.type ? card.type : Number(row.type || old?.type || 1);
    const subjectIds = card?.ok ? card.subjectIds : old?.subjectIds || [];
    const lessonTypeIds = card?.ok ? card.lessonTypeIds : old?.lessonTypeIds || [];
    return {
      id: Number(row.id),
      name,
      price,
      lessonsCount,
      duration,
      type,
      typeName: (card?.ok && card.typeName) || TYPE_NAMES[type] || old?.typeName || "Поурочный",
      archive: false,
      branchIds,
      subjectIds,
      lessonTypeIds,
      calculationType: card?.ok ? card.calculationType : old?.calculationType || 0,
      calculationName: (card?.ok && card.calculationName) || old?.calculationName || "",
      periodCount: card?.ok ? card.periodCount : old?.periodCount || 0,
      periodType: card?.ok ? card.periodType : old?.periodType || 0,
      periodLabel: (card?.ok && card.periodLabel) || old?.periodLabel || "",
      pricePerLesson: lessonsCount ? Math.round((price / lessonsCount) * 100) / 100 : 0,
      eDate: toIsoDate((card?.ok && card.eDate) || String(row.e_date || old?.eDate || "")),
      bDate: toIsoDate((card?.ok && card.bDate) || String(row.b_date || old?.bDate || "")),
      added: String(row.added || old?.added || ""),
      cardOk: Boolean(card?.ok || old?.cardOk),
    };
  });

  const store = saveTariffs({ at: new Date().toISOString(), items, lessonTypes, branches });
  const noSubjects = items.filter((x) => !x.archive && !x.subjectIds.length).length;
  const noCard = items.filter((x) => !x.cardOk).length;
  const byBranch = Object.fromEntries(
    BRANCH_ORDER.map((id) => [id, items.filter((x) => !x.archive && x.branchIds.includes(id)).length]),
  );
  return {
    ...store,
    error: login.error,
    stats: {
      total: items.length,
      active: items.filter((x) => !x.archive).length,
      archive: items.filter((x) => x.archive).length,
      withSubjects: items.filter((x) => x.subjectIds.length).length,
      noSubjects,
      noCard,
      byBranch,
    },
  };
}

export function subjectsWithHref() {
  const map = loadScheduleMap();
  const byId = new Map(map.courses.map((c) => [c.subjectId, c]));
  return loadSubjects().map((s) => {
    const link = byId.get(s.id);
    return { id: s.id, name: s.name, href: link?.siteHref || link?.courseId || "", courseId: link?.courseId || "" };
  });
}

/** subjectId CRM, которые сидят на курсе сайта: карта Соответствий + группы с этим courseId. Имя не смотрим. */
export function courseSubjectIndex(): Record<string, number[]> {
  const map = loadScheduleMap();
  const tree = loadSiteTree();
  const out = new Map<string, Set<number>>();
  const add = (raw: string, sid: number) => {
    if (!raw || !sid) return;
    const id = tree.courses.find((c) => c.id === raw || c.href === raw)?.id || raw;
    let set = out.get(id);
    if (!set) {
      set = new Set();
      out.set(id, set);
    }
    set.add(sid);
  };
  for (const c of map.courses) add(c.courseId || c.siteHref, Number(c.subjectId) || 0);
  for (const s of listAdminSlots()) {
    const cid = String(s.courseId || tree.assign[slotTreeKey(s)] || "");
    add(cid, Number(s.subjectId) || 0);
  }
  for (const c of tree.courses) {
    if (out.get(c.id)?.size) continue;
    const twin = tree.courses.find(
      (x) =>
        x.id !== c.id &&
        x.schoolId === c.schoolId &&
        x.label === c.label &&
        (x.age || "") === (c.age || "") &&
        (out.get(x.id)?.size || out.get(x.href)?.size),
    );
    if (!twin) continue;
    for (const sid of out.get(twin.id) || out.get(twin.href) || []) add(c.id, sid);
  }
  return Object.fromEntries([...out.entries()].map(([k, v]) => [k, [...v]]));
}

export const LESSON_TYPE_ORDER = [2, 5, 10, 11, 3, 4, 1, 15, 13, 7, 6, 8, 12, 9, 14];

export function sortLessonTypes(list: CrmLessonType[]) {
  return [...list].sort((a, b) => {
    const ia = LESSON_TYPE_ORDER.indexOf(a.id);
    const ib = LESSON_TYPE_ORDER.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.name.localeCompare(b.name, "ru");
  });
}

export function normalizeTariff(t: CrmTariff): CrmTariff {
  const lessonsCount = Number(t.lessonsCount || 0);
  const price = Number(t.price || 0);
  const type = Number(t.type || 1);
  const calculationType = Number(t.calculationType || 0);
  const periodCount = Number(t.periodCount || 0);
  const periodType = Number(t.periodType || 0);
  return {
    ...t,
    price,
    lessonsCount,
    duration: Number(t.duration || 0),
    type,
    typeName: t.typeName || TYPE_NAMES[type] || "Поурочная",
    pricePerLesson: lessonsCount ? Math.round((price / lessonsCount) * 100) / 100 : 0,
    calculationType,
    calculationName: CALC_NAMES[calculationType] || t.calculationName || "Любой",
    periodCount,
    periodType,
    periodLabel: periodLabel(periodCount, periodType),
    bDate: toIsoDate(t.bDate || ""),
    eDate: toIsoDate(t.eDate || ""),
    branchIds: [...new Set((t.branchIds || []).map(Number).filter(Boolean))],
    subjectIds: [...new Set((t.subjectIds || []).map(Number).filter(Boolean))],
    lessonTypeIds: [...new Set((t.lessonTypeIds || []).map(Number).filter(Boolean))],
  };
}

export function saveTariffEdits(incoming: CrmTariff[], dropLocalIds: number[] = []) {
  const store = loadTariffs();
  const drop = new Set(dropLocalIds.map(Number).filter((n) => n));
  const names = new Set(incoming.filter((t) => Number(t.id) > 0).map((t) => t.name));
  const byId = new Map(
    store.items
      .filter((x) => !drop.has(x.id) && !(x.id < 0 && names.has(x.name)))
      .map((x) => [x.id, x]),
  );
  for (const raw of incoming) {
    const id = Number(raw.id);
    if (!id) continue;
    byId.set(id, normalizeTariff({ ...(byId.get(id) || raw), ...raw, id }));
  }
  const packed = saveTariffs({ ...store, at: new Date().toISOString(), items: [...byId.values()] });
  const to = Number(incoming.find((t) => Number(t.id) > 0)?.id) || 0;
  if (to && drop.size) {
    const map = readTariffMap();
    let changed = false;
    const next: TariffLink[] = [];
    const seen = new Set<number>();
    for (const x of map) {
      const id = drop.has(x.tariffId) ? to : x.tariffId;
      if (!id || seen.has(id)) {
        if (drop.has(x.tariffId)) changed = true;
        continue;
      }
      if (id !== x.tariffId) changed = true;
      seen.add(id);
      next.push({ ...x, tariffId: id });
    }
    if (changed) saveTariffMap(next);
  }
  return packed;
}

function formFields(html: string) {
  const body = new URLSearchParams();
  for (const m of html.matchAll(/<input\b([^>]*)>/gi)) {
    const tag = m[0];
    const name = tagAttr(tag, "name");
    if (!name) continue;
    const type = (tagAttr(tag, "type") || "text").toLowerCase();
    if (["submit", "button", "file", "image"].includes(type)) continue;
    if (type === "checkbox" || type === "radio") {
      if (/\bchecked\b/i.test(tag)) body.append(name, tagAttr(tag, "value") || "1");
      continue;
    }
    body.append(name, tagAttr(tag, "value"));
  }
  for (const m of html.matchAll(/<select\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi)) {
    const inner = m[2];
    const sel =
      inner.match(/<option\b[^>]*\bselected\b[^>]*value="([^"]*)"/i) ||
      inner.match(/<option\b[^>]*value="([^"]*)"[^>]*\bselected/i);
    body.set(m[1], sel ? sel[1] : "");
  }
  return body;
}

function applyTariffFields(body: URLSearchParams, t: CrmTariff) {
  body.set("Tariff[name]", t.name);
  body.set("Tariff[type]", "1");
  body.set("Tariff[lessons_count]", String(t.lessonsCount || 0));
  body.set("Tariff[duration]", String(t.duration || 0));
  body.set("Tariff[price]", Number(t.price || 0).toFixed(2));
  body.set("Tariff[calculation_type]", t.calculationType ? String(t.calculationType) : "");
  if (t.periodCount) {
    body.set("Tariff[period_count]", String(t.periodCount));
    body.set("Tariff[period_type]", String(t.periodType || 1));
  } else {
    const derived = effectivePeriod(t);
    if (derived.count) {
      body.set("Tariff[period_count]", String(derived.count));
      body.set("Tariff[period_type]", String(derived.type));
    } else {
      body.set("Tariff[period_count]", "");
      body.set("Tariff[period_type]", "");
    }
  }
  body.delete("Tariff[b_date]");
  const isoEnd = toIsoDate(t.eDate || "");
  const ruEnd = toCrmDate(t.eDate || "");
  if (isoEnd) body.set("Tariff[e_date]", isoEnd);
  else body.delete("Tariff[e_date]");
  const today = new Date().toISOString().slice(0, 10);
  if (ruEnd && isoEnd >= today) body.set("ActionForm[date_end]", ruEnd);
  else if (!body.get("ActionForm[date_end]")) body.delete("ActionForm[date_end]");
  body.set("ActionForm[is_affect_customers]", "");
  function setIds(field: string, ids: number[]) {
    for (const key of [...body.keys()]) {
      if (key === `Tariff[${field}]` || key === `Tariff[${field}][]`) body.delete(key);
    }
    if (ids.length) {
      for (const id of ids) body.append(`Tariff[${field}][]`, String(id));
    } else {
      body.set(`Tariff[${field}]`, "");
    }
  }
  setIds("branch_ids", t.branchIds);
  setIds("subject_ids", t.subjectIds);
  setIds("lesson_type_ids", t.lessonTypeIds);
  return body;
}

async function openTariffCreateForm(cookie: string, branchIds: number[]) {
  const host = crmHost();
  const order = [...new Set([...(branchIds || []), 2, 1, 3, 4])];
  for (const company of order) {
    const url = `${host}/company/${company}/tariff/create`;
    const res = await fetchTimed(url, { headers: { Cookie: cookie, Accept: "text/html" }, redirect: "manual" });
    const next = mergeCookies(cookie, setCookieList(res));
    const html = await res.text();
    if (res.status !== 200 || /LoginForm/i.test(html)) continue;
    if (!/Tariff\[name\]/.test(html)) continue;
    return { url, html, cookie: next, company };
  }
  return null;
}

function parseCreatedId(text: string, loc: string) {
  try {
    const j = JSON.parse(text) as { model?: { id?: number }; id?: number };
    const id = Number(j.model?.id || j.id || 0);
    if (id) return id;
  } catch {
    /* html */
  }
  const fromLoc = loc.match(/[?&]id=(\d+)/);
  if (fromLoc) return Number(fromLoc[1]);
  const fromText = text.match(/tariff\/(?:update|view).*?[?&]id=(\d+)/);
  return Number(fromText?.[1] || 0);
}

async function postCrmForm(url: string, cookie: string, body: URLSearchParams) {
  return fetchTimed(url, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Origin: crmHost(),
      Referer: url,
    },
    body,
    redirect: "manual",
  }, 45000);
}

async function openTariffForm(id: number, cookie: string) {
  const host = crmHost();
  for (const company of [2, 1, 3, 4]) {
    const url = `${host}/company/${company}/tariff/update?id=${id}`;
    const res = await fetchTimed(url, { headers: { Cookie: cookie, Accept: "text/html" }, redirect: "manual" });
    const next = mergeCookies(cookie, setCookieList(res));
    const html = await res.text();
    if (res.status !== 200 || /LoginForm/i.test(html)) continue;
    if (!/Tariff\[name\]/.test(html)) continue;
    return { url, html, cookie: next, company };
  }
  return null;
}

export async function pushTariffToCrm(tariff: CrmTariff, cookieIn?: string) {
  let t = normalizeTariff(tariff);
  const derived = effectivePeriod(t);
  if (derived.count && !t.periodCount) {
    t = { ...t, periodCount: derived.count, periodType: derived.type, periodLabel: periodLabel(derived.count, derived.type) };
  }
  if (!t.id) return { ok: false as const, id: 0, error: "Нет номера абонемента." };
  let cookie = cookieIn || "";
  if (!cookie) {
    const login = await crmLogin();
    if (!login.cookie) return { ok: false as const, id: t.id, error: login.error || "Нет входа в кабинет CRM. Предметы и типы уроков без входа не записываются." };
    cookie = login.cookie;
  }
  const write = async () => {
    const page = await openTariffForm(t.id, cookie);
    if (!page) return { ok: false as const, error: `Карточка ${t.id} в CRM не открылась.`, cookie };
    cookie = page.cookie;
    const body = applyTariffFields(formFields(page.html), t);
    if (!body.get("_csrf")) return { ok: false as const, error: "В форме CRM нет CSRF.", cookie };
    const post = await postCrmForm(page.url, page.cookie, body);
    cookie = mergeCookies(page.cookie, setCookieList(post));
    const text = await post.text();
    if (post.status === 400 || /Не удалось проверить переданные данные/i.test(text)) {
      return { ok: false as const, error: "CRM отклонила форму (CSRF). Повторяю.", cookie, retry: true };
    }
    if (post.status === 302 && /login/i.test(post.headers.get("location") || "")) {
      return { ok: false as const, error: "CRM сбросила сессию.", cookie };
    }
    if (/toastr_success|Успешно сохранен/i.test(text)) return { ok: true as const, error: "", cookie };
    try {
      const j = JSON.parse(text) as { success?: boolean; form?: string; errors?: Record<string, string[] | string> };
      if (j.form && !j.success) {
        return { ok: false as const, error: "form-date", cookie, retryDate: true };
      }
      if (j.success === false) {
        const err = j.errors
          ? Object.entries(j.errors)
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join("; ") : v}`)
              .join(". ")
          : "CRM не сохранила карточку.";
        if (/e_date|конца действия|формат/i.test(err)) {
          return { ok: false as const, error: err, cookie, retryDate: true };
        }
        return { ok: false as const, error: err, cookie };
      }
    } catch {
      /* html */
    }
    if (post.status >= 400) return { ok: false as const, error: `CRM ${post.status}`, cookie };
    return { ok: false as const, error: "CRM не подтвердила сохранение.", cookie };
  };

  let last = await write();
  if (!last.ok && "retry" in last && last.retry) {
    const login = await crmLogin();
    if (login.cookie) cookie = login.cookie;
    last = await write();
  }
  cookie = last.cookie || cookie;
  if (!last.ok && "retryDate" in last && last.retryDate) {
    cookie = last.cookie || cookie;
  } else if (!last.ok) {
    return { ok: false as const, id: t.id, error: last.error, cookie };
  }

  const e = toIsoDate(t.eDate);
  try {
    const { token, request } = await import("./alfacrm");
    const tok = await token();
    const company = t.branchIds.includes(2) ? 2 : t.branchIds[0] || 2;
    const extra: Record<string, unknown> = {
      id: t.id,
      type: Number(t.type || 1),
      lessons_count: Number(t.lessonsCount || 0),
      duration: Number(t.duration || 0),
      price: Number(t.price || 0),
    };
    const period = effectivePeriod(t);
    if (period.count) {
      extra.period_count = period.count;
      extra.period_type = period.type;
    }
    if (e) extra.e_date = e;
    await request(`/v2api/${company}/tariff/update?id=${t.id}`, extra, tok);
  } catch {
    if (e) {
      try {
        const { token, request } = await import("./alfacrm");
        const tok = await token();
        const company = t.branchIds.includes(2) ? 2 : t.branchIds[0] || 2;
        await request(`/v2api/${company}/tariff/update?id=${t.id}`, { id: t.id, e_date: e }, tok);
      } catch {
        /* HTML уже записал карточку */
      }
    }
  }

  const page = await openTariffForm(t.id, cookie);
  const parsed = page ? parseTariffForm(page.html, t.id) : null;
  if (page) cookie = page.cookie;
  const missingSub = t.subjectIds.filter((id) => !parsed?.subjectIds?.includes(id));
  const missingType = t.lessonTypeIds.filter((id) => !parsed?.lessonTypeIds?.includes(id));
  const calcMiss = t.calculationType && Number(parsed?.calculationType || 0) !== Number(t.calculationType);
  if (missingSub.length || missingType.length || calcMiss) {
    last = await write();
    const again = await openTariffForm(t.id, last.cookie || cookie);
    const parsed2 = again ? parseTariffForm(again.html, t.id) : parsed;
    const stillSub = t.subjectIds.filter((id) => !parsed2?.subjectIds?.includes(id));
    const stillType = t.lessonTypeIds.filter((id) => !parsed2?.lessonTypeIds?.includes(id));
    const stillCalc = t.calculationType && Number(parsed2?.calculationType || 0) !== Number(t.calculationType);
    const bits = [
      stillSub.length ? "предметы" : "",
      stillType.length ? "типы уроков" : "",
      stillCalc ? "клиентский счёт" : "",
    ].filter(Boolean);
    if (bits.length) {
      return { ok: false as const, id: t.id, error: `В CRM не записались: ${bits.join(", ")}.`, cookie: last.cookie };
    }
  }
  saveTariffEdits([t]);
  return { ok: true as const, id: t.id, title: t.name, cookie };
}

export async function pushTariffsToCrm(list: CrmTariff[]) {
  const unique = [...new Map(list.map((t) => {
    const n = normalizeTariff(t);
    const key = n.id > 0 ? `id:${n.id}` : `name:${n.name.trim().toLowerCase()}`;
    return [key, n] as const;
  })).values()];
  if (!unique.length) return { ok: false as const, error: "Нет абонементов для выгрузки.", pushed: 0, failed: 0, results: [] as { id: number; ok: boolean; error?: string }[] };
  const login = await crmLogin();
  if (!login.cookie) return { ok: false as const, error: login.error || "Нет входа в кабинет CRM.", pushed: 0, failed: unique.length, results: [] };
  let cookie = login.cookie;
  const results: { id: number; ok: boolean; error?: string }[] = [];
  const created: CrmTariff[] = [];
  const remaps: { from: number; to: number }[] = [];
  const seenNames = new Set<string>();
  for (const t of unique) {
    const key = t.name.trim().toLowerCase();
    if (t.id <= 0 && key && seenNames.has(key)) {
      results.push({ id: 0, ok: true, error: undefined });
      continue;
    }
    if (key) seenNames.add(key);
    if (t.id <= 0) {
      const localId = t.id;
      const made = await createTariffInCrm(t);
      results.push({ id: made.id || 0, ok: made.ok, error: made.ok ? undefined : made.error });
      if (made.id) remaps.push({ from: localId, to: made.id });
      if (made.tariff) {
        created.push(made.tariff);
        saveTariffEdits([made.tariff], [localId]);
      }
    } else {
      const one = await pushTariffToCrm(t, cookie);
      if ("cookie" in one && one.cookie) cookie = one.cookie;
      results.push({ id: t.id, ok: one.ok, error: one.ok ? undefined : one.error });
    }
    await new Promise((r) => setTimeout(r, 220));
  }
  const failed = results.filter((r) => !r.ok);
  return {
    ok: failed.length === 0,
    error: failed.length ? `Не выгрузились: ${failed.map((r) => `${r.id}${r.error ? ` (${r.error})` : ""}`).join(", ")}` : "",
    pushed: results.filter((r) => r.ok).length,
    failed: failed.length,
    results,
    created,
    remaps,
  };
}

function blankTariff(partial: Partial<CrmTariff> = {}): CrmTariff {
  return normalizeTariff({
    id: 0,
    name: "Новый абонемент",
    price: 0,
    lessonsCount: 4,
    duration: 60,
    type: 1,
    typeName: "Поурочная",
    archive: false,
    branchIds: [2],
    subjectIds: [],
    lessonTypeIds: [2, 5, 10, 11],
    calculationType: 2,
    calculationName: "Отдельный счет",
    periodCount: 0,
    periodType: 0,
    periodLabel: "",
    pricePerLesson: 0,
    bDate: "",
    eDate: "",
    added: "",
    cardOk: false,
    ...partial,
  });
}

export function newLocalTariff(branchId?: number): CrmTariff {
  return blankTariff({ id: -Date.now(), branchIds: branchId && branchId !== 0 ? [branchId] : [2] });
}

export async function createTariffInCrm(tariff: CrmTariff) {
  const t = normalizeTariff(tariff);
  try {
    const { token, request } = await import("./alfacrm");
    const tok = await token();
    const company = t.branchIds.includes(2) ? 2 : t.branchIds[0] || 2;
    const existingId = await findActiveTariffIdByName(t.name, company, tok);
    let id = existingId;
    if (!id) {
      let json = await request<{ success?: boolean; errors?: Record<string, unknown>; model?: { id?: number } }>(
        `/v2api/${company}/tariff/create`,
        tariffApiBody(t),
        tok,
      );
      id = Number(json.model?.id || 0);
      if (!id && json.errors && /e_date|конца действия|формат/i.test(JSON.stringify(json.errors))) {
        const body = tariffApiBody(t);
        delete body.e_date;
        json = await request(`/v2api/${company}/tariff/create`, body, tok);
        id = Number(json.model?.id || 0);
      }
      if (!id) {
        const why = json.errors ? JSON.stringify(json.errors).slice(0, 180) : "CRM не вернула номер нового абонемента.";
        return { ok: false as const, id: 0, error: why };
      }
    }
    const full = { ...t, id };
    await new Promise((r) => setTimeout(r, 400));
    const pushed = await pushTariffToCrm(full);
    saveTariffEdits([full], [t.id].filter((n) => n < 0));
    if (!pushed.ok) {
      return {
        ok: false as const,
        id,
        tariff: full,
        error: `Создан №${id}, но предмет и типы уроков не записались: ${pushed.error}`,
      };
    }
    return { ok: true as const, id, tariff: full };
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Не удалось создать абонемент в CRM.";
    return { ok: false as const, id: 0, error: raw.replace(/^alfacrm\s+\d+\s+\S+\s+/, "").slice(0, 280) };
  }
}

async function findActiveTariffIdByName(name: string, company: number, tok: string) {
  const want = String(name || "").trim();
  if (!want) return 0;
  const { request } = await import("./alfacrm");
  for (let page = 0; page < 20; page++) {
    const json = await request<{ items?: { id?: number; name?: string; is_archive?: number | boolean }[]; total?: number }>(
      `/v2api/${company}/tariff/index`,
      { page, pageSize: 100, is_archive: 0 },
      tok,
    );
    const items = json.items || [];
    const hit = items.find((x) => String(x.name || "").trim() === want && !Number(x.is_archive));
    if (hit?.id) return Number(hit.id);
    if (items.length < 100) break;
  }
  return 0;
}

function tariffApiBody(t: CrmTariff) {
  const body: Record<string, unknown> = {
    name: t.name || "Новый абонемент",
    price: Number(t.price || 0),
    lessons_count: Number(t.lessonsCount || 0),
    duration: Number(t.duration || 0),
    type: Number(t.type || 1),
    calculation_type: Number(t.calculationType || 0),
    branch_ids: t.branchIds.length ? t.branchIds : [2],
    subject_ids: t.subjectIds || [],
    lesson_type_ids: t.lessonTypeIds || [],
  };
  const period = effectivePeriod(t);
  if (period.count) {
    body.period_count = period.count;
    body.period_type = period.type;
  }
  const e = toIsoDate(t.eDate);
  if (e) body.e_date = e;
  return body;
}

export async function archiveTariffsInCrm(ids: number[]) {
  const { token, request } = await import("./alfacrm");
  const tok = await token();
  const results: { id: number; ok: boolean; error?: string }[] = [];
  for (const id of ids.filter((n) => n > 0)) {
    try {
      await request(`/v2api/2/tariff/update?id=${id}`, { id, is_archive: 1 }, tok);
      results.push({ id, ok: true });
    } catch (e) {
      results.push({ id, ok: false, error: e instanceof Error ? e.message : "ошибка" });
    }
  }
  const store = loadTariffs();
  const drop = new Set(ids);
  saveTariffs({ ...store, at: new Date().toISOString(), items: store.items.filter((t) => !drop.has(t.id)) });
  return { ok: results.every((r) => r.ok), results, removed: ids.length };
}

export type TariffChange = { id: number; field: string; from: string; to: string };
export type TariffAdd = Partial<CrmTariff> & { name?: string };

function matchSubjectIds(text: string, subjects: { id: number; name: string }[]) {
  const fold = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/["«»]/g, "").replace(/\s+/g, " ").trim();
  const q = fold(text);
  if (!q) return [] as number[];
  const hits = subjects.filter((s) => fold(s.name).includes(q) || q.includes(fold(s.name).slice(0, 18)));
  return hits.map((s) => s.id);
}

function matchBranchIds(text: string, branches: CrmBranch[]) {
  const q = text.toLowerCase();
  const ids: number[] = [];
  for (const b of branches) {
    if (q.includes("цмит") && b.id === 2) ids.push(2);
    if (q.includes("граждан") && b.id === 1) ids.push(1);
    if (q.includes("луховиц") && b.id === 3) ids.push(3);
    if (q.includes("лет") && b.id === 4) ids.push(4);
    if (q.includes(b.short.toLowerCase())) ids.push(b.id);
  }
  return [...new Set(ids)];
}

export async function aiTariffsParse(items: CrmTariff[], prompt: string, selectedIds: number[]) {
  const store = loadTariffs();
  const subjects = (await import("./crm-subjects")).loadSubjects();
  const asked = prompt.trim();
  const pool = selectedIds.length ? items.filter((t) => selectedIds.includes(t.id)) : [];
  const changes: TariffChange[] = [];
  const dateInName = /\s*(?:с\s*)?\d{1,2}\.\d{1,2}\.\d{2,4}\s*до\s*\d{1,2}\.\d{1,2}\.\d{2,4}/gi;
  const stripDates = (name: string) => name.replace(dateInName, "").replace(/\s{2,}/g, " ").trim();
  if (pool.length && /убер|удал|выч|выреж|без /i.test(asked) && /назван|период|дат/i.test(asked)) {
    for (const t of pool) {
      const to = stripDates(t.name);
      if (to && to !== t.name) changes.push({ id: t.id, field: "name", from: t.name, to });
    }
    if (changes.length) {
      return { comment: `Убираю даты из названия у ${changes.length} абонементов.`, changes, adds: [] as TariffAdd[] };
    }
  }
  const price = asked.match(/цен[ауие]\s*(\d{3,6})/i);
  const lessons = asked.match(/(\d{1,3})\s*(?:зан|урок)/i);
  const mins = asked.match(/(\d{2,3})\s*мин/i);
  if (pool.length && (price || lessons || mins)) {
    for (const t of pool) {
      if (price && String(t.price) !== price[1]) changes.push({ id: t.id, field: "price", from: String(t.price), to: price[1] });
      if (lessons && String(t.lessonsCount) !== lessons[1]) changes.push({ id: t.id, field: "lessonsCount", from: String(t.lessonsCount), to: lessons[1] });
      if (mins && String(t.duration) !== mins[1]) changes.push({ id: t.id, field: "duration", from: String(t.duration), to: mins[1] });
    }
    if (changes.length) return { comment: `Правка ${changes.length} полей у ${pool.length} абонементов.`, changes, adds: [] as TariffAdd[] };
  }
  const { yandexJson } = await import("./agent-channels");
  const slim = (selectedIds.length ? items.filter((t) => selectedIds.includes(t.id)) : items.slice(0, 40)).map((t) => ({
    id: t.id,
    name: t.name,
    price: t.price,
    lessonsCount: t.lessonsCount,
    duration: t.duration,
    branchIds: t.branchIds,
    subjectIds: t.subjectIds,
  }));
  const llm = await yandexJson<{
    comment?: string;
    changes?: { id?: number; field?: string; to?: string | number }[];
    adds?: { name?: string; price?: number; lessonsCount?: number; duration?: number; branch?: string; subject?: string }[];
  }>(
    `Ты администратор абонементов студии «Развивайся».
Поля: name, price, lessonsCount, duration. Филиалы: ЦМИТ=2, Гражданская=1, Луховицы=3, Лето=4.
changes только с id из списка. adds — только если просят добавить/создать абонемент.
Ответ JSON.`,
    `Запрос: ${asked.slice(0, 1500)}
Выделены: ${JSON.stringify(slim).slice(0, 8000)}
Предметы: ${JSON.stringify(subjects.map((s) => s.name)).slice(0, 2500)}
JSON: {"comment":"","changes":[{"id":179,"field":"price","to":3200}],"adds":[]}`,
    2500,
  );
  const out: TariffChange[] = [];
  for (const c of llm?.changes || []) {
    const id = Number(c.id);
    const field = String(c.field || "");
    if (!id || !["name", "price", "lessonsCount", "duration"].includes(field)) continue;
    const hit = items.find((t) => t.id === id);
    if (!hit) continue;
    const from = String((hit as unknown as Record<string, unknown>)[field] ?? "");
    const to = String(c.to ?? "");
    if (from === to) continue;
    out.push({ id, field, from, to });
  }
  const adds: TariffAdd[] = [];
  for (const a of llm?.adds || []) {
    if (!a?.name && !a?.price) continue;
    const branchIds = matchBranchIds(`${a.branch || ""} ${asked}`, store.branches);
    const subjectIds = matchSubjectIds(String(a.subject || a.name || asked), subjects);
    adds.push(
      blankTariff({
        id: 0,
        name: a.name || "Новый абонемент",
        price: Number(a.price || 0),
        lessonsCount: Number(a.lessonsCount || 4),
        duration: Number(a.duration || 60),
        branchIds: branchIds.length ? branchIds : [2],
        subjectIds,
      }),
    );
  }
  return { comment: llm?.comment || (out.length || adds.length ? "Предпросмотр" : "Не понял, что менять. Напишите цену, минуты или «добавь абонемент»."), changes: out, adds };
}

export function applyTariffChanges(items: CrmTariff[], changes: TariffChange[], adds: TariffAdd[]) {
  const byId = new Map(items.map((t) => [t.id, { ...t }]));
  for (const c of changes) {
    const t = byId.get(c.id);
    if (!t) continue;
    if (c.field === "name") t.name = c.to;
    if (c.field === "price") t.price = Number(c.to) || 0;
    if (c.field === "lessonsCount") t.lessonsCount = Number(c.to) || 0;
    if (c.field === "duration") t.duration = Number(c.to) || 0;
    byId.set(c.id, normalizeTariff(t));
  }
  const created: CrmTariff[] = [];
  for (const a of adds) {
    const t = newLocalTariff(a.branchIds?.[0]);
    created.push(normalizeTariff({ ...t, ...a, id: t.id }));
  }
  return saveTariffEdits([...byId.values(), ...created]);
}

function pickN<T>(list: T[], n: number) {
  const copy = [...list];
  const out: T[] = [];
  while (copy.length && out.length < n) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

export async function probeCreateTariff() {
  const stamp = new Date().toLocaleString("ru-RU");
  const subjects = loadSubjects().filter((s) => s.id > 0 && !/индивидуальн|мероприятие|экскурсион/i.test(s.name));
  const pickedSubjects = pickN(subjects, 1);
  if (!pickedSubjects.length) {
    return { ok: false as const, error: "На сайте нет предметов — сначала загрузите предметы из CRM." };
  }
  const branchPool = loadTariffs().branches.filter((b) => b.id !== 4);
  const pickedBranches = pickN(branchPool.length ? branchPool : [
    { id: 2, name: "ЦМИТ", short: "ЦМИТ" },
    { id: 1, name: "Гражданская", short: "Гражданская" },
    { id: 3, name: "Луховицы", short: "Луховицы" },
  ], 3);
  const branchIds = pickedBranches.map((b) => b.id);
  const periodCount = 10;
  const periodType = 2;
  const lessonTypeIds = [2, 5, 10, 11];
  const subjectIds = pickedSubjects.map((s) => s.id);
  const subjectNames = pickedSubjects.map((s) => s.name);
  const name = `Проверка rastudio.org · ${subjectNames.join(", ")} · ${stamp}`;
  const draft = blankTariff({
    name,
    price: 111,
    lessonsCount: 4,
    duration: 60,
    type: 1,
    typeName: "Поурочная",
    branchIds,
    lessonTypeIds,
    subjectIds,
    calculationType: 2,
    calculationName: "Отдельный счет",
    periodCount,
    periodType,
    periodLabel: periodLabel(periodCount, periodType),
  });
  const made = await createTariffInCrm(draft);
  if (!made.ok || !made.id) return { ok: false as const, error: made.error || "Карточка в CRM не создалась." };
  const login = await crmLogin();
  const cookie = login.cookie || "";
  const page = cookie ? await openTariffForm(made.id, cookie) : null;
  const parsed = page ? parseTariffForm(page.html, made.id) : null;
  const checks = [
    { ok: Boolean(parsed), label: "карточка открылась в CRM" },
    { ok: (parsed?.name || "") === name, label: `название: ${parsed?.name || "—"}` },
    { ok: Number(parsed?.price || 0) === 111, label: `цена ${parsed?.price ?? "—"}` },
    { ok: Number(parsed?.lessonsCount || 0) === 4, label: `уроков ${parsed?.lessonsCount ?? "—"}` },
    { ok: Number(parsed?.duration || 0) === 60, label: `минут ${parsed?.duration ?? "—"}` },
    { ok: Number(parsed?.type || 0) === 1, label: `тарификация ${parsed?.typeName || "—"}` },
    { ok: Number(parsed?.calculationType || 0) === 2, label: `счёт ${parsed?.calculationName || "—"}` },
    { ok: Number(parsed?.periodCount || 0) === periodCount, label: `период ${parsed?.periodLabel || parsed?.periodCount || "не записан"}` },
    { ok: subjectIds.every((id) => parsed?.subjectIds?.includes(id)), label: `предметы ${subjectNames.join(", ")}` },
    { ok: branchIds.every((id) => parsed?.branchIds?.includes(id)), label: `филиалы ${pickedBranches.map((b) => b.short || b.name).join(", ")}` },
    { ok: lessonTypeIds.every((id) => parsed?.lessonTypeIds?.includes(id)), label: `типы уроков ${parsed?.lessonTypeIds?.length || 0} из ${lessonTypeIds.length}` },
  ];
  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0,
    id: made.id,
    name,
    price: 111,
    lessonsCount: 4,
    duration: 60,
    branch: pickedBranches.map((b) => b.short || b.name).join(", "),
    subjectId: subjectIds[0],
    subjectName: subjectNames.join(", "),
    periodCount,
    periodLabel: periodLabel(periodCount, periodType),
    verifiedName: parsed?.name || "",
    verifiedPrice: parsed?.price || 0,
    verifiedSubjects: parsed?.subjectIds || [],
    checks,
    url: `${crmHost()}/company/${branchIds.includes(2) ? 2 : branchIds[0] || 2}/tariff/update?id=${made.id}`,
    error: failed.length ? failed.map((c) => c.label).join("; ") : "",
  };
}

export async function probeDeleteTariff(id: number) {
  if (!id) return { ok: false as const, error: "Нет номера проверочной карточки." };
  const res = await archiveTariffsInCrm([id]);
  return { ok: res.ok, id, error: res.ok ? "" : res.results.find((r) => !r.ok)?.error || "Не удалось архивировать." };
}
