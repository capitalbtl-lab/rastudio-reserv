import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { serverEnv } from "./server-env";
import { subjectIdOfCourse } from "./ids";

export type CrmSubject = { id: number; name: string; local?: boolean };

export const SEED_SUBJECTS: CrmSubject[] = [
  { id: 116, name: "Художественная студия (4-5 лет)" },
  { id: 115, name: "Основы портрета (12+)" },
  { id: 114, name: "Билингвальная робототехника (7–9, 10-13 лет)" },
  { id: 111, name: "Английский язык \"Go Getter\" (9–14 лет)" },
  { id: 110, name: "Английский язык \"Super Minds\" (6–8 лет)" },
  { id: 112, name: "Корейский язык \"Vitamin Korean\" (9–16 лет)" },
  { id: 113, name: "Японский язык «Kodomo no Nihongo» (9–16 лет)" },
  { id: 108, name: "Развивающий курс \"Лего-Математика\" (3-6 лет)" },
  { id: 109, name: "Развивающий курс \"Планета S.T.E.A.M.\" (3-6 лет)" },
  { id: 27, name: "Развивающий курс \"Увлекательная наука\" (5-9 лет)" },
  { id: 25, name: "Беспилотная авиация (9-13 лет)" },
  { id: 107, name: "3D-анимация в Blender (15-15 лет)" },
  { id: 39, name: "Инженерное 3D моделирование в Компас (10-15 лет)" },
  { id: 4, name: "Модельная школа" },
  { id: 89, name: "Научный курс \"Физика инноваций\" (11+)" },
  { id: 97, name: "Основы цифрового рисунка (12-15 лет)" },
  { id: 5, name: "Подготовка в художественные ВУЗы (от 14 лет)" },
  { id: 16, name: "Подготовка к школе (5-6 лет)" },
  { id: 43, name: "IT-Лаборатория Start: \"Первые шаги в мир цифры и STEAM\"" },
  { id: 98, name: "IT-Лаборатория Create: \"Создатель игр и IT-проектов\"" },
  { id: 15, name: "IT-Лаборатория Dev: \"Юный разработчик в сфере IT\"" },
  { id: 46, name: "IT-Школа: \"Программирование на Python с CodeBOOK\"" },
  { id: 52, name: "IT-Школа: \"GameDev 4в1 - разработка игр на Unity\"" },
  { id: 48, name: "IT-Школа: \"Программирование на С++\"" },
  { id: 36, name: "Робототехника (5-6 лет)" },
  { id: 37, name: "Робототехника (7-9 лет)" },
  { id: 67, name: "Радиотехника (9+)" },
  { id: 35, name: "Робототехника (9-11, 11-14 лет)" },
  { id: 11, name: "Скульптурная студия (5-7, 8-14 лет)" },
  { id: 92, name: "Художественная школа (10-14 лет)" },
  { id: 14, name: "Художественная студия (7-9 лет)" },
  { id: 13, name: "Художественная студия (5-6 лет)" },
  { id: 12, name: "Художественная студия (3-4 лет)" },
  { id: 7, name: "Экскурсионная поездка" },
  { id: 54, name: "Индивидуальный урок" },
  { id: 104, name: "Групповое мероприятие" },
  { id: 85, name: "Фиджитал-программа «Игры будущего» (7-13 лет)" },
  { id: 81, name: "Творческая программа «ДаВинчи» (9-12 лет)" },
  { id: 1, name: "Радиотехническая программа «Мьюзик Бокс» (9-14 лет)" },
  { id: 77, name: "Научная программа \"Покорители планет\" (7-12 лет)" },
  { id: 106, name: "Радиотехническая программа «Кладоискатели» (9-14 лет)" },
  { id: 82, name: "Робототехническая программа «Робополис» (7-12 лет)" },
  { id: 105, name: "Робототехническая программа «Робофабрика» (10-15 лет)" },
  { id: 83, name: "Радиотехническая программа «Сделай радио» (9-15 лет)" },
  { id: 90, name: "Творческая программа \"Вдохновляйся!\" (7-12 лет)" },
  { id: 84, name: "Радиотехническая программа «Машина времени» (9-15 лет)" },
  { id: 88, name: "Стартап-Программа \"Мастера Будущего\" (10-15 лет)" },
  { id: 87, name: "Бьюти-программа \"Beauty & Art\" (9-15 лет)" },
];

