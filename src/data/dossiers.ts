import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isAdminRequest } from "./admin-auth";
import { formatRuPhone, leadUrl, request, token as alfaToken } from "./alfacrm";
import type { SessionNote } from "./session-note";
import { loadVersions } from "./crm-slots";
import { isPhoneLike, displayPersonName, membershipIds } from "./client-display";
import { clientCardId } from "./ids";
import type { DossiersReq } from "./dossiers-fn";
import { logAdmin } from "./admin-settings";

export type PersonName = {
  fio: string;
  last?: string;
  first?: string;
  middle?: string;
};

export type DossierLog = { at: string; source: string; text: string };

/** Связь клиента с группой: id = groupId AlfaCRM. Имя — подпись. */
export type GroupLink = {
  id: number;
  name: string;
  branchId: number;
  school: string;
  active: boolean;
  subjectId?: number;
  courseId?: string;
};

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
  groupLinks?: GroupLink[];
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

type Store = { items: Dossier[]; lastCrmSync?: string; nextCrmSync?: string; lastLeadSync?: string };

const MAX = 8000;
let cachedStore: { mtime: number; store: Store } | null = null;
let viewsMemo: { items: Dossier[]; views: unknown[] } | null = null;

function fileOf() {
  const local = join(process.cwd(), "storage", "dossiers.json");
  if (existsSync(local)) return local;
  const abs = "/var/www/rastudio/storage/dossiers.json";
  if (existsSync(abs)) return abs;
  return local;
}

function loadStore(): Store {
  const p = fileOf();
  for (let i = 0; i < 3; i++) {
    try {
      if (!existsSync(p)) return cachedStore?.store || { items: [] };
      const mtime = statSync(p).mtimeMs;
      if (cachedStore && cachedStore.mtime === mtime) return cachedStore.store;
      const raw = JSON.parse(readFileSync(p, "utf8")) as Store;
      const store = {
        items: Array.isArray(raw.items) ? raw.items : [],
        lastCrmSync: raw.lastCrmSync,
        nextCrmSync: raw.nextCrmSync,
        lastLeadSync: raw.lastLeadSync,
      };
      if (store.items.length) cachedStore = { mtime, store };
      return store.items.length ? store : cachedStore?.store || store;
    } catch {
      if (cachedStore) return cachedStore.store;
    }
  }
  return cachedStore?.store || { items: [] };
}

function saveStore(store: Store) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  const target = fileOf();
  const tmp = `${target}.${process.pid}.tmp`;
  const packed: Store = {
    items: store.items.slice(0, MAX),
    lastCrmSync: store.lastCrmSync || "",
    nextCrmSync: store.nextCrmSync || "",
    lastLeadSync: store.lastLeadSync || "",
  };
  writeFileSync(tmp, JSON.stringify(packed, null, 0), "utf8");
  renameSync(tmp, target);
  try {
    cachedStore = { mtime: statSync(target).mtimeMs, store: packed };
  } catch {
    cachedStore = { mtime: Date.now(), store: packed };
  }
  viewsMemo = null;
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
  if (!next || isPhoneLike(next)) {
    if (prev.fio && isPhoneLike(prev.fio)) return { fio: "" };
    return prev;
  }
  if (crmWins) return { ...prev, ...splitFio(next), fio: next };
  const fio = preferName(prev.fio, next);
  return { ...prev, ...splitFio(fio), fio };
}

