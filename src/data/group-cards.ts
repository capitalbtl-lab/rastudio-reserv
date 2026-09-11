import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GroupCalLesson } from "./crm-slots-core";
import { pupilNameOk, mergeLessonPupils } from "./crm-slots-core";
import { rememberLessons } from "./crm-lessons";
import { nextLocalId } from "./crm-local-id";
import { mergeJournalInbound, collapseLessonRows } from "./crm-inbound-core";
import { journalForCustomer, calendarLessonForCard, lessonBranchOf } from "./crm-journal-core";
import { chargeFromPupils } from "./crm-ledger-core";
import { findDossier } from "./dossiers";
import { cardPays } from "./crm-pay";

export type CachedGroupCard = {
  id: number;
  branchId: number;
  name: string;
  note: string;
  description: string;
  remarks: string;
  hashtags: string;
  makeup: string;
  statusId: number;
  bDate: string;
  eDate: string;
  levelId: number;
  signup: string;
  /** Предмет CRM. Карточка группы ключуется branchId+id (=groupId). */
  subjectId: number;
  subject: string;
  priority?: number;
  calendar: GroupCalLesson[];
  at: string;
  /** Когда журнал группы последний раз дочитали из Alfa (даже если занятий 0). */
  journalAt?: string;
  /** Какие кварталы уже сняли с Alfa. pulled — только ручные нажатия, не вывод из календаря. rechecked — повторная сверка, дубликаты проверили. */
  journalFill?: { done: string[]; fail?: Record<string, string>; pulled?: Record<string, string>; weak?: string[]; rechecked?: string[] };
  /** Срок жизни группы: по расписанию или по первой/последней явке Alfa. */
  journalLife?: { from: string; to: string; source: "slot" | "alfa"; at: string };
};

type CardMem = { mtime: number; card: CachedGroupCard };
const cardMem = new Map<string, CardMem>();

function cardsDir() {
  return join(process.cwd(), "storage", "group-cards");
}

function cardFile(branchId: number, gid: number) {
  return join(cardsDir(), `${branchId}-${gid}.json`);
}

function key(branchId: number, gid: number) {
  return `${branchId}-${gid}`;
}

export function loadGroupCard(branchId: number, gid: number): CachedGroupCard | null {
  const p = cardFile(branchId, gid);
  try {
    if (!existsSync(p)) return null;
    const mtime = statSync(p).mtimeMs;
    const k = key(branchId, gid);
    const hit = cardMem.get(k);
    if (hit && hit.mtime === mtime) return hit.card;
    const raw = JSON.parse(readFileSync(p, "utf8")) as CachedGroupCard;
    if (!raw || typeof raw !== "object") return null;
    cardMem.set(k, { mtime, card: raw });
    return raw;
  } catch {
    return null;
  }
}

export function saveGroupCard(card: CachedGroupCard) {
  saveGroupCards([card]);
}

export function saveGroupCards(cards: CachedGroupCard[]) {
  if (!cards.length) return;
  mkdirSync(cardsDir(), { recursive: true });
  const at = new Date().toISOString();
  for (const card of cards) {
    const next = { ...card, at };
    const p = cardFile(card.branchId, card.id);
    writeFileSync(p, JSON.stringify(next), "utf8");
    let mtime = Date.now();
    try {
      mtime = statSync(p).mtimeMs;
    } catch {
      /* */
    }
    cardMem.set(key(card.branchId, card.id), { mtime, card: next });
  }
}

export function listGroupCards(): CachedGroupCard[] {
  try {
    if (!existsSync(cardsDir())) return [];
    const out: CachedGroupCard[] = [];
    for (const name of readdirSync(cardsDir())) {
      const m = /^(\d+)-(\d+)\.json$/.exec(name);
      if (!m) continue;
      const card = loadGroupCard(Number(m[1]), Number(m[2]));
      if (card) out.push(card);
    }
    return out;
  } catch {
    return [];
  }
}

export type HydrateFill = {
  branchId: number;
  groupId: number;
  pulled?: Record<string, string>;
  rechecked?: string[];
  weak?: string[];
  fail?: Record<string, string>;
  life?: { from: string; to: string; source: string };
};

