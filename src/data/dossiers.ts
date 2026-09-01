import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { formatRuPhone, leadUrl, request, token as alfaToken } from "./alfacrm";
import type { SessionNote } from "./session-note";

export type PersonName = {
  fio: string;
  last?: string;
  first?: string;
  middle?: string;
};

export type DossierLog = { at: string; source: string; text: string };

export type Dossier = {
  id: string;
  crmId?: number;
  branchId?: number;
  url?: string;
  phones: string[];
  phoneDigits: string;
  child: PersonName & { gender?: "мальчик" | "девочка" | ""; dob?: string };
  parent: PersonName;
  address?: string;
  city?: string;
  branch?: string;
  coursesNow: string[];
  coursesPast: string[];
  services: string[];
  teachers: string[];
  schools: string[];
  age?: number;
  ageBand?: string;
  tariff?: string;
  status?: string;
  extras: Record<string, string>;
  chatIds: string[];
  log: DossierLog[];
  createdAt: string;
  updatedAt: string;
};

type Store = { items: Dossier[]; lastCrmSync?: string; nextCrmSync?: string };

const MAX = 8000;

function fileOf() {
  return join(process.cwd(), "storage", "dossiers.json");
}

function loadStore(): Store {
  try {
    if (!existsSync(fileOf())) return { items: [] };
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Store;
    return { items: Array.isArray(raw.items) ? raw.items : [], lastCrmSync: raw.lastCrmSync, nextCrmSync: raw.nextCrmSync };
  } catch {
    return { items: [] };
  }
}

function saveStore(store: Store) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(
    fileOf(),
    JSON.stringify(
      { items: store.items.slice(0, MAX), lastCrmSync: store.lastCrmSync || "", nextCrmSync: store.nextCrmSync || "" },
      null,
      0,
    ),
    "utf8",
  );
}

export function digitsPhone(raw?: string) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("9")) d = `7${d}`;
  if (d.length === 11 && d.startsWith("8")) d = `7${d.slice(1)}`;
  return d;
}

function splitFio(raw?: string): PersonName {
  const fio = String(raw || "").replace(/\s+/g, " ").trim();
  if (!fio) return { fio: "" };
  const parts = fio.split(" ");
  if (parts.length === 1) return { fio, first: parts[0] };
  if (parts.length === 2) return { fio, last: parts[0], first: parts[1] };
  return { fio, last: parts[0], first: parts[1], middle: parts.slice(2).join(" ") };
}

function preferName(prev: string, next: string) {
  const a = (prev || "").trim();
  const b = (next || "").trim();
  if (!b) return a;
  if (!a) return b;
  if (a.toLowerCase() === b.toLowerCase()) return a.split(" ").length >= b.split(" ").length ? a : b;
  const a0 = a.split(/\s+/)[0].toLowerCase();
  if (b.toLowerCase().includes(a0) && b.split(/\s+/).length >= a.split(/\s+/).length) return b;
  if (b.split(/\s+/).length > a.split(/\s+/).length) return b;
  return a;
}