function filePath() {
  return join(process.cwd(), "storage", "crm-subjects.json");
}

export function foldSubject(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/["«»„“]/g, "")
    .replace(/[·•–—]/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function loadSubjects(): CrmSubject[] {
  try {
    if (existsSync(filePath())) {
      const raw = JSON.parse(readFileSync(filePath(), "utf8")) as { items?: CrmSubject[] };
      if (Array.isArray(raw.items) && raw.items.length) return raw.items;
    }
  } catch {
    /* */
  }
  return SEED_SUBJECTS.map((s) => ({ ...s }));
}

export function saveSubjects(items: CrmSubject[]) {
  mkdirSync(dirname(filePath()), { recursive: true });
  const uniq = new Map<number, CrmSubject>();
  let nextLocal = 9000;
  for (const s of items) {
    const id = Number(s.id) || nextLocal++;
    uniq.set(id, { id, name: String(s.name || "").trim(), ...(id >= 9000 || s.local ? { local: true } : {}) });
  }
  const list = [...uniq.values()].filter((s) => s.name).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  writeFileSync(filePath(), JSON.stringify({ at: new Date().toISOString(), items: list }, null, 2));
  return list;
}

export function matchSubject(name: string, list = loadSubjects()): CrmSubject | undefined {
  return bestSubject(name, list);
}

function ageRanges(s: string) {
  const out: { lo: number; hi: number }[] = [];
  for (const m of s.matchAll(/(\d{1,2})\s*[-–—]\s*(\d{1,2})/g)) {
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    if (lo && hi && lo <= hi && hi < 20) out.push({ lo, hi });
  }
  for (const m of s.matchAll(/(\d{1,2})\s*\+/g)) {
    const lo = Number(m[1]);
    if (lo && lo < 20) out.push({ lo, hi: lo + 6 });
  }
  return out;
}

function ageHit(a: string, b: string) {
  const x = ageRanges(a);
  const y = ageRanges(b);
  if (!x.length || !y.length) return { both: false, n: 0 };
  let n = 0;
  for (const p of x) {
    for (const q of y) {
      const lo = Math.max(p.lo, q.lo);
      const hi = Math.min(p.hi, q.hi);
      if (lo <= hi) n += hi - lo + 1;
    }
  }
  return { both: true, n };
}

const STOP = new Set(["для", "лет", "год", "года", "детей", "курс", "школа", "the", "and", "на"]);

function wordsOf(s: string) {
  return foldSubject(s)
    .split(/[^a-zа-я0-9+]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

export function scoreSubject(hay: string, sub: CrmSubject) {
  const n = foldSubject(hay);
  const m = foldSubject(sub.name);
  if (!n || !m) return 0;
  const n2 = n.replace(/^\d{4}\s+/, "");
  let score = 0;
  if (n === m || n2 === m) score = 1000;
  else if (n.includes(m) || n2.includes(m)) score = 620 + Math.min(80, m.length);
  else if (m.includes(n2) && n2.length > 12) score = 520 + Math.min(40, n2.length);
  else {
    const nw = new Set(wordsOf(n2));
    const mw = wordsOf(m);
    if (!mw.length) return 0;
    const hit = mw.filter((w) => nw.has(w)).length;
    score = hit * 28;
  }
  const ages = ageHit(n, m);
  if (ages.both && !ages.n) score = Math.min(score, 18);
  else if (ages.both && ages.n && score >= 40) score += Math.min(120, ages.n * 12);
  return score;
}

export function bestSubject(name: string, list = loadSubjects()): CrmSubject | undefined {
  let best: CrmSubject | undefined;
  let score = 0;
  for (const s of list) {
    const sc = scoreSubject(name, s);
    if (sc > score) {
      score = sc;
      best = s;
    }
  }
  return score >= 40 ? best : undefined;
}

function stemLabel(s: string) {
  return foldSubject(s)
    .replace(/^20\d{2}\s+/, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\d+\s*[-–—]?\s*\d*\s*(лет|года|год)?/g, " ")
    .replace(/[·•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GENERIC = new Set([
  "курс",
  "для",
  "лет",
  "год",
  "года",
  "детей",
  "школа",
  "студия",
  "язык",
  "языка",
  "английского",
  "английский",
  "группа",
  "занятие",
  "программа",
  "основы",
  "подготовка",
  "творческая",
  "научный",
  "развивающий",
  "носителем",
  "носитель",
  "мире",
  "цифры",
]);

function tokensOf(s: string) {
  return foldSubject(s)
    .replace(/^20\d{2}\s+/, "")
    .split(/[^a-zа-я0-9+]+/)
    .filter((w) => w.length > 2 && !GENERIC.has(w));
}

function quotedOf(s: string) {
  const out: string[] = [];
  for (const m of String(s || "").matchAll(/["«„“]([^"»”]{2,40})["»”]/g)) out.push(foldSubject(m[1]));
  return out;
}

/** Предмет группы: slot.subjectId, затем карта courseId → subjectId. Имя не ищем. */
export function pickSubjectForSlot(
  slot: { subjectId?: number; courseId?: string },
  list: CrmSubject[],
  mapCourses?: { subjectId: number; courseId?: string; siteHref?: string }[],
) {
  if (Number(slot.subjectId)) {
    const hit = list.find((s) => s.id === Number(slot.subjectId) && !s.local);
    if (hit) return hit;
  }
  if (slot.courseId) {
    const sid = subjectIdOfCourse(slot.courseId, mapCourses);
    if (sid) {
      const hit = list.find((s) => s.id === sid && !s.local);
      if (hit) return hit;
    }
  }
  return undefined;
}

function crmId(res: unknown) {
  const r = res as { model?: { id?: number }; id?: number };
  return Number(r?.model?.id || r?.id || 0);
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

function csrfOf(html: string) {
  return (
    (html.match(/meta name="csrf-token" content="([^"]+)"/i) || [])[1] ||
    (html.match(/name="_csrf"[^>]*value="([^"]+)"/i) || [])[1] ||
    (html.match(/value="([^"]+)"[^>]*name="_csrf"/i) || [])[1] ||
    ""
  );
}

function subjectTitle(name: string) {
  return String(name || "")
    .replace(/^20\d{2}\s+/, "")
    .replace(/[·•]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*(лет|года)?$/i, " ($1-$2 лет)")
    .slice(0, 120);
}

export function nextLocalSubjectId(list = loadSubjects()) {
  let n = 9000;
  for (const s of list) {
    const id = Number(s.id) || 0;
    if (id >= n) n = id + 1;
  }
  return n;
}

/** Предмет на диск сразу. Alfa — очередь subject.create. Не ищем CRM по похожему имени. */
export function createLocalSubject(name: string) {
  const cleaned = subjectTitle(name);
  if (!cleaned) throw new Error("Нет названия предмета.");
  const list = loadSubjects();
  const localHit = list.find((s) => (s.local || s.id >= 9000) && foldSubject(s.name) === foldSubject(cleaned));
  if (localHit) return localHit;
  const next = { id: nextLocalSubjectId(list), name: cleaned, local: true as const };
  saveSubjects([...list, next]);
  return loadSubjects().find((s) => s.id === next.id) || next;
}

export async function applyCreatedSubject(localId: number, crmId: number, name?: string) {
  const from = Number(localId) || 0;
  const to = Number(crmId) || 0;
  if (!from || !to || from === to) return loadSubjects();
  const mapped = loadSubjects().map((s) =>
    s.id === from ? { id: to, name: String(name || s.name).trim() } : s.id === to ? { id: to, name: String(name || s.name).trim() } : s,
  );
  const uniq = new Map<number, CrmSubject>();
  for (const s of mapped) uniq.set(s.id, { id: s.id, name: s.name });
  saveSubjects([...uniq.values()]);
  try {
    const { loadScheduleMap, saveScheduleMap } = await import("./schedule-map");
    const map = loadScheduleMap();
    saveScheduleMap({
      ...map,
      courses: map.courses.map((c) => (c.subjectId === from ? { ...c, subjectId: to } : c)),
    });
  } catch {
    /* карта */
  }
  try {
    const { listAdminSlots, saveAdminSlots } = await import("./alfacrm-schedule");
    saveAdminSlots(listAdminSlots().map((s) => (s.subjectId === from ? { ...s, subjectId: to } : s)));
  } catch {
    /* слоты */
  }
  return loadSubjects();
}

async function listLive(branch: number) {
  const { token, request } = await import("./alfacrm");
  const t = await token();
  const listed = await request<{ items?: { id?: number; name?: string }[] }>(`/v2api/${Number(branch) || 1}/subject/index`, { page: 0, pageSize: 100 }, t);
  return (listed.items || [])
    .map((s) => ({ id: Number(s.id) || 0, name: String(s.name || "").trim() }))
    .filter((s) => s.id && s.name);
}

function pickCreated(_name: string, before: Set<number>, after: { id: number; name: string }[]) {
  const born = after.filter((s) => !before.has(s.id)).sort((a, b) => b.id - a.id);
  return born[0];
}

async function crmWebLogin() {
  const host = crmHost();
  const email = serverEnv("ALFACRM_EMAIL") || "";
  const pass = webPassword();
  if (!email || !pass) return { cookie: "", error: "Нет пароля кабинета CRM." };
  const loginUrl = `${host}/site/login`;
  const page = await fetch(loginUrl, { redirect: "manual" });
  let cookie = mergeCookies("", setCookieList(page));
  const html = await page.text();
  const csrf = csrfOf(html);
  const res = await fetch(loginUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
      Origin: host,
      Referer: loginUrl,
    },
    body: new URLSearchParams({
      ...(csrf ? { _csrf: csrf } : {}),
      "LoginForm[username]": email,
      "LoginForm[password]": pass,
      "LoginForm[rememberMe]": "1",
    }),
    redirect: "manual",
  });
  cookie = mergeCookies(cookie, setCookieList(res));
  const loc = res.headers.get("location") || "";
  if (res.status === 302 && loc && !/login/i.test(loc)) {
    const next = loc.startsWith("http") ? loc : `${host}${loc}`;
    const follow = await fetch(next, { headers: { Cookie: cookie }, redirect: "manual" });
    cookie = mergeCookies(cookie, setCookieList(follow));
    return { cookie, error: "" };
  }
  return { cookie: "", error: "Вход в кабинет CRM не удался." };
}

/** Включает предмет тумблером «Сделать активным». v2api weight этого не делает. */
export async function activateCrmSubject(id: number, branches = [1, 2, 3, 4], cookieIn = "") {
  const host = crmHost();
  let cookie = cookieIn;
  if (!cookie) {
    const login = await crmWebLogin();
    if (!login.cookie) throw new Error(login.error || "Нет входа в кабинет CRM, предмет не включён.");
    cookie = login.cookie;
  }
  const ok: number[] = [];
  const uniq = [...new Set(branches.map(Number).filter((n) => n > 0))];
  for (const br of uniq) {
    const indexUrl = `${host}/settings/${br}/subject/index`;
    const page = await fetch(indexUrl, {
      headers: { Cookie: cookie, Accept: "text/html", "X-Requested-With": "XMLHttpRequest" },
      redirect: "manual",
    });
    cookie = mergeCookies(cookie, setCookieList(page));
    const html = await page.text();
    const csrf = csrfOf(html);
    if (new RegExp(`subject/state\\?id=${id}[^"']*state=0`).test(html)) {
      ok.push(br);
      continue;
    }
    const url = `${host}/settings/${br}/subject/state?id=${id}&state=1`;
    const res = await fetch(url, {
      headers: {
        Cookie: cookie,
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRF-Token": csrf,
        Referer: indexUrl,
      },
      redirect: "manual",
    });
    cookie = mergeCookies(cookie, setCookieList(res));
    const text = await res.text();
    if (res.ok || /reload_pjax|state=0|toggle-on/i.test(text)) ok.push(br);
  }
  if (!ok.length) throw new Error("AlfaCRM не включила предмет. Откройте Настройки → Предметы и нажмите тумблер.");
  return ok;
}

async function createSubjectHtml(name: string, branch: number) {
  const host = crmHost();
  const login = await crmWebLogin();
  if (!login.cookie) throw new Error(login.error || "Нет входа в кабинет CRM.");
  let cookie = login.cookie;
  const title = subjectTitle(name);
  const br = Number(branch) || 1;
  const before = new Set((await listLive(br)).map((s) => s.id));
  const createUrl = `${host}/settings/${br}/subject/create`;
  const formRes = await fetch(createUrl, {
    headers: {
      Cookie: cookie,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${host}/settings/${br}/subject/index`,
    },
    redirect: "manual",
  });
  cookie = mergeCookies(cookie, setCookieList(formRes));
  const raw = await formRes.text();
  let content = raw;
  try {
    const j = JSON.parse(raw) as { modal_open?: { content?: string } };
    if (j.modal_open?.content) content = j.modal_open.content;
  } catch {
    /* html */
  }
  if (/LoginForm/i.test(content) && !/Subject\[name\]/.test(content)) {
    throw new Error("Сессия CRM сбросилась. Войдите в AlfaCRM и повторите.");
  }
  const csrf = csrfOf(content);
  if (!csrf) throw new Error("Форма предмета не открылась.");
  const post = await fetch(createUrl, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      "X-CSRF-Token": csrf,
      Origin: host,
      Referer: createUrl,
    },
    body: new URLSearchParams({
      _csrf: csrf,
      "Subject[is_reload]": "0",
      "Subject[name]": title,
      "Subject[description]": "",
      "Subject[color]": "#00FF00",
      "Subject[custom_webpage]": "",
    }),
    redirect: "manual",
  });
  cookie = mergeCookies(cookie, setCookieList(post));
  const text = await post.text();
  const loc = post.headers.get("location") || "";
  if (post.status === 302 && /login/i.test(loc)) throw new Error("CRM сбросила сессию при сохранении предмета.");
  if (post.status === 400 || /Не удалось проверить переданные данные/i.test(text)) {
    throw new Error("CRM отклонила форму (CSRF). Повторите.");
  }
  const saved = /reload_pjax|modal_close|"success"\s*:\s*true/i.test(text);
  if (!saved) {
    throw new Error(`CRM не приняла предмет (${post.status}): ${text.replace(/\s+/g, " ").slice(0, 180)}`);
  }
  await new Promise((r) => setTimeout(r, 600));
  const after = await listLive(br);
  const hit = pickCreated(title, before, after);
  if (!hit) {
    throw new Error(`CRM закрыла форму, но предмета «${title}» в списке нет. Обновите предметы из CRM.`);
  }
  await activateCrmSubject(hit.id, [br, 1, 2, 3, 4], cookie).catch(() => undefined);
  return { id: hit.id, name: hit.name, cookie };
}

export async function ensureCrmSubject(name: string, hintId = 0, branch = 2, mode: "auto" | "create" = "auto") {
  const list = loadSubjects();
  const cleaned = subjectTitle(name);
  if (!cleaned) throw new Error("Нет названия предмета, чтобы создать его в AlfaCRM.");
  const br = Number(branch) || 1;
  const live = await listLive(br);
  if (live.length) saveSubjects([...list.filter((s) => !live.some((x) => x.id === s.id)), ...live]);
  const hint = Number(hintId) || 0;
  const liveHit = hint ? live.find((s) => s.id === hint) : undefined;
  if (liveHit) {
    void activateCrmSubject(liveHit.id, [br, 1, 2, 3, 4]).catch(() => undefined);
    return liveHit;
  }
  if (mode === "auto") {
    throw new Error(hint ? `В филиале нет предмета id ${hint}.` : `Нет subjectId. Выберите предмет курса, не создавайте по имени.`);
  }
  const made = await createSubjectHtml(cleaned, br);
  const next = { id: made.id, name: made.name };
  saveSubjects([...loadSubjects().filter((s) => s.id !== next.id), next]);
  return next;
}

async function bumpSubjectWeight(id: number, branch: number) {
  const { token, request } = await import("./alfacrm");
  const t = await token();
  const list = loadSubjects();
  const hit = list.find((s) => s.id === id);
  if (!hit) return;
  await request(`/v2api/${Number(branch) || 2}/subject/update?id=${id}`, { id, name: hit.name, weight: 1 }, t);
}

export async function pullSubjectsFromCrm() {
  const { token, request } = await import("./alfacrm");
  const t = await token();
  const byId = new Map<number, CrmSubject>();
  for (let page = 0; page < 20; page++) {
    const res = await request<{ items?: { id?: number; name?: string }[]; total?: number }>(
      "/v2api/2/subject/index",
      { page, pageSize: 100 },
      t,
    );
    const batch = res.items || [];
    for (const s of batch) {
      const id = Number(s.id);
      const name = String(s.name || "").trim();
      if (!id || !name) continue;
      byId.set(id, { id, name });
    }
    if (batch.length < 100) break;
  }
  return saveSubjects([...byId.values()]);
}

export async function pushSubjectsToCrm(items: CrmSubject[]) {
  const { token, request } = await import("./alfacrm");
  const t = await token();
  const next: CrmSubject[] = [];
  const results: { name: string; id: number; ok: boolean; error?: string }[] = [];
  for (const s of items) {
    try {
      if (s.id && s.id < 9000 && !s.local) {
        await request("/v2api/2/subject/update", { id: s.id, name: s.name }, t);
        next.push({ id: s.id, name: s.name });
        results.push({ name: s.name, id: s.id, ok: true });
      } else {
        const created = await request("/v2api/2/subject/create", { name: s.name, weight: 1 }, t);
        const id = crmId(created) || s.id;
        if (!id) throw new Error("CRM не вернула id предмета");
        await activateCrmSubject(id).catch(() => undefined);
        next.push({ id, name: s.name });
        results.push({ name: s.name, id, ok: true });
      }
    } catch (e) {
      next.push(s);
      results.push({ name: s.name, id: s.id, ok: false, error: e instanceof Error ? e.message.slice(0, 160) : "ошибка" });
    }
  }
  saveSubjects(next);
  return { items: loadSubjects(), results };
}

export type SubjectChange = { id: number; field: string; from: string; to: string };
export type SubjectAdd = { name: string };

export async function aiSubjectsParse(items: CrmSubject[], prompt: string, selectedIds: number[]) {
  const asked = prompt.trim();
  const pool = selectedIds.length ? items.filter((s) => selectedIds.includes(s.id)) : [];
  const quoted = asked.match(/[«"]([^«»"]+)[»"]/);
  if (pool.length && /переимен|назван|замени|сделай назван/i.test(asked) && quoted) {
    const to = quoted[1].trim();
    const changes = pool.filter((s) => s.name !== to).map((s) => ({ id: s.id, field: "name", from: s.name, to }));
    if (changes.length) return { comment: `Новое имя «${to}» у ${changes.length} предметов.`, changes, adds: [] as SubjectAdd[] };
  }
  if (pool.length && /убери|удали|вырежи/i.test(asked) && /возраст|лет|год/i.test(asked)) {
    const changes: SubjectChange[] = [];
    for (const s of pool) {
      const to = s.name.replace(/\s*\([^)]*\d[^)]*\)\s*/g, " ").replace(/\s{2,}/g, " ").trim();
      if (to && to !== s.name) changes.push({ id: s.id, field: "name", from: s.name, to });
    }
    if (changes.length) return { comment: `Убираю возраст из названия у ${changes.length} предметов.`, changes, adds: [] };
  }
  const { yandexJson } = await import("./agent-channels");
  const slim = (pool.length ? pool : items).map((s) => ({ id: s.id, name: s.name }));
  const llm = await yandexJson<{
    comment?: string;
    changes?: { id?: number; field?: string; to?: string }[];
    adds?: { name?: string }[];
  }>(
    `Ты правишь справочник предметов студии «Развивайся».
Меняй только поле name. changes только с id из списка. adds — только если просят добавить предмет.
Ответ JSON.`,
    `Запрос: ${asked.slice(0, 1500)}
Предметы: ${JSON.stringify(slim).slice(0, 8000)}
JSON: {"comment":"","changes":[{"id":12,"field":"name","to":"Художественная студия (3-4 года)"}],"adds":[]}`,
    1800,
  );
  const out: SubjectChange[] = [];
  for (const c of llm?.changes || []) {
    const id = Number(c.id);
    if (!id || String(c.field || "name") !== "name") continue;
    const hit = items.find((s) => s.id === id);
    if (!hit) continue;
    const to = String(c.to || "").trim();
    if (!to || to === hit.name) continue;
    out.push({ id, field: "name", from: hit.name, to });
  }
  const adds: SubjectAdd[] = [];
  for (const a of llm?.adds || []) {
    const name = String(a?.name || "").trim();
    if (name) adds.push({ name });
  }
  return {
    comment: llm?.comment || (out.length || adds.length ? "Предпросмотр" : "Не понял. Напишите: «переименуй в …» или «убери возраст из названия»."),
    changes: out,
    adds,
  };
}

export function applySubjectChanges(items: CrmSubject[], changes: SubjectChange[], adds: SubjectAdd[]) {
  const byId = new Map(items.map((s) => [s.id, { ...s }]));
  for (const c of changes) {
    const s = byId.get(c.id);
    if (!s || c.field !== "name") continue;
    s.name = c.to;
    byId.set(c.id, s);
  }
  let nextLocal = 9000;
  while (byId.has(nextLocal)) nextLocal += 1;
  for (const a of adds) {
    const name = String(a.name || "").trim();
    if (!name) continue;
    byId.set(nextLocal, { id: nextLocal, name, local: true });
    nextLocal += 1;
  }
  return saveSubjects([...byId.values()]);
}