/** Один раз: ночной group-cards.json → файлы по группам. Alfa не трогает. */
export function hydrateGroupCardsFromMonolith(): { n: number; fills: HydrateFill[]; skip?: string } {
  const flag = join(cardsDir(), ".hydrated");
  try {
    if (existsSync(flag)) return { n: 0, fills: [], skip: "ok" };
    const mega = join(process.cwd(), "storage", "group-cards.json");
    if (!existsSync(mega)) {
      mkdirSync(cardsDir(), { recursive: true });
      writeFileSync(flag, new Date().toISOString(), "utf8");
      return { n: 0, fills: [], skip: "нет общего файла" };
    }
    const raw = JSON.parse(readFileSync(mega, "utf8")) as { items?: Record<string, CachedGroupCard> };
    const items = raw?.items && typeof raw.items === "object" ? Object.values(raw.items) : [];
    mkdirSync(cardsDir(), { recursive: true });
    let n = 0;
    const fills: HydrateFill[] = [];
    for (const card of items) {
      const gid = Number(card?.id) || 0;
      const bid = Number(card?.branchId) || 0;
      if (!gid || !bid) continue;
      const prev = loadGroupCard(bid, gid);
      const nextN = (card.calendar || []).length;
      const prevN = (prev?.calendar || []).length;
      if (!prev || nextN > prevN) {
        const p = cardFile(bid, gid);
        writeFileSync(p, JSON.stringify({ ...card, id: gid, branchId: bid }), "utf8");
        try {
          cardMem.set(key(bid, gid), { mtime: statSync(p).mtimeMs, card: { ...card, id: gid, branchId: bid } });
        } catch {
          /* */
        }
        n += 1;
      }
      const fill = card.journalFill || prev?.journalFill;
      const life = card.journalLife || prev?.journalLife;
      if (fill || life) {
        fills.push({
          branchId: bid,
          groupId: gid,
          pulled: fill?.pulled,
          rechecked: fill?.rechecked,
          weak: fill?.weak,
          fail: fill?.fail,
          life: life ? { from: String(life.from || ""), to: String(life.to || ""), source: String(life.source || "") } : undefined,
        });
      }
    }
    writeFileSync(flag, new Date().toISOString(), "utf8");
    return { n, fills };
  } catch (e) {
    return { n: 0, fills: [], skip: e instanceof Error ? e.message.slice(0, 80) : "не разобрали" };
  }
}

export function nextLocalLessonId() {
  const used: number[] = [];
  for (const card of listGroupCards()) {
    for (const l of card.calendar || []) used.push(Number(l.lessonId) || 0);
  }
  for (const cid of listCustomerCalIds()) {
    for (const l of loadCustomerCalendar(cid)) used.push(Number(l.lessonId) || 0);
  }
  return nextLocalId(used);
}

function mergeLessonPatch(old: GroupCalLesson, row: GroupCalLesson): GroupCalLesson {
  const newN = row.pupils?.length || 0;
  const oldN = old.pupils?.length || 0;
  const pupils =
    newN >= oldN && newN
      ? mergeLessonPupils(old.pupils, row.pupils)
      : mergeLessonPupils(row.pupils, old.pupils) || old.pupils || row.pupils;
  return {
    ...old,
    ...row,
    topic: String(row.topic || "").trim() || old.topic,
    homework: String(row.homework || "").trim() || old.homework,
    note: String(row.note || "").trim() || old.note,
    detailsAt: old.detailsAt || row.detailsAt,
    pupils: pupils?.length ? pupils : row.pupils || old.pupils,
    customerIds: row.customerIds?.length ? row.customerIds : old.customerIds || (pupils || []).map((p) => p.customerId),
    amount: Number(row.amount) > 0 ? row.amount : old.amount,
    cttId: Number(row.cttId) > 0 ? row.cttId : old.cttId,
    lessonId: Number(row.lessonId) || old.lessonId,
  };
}

function mergeLessonInto(cal: GroupCalLesson[], lesson: GroupCalLesson) {
  const lid = Number(lesson.lessonId) || 0;
  const date = String(lesson.date || "");
  const from = String(lesson.from || "");
  const next = cal.filter((x) => {
    const xid = Number(x.lessonId) || 0;
    if (lid && xid === lid) return false;
    if (date && String(x.date) === date && String(x.from || "") === from && (!xid || !lid || xid === lid)) return false;
    return true;
  });
  const twins = cal.filter((x) => {
    const xid = Number(x.lessonId) || 0;
    if (lid && xid === lid) return true;
    if (date && String(x.date) === date && String(x.from || "") === from && (!xid || !lid)) return true;
    return false;
  });
  let item = lesson;
  for (const old of twins) item = mergeLessonPatch(old, item);
  next.push(item);
  return { list: next, item };
}