function uniq(list: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of list) {
    const s = String(x || "").trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function emptyDossier(partial: Partial<Dossier> & { id: string }): Dossier {
  const now = new Date().toISOString();
  return {
    id: partial.id,
    phones: [],
    phoneDigits: "",
    child: { fio: "" },
    parent: { fio: "" },
    coursesNow: [],
    coursesPast: [],
    services: [],
    teachers: [],
    schools: [],
    extras: {},
    chatIds: [],
    log: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function mergePerson(prev: PersonName, incoming?: string, crmWins = false): PersonName {
  const next = (incoming || "").trim();
  if (!next) return prev;
  if (crmWins) return { ...prev, ...splitFio(next), fio: next };
  const fio = preferName(prev.fio, next);
  return { ...prev, ...splitFio(fio), fio };
}

const BRANCH_TITLE: Record<number, string> = {
  1: "Коломна, ЦМИТ, Октябрьской революции, 340",
  2: "Коломна, Гражданская, 2",
  3: "Луховицы, Пушкина, 202А",
  4: "Летние программы",
};

export function ageFromDob(dob?: string) {
  const s = String(dob || "").trim();
  let y = 0;
  let mo = 0;
  let da = 0;
  const ru = s.match(/^(\d{1,2})[.](\d{1,2})[.](\d{4})$/);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ru) {
    da = Number(ru[1]);
    mo = Number(ru[2]);
    y = Number(ru[3]);
  } else if (iso) {
    y = Number(iso[1]);
    mo = Number(iso[2]);
    da = Number(iso[3]);
  }
  if (!y || y < 1990 || y > 2026) return undefined;
  const born = new Date(y, mo - 1, da || 1);
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age -= 1;
  if (age < 0 || age > 25) return undefined;
  return age;
}

export function ageBandOf(age?: number) {
  if (age == null) return "";
  if (age <= 4) return "3-4";
  if (age <= 6) return "5-6";
  if (age <= 9) return "7-9";
  if (age <= 14) return "10-14";
  return "15+";
}

export function schoolOfText(text: string) {
  const t = text.toLowerCase();
  if (/худ|рис|живоп|скульп|манг|аним|digital|давинч|наследие|акварель|гуашь|подготовк.{0,12}вуз|арт-програм/.test(t)) return "Художественная школа";
  if (/робот|arduino|wedo|\blego\b/.test(t)) return "Школа робототехники";
  if (/программ|scratch|python|c\+\+|unity|компьютер|gamedev|startschool|juniorschool|майнкрафт/.test(t)) return "Школа программирования";
  if (/физик|радио|беспил|steam|наук|инженер|компас|3d|фиджитал/.test(t)) return "Школа наук и инженерии";
  if (/модел|подиум|beauty|бьюти/.test(t)) return "Модельная школа";
  if (/английск|язык|super minds|go getter/.test(t)) return "Иностранные языки";
  if (/подготовк.{0,12}школ|лего-матем|ранн/.test(t)) return "Раннее развитие";
  if (/мастер/.test(t)) return "Мастер-классы";
  if (/лагер|смен|летн/.test(t)) return "Летние программы";
  return "";
}

function genderFromCrm(g: unknown): "мальчик" | "девочка" | "" | undefined {
  if (g === 1 || g === "1") return "мальчик";
  if (g === 2 || g === "2") return "девочка";
  return undefined;
}

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x || "").trim()).filter(Boolean);
  if (v == null || v === "") return [];
  return [String(v).trim()].filter(Boolean);
}