const BRANCH_TITLE: Record<number, string> = {
  1: "Коломна, Гражданская, 2",
  2: "Коломна, ЦМИТ, Октябрьской революции, 340",
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
  if (age <= 12) return "10-12";
  if (age <= 17) return "13-17";
  return "18+";
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

function genderFromFio(fio: string): "мальчик" | "девочка" | "" {
  const parts = String(fio || "").trim().split(/\s+/);
  const pat = (parts[2] || "").toLowerCase();
  if (/овна$|евна$|ична$|инична$/.test(pat)) return "девочка";
  if (/ович$|евич$/.test(pat) || (/ич$/.test(pat) && !/ичн/.test(pat))) return "мальчик";
  return "";
}

function genderFromCrm(g: unknown, fio = ""): "мальчик" | "девочка" | "" | undefined {
  if (g === 1 || g === "1") return "мальчик";
  if (g === 2 || g === "2") return "девочка";
  return genderFromFio(fio) || undefined;
}

const STUDY_STATUS: Record<number, { name: string; bucket: "учится" | "архив" | "лид" }> = {
  1: { name: "Обучается", bucket: "учится" },
  4: { name: "Ожидает старта", bucket: "учится" },
  8: { name: "Ждём на занятиях", bucket: "учится" },
  5: { name: "Должник", bucket: "учится" },
  7: { name: "Пропустил 1 занятие", bucket: "учится" },
  10: { name: "Пропустил 2 занятия", bucket: "учится" },
  11: { name: "Пропустил 3 занятия", bucket: "архив" },
  2: { name: "Завершил", bucket: "архив" },
  9: { name: "Без статуса", bucket: "архив" },
};

function studyMeta(item: Record<string, unknown>) {
  const sid = Number(item.study_status_id || 0);
  return STUDY_STATUS[sid] || null;
}

function statusFromCrm(item: Record<string, unknown>, archived = false) {
  if (Number(item.removed) === 1 || String(item.removed) === "1") return "удалён";
  const study = Number(item.is_study);
  if (study === 0) return "лид";
  if (study === 1) return "учится";
  if (study === 2 || archived) return "архив";
  return "удалён";
}

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x || "").trim()).filter(Boolean);
  if (v == null || v === "") return [];
  return [String(v).trim()].filter(Boolean);
}