function calsDir() {
  return join(process.cwd(), "storage", "customer-cals");
}

function oneCal(id: number) {
  return join(calsDir(), `${id}.json`);
}

type CalMem = { mtime: number; list: GroupCalLesson[] };
const calMem = new Map<string, CalMem>();

function listCustomerCalIds(): number[] {
  try {
    if (!existsSync(calsDir())) return [];
    const out: number[] = [];
    for (const name of readdirSync(calsDir())) {
      const m = /^(\d+)\.json$/.exec(name);
      if (m) out.push(Number(m[1]));
    }
    return out;
  } catch {
    return [];
  }
}

export function loadCustomerCalendar(customerId: number): GroupCalLesson[] {
  const id = Number(customerId) || 0;
  if (!id) return [];
  const p = oneCal(id);
  try {
    if (!existsSync(p)) return [];
    const mtime = statSync(p).mtimeMs;
    const k = String(id);
    const hit = calMem.get(k);
    if (hit && hit.mtime === mtime) return hit.list;
    const raw = JSON.parse(readFileSync(p, "utf8")) as GroupCalLesson[] | { items?: GroupCalLesson[] };
    const list = Array.isArray(raw) ? raw : Array.isArray(raw.items) ? raw.items : [];
    calMem.set(k, { mtime, list });
    return list;
  } catch {
    return [];
  }
}

function saveCustomerCalendarList(id: number, list: GroupCalLesson[]) {
  mkdirSync(calsDir(), { recursive: true });
  const p = oneCal(id);
  writeFileSync(p, JSON.stringify(list), "utf8");
  let mtime = Date.now();
  try {
    mtime = statSync(p).mtimeMs;
  } catch {
    /* */
  }
  calMem.set(String(id), { mtime, list });
}

export function upsertCustomerCalendar(customerId: number, lesson: GroupCalLesson) {
  const id = Number(customerId) || 0;
  if (!id) return [];
  const { list, item } = mergeLessonInto(loadCustomerCalendar(id), lesson);
  saveCustomerCalendarList(id, list);
  rememberLessons([item]);
  return list;
}

export function replaceCustomerCalendar(customerId: number, lessons: GroupCalLesson[]) {
  const id = Number(customerId) || 0;
  if (!id) return [];
  const list = collapseLessonRows(lessons || []).slice(0, 2500);
  saveCustomerCalendarList(id, list);
  rememberLessons(list);
  return list;
}

function fioOf(cid: number) {
  const d = findDossier({ crmId: cid });
  const fromDossier = String(d?.child?.fio || d?.parent?.fio || "").trim();
  if (fromDossier) return fromDossier;
  for (const row of cardPays(cid)) {
    const pay = pupilNameOk(row.customerName);
    if (pay) return pay;
  }
  return "";
}

function withPupilFio(lesson: GroupCalLesson): GroupCalLesson {
  const ids = (lesson.customerIds || []).map(Number).filter((n) => n > 0);
  const base = lesson.pupils?.length
    ? lesson.pupils
    : ids.map((customerId) => ({ customerId, attend: true as boolean }));
  if (!base.length) return lesson;
  const pupils = base.map((p) => {
    const have = String((p as { name?: string }).name || "");
    if (pupilNameOk(have)) return p;
    const name = fioOf(p.customerId);
    return name ? { ...p, name } : p;
  });
  return {
    ...lesson,
    pupils,
    customerIds: ids.length ? ids : pupils.map((p) => p.customerId).filter((n) => n > 0),
  };
}

export function journalGroupsOfCustomer(
  customerId: number,
  linked: { id: number; branchId: number; name?: string; subjectId?: number }[] = [],
) {
  const id = Number(customerId) || 0;
  const seen = new Set(linked.map((g) => `${Number(g.branchId) || 0}-${Number(g.id) || 0}`));
  const out = linked.map((g) => ({ id: g.id, branchId: g.branchId, name: g.name, subjectId: g.subjectId }));
  if (!id) return out;
  for (const card of listGroupCards()) {
    const k = `${Number(card.branchId) || 0}-${Number(card.id) || 0}`;
    if (seen.has(k)) continue;
    const hit = (card.calendar || []).some(
      (l) =>
        (l.customerIds || []).map(Number).includes(id) || (l.pupils || []).some((p) => Number(p.customerId) === id),
    );
    if (!hit) continue;
    seen.add(k);
    out.push({ id: card.id, branchId: card.branchId, name: card.name, subjectId: card.subjectId || undefined });
  }
  return out;
}