function stringifyVal(v: unknown): string {
  if (v == null || v === "") return "";
  if (Array.isArray(v)) return v.map((x) => stringifyVal(x)).filter(Boolean).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function extrasFromCrm(item: Record<string, unknown>) {
  const extras: Record<string, string> = {};
  for (const [k, v] of Object.entries(item)) {
    extras[k] = stringifyVal(v);
  }
  return extras;
}

function addressFromCrm(item: Record<string, unknown>) {
  const addr = asList(item.addr).join(", ");
  const custom = String(item.custom_adresprozhivaniya || "").trim();
  if (addr) return addr;
  if (custom && !/введите адрес/i.test(custom)) return custom;
  return "";
}

function statusFromCrm(item: Record<string, unknown>, archived = false) {
  const study = Number(item.is_study);
  if (study === 1) return "учится";
  if (study === 2 || archived) return "архив";
  if (study === 0) return "лид";
  return item.study_status_id != null ? `статус ${item.study_status_id}` : "";
}

function parseJsonish(raw?: string) {
  const s = String(raw || "").trim();
  if (!s || s === "null") return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function namesFromGroup(raw?: string) {
  const courses: string[] = [];
  const teachers: string[] = [];
  const g = parseJsonish(raw);
  const list = Array.isArray(g) ? g : g ? [g] : [];
  for (const one of list) {
    if (!one || typeof one !== "object") continue;
    const rec = one as { name?: string; teachers?: { name?: string }[]; teacher_ids?: unknown };
    if (rec.name) courses.push(String(rec.name));
    for (const t of rec.teachers || []) if (t?.name) teachers.push(String(t.name));
  }
  return { courses, teachers };
}

function idList(raw?: string) {
  const s = String(raw || "").trim();
  if (!s) return [] as number[];
  const parsed = parseJsonish(s);
  const arr = Array.isArray(parsed) ? parsed : parsed != null ? [parsed] : s.split(/[,\s]+/);
  return arr.map((x) => Number(x)).filter((n) => n > 0);
}

export function upsertDossier(patch: {
  crmId?: number;
  branchId?: number;
  phone?: string;
  child?: string;
  parent?: string;
  gender?: "мальчик" | "девочка" | "";
  dob?: string;
  address?: string;
  city?: string;
  branch?: string;
  course?: string;
  coursePast?: string;
  service?: string;
  teacher?: string;
  teachers?: string[];
  school?: string;
  tariff?: string;
  status?: string;
  extras?: Record<string, string>;
  chatId?: string;
  source: string;
  note?: string;
  crmWins?: boolean;
}) {
  const crm = patch.source === "alfacrm" || Boolean(patch.crmWins);
  const digits = digitsPhone(patch.phone);
  const store = loadStore();
  const byCrm = patch.crmId
    ? store.items.find((d) => d.crmId === patch.crmId)
    : undefined;
  const byPhone = digits ? store.items.find((d) => d.phoneDigits === digits || d.phones.some((p) => digitsPhone(p) === digits)) : undefined;
  let cur = byCrm || byPhone;
  const id = cur?.id || (patch.crmId ? `crm-${patch.crmId}` : digits ? `tel-${digits}` : `tmp-${Date.now().toString(36)}`);
  if (!cur) cur = emptyDossier({ id });
  const before = JSON.stringify({
    child: cur.child.fio,
    parent: cur.parent.fio,
    dob: cur.child.dob,
    gender: cur.child.gender,
    city: cur.city,
  });
  const childFio = mergePerson(cur.child, patch.child, crm);
  const parentFio = mergePerson(cur.parent, patch.parent, crm);
  const next: Dossier = {
    ...cur,
    id,
    crmId: patch.crmId || cur.crmId,
    branchId: patch.branchId || cur.branchId,
    url: patch.crmId && (patch.branchId || cur.branchId) ? leadUrl(patch.branchId || cur.branchId || 2, patch.crmId) : cur.url,
    phones: uniq([...cur.phones, patch.phone ? formatRuPhone(patch.phone) : ""]),
    phoneDigits: digits || cur.phoneDigits,
    child: {
      ...childFio,
      gender: patch.gender !== undefined && patch.gender !== "" ? patch.gender : cur.child.gender || "",
      dob: crm && patch.dob ? patch.dob : patch.dob || cur.child.dob || "",
    },
    parent: parentFio,
    address: crm && patch.address ? patch.address : patch.address || cur.address,
    city: patch.city || cur.city,
    branch: crm && patch.branch ? patch.branch : patch.branch || cur.branch,
    coursesNow: uniq([...(cur.coursesNow || []), patch.course || ""]),
    coursesPast: uniq([...(cur.coursesPast || []), patch.coursePast || ""]),
    services: uniq([...(cur.services || []), patch.service || ""]),
    teachers: uniq([...(cur.teachers || []), patch.teacher || "", ...(patch.teachers || [])]),
    schools: uniq([...(cur.schools || []), patch.school || "", schoolOfText(patch.course || ""), schoolOfText(patch.coursePast || "")]),
    age: ageFromDob(crm && patch.dob ? patch.dob : patch.dob || cur.child.dob || "") || cur.age,
    ageBand: "",
    tariff: crm && patch.tariff ? patch.tariff : patch.tariff || cur.tariff,
    status: crm && patch.status ? patch.status : patch.status || cur.status,
    extras: { ...cur.extras, ...(patch.extras || {}) },
    chatIds: uniq([...cur.chatIds, patch.chatId || ""]),
    updatedAt: new Date().toISOString(),
    createdAt: cur.createdAt,
    log: cur.log,
  };
  next.ageBand = ageBandOf(next.age);
  const after = JSON.stringify({
    child: next.child.fio,
    parent: next.parent.fio,
    dob: next.child.dob,
    city: next.city,
  });
  if (before !== after || patch.note) {
    next.log = [
      {
        at: next.updatedAt,
        source: patch.source,
        text: patch.note || `Обновление: ${next.child.fio || "без имени"} · ${next.parent.fio || "заказчик"} · ${next.phoneDigits}`,
      },
      ...cur.log,
    ].slice(0, 80);
  }
  const rest = store.items.filter((d) => d.id !== cur!.id && d.id !== next.id);
  if (byPhone && byCrm && byPhone.id !== byCrm.id) {
    store.items = [next, ...rest.filter((d) => d.id !== byPhone.id && d.id !== byCrm.id)];
  } else {
    store.items = [next, ...rest];
  }
  store.items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  saveStore(store);
  return next;
}

export function dossierFromNote(note: SessionNote, extra?: { phone?: string; chatId?: string; crmId?: number; branchId?: number }) {
  const gender: Dossier["child"]["gender"] =
    /девоч|дочь|дочк|девочка/i.test(`${note.child || ""} ${note.essence}`)
      ? "девочка"
      : /мальчик|сын\b/i.test(`${note.child || ""} ${note.essence}`)
        ? "мальчик"
        : "";
  return upsertDossier({
    crmId: extra?.crmId,
    branchId: extra?.branchId || note.branchId,
    phone: extra?.phone || note.phone,
    child: note.child,
    parent: note.parent,
    gender,
    city: note.city,
    branch: note.branch,
    course: note.course || note.school,
    service: note.service,
    chatId: extra?.chatId,
    source: "chat",
    note: note.essence,
  });
}

export function findDossier(opts: { crmId?: number; phone?: string; id?: string }) {
  const store = loadStore();
  const digits = digitsPhone(opts.phone);
  return (
    store.items.find((d) => (opts.id && d.id === opts.id) || (opts.crmId && d.crmId === opts.crmId) || (digits && d.phoneDigits === digits)) ||
    null
  );
}

export function dossierPrompt(d: Dossier | null) {
  if (!d) return "";
  const lines = [
    d.crmId ? `AlfaCRM id ${d.crmId}, филиал ${d.branchId || "—"}` : "карточки в CRM ещё нет",
    d.child.fio ? `ребёнок: ${d.child.fio}${d.child.gender ? `, ${d.child.gender}` : ""}${d.child.dob ? `, др ${d.child.dob}` : ""}` : "",
    d.parent.fio ? `заказчик: ${d.parent.fio}` : "",
    d.phones.length ? `телефон: ${d.phones.join(", ")}` : "",
    d.city ? `город: ${d.city}` : "",
    d.branch ? `филиал: ${d.branch}` : "",
    d.address ? `адрес: ${d.address}` : "",
    d.coursesNow.length ? `ходит сейчас: ${d.coursesNow.join(", ")}` : "",
    d.coursesPast.length ? `ходил раньше: ${d.coursesPast.join(", ")}` : "",
    d.services.length ? `услуги: ${d.services.join(", ")}` : "",
    d.tariff ? `абонемент: ${d.tariff}` : "",
    d.status ? `статус: ${d.status}` : "",
    d.child.dob ? `дата рождения: ${d.child.dob}` : "",
    Object.entries(d.extras)
      .filter(([k, v]) => v && /custom_|osobennost|addr|paid_till|balance|email|last_attend/i.test(k))
      .slice(0, 8)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n") || "",
  ].filter(Boolean);
  if (!lines.length) return "";
  return `

ЛИЧНОЕ ДЕЛО клиента (основа разговора, не переспрашивай то, что здесь есть):
${lines.map((l) => `— ${l}`).join("\n")}
Если клиент назвал более полное ФИО — запомни новое, короткое не важнее полного.
`;
}

export function applyCrmCustomer(item: Record<string, unknown>, branchId: number, archived = false, teacherMap: Record<string, string> = {}) {
  const id = Number(item.id);
  if (!id) return null;
  const phones = asList(item.phone);
  const gender = genderFromCrm(item.gender);
  const paid = item.paid_till ? `оплачено до ${item.paid_till}` : "";
  const extraTariff = Number(item.paid_count) ? `занятий по абонементу: ${item.paid_count}` : "";
  const extras = extrasFromCrm(item);
  const fromGroup = namesFromGroup(extras.groups);
  const study = Number(item.is_study);
  const reallyArchived = study === 2 || (archived && study !== 1);
  const courseName = fromGroup.courses[0] || "";
  const teacherFromIds = idList(extras.teacher_ids)
    .map((n) => teacherMap[String(n)] || "")
    .filter(Boolean);
  const teachers = uniq([...fromGroup.teachers, ...teacherFromIds]);
  const school = schoolOfText(courseName);
  return upsertDossier({
    crmId: id,
    branchId,
    phone: phones[0] || "",
    child: String(item.name || ""),
    parent: String(item.legal_name || ""),
    gender,
    dob: String(item.dob || ""),
    address: addressFromCrm(item),
    branch: BRANCH_TITLE[branchId] || String(branchId),
    city: branchId === 3 ? "Луховицы" : branchId === 4 ? "лето" : "Коломна",
    course: reallyArchived ? "" : courseName,
    coursePast: reallyArchived ? courseName : "",
    teacher: teachers[0] || "",
    teachers,
    school,
    tariff: [paid, extraTariff].filter(Boolean).join(" · "),
    status: statusFromCrm(item, reallyArchived),
    extras,
    source: "alfacrm",
    crmWins: true,
    note: `CRM ${id}: ${item.name || ""}`,
  });
}

export async function syncDossierFromCrm(crmId: number, branchId: number) {
  const t = await alfaToken();
  const data = await request<{ items?: Record<string, unknown>[] }>(
    `/v2api/${branchId}/customer/index`,
    { page: 0, pageSize: 1, id: crmId },
    t,
  );
  const item = data.items?.[0];
  if (!item) throw new Error("В AlfaCRM нет такой карточки.");
  return applyCrmCustomer(item, branchId);
}

export async function syncAllFromCrm() {
  const t = await alfaToken();
  const teacherMap: Record<string, string> = {};
  for (const branch of [1, 2, 3, 4]) {
    const tr = await request<{ items?: { id?: number; name?: string }[] }>(`/v2api/${branch}/teacher/index`, { page: 0, pageSize: 200 }, t).catch(
      () => ({ items: [] as { id?: number; name?: string }[] }),
    );
    for (const p of tr.items || []) if (p.id && p.name) teacherMap[String(p.id)] = p.name;
  }
  let n = 0;
  for (const branch of [1, 2, 3, 4]) {
    for (const study of [0, 1, 2]) {
      for (let page = 0; page < 80; page += 1) {
        const data = await request<{ items?: Record<string, unknown>[] }>(
          `/v2api/${branch}/customer/index`,
          { page, pageSize: 50, is_study: study },
          t,
        );
        const items = data.items || [];
        for (const item of items) {
          applyCrmCustomer(item, branch, study === 2, teacherMap);
          n += 1;
        }
        if (items.length < 50) break;
      }
    }
    for (let page = 0; page < 40; page += 1) {
      const data = await request<{ items?: Record<string, unknown>[] }>(
        `/v2api/${branch}/customer/index`,
        { page, pageSize: 50, removed: 1 },
        t,
      ).catch(() => ({ items: [] as Record<string, unknown>[] }));
      const items = data.items || [];
      for (const item of items) {
        if (Number(item.is_study) === 1) {
          applyCrmCustomer(item, branch, false, teacherMap);
        } else {
          applyCrmCustomer(item, branch, true, teacherMap);
        }
        n += 1;
      }
      if (items.length < 50) break;
    }
  }
  const store = loadStore();
  store.lastCrmSync = new Date().toISOString();
  saveStore(store);
  return { ok: true as const, count: n, lastCrmSync: store.lastCrmSync };
}

function viewOf(d: Dossier) {
  const ex = d.extras || {};
  const fromGroup = namesFromGroup(ex.groups);
  const study = Number(ex.is_study);
  const status = d.status && d.status !== "архив" ? d.status : statusFromCrm({ is_study: ex.is_study, study_status_id: ex.study_status_id }, study === 2);
  const coursesNow = uniq([...(d.coursesNow || []), ...(status === "учится" ? fromGroup.courses : [])]);
  const coursesPast = uniq([...(d.coursesPast || []), ...(status !== "учится" ? fromGroup.courses : [])]);
  const teachers = uniq([...(d.teachers || []), ...fromGroup.teachers]);
  const schools = uniq([
    ...(d.schools || []),
    ...coursesNow.map(schoolOfText),
    ...coursesPast.map(schoolOfText),
  ].filter(Boolean));
  const age = d.age || ageFromDob(d.child.dob);
  return {
    id: d.id,
    crmId: d.crmId || null,
    branchId: d.branchId || null,
    url: d.url || "",
    child: d.child.fio,
    gender: d.child.gender || "",
    dob: d.child.dob || "",
    age: age ?? null,
    ageBand: ageBandOf(age),
    parent: d.parent.fio,
    phone: d.phones[0] || d.phoneDigits,
    city: d.city || "",
    branch: d.branch || "",
    courses: uniq([...coursesNow, ...coursesPast]),
    coursesNow,
    coursesPast,
    schools,
    teachers,
    tariff: d.tariff || "",
    status,
    archived: status === "архив",
    updatedAt: d.updatedAt,
  };
}

export type ClientView = ReturnType<typeof viewOf>;

export function searchClientViews(q = "", limit = 400) {
  const store = loadStore();
  const needle = String(q || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .trim();
  const words = needle.split(/\s+/).filter((w) => w.length > 1);
  const items = store.items.map(viewOf).filter((d) => {
    if (!needle) return true;
    const hay = `${d.child} ${d.parent} ${d.phone} ${d.city} ${d.branch} ${d.courses.join(" ")} ${d.schools.join(" ")} ${d.crmId || ""}`
      .toLowerCase()
      .replace(/ё/g, "е");
    if (hay.includes(needle)) return true;
    return words.length > 0 && words.every((w) => hay.includes(w));
  });
  items.sort((a, b) => {
    const rank = (s: string) => (s === "учится" ? 0 : s === "лид" ? 1 : 2);
    const r = rank(a.status) - rank(b.status);
    if (r) return r;
    return (a.child || "").localeCompare(b.child || "", "ru");
  });
  return { items: items.slice(0, limit), total: store.items.length, lastCrmSync: store.lastCrmSync || "" };
}

export const adminDossiers = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        action?: "list" | "get" | "save" | "sync" | "syncAll";
        id?: string;
        crmId?: number;
        branchId?: number;
        q?: string;
        patch?: Partial<Dossier> & { childFio?: string; parentFio?: string; dob?: string; phone?: string };
      },
  )
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const store = loadStore();
    if (data.action === "get" && data.id) {
      const one = store.items.find((d) => d.id === data.id);
      if (!one) return { ok: false as const, error: "Дело не найдено." };
      return { ok: true as const, dossier: one };
    }
    if (data.action === "syncAll") {
      try {
        const res = await syncAllFromCrm();
        return { ok: true as const, ...res };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "CRM" };
      }
    }
    if (data.action === "sync" && data.crmId && data.branchId) {
      try {
        const d = await syncDossierFromCrm(data.crmId, data.branchId);
        return { ok: true as const, dossier: d };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "CRM" };
      }
    }
    if (data.action === "save" && data.id) {
      const prev = store.items.find((d) => d.id === data.id);
      if (!prev) return { ok: false as const, error: "Дело не найдено." };
      const p = data.patch || {};
      const next = upsertDossier({
        crmId: prev.crmId,
        branchId: prev.branchId,
        phone: p.phone || prev.phoneDigits,
        child: p.childFio ?? prev.child.fio,
        parent: p.parentFio ?? prev.parent.fio,
        dob: p.dob ?? prev.child.dob,
        address: p.address ?? prev.address,
        city: p.city ?? prev.city,
        branch: p.branch ?? prev.branch,
        tariff: p.tariff ?? prev.tariff,
        status: p.status ?? prev.status,
        source: "admin",
        note: "Правка в кабинете",
      });
      return { ok: true as const, dossier: next };
    }
    const q = String(data.q || "").toLowerCase();
    const views = store.items.map(viewOf).filter((d) => {
      if (!q) return true;
      const hay = `${d.child} ${d.parent} ${d.phone} ${d.city} ${d.courses.join(" ")} ${d.schools.join(" ")} ${d.teachers.join(" ")} ${d.crmId || ""}`.toLowerCase();
      return hay.includes(q);
    });
    views.sort((a, b) => {
      const rank = (s: string) => (s === "учится" ? 0 : s === "лид" ? 1 : 2);
      const r = rank(a.status) - rank(b.status);
      if (r) return r;
      const sa = a.schools[0] || "";
      const sb = b.schools[0] || "";
      if (sa !== sb) return sa.localeCompare(sb, "ru");
      const ca = a.courses[0] || "";
      const cb = b.courses[0] || "";
      if (ca !== cb) return ca.localeCompare(cb, "ru");
      return (a.child || "").localeCompare(b.child || "", "ru");
    });
    const facet = (key: (d: (typeof views)[0]) => string[]) => {
      const bag: Record<string, number> = {};
      for (const d of views) for (const v of key(d)) if (v) bag[v] = (bag[v] || 0) + 1;
      return Object.entries(bag)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"))
        .map(([name, n]) => ({ name, n }));
    };
    return {
      ok: true as const,
      total: store.items.length,
      lastCrmSync: store.lastCrmSync || "",
      nextCrmSync: store.nextCrmSync || "",
      items: views,
      facets: {
        status: facet((d) => [d.status]),
        ageBand: facet((d) => [d.ageBand]),
        school: facet((d) => d.schools),
        course: facet((d) => d.courses),
        teacher: facet((d) => d.teachers),
        city: facet((d) => [d.city]),
      },
    };
  });