function stringifyVal(v: unknown): string {
  if (v == null || v === "") return "";
  if (Array.isArray(v) || (typeof v === "object" && v !== null)) return JSON.stringify(v);
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

/** groupId из JSON групп CRM. Имя — подпись. */
function groupsFromItem(item: Record<string, unknown>, branchId: number): GroupLink[] {
  let raw: unknown = item.groups;
  if (typeof raw === "string") raw = parseJsonish(raw);
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw as Record<string, unknown>) : [];
  const out: GroupLink[] = [];
  const seen = new Set<string>();
  for (const one of list) {
    if (!one || typeof one !== "object") continue;
    const rec = one as { id?: number; group_id?: number; name?: string; branch_id?: number; subject_id?: number };
    const id = Number(rec.id || rec.group_id || 0);
    if (!id) continue;
    const bid = Number(rec.branch_id || branchId || 0);
    const k = `${bid}:${id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const name = String(rec.name || `группа ${id}`);
    out.push({
      id,
      name,
      branchId: bid,
      school: schoolOfText(name),
      active: true,
      subjectId: Number(rec.subject_id || 0) || undefined,
    });
  }
  return out;
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
  groupLink?: GroupLink;
  groupLinks?: GroupLink[];
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
      gender: (patch.gender !== undefined && patch.gender !== "" ? patch.gender : cur.child.gender) || genderFromFio(childFio.fio) || "",
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
    groupLinks: (() => {
      const list = [...(cur.groupLinks || [])];
      const incoming = [...(patch.groupLinks || []), ...(patch.groupLink ? [patch.groupLink] : [])];
      for (const g of incoming) {
        if (!g?.id) continue;
        const i = list.findIndex((x) => x.id === g.id && x.branchId === g.branchId);
        if (i >= 0) list[i] = { ...list[i], ...g };
        else list.push(g);
      }
      return list;
    })(),
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

function isArchivedLeadOnSite(d: Dossier, activeLeadIds: Set<number>, currentMap?: Map<number, Set<number>>) {
  const id = Number(d.crmId || 0);
  if (id && currentMap?.has(id)) return false;
  const ex = d.extras || {};
  const studyRaw = String(ex.is_study ?? "");
  const study = studyRaw === "" ? null : Number(studyRaw);
  const st = String(d.status || "");
  if (st === "учится" || study === 1 || String(ex.crm_current) === "1") return false;
  if (st === "архив" || study === 2) return true;
  if ((st === "лид" || study === 0) && id && !activeLeadIds.has(id)) return true;
  return false;
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

export function applyCrmCustomer(item: Record<string, unknown>, branchId: number, _archived = false, teacherMap: Record<string, string> = {}) {
  const id = Number(item.id);
  if (!id) return null;
  const phones = asList(item.phone);
  const rawName = String(item.name || "").trim();
  if (isPhoneLike(rawName) && rawName && !phones.some((p) => digitsPhone(p) === digitsPhone(rawName))) phones.unshift(rawName);
  const childName = isPhoneLike(rawName) ? "" : rawName;
  const gender = genderFromCrm(item.gender, childName);
  const paid = item.paid_till ? `оплачено до ${item.paid_till}` : "";
  const extraTariff = Number(item.paid_count) ? `занятий по абонементу: ${item.paid_count}` : "";
  const extras = extrasFromCrm(item);
  const fromGroup = namesFromGroup(extras.groups);
  const study = Number(item.is_study);
  extras.removed = study === 0 || study === 1 || study === 2 ? "0" : String(extras.removed || "0");
  const reallyArchived = study === 2;
  const courseName = fromGroup.courses[0] || "";
  const teacherFromIds = idList(extras.teacher_ids)
    .map((n) => teacherMap[String(n)] || "")
    .filter(Boolean);
  const teachers = uniq([...fromGroup.teachers, ...teacherFromIds]);
  const school = schoolOfText(courseName);
  const groupLinks = groupsFromItem(item, branchId);
  return upsertDossier({
    crmId: id,
    branchId,
    phone: phones[0] || "",
    child: childName,
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
    groupLinks,
    source: "alfacrm",
    crmWins: true,
    note: `CRM ${id}: ${childName || rawName || ""}`,
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

export async function syncAllFromCrm(
  onProgress?: (p: { step: string; n: number; total: number }) => void,
  studies: number[] = [1],
) {
  const t = await alfaToken();
  const teacherMap: Record<string, string> = {};
  const want = studies.length ? studies : [1];
  const leadsOnly = want.length === 1 && want[0] === 0;
  if (!leadsOnly) {
    for (const branch of [1, 2, 3, 4]) {
      onProgress?.({ step: `Педагоги · филиал ${branch}`, n: 0, total: 0 });
      const tr = await request<{ items?: { id?: number; name?: string }[] }>(`/v2api/${branch}/teacher/index`, { page: 0, pageSize: 200 }, t).catch(
        () => ({ items: [] as { id?: number; name?: string }[] }),
      );
      for (const p of tr.items || []) if (p.id && p.name) teacherMap[String(p.id)] = p.name;
    }
  }
  let n = 0;
  const labels: Record<number, string> = { 0: "лиды", 1: "текущие", 2: "архив" };
  const names: Record<number, string> = { 1: "Гражданская", 2: "ЦМИТ", 3: "Луховицы", 4: "Лето" };
  const currentMap = new Map<number, Set<number>>();
  const leadIds = new Set<number>();
  for (const branch of [1, 2, 3, 4]) {
    for (const study of want) {
      for (let page = 0; page < 80; page += 1) {
        onProgress?.({
          step: `${names[branch] || branch} · ${labels[study] || study} · стр. ${page + 1}`,
          n,
          total: n,
        });
        const data = await request<{ items?: Record<string, unknown>[] }>(
          `/v2api/${branch}/customer/index`,
          { page, pageSize: 50, is_study: study, ...(study === 2 ? {} : { removed: 0 }) },
          t,
        ).catch(() => ({ items: [] as Record<string, unknown>[] }));
        const items = data.items || [];
        for (const item of items) {
          if (Number(item.removed) === 1 || String(item.removed) === "1") continue;
          if (Number(item.is_study) !== study) continue;
          if (study !== 2 && Number(item.is_study) === 2) continue;
          applyCrmCustomer(item, branch, study === 2, teacherMap);
          const id = Number(item.id || 0);
          if (id && study === 1) {
            if (!currentMap.has(id)) currentMap.set(id, new Set());
            currentMap.get(id)!.add(branch);
          }
          if (id && study === 0) leadIds.add(id);
          n += 1;
        }
        if (items.length < 50) break;
      }
    }
  }
  const store = loadStore();
  if (want.includes(1)) {
    const pref = [1, 2, 3, 4];
    for (const d of store.items) {
      const id = Number(d.crmId || 0);
      if (!id) continue;
      d.extras = d.extras || {};
      const hit = currentMap.get(id);
      if (hit && hit.size) {
        d.extras.is_study = "1";
        d.extras.crm_current = "1";
        d.extras.removed = "0";
        d.status = "учится";
        d.extras.crm_current_branches = [...hit].join(",");
        const keep = hit.has(Number(d.branchId)) ? Number(d.branchId) : 0;
        const primary = keep || pref.find((b) => hit.has(b)) || [...hit][0];
        if (primary) {
          d.branchId = primary;
          d.branch = BRANCH_TITLE[primary] || d.branch;
        }
      } else if (String(d.extras.is_study) === "1" || d.status === "учится") {
        d.extras.crm_current = "0";
        d.extras.crm_current_branches = "";
        d.extras.is_study = "";
        d.status = "снят";
      }
    }
  }
  let purged = 0;
  if (want.includes(0) && !want.includes(2)) {
    store.items = store.items.filter((d) => {
      if (!isArchivedLeadOnSite(d, leadIds, currentMap)) return true;
      purged += 1;
      return false;
    });
    store.lastLeadSync = new Date().toISOString();
  }
  store.lastCrmSync = new Date().toISOString();
  saveStore(store);
  return { ok: true as const, count: n, purged, lastCrmSync: store.lastCrmSync, studies: want };
}

let leadTickBusy = false;

/** Только новые лиды (id, которых ещё нет на сайте). Старых не перечитываем. */
export async function syncNewLeadsFromCrm() {
  if (leadTickBusy) return { ok: true as const, added: 0, skipped: true as const };
  leadTickBusy = true;
  try {
    const store = loadStore();
    const known = new Set(store.items.map((d) => Number(d.crmId || 0)).filter(Boolean));
    const t = await alfaToken();
    let added = 0;
    for (const branch of [1, 2, 3, 4]) {
      let knownPages = 0;
      for (let page = 0; page < 4; page += 1) {
        const data = await request<{ items?: Record<string, unknown>[] }>(
          `/v2api/${branch}/customer/index`,
          { page, pageSize: 50, is_study: 0, removed: 0 },
          t,
        ).catch(() => ({ items: [] as Record<string, unknown>[] }));
        const items = data.items || [];
        if (!items.length) break;
        const ids = items.map((it) => Number(it.id || 0)).filter(Boolean);
        const desc = ids.length >= 2 && ids[0] > ids[ids.length - 1];
        let newOnPage = 0;
        for (const item of items) {
          const id = Number(item.id || 0);
          if (!id || Number(item.removed) === 1 || Number(item.is_study) !== 0) continue;
          if (known.has(id)) continue;
          applyCrmCustomer(item, branch, false);
          known.add(id);
          added += 1;
          newOnPage += 1;
        }
        if (newOnPage === 0) {
          knownPages += 1;
          if (desc || knownPages >= 2) break;
        } else knownPages = 0;
        if (items.length < 50) break;
      }
    }
    const next = loadStore();
    next.lastLeadSync = new Date().toISOString();
    next.nextCrmSync = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    if (added) next.lastCrmSync = next.lastLeadSync;
    saveStore(next);
    if (added) logAdmin(`Новые лиды из AlfaCRM: ${added}`);
    return { ok: true as const, added, count: added };
  } finally {
    leadTickBusy = false;
  }
}

export function startLeadTicker() {
  const g = globalThis as { __raLeadTimer?: ReturnType<typeof setInterval> };
  if (g.__raLeadTimer) return;
  const tick = () => {
    void syncNewLeadsFromCrm().catch(() => {});
  };
  g.__raLeadTimer = setInterval(tick, 5 * 60 * 1000);
  setTimeout(tick, 20 * 1000);
}

let teacherMapCache: Record<string, string> | null = null;

async function teacherMap() {
  if (teacherMapCache) return teacherMapCache;
  const t = await alfaToken();
  const map: Record<string, string> = {};
  for (const branch of [1, 2, 3, 4]) {
    const tr = await request<{ items?: { id?: number; name?: string }[] }>(`/v2api/${branch}/teacher/index`, { page: 0, pageSize: 200 }, t).catch(
      () => ({ items: [] as { id?: number; name?: string }[] }),
    );
    for (const p of tr.items || []) if (p.id && p.name) map[String(p.id)] = p.name;
  }
  teacherMapCache = map;
  return map;
}

export async function syncSliceFromCrm(opts: { branchId: number; isStudy?: number; removed?: boolean; page?: number; pages?: number }) {
  const t = await alfaToken();
  const map = await teacherMap();
  const branch = Number(opts.branchId) || 1;
  const pages = Math.min(Math.max(Number(opts.pages) || 3, 1), 6);
  let page = Math.max(0, Number(opts.page) || 0);
  let n = 0;
  let hasMore = true;
  for (let i = 0; i < pages; i += 1) {
    const body = opts.removed
      ? { page, pageSize: 50, removed: 1 }
      : { page, pageSize: 50, is_study: opts.isStudy, ...(opts.isStudy === 2 ? {} : { removed: 0 }) };
    const data = await request<{ items?: Record<string, unknown>[] }>(`/v2api/${branch}/customer/index`, body, t).catch(
      () => ({ items: [] as Record<string, unknown>[] }),
    );
    const items = data.items || [];
    for (const item of items) {
      if (!opts.removed && (Number(item.removed) === 1 || (opts.isStudy != null && Number(item.is_study) !== Number(opts.isStudy)))) continue;
      if (!opts.removed && opts.isStudy !== 2 && Number(item.is_study) === 2) continue;
      if (opts.removed) applyCrmCustomer(item, branch, Number(item.is_study) !== 1, map);
      else applyCrmCustomer(item, branch, opts.isStudy === 2, map);
      n += 1;
    }
    page += 1;
    if (items.length < 50) {
      hasMore = false;
      break;
    }
  }
  const store = loadStore();
  store.lastCrmSync = new Date().toISOString();
  saveStore(store);
  const counts = { все: 0, учится: 0, лид: 0, архив: 0 };
  for (const d of store.items) {
    counts.все += 1;
    if (d.status === "учится") counts.учится += 1;
    else if (d.status === "лид") counts.лид += 1;
    else if (d.status === "архив") counts.архив += 1;
  }
  return { ok: true as const, count: n, nextPage: page, hasMore, total: store.items.length, counts, lastCrmSync: store.lastCrmSync };
}

export async function syncMembershipsSlice(offset = 0, take = 8) {
  const slots = (loadVersions()[0]?.slots || []).filter((s) => Number(s.groupId) > 0 && Number(s.statusId) !== 3 && Number(s.statusId) !== 4);
  const seen = new Set<string>();
  const groups: { id: number; branchId: number; name: string; school: string; subjectId: number; courseId: string }[] = [];
  for (const s of slots) {
    const id = Number(s.groupId);
    const branchId = Number(s.branchId) || 1;
    const k = `${branchId}-${id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    groups.push({
      id,
      branchId,
      name: s.groupName || s.course || `группа ${id}`,
      school: s.school || schoolOfText(s.groupName || s.course || ""),
      subjectId: Number(s.subjectId) || 0,
      courseId: s.courseId || "",
    });
  }
  const slice = groups.slice(offset, offset + take);
  const t = await alfaToken();
  let n = 0;
  for (const g of slice) {
    for (let page = 0; page < 4; page += 1) {
      const json = await request<{ items?: Record<string, unknown>[] }>(
        `/v2api/${g.branchId}/customer/index`,
        { page, pageSize: 50, group_id: g.id, is_study: 1 },
        t,
      ).catch(() => ({ items: [] as Record<string, unknown>[] }));
      const items = json.items || [];
      for (const c of items) {
        const crmId = Number(c.id || 0);
        if (!crmId) continue;
        if (Number(c.removed) === 1 || Number(c.is_study) !== 1) continue;
        applyCrmCustomer(c, g.branchId, false, {});
        upsertDossier({
          crmId,
          branchId: g.branchId,
          course: g.name,
          school: g.school,
          status: "учится",
          groupLink: {
            id: g.id,
            name: g.name,
            branchId: g.branchId,
            school: g.school,
            active: true,
            subjectId: g.subjectId || undefined,
            courseId: g.courseId || undefined,
          },
          source: "alfacrm",
          crmWins: true,
        });
        n += 1;
      }
      if (items.length < 50) break;
    }
  }
  const done = offset + take >= groups.length;
  const views = searchClientViews("", 1, "учится");
  return {
    ok: true as const,
    count: n,
    next: offset + take,
    totalGroups: groups.length,
    done,
    studying: views.counts.учится,
    counts: views.counts,
  };
}

export async function reclassifyRolesFromCrm() {
  const t = await alfaToken();
  const current = new Set<number>();
  const leads = new Set<number>();
  const archive = new Set<number>();
  const currentBranches = new Map<number, Set<number>>();
  const totals = { учится: 0, лид: 0, архив: 0 };
  for (const branch of [1, 2, 3, 4]) {
    for (const study of [1, 0, 2] as const) {
      for (let page = 0; page < 80; page += 1) {
        const data = await request<{ items?: Record<string, unknown>[]; total?: number }>(
          `/v2api/${branch}/customer/index`,
          { page, pageSize: 50, is_study: study },
          t,
        ).catch(() => ({ items: [] as Record<string, unknown>[] }));
        const items = data.items || [];
        if (page === 0) {
          if (study === 1) totals.учится += Number(data.total) || items.length;
          if (study === 0) totals.лид += Number(data.total) || items.length;
          if (study === 2) totals.архив += Number(data.total) || items.length;
        }
        for (const it of items) {
          const id = Number(it.id || 0);
          if (!id) continue;
          if (study === 1) {
            current.add(id);
            if (!currentBranches.has(id)) currentBranches.set(id, new Set());
            currentBranches.get(id)!.add(branch);
          } else if (study === 0) leads.add(id);
          else archive.add(id);
        }
        if (items.length < 50) break;
      }
    }
  }
  const store = loadStore();
  let marked = 0;
  for (const d of store.items) {
    const id = Number(d.crmId || 0);
    if (!id) continue;
    d.extras = d.extras || {};
    if (current.has(id)) {
      d.extras.is_study = "1";
      d.extras.removed = "0";
      d.extras.crm_current_branches = [...(currentBranches.get(id) || [])].join(",");
      d.status = "учится";
      const first = [...(currentBranches.get(id) || [])][0];
      if (first) {
        d.branchId = first;
        d.branch = BRANCH_TITLE[first] || d.branch;
      }
    } else if (leads.has(id) && !archive.has(id)) {
      d.extras.is_study = "0";
      d.extras.removed = "0";
      d.status = "лид";
    } else if (archive.has(id)) {
      d.extras.is_study = "2";
      d.extras.removed = "0";
      d.status = "архив";
    } else {
      d.extras.removed = "1";
      d.status = "удалён";
    }
    marked += 1;
  }
  store.lastCrmSync = new Date().toISOString();
  saveStore(store);
  const views = searchClientViews("", 1, "учится");
  return {
    ok: true as const,
    crm: totals,
    currentIds: current.size,
    leadIds: leads.size,
    archiveIds: archive.size,
    marked,
    counts: views.counts,
    lastCrmSync: store.lastCrmSync,
  };
}

function viewOf(d: Dossier) {
  const ex = d.extras || {};
  const fromGroup = namesFromGroup(ex.groups);
  const removed = String(ex.removed || "") === "1";
  const studyRaw = String(ex.is_study ?? "");
  const study = studyRaw === "" ? null : Number(studyRaw);
  const current = String(ex.crm_current || "") === "1" || study === 1;
  const status = removed
    ? "удалён"
    : d.status === "снят" && !current
      ? "снят"
      : current
        ? "учится"
        : study === 0
          ? "лид"
          : study === 2
            ? "архив"
            : d.status === "учится" || d.status === "лид" || d.status === "архив"
              ? d.status
              : "удалён";
  const studyStatus = studyMeta({ study_status_id: ex.study_status_id })?.name || "";
  const coursesNow = uniq([...(d.coursesNow || []), ...((d.groupLinks || []).filter((g) => g.active).map((g) => g.name)), ...(status === "учится" ? fromGroup.courses : [])]);
  const coursesPast = uniq([...(d.coursesPast || []), ...((d.groupLinks || []).filter((g) => !g.active).map((g) => g.name)), ...(status !== "учится" ? fromGroup.courses : [])]);
  const teachers = uniq([...(d.teachers || []), ...fromGroup.teachers]);
  const schools = uniq([
    ...(d.schools || []),
    ...(d.groupLinks || []).map((g) => g.school),
    ...coursesNow.map(schoolOfText),
    ...coursesPast.map(schoolOfText),
  ].filter(Boolean));
  const age = d.age || ageFromDob(d.child.dob);
  const gender = d.child.gender || genderFromFio(d.child.fio) || "";
  const child = isPhoneLike(d.child.fio) ? "" : d.child.fio;
  const parent = isPhoneLike(d.parent.fio) ? "" : d.parent.fio;
  const home = Number(d.branchId) || 0;
  const branchIds = home ? [home] : [];
  const links = (d.groupLinks || []).length ? d.groupLinks || [] : groupsFromItem({ groups: parseJsonish(ex.groups) || ex.groups }, home);
  return {
    id: d.id,
    crmId: d.crmId || null,
    cardId: d.crmId ? clientCardId(d.crmId) : "",
    branchId: d.branchId || null,
    url: d.url || "",
    child,
    displayName: displayPersonName(child, parent),
    gender,
    dob: d.child.dob || "",
    age: age ?? null,
    ageBand: ageBandOf(age),
    parent,
    phone: d.phones[0] || d.phoneDigits,
    city: d.city || "",
    branch: d.branch || "",
    branchIds,
    courses: uniq([...coursesNow, ...coursesPast]),
    coursesNow,
    coursesPast,
    schools,
    teachers,
    tariff: d.tariff || "",
    status,
    studyStatus,
    groupLinks: links,
    archived: status === "архив",
    leadStatusId: Number(ex.lead_status_id || 0),
    note: String(d.note || ex.note || "").replace(/<[^>]+>/g, "").trim().slice(0, 280),
    updatedAt: d.updatedAt,
  };
}

export type ClientView = ReturnType<typeof viewOf>;

export function groupRoster(branchId: number, groupId: number) {
  const store = loadStore();
  const active: {
    id: number;
    name: string;
    parent: string;
    dob: string;
    age: string;
    phone: string;
    phones: string[];
    email: string;
    gender: string;
    from: string;
    to: string;
    archived: boolean;
    status: string;
  }[] = [];
  const archive: typeof active = [];
  for (const d of store.items) {
    const home = Number(d.branchId) || branchId;
    const links = (d.groupLinks || []).length
      ? d.groupLinks || []
      : groupsFromItem({ groups: parseJsonish(d.extras?.groups) || d.extras?.groups }, home);
    const hit = links.some((g) => Number(g.id) === groupId && (!g.branchId || !branchId || Number(g.branchId) === branchId));
    if (!hit) continue;
    const id = Number(d.crmId || 0);
    if (!id) continue;
    const v = viewOf(d);
    const m = {
      id,
      name: v.child,
      parent: v.parent,
      dob: v.dob || "",
      age: v.age == null ? "" : `${v.age} лет`,
      phone: v.phone || "",
      phones: [v.phone].filter(Boolean),
      email: "",
      gender: v.gender || "",
      from: "",
      to: "",
      archived: v.archived,
      status: v.status === "лид" ? "лид" : v.archived || v.status === "архив" ? "архив" : "учится",
    };
    if (m.archived || m.status === "архив") archive.push(m);
    else active.push(m);
  }
  return { active, archive };
}

export function searchClientViews(q = "", limit = 2500, status = "", branchId = 0, ageBand = "") {
  const store = loadStore();
  const needle = String(q || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .trim();
  const words = needle.split(/\s+/).filter((w) => w.length > 1);
  const want = String(status || "").trim();
  if (!viewsMemo || viewsMemo.items !== store.items) viewsMemo = { items: store.items, views: store.items.map(viewOf) };
  const views = viewsMemo.views as ClientView[];
  const counts = { все: 0, учится: 0, лид: 0, архив: 0 };
  const branchCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const hidden = (d: ClientView) => d.status === "удалён" || d.status === "снят";
  for (const d of views) {
    if (hidden(d)) continue;
    counts.все += 1;
    if (d.status === "учится") counts.учится += 1;
    else if (d.status === "лид") counts.лид += 1;
    else if (d.status === "архив") counts.архив += 1;
  }
  const chipStatus = !want || want === "все" ? "" : want;
  for (const d of views) {
    if (hidden(d)) continue;
    if (chipStatus && d.status !== chipStatus) continue;
    const b = Number(d.branchId) || 0;
    if (branchCounts[b] != null) branchCounts[b] += 1;
  }
  const items = views.filter((d) => {
    if (hidden(d) && !needle) return false;
    if (hidden(d) && needle && d.status === "снят") return false;
    if (d.status === "архив" && want !== "архив") return false;
    if (want === "лид" && d.status !== "лид") return false;
    if (want && want !== "все") {
      if (d.status !== want) return false;
    } else if (!want && !needle) {
      if (d.status !== "учится") return false;
    }
    if (branchId && Number(d.branchId) !== branchId) return false;
    if (ageBand && d.ageBand !== ageBand) return false;
    if (!needle) return true;
    const hay = `${d.displayName} ${d.child} ${d.parent} ${d.phone} ${d.city} ${d.branch} ${d.courses.join(" ")} ${d.schools.join(" ")} ${d.gender} ${d.crmId || ""} ${d.cardId || ""}`
      .toLowerCase()
      .replace(/ё/g, "е");
    if (hay.includes(needle)) return true;
    return words.length > 0 && words.every((w) => hay.includes(w));
  });
  items.sort((a, b) => (a.displayName || a.child || "").localeCompare(b.displayName || b.child || "", "ru"));
  return {
    items: items.slice(0, limit),
    total: items.length,
    all: store.items.length,
    counts,
    branchCounts,
    lastCrmSync: store.lastCrmSync || "",
  };
}

export async function handleAdminDossiers(data: DossiersReq) {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const store = loadStore();
    if (data.action === "get" && data.id) {
      const one = store.items.find((d) => d.id === data.id);
      if (!one) return { ok: false as const, error: "Дело не найдено." };
      return { ok: true as const, dossier: one };
    }
    if (data.action === "reclassify") {
      try {
        const res = await reclassifyRolesFromCrm();
        return res;
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Не удалось сверить статусы с AlfaCRM." };
      }
    }
    if (data.action === "syncAll") {
      try {
        const res = await syncAllFromCrm();
        return { ok: true as const, ...res };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "CRM" };
      }
    }
    if (data.action === "syncSlice") {
      try {
        const res = await syncSliceFromCrm({
          branchId: Number(data.branchId) || 1,
          isStudy: data.isStudy,
          removed: Boolean(data.removed),
          page: Number(data.page) || 0,
          pages: Number(data.pages) || 3,
        });
        return { ok: true as const, ...res };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "CRM не ответила на этот шаг." };
      }
    }
    if (data.action === "syncMembers") {
      try {
        const res = await syncMembershipsSlice(Number(data.offset) || 0, 8);
        return { ok: true as const, ...res };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Не удалось сверить состав групп." };
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
}