export function collectCustomerJournal(
  customerId: number,
  groups: { id: number; branchId: number; name?: string }[],
): GroupCalLesson[] {
  const out: GroupCalLesson[] = [];
  const seen = new Set<string>();
  const id = Number(customerId) || 0;
  const allGroups = journalGroupsOfCustomer(id, groups);
  const push = (les: GroupCalLesson, groupName?: string, fromOwn = false, groupBranch = 0) => {
    const ids = (les.customerIds || []).map(Number);
    const pupil = (les.pupils || []).some((p) => Number(p.customerId) === id);
    if (id && ids.length && !ids.includes(id) && !pupil) return;
    if (id && !ids.length && !pupil && !fromOwn) return;
    const charge = id ? chargeFromPupils(les, id) : { amount: Number(les.amount) || 0, cttId: Number(les.cttId) || 0 };
    const bid = lessonBranchOf(les, allGroups, groupBranch);
    const row: GroupCalLesson = withPupilFio({
      ...les,
      group: les.group || groupName || "",
      amount: charge.amount || les.amount,
      cttId: charge.cttId || les.cttId,
      ...(bid ? { branchId: bid } : {}),
    });
    if (groups.length && !fromOwn && !calendarLessonForCard(row, allGroups, id)) return;
    const key = String(row.lessonId || `${row.date}|${row.from}|${row.type}|${row.group}`);
    const prev = seen.has(key) ? out.find((x) => String(x.lessonId || `${x.date}|${x.from}|${x.type}|${x.group}`) === key) : undefined;
    if (prev) {
      if (!(Number(prev.amount) > 0) && Number(row.amount) > 0) prev.amount = row.amount;
      if (!(Number(prev.cttId) > 0) && Number(row.cttId) > 0) prev.cttId = row.cttId;
      const merged = mergeLessonPupils(prev.pupils, row.pupils);
      if (merged?.length) {
        prev.pupils = merged;
        prev.total = merged.length;
        prev.attend = merged.filter((p) => p.attend !== false).length;
      }
      const idsA = prev.customerIds || [];
      const idsB = row.customerIds || [];
      if (idsB.length > idsA.length) prev.customerIds = idsB;
      else if (!idsA.length && merged?.length) prev.customerIds = merged.map((p) => p.customerId);
      if ((Number(row.total) || 0) > (Number(prev.total) || 0) && !merged?.length) prev.total = row.total;
      if ((Number(row.attend) || 0) > (Number(prev.attend) || 0) && !merged?.length) prev.attend = row.attend;
      if (!String(prev.topic || "").trim() && String(row.topic || "").trim()) prev.topic = row.topic;
      if (!String(prev.homework || "").trim() && String(row.homework || "").trim()) prev.homework = row.homework;
      if (!String(prev.note || "").trim() && String(row.note || "").trim()) prev.note = row.note;
      if (!prev.detailsAt && row.detailsAt) prev.detailsAt = row.detailsAt;
      if (!prev.teacher && row.teacher) prev.teacher = row.teacher;
      if (!prev.subject && row.subject) prev.subject = row.subject;
      if (!prev.group && row.group) prev.group = row.group;
      if (!prev.branchId && row.branchId) prev.branchId = row.branchId;
      return;
    }
    seen.add(key);
    out.push(row);
  };
  for (const les of loadCustomerCalendar(customerId)) push(les, undefined, true);
  for (const g of allGroups) {
    const gcard = loadGroupCard(g.branchId, g.id);
    for (const les of journalForCustomer(gcard?.calendar || [], customerId)) push(les, g.name, false, g.branchId);
    for (const les of gcard?.calendar || []) {
      if ((les.pupils || []).some((p) => Number(p.customerId) === id)) push(les, g.name, true, g.branchId);
      else if ((les.customerIds || []).map(Number).includes(id)) push(les, g.name, true, g.branchId);
    }
  }
  return out.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.from || "").localeCompare(String(b.from || "")));
}

/** Явка ученика с занятия — в его журнал на диске. Любой статус: план, пропуск, проведено. */
export function fanOutLessonWriteoffs(lessons: GroupCalLesson[]) {
  const rows = (lessons || []).filter((l) => {
    if ((l.pupils || []).length) return true;
    return (l.customerIds || []).some((n) => Number(n) > 0);
  });
  if (!rows.length) return 0;
  let n = 0;
  const byCid = new Map<number, GroupCalLesson[]>();
  for (const lesson of rows) {
    const cids = new Set<number>();
    for (const p of lesson.pupils || []) {
      const cid = Number(p.customerId) || 0;
      if (cid) cids.add(cid);
    }
    for (const raw of lesson.customerIds || []) {
      const cid = Number(raw) || 0;
      if (cid) cids.add(cid);
    }
    for (const cid of cids) {
      const charge = chargeFromPupils(lesson, cid);
      const prev = byCid.get(cid) || loadCustomerCalendar(cid);
      const { list } = mergeLessonInto(prev, {
        ...lesson,
        amount: charge.amount || undefined,
        cttId: charge.cttId || undefined,
      });
      byCid.set(cid, list);
      n += 1;
    }
  }
  for (const [cid, list] of byCid) {
    saveCustomerCalendarList(
      cid,
      list
        .slice()
        .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.from || "").localeCompare(String(b.from || "")))
        .slice(-8000),
    );
  }
  return n;
}

export function upsertGroupCalendar(
  branchId: number,
  gid: number,
  lesson: GroupCalLesson,
  seed?: Partial<CachedGroupCard>,
) {
  const prev = loadGroupCard(branchId, gid);
  const card: CachedGroupCard = prev || {
    id: gid,
    branchId,
    name: seed?.name || `группа ${gid}`,
    note: seed?.note || "",
    description: seed?.description || "",
    remarks: seed?.remarks || "",
    hashtags: seed?.hashtags || "",
    makeup: seed?.makeup || "",
    statusId: Number(seed?.statusId || 0),
    bDate: seed?.bDate || "",
    eDate: seed?.eDate || "",
    levelId: Number(seed?.levelId || 0),
    signup: seed?.signup || "",
    subjectId: Number(seed?.subjectId || lesson.subjectId || 0),
    subject: seed?.subject || lesson.subject || "",
    calendar: [],
    at: "",
  };
  const { list: cal, item } = mergeLessonInto(card.calendar || [], lesson);
  const next = { ...card, calendar: cal };
  saveGroupCard(next);
  rememberLessons([item]);
  return next;
}

export function mergeLocalCalendar(
  pulled: GroupCalLesson[],
  prev: GroupCalLesson[] | undefined,
  holdIds?: Iterable<number>,
  mode: "replace" | "union" = "union",
): GroupCalLesson[] {
  const list = mergeJournalInbound(pulled, prev, holdIds, mode);
  if (!prev?.length) return list;
  const prevMap = new Map(prev.map((x) => [String(x.lessonId || `${x.date}|${x.from}`), x]));
  return list.map((row) => {
    const old = prevMap.get(String(row.lessonId || `${row.date}|${row.from}`));
    if (!old) return row;
    return mergeLessonPatch(old, row);
  });
}

export function applyCreatedCalendarLesson(localId: number, crmId: number) {
  const from = Number(localId) || 0;
  const to = Number(crmId) || 0;
  if (!from || !to || from === to) return;
  const remapped: GroupCalLesson[] = [];
  for (const card of listGroupCards()) {
    let changed = false;
    const calendar = (card.calendar || []).map((x) => {
      if (Number(x.lessonId) !== from) return x;
      changed = true;
      const next = { ...x, lessonId: to };
      remapped.push(next);
      return next;
    });
    if (changed) saveGroupCard({ ...card, calendar });
  }
  for (const cid of listCustomerCalIds()) {
    const list = loadCustomerCalendar(cid);
    let hit = false;
    const calendar = list.map((x) => {
      if (Number(x.lessonId) !== from) return x;
      hit = true;
      const next = { ...x, lessonId: to };
      remapped.push(next);
      return next;
    });
    if (hit) saveCustomerCalendarList(cid, calendar);
  }
  if (remapped.length) rememberLessons(remapped);
}

export function groupCardsExist() {
  try {
    return existsSync(cardsDir()) && readdirSync(cardsDir()).some((n) => /^\d+-\d+\.json$/.test(n));
  } catch {
    return false;
  }
}

export function groupFactsForVoice(limit = 80) {
  return listGroupCards()
    .slice(0, limit)
    .map((g) => {
      const last = [...g.calendar].sort((a, b) => b.date.localeCompare(a.date))[0];
      return [
        `gid ${g.id}`,
        g.name,
        g.subject,
        g.note,
        g.statusId ? `status ${g.statusId}` : "",
        g.bDate && g.eDate ? `${g.bDate}–${g.eDate}` : "",
        last ? `последнее ${last.date} ${last.type} ст.${last.status}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
    });
}
