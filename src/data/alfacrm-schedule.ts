import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CmsSession } from "@/data/cms";
import { request, token } from "@/data/alfacrm";
import { agesOverlap } from "@/data/ages";
import { courseOf, dayLabel, schoolOf, slotFromSession, stampTimes, toSession, normalizeArtSlot, beatsOf, stampSubjects, type CrmSlot } from "@/data/crm-slots";
import { applyScheduleMap } from "@/data/schedule-map";

const SKIP_SUBJECT = new Set([7, 54, 104, 85, 81, 1, 77, 106, 82, 105, 83, 90, 84, 88, 87]);
const DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const DAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const SUBJECT_PATH: Record<number, string> = {
  12: "/art-studio-3-4",
  116: "/art-studio-3-4",
  13: "/art-studio-5-6",
  14: "/art-studio-7-8",
  92: "/art-studio-9-13",
  115: "/art-studio-9-13",
  5: "/podgotovka-v-hudvuz",
  11: "/sculptural-studio",
  97: "/digitalartschool",
  36: "/robototehnika-5-7",
  37: "/robototehnika-7-9",
  35: "/robototehnika-10-14",
  114: "/roboticsinenglish",
  46: "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-python",
  48: "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-си",
  52: "/kursy-shkoly-programmirovaniya/it-школа-разработка-игр-на-unity",
  43: "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-5-7-лет",
  98: "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-7-9-лет",
  15: "/kursy-shkoly-programmirovaniya/it-лаборатория-dev-для-детей-9-10-лет",
  107: "/gamedesign",
  39: "/3d-modeling",
  27: "/science-course",
  89: "/teslaphysics",
  67: "/radioengineering",
  25: "/robototehnika-v-kolomne",
  16: "/preparation-for-school",
  108: "/happybricks",
  109: "/science-course",
  4: "/model-school",
  110: "/englishlanguagesm",
  111: "/englishlanguagegg",
  112: "/vitaminkorean",
  113: "/japanese",
};

const BRANCH: Record<number, { city: string; branch: string; short: string }> = {
  1: { city: "Коломна", branch: "ул. Гражданская, 2", short: "Гражданская" },
  2: { city: "Коломна", branch: "ЦМИТ, ул. Октябрьской революции, 340", short: "ЦМИТ / Октябрьской" },
  3: { city: "Луховицы", branch: "ул. Пушкина, 202А", short: "Луховицы" },
  4: { city: "Коломна", branch: "летние программы", short: "Лето" },
};

type Group = {
  id: number;
  name: string;
  note?: string;
  limit?: number;
  status_id?: number;
  teacher_ids?: number[];
  b_date?: string;
  e_date?: string;
  subject_id?: number;
};
type Lesson = {
  id: number;
  related_id?: number | null;
  subject_id?: number;
  branch_id?: number;
  day?: number;
  time_from_v?: string;
  time_to_v?: string;
  time_from?: string;
  time_to?: string;
  teacher_ids?: number[];
  room_id?: number;
};
type Subject = { id: number; name: string };
type Teacher = { id: number; name?: string };
type CrmLesson = { group_ids?: number[]; customer_ids?: number[]; date?: string };

type SeatInfo = { limit: number; taken: number };
type CacheBag = { at: number; sessions: CmsSession[]; seats: Map<string, SeatInfo>; slots: CrmSlot[] };

let cache: CacheBag | null = null;
const TTL = 10 * 60 * 1000;

function endedOn(raw?: string) {
  const s = String(raw || "").trim();
  if (!s) return false;
  let y = 0, m = 0, d = 0;
  const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ru) {
    d = Number(ru[1]);
    m = Number(ru[2]);
    y = Number(ru[3]);
  } else if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else return false;
  const end = new Date(y, m - 1, d);
  if (Number.isNaN(end.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return end < today;
}

function isLiveGroup(group?: Group): group is Group {
  if (!group) return false;
  if (Number(group.status_id) === 2) return false;
  if (/архив|отложен/i.test(group.name || "")) return false;
  if (endedOn(group.e_date)) return false;
  return true;
}

function isLiveSlot(s: CrmSlot) {
  if (Number(s.statusId) === 2) return false;
  if (/архив|отложен/i.test(s.groupName || "")) return false;
  if (endedOn(s.eDate)) return false;
  return true;
}

function snapFile() {
  return join(process.cwd(), "storage", "crm-schedule.json");
}

function writeSnap(bag: CacheBag) {
  mkdirSync(dirname(snapFile()), { recursive: true });
  writeFileSync(
    snapFile(),
    JSON.stringify(
      {
        at: bag.at,
        sessions: bag.sessions,
        seats: [...bag.seats.entries()],
        slots: bag.slots,
      },
      null,
      0,
    ),
    "utf8",
  );
}

function readSnap(): CacheBag | null {
  try {
    if (!existsSync(snapFile())) return null;
    const raw = JSON.parse(readFileSync(snapFile(), "utf8")) as {
      at?: number;
      sessions?: CmsSession[];
      seats?: [string, SeatInfo][];
      slots?: CrmSlot[];
    };
    if (!Array.isArray(raw.sessions) || !raw.sessions.length) return null;
    return {
      at: Number(raw.at) || 0,
      sessions: raw.sessions,
      seats: new Map(raw.seats || []),
      slots: Array.isArray(raw.slots) ? raw.slots : [],
    };
  } catch {
    return null;
  }
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function seatKey(branch: number, gid: string | number) {
  return `${branch}:${gid}`;
}

function waitDays(crmDay?: number) {
  const today = ((new Date().getDay() + 6) % 7) + 1;
  const day = Number(crmDay) || 1;
  return (day - today + 7) % 7;
}

function crmDayOf(when: string) {
  const i = DAYS.findIndex((d) => when.startsWith(d));
  return i >= 0 ? i + 1 : 1;
}

async function loadSeats(branch: number, t: string) {
  const taken = new Map<number, number>();
  const from = iso(new Date(Date.now() - 100 * 86400000));
  const to = iso(new Date(Date.now() + 50 * 86400000));
  for (let page = 0; page < 5; page++) {
    const res = await request<{ items?: CrmLesson[] }>(
      `/v2api/${branch}/lesson/index`,
      { page, pageSize: 100, date_from: from, date_to: to },
      t,
    );
    for (const lesson of res.items || []) {
      const gid = Number(lesson.group_ids?.[0] || 0);
      if (!gid) continue;
      const n = (lesson.customer_ids || []).length;
      taken.set(gid, Math.max(taken.get(gid) || 0, n));
    }
    if ((res.items || []).length < 100) break;
  }
  return taken;
}

function ageOf(name: string) {
  const m = name.match(/(\d+\s*[–-]\s*\d+\s*(?:лет|года)?|\d+\s*\+\s*|от\s*\d+\s*лет|\d+\s*лет)/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function whenOf(day?: number, from?: string, to?: string) {
  const label = DAYS[(Number(day) || 1) - 1] || "День уточняется";
  if (from && to) return `${label} с ${from} до ${to}`;
  if (from) return `${label} в ${from}`;
  return label;
}

export function signupUrl(branch: number, gid: string | number) {
  return `https://studiyarazvivaysya.s20.online/common/${branch}/lead/create?gid=${gid}`;
}

export function sessionsFromSlots(slots: CrmSlot[]): CmsSession[] {
  return stampTimes(slots.map((s) => normalizeArtSlot({ ...s })))
    .filter((s) => s.school !== "Прочее" && s.statusId !== 2 && !/отложен/i.test(s.groupName))
    .flatMap((s) => {
      const beats = beatsOf(s);
      return beats.map((b, i) =>
        toSession({
          ...s,
          id: beats.length > 1 ? `${s.id}-b${i}` : s.id,
          day: b.day,
          dayLabel: dayLabel(b.day),
          timeFrom: b.timeFrom,
          timeTo: b.timeTo,
          timesPerWeek: beats.length,
        }),
      );
    });
}

function gidKey(s: CrmSlot) {
  return s.groupId ? `${s.branchId}:${s.groupId}` : "";
}

export function mergeCrmIntoSite(incoming: CrmSlot[], existing: CrmSlot[]) {
  const prev = new Map<string, CrmSlot>();
  for (const s of existing) {
    const k = gidKey(s);
    if (k) prev.set(k, s);
  }
  const seen = new Set<string>();
  let added = 0;
  let updated = 0;
  const out: CrmSlot[] = [];
  for (const s of incoming) {
    const k = gidKey(s);
    if (k) seen.add(k);
    const old = k ? prev.get(k) : undefined;
    if (old) {
      out.push({
        ...old,
        ...s,
        school: s.school && s.school !== "Прочее" ? s.school : old.school,
        course: s.course || old.course,
        path: s.path || old.path,
        age: s.age || old.age,
        beats: s.beats?.length ? s.beats : old.beats,
      });
      updated += 1;
    } else {
      out.push(s);
      added += 1;
    }
  }
  for (const s of existing) {
    const k = gidKey(s);
    if (k && seen.has(k)) continue;
    if (!k || String(s.id).startsWith("local-")) out.push(s);
  }
  return { slots: applyScheduleMap(stampSubjects(stampTimes(out))), added, updated };
}

export async function sessionsFromCrm(): Promise<CmsSession[]> {
  const local = listAdminSlots();
  if (local.length) return sessionsFromSlots(local);
  try {
    const bag = await loadCrm();
    if (bag.slots?.length) return sessionsFromSlots(bag.slots);
    return bag.sessions;
  } catch {
    return [];
  }
}

export async function refreshCrmSchedule() {
  const existing = listAdminSlots();
  cache = null;
  const bag = await loadCrm(true);
  const merged = mergeCrmIntoSite(stampTimes((bag.slots || []).map(normalizeArtSlot)), existing);
  const saved = saveAdminSlots(merged.slots);
  return {
    at: new Date(saved.at).toISOString(),
    count: saved.slots.length,
    sessions: saved.sessions,
    slots: saved.slots,
    added: merged.added,
    updated: merged.updated,
  };
}

export function crmScheduleMeta() {
  const snap = cache || readSnap();
  return {
    at: snap?.at ? new Date(snap.at).toISOString() : "",
    count: snap?.slots?.length || snap?.sessions.length || 0,
  };
}

export function listAdminSlots(): CrmSlot[] {
  const snap = cache || readSnap();
  const raw = snap?.slots?.length ? snap.slots : (snap?.sessions || []).map(slotFromSession);
  return applyScheduleMap(stampSubjects(stampTimes(raw.map(normalizeArtSlot)))).filter(isLiveSlot);
}

export function bindSubjectsOnSite() {
  const snap = cache || readSnap();
  const raw = snap?.slots?.length ? snap.slots : (snap?.sessions || []).map(slotFromSession);
  const stamped = stampTimes((raw || []).map(normalizeArtSlot));
  const bound = applyScheduleMap(stampSubjects(stamped));
  const changed = bound.some(
    (s, i) => s.subjectId !== stamped[i]?.subjectId || s.subject !== stamped[i]?.subject || s.school !== stamped[i]?.school || s.path !== stamped[i]?.path,
  );
  if (changed) saveAdminSlots(bound);
  return { slots: bound, changed };
}

export function saveAdminSlots(slots: CrmSlot[]) {
  const stamped = applyScheduleMap(stampSubjects(stampTimes(slots.map((s) => normalizeArtSlot({ ...s }))))).filter(isLiveSlot);
  const sessions = sessionsFromSlots(stamped);
  const seats = cache?.seats || readSnap()?.seats || new Map();
  cache = { at: Date.now(), sessions, seats, slots: stamped };
  writeSnap(cache);
  return cache;
}

async function loadCrm(force = false): Promise<CacheBag> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache;
  if (!force) {
    const snap = readSnap();
    if (snap && Date.now() - snap.at < TTL) {
      cache = snap;
      return snap;
    }
  }
  const t = await token();
  const sessions: CmsSession[] = [];
  const slots: CrmSlot[] = [];
  const seats = new Map<string, SeatInfo>();
  const subjects = new Map<number, string>();
  const teachers = new Map<number, string>();
  const sub = await request<{ items?: Subject[] }>("/v2api/2/subject/index", { page: 0, pageSize: 200 }, t);
  for (const s of sub.items || []) subjects.set(s.id, s.name);
  for (const branch of [1, 2, 3]) {
    const tr = await request<{ items?: Teacher[] }>(`/v2api/${branch}/teacher/index`, { page: 0, pageSize: 200 }, t).catch(() => ({ items: [] as Teacher[] }));
    for (const p of tr.items || []) if (p.id) teachers.set(p.id, p.name || String(p.id));
    const groups = await request<{ items?: Group[] }>(`/v2api/${branch}/group/index`, { page: 0, pageSize: 200 }, t);
    const groupMap = new Map((groups.items || []).map((g) => [g.id, g]));
    const taken = await loadSeats(branch, t).catch(() => new Map<number, number>());
    for (const g of groups.items || []) {
      seats.set(seatKey(branch, g.id), { limit: Number(g.limit) || 0, taken: taken.get(g.id) || 0 });
    }
    const lessons = await request<{ items?: Lesson[] }>(
      `/v2api/${branch}/regular-lesson/index`,
      { page: 0, pageSize: 200 },
      t,
    );
    const meta = BRANCH[branch];
    for (const lesson of lessons.items || []) {
      const sid = Number(lesson.subject_id);
      const group = lesson.related_id ? groupMap.get(lesson.related_id) : undefined;
      if (!isLiveGroup(group)) continue;
      const subjectName = subjects.get(sid) || group.name || "Курс";
      const age = ageOf(group?.name || "") || ageOf(subjectName);
      const path = SUBJECT_PATH[sid] || "";
      const gid = Number(group?.id || lesson.related_id || 0);
      const tIds = (lesson.teacher_ids || group?.teacher_ids || []).map(Number).filter(Boolean);
      const teacherId = tIds[0] || 0;
      const from = String(lesson.time_from_v || lesson.time_from || "").slice(0, 5);
      const to = String(lesson.time_to_v || lesson.time_to || "").slice(0, 5);
      const day = Number(lesson.day) || 1;
      const school = schoolOf(path, subjectName, group?.name || "");
      const seat = gid ? seats.get(seatKey(branch, gid)) : undefined;
      const slot: CrmSlot = {
        id: `crm-${lesson.id}`,
        lessonId: Number(lesson.id),
        groupId: gid,
        groupName: group?.name || subjectName,
        groupNote: String(group?.note || ""),
        statusId: Number(group?.status_id || 0),
        limit: seat?.limit || Number(group?.limit) || 0,
        taken: seat?.taken || 0,
        subjectId: sid,
        subject: subjectName,
        school,
        course: courseOf(subjectName, group?.name || "", path),
        path,
        age,
        day,
        dayLabel: dayLabel(day),
        timeFrom: from,
        timeTo: to,
        timesPerWeek: 1,
        branchId: branch,
        city: meta.city,
        branch: meta.branch,
        signup: gid ? signupUrl(branch, gid) : path,
        teacherId,
        teacherIds: tIds,
        teacher: tIds.map((id) => teachers.get(id) || String(id)).join(", "),
        roomId: Number(lesson.room_id) || 0,
        bDate: String(group?.b_date || ""),
        eDate: String(group?.e_date || ""),
      };
      slots.push(normalizeArtSlot(slot));
      if (!sid || SKIP_SUBJECT.has(sid)) continue;
      sessions.push(toSession(slots[slots.length - 1]));
    }
  }
  stampTimes(slots);
  cache = { at: Date.now(), sessions, seats, slots: slots.filter(isLiveSlot) };
  try {
    writeSnap(cache);
  } catch {
    /* */
  }
  return cache;
}

export function filterCrmSessions(sessions: CmsSession[], splat?: string | null) {
  if (!splat) return sessions;
  let decoded = splat.startsWith("/") ? splat : `/${splat}`;
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    /* keep */
  }
  const hrefOf = (s: CmsSession) => s.path || (s.signup.startsWith("/") ? s.signup : "");
  if (decoded === "/" || decoded === "/schedule" || decoded === "/allcourses") return sessions;
  if (decoded === "/art-studio") {
    return sessions.filter((s) => /art-studio|hudvuz|sculptural|digitalart/.test(hrefOf(s)));
  }
  if (decoded === "/robototehnika-v-kolomne") {
    return sessions.filter((s) => /robot/.test(hrefOf(s)));
  }
  if (decoded === "/programming-school") {
    return sessions.filter((s) => /kursy-shkoly-programmirovaniya|gamedesign|3d-modeling/.test(hrefOf(s)));
  }
  if (decoded === "/languageschool") {
    return sessions.filter((s) => /english|vitamin|japanese/.test(hrefOf(s)));
  }
  if (decoded === "/promising-professions") {
    return sessions.filter((s) => /tesla|science|radio|3d-modeling/.test(hrefOf(s)));
  }
  return sessions.filter((s) => hrefOf(s) === decoded);
}

export type LiveGroup = {
  gid: string;
  branchId: number;
  name: string;
  age: string;
  when: string;
  city: string;
  branch: string;
  short: string;
  path: string;
  signup: string;
  chip: string;
  limit: number;
  taken: number;
  seats: string;
  wait: number;
};

function seatsText(limit: number, taken: number) {
  if (!limit) return taken ? `в группе ${taken}` : "места уточним";
  const free = Math.max(0, limit - taken);
  if (!taken) return `набор, до ${limit} мест`;
  if (!free) return "мест нет";
  return `свободно ${free} из ${limit}`;
}

function chipLabel(session: CmsSession, branchId: number, seats: string) {
  let when = session.when;
  DAYS.forEach((d, i) => {
    when = when.replace(d, DAY_SHORT[i]);
  });
  when = when.replace(" с ", " ").replace(" до ", "–");
  const short = BRANCH[branchId]?.short || session.city;
  const seatBit = seats.startsWith("свободно") ? seats.replace(" из ", "/") : seats.startsWith("набор") ? "набор" : seats === "мест нет" ? "нет мест" : "";
  return seatBit ? `${when} · ${short} · ${seatBit}` : `${when} · ${short}`;
}

export async function groupsForQuery(q: { age?: number; branch?: string; course?: string }) {
  const bag = await loadCrm();
  const bid = branchIdOf(q.branch || "");
  const kolomnaOnly = /коломн/.test((q.branch || "").toLowerCase()) && !bid;
  const seen = new Set<string>();
  const out: LiveGroup[] = [];
  for (const session of bag.sessions) {
    const gid = session.signup.match(/gid=(\d+)/)?.[1];
    const branchId = Number(session.signup.match(/common\/(\d+)\//)?.[1] || 0);
    if (!gid || !branchId) continue;
    if (bid && branchId !== bid) continue;
    if (kolomnaOnly && branchId === 3) continue;
    if (q.age) {
      if (session.age && !agesOverlap(session.age, q.age, q.age)) continue;
      if (!session.age) continue;
    }
    if (q.course && !courseMatch(session, q.course)) continue;
    const key = `${gid}-${session.when}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const seat = bag.seats.get(seatKey(branchId, gid)) || { limit: 0, taken: 0 };
    const seats = seatsText(seat.limit, seat.taken);
    out.push({
      gid,
      branchId,
      name: session.group,
      age: session.age,
      when: session.when,
      city: session.city,
      branch: session.branch,
      short: BRANCH[branchId]?.short || session.city,
      path: session.path || "",
      signup: session.signup,
      chip: chipLabel(session, branchId, seats),
      limit: seat.limit,
      taken: seat.taken,
      seats,
      wait: waitDays(crmDayOf(session.when)),
    });
  }
  out.sort((a, b) => a.wait - b.wait || a.when.localeCompare(b.when, "ru"));
  const open = out.filter((g) => g.seats !== "мест нет");
  const full = out.filter((g) => g.seats === "мест нет");
  return [...open, ...full].slice(0, 12);
}

export function formatGroups(list: LiveGroup[], age?: number) {
  if (!list.length) {
    return age
      ? `По фильтру живых групп на ${age} лет сейчас не видно. Это НЕ «мест нет». Не говори, что набор закрыт. Предложи заявку на пробное (дату согласуем) и другие направления на этот возраст. Телефон 8 (800) 511-34-01.`
      : "Группы не найдены. Спроси возраст и филиал.";
  }
  const open = list.filter((g) => g.seats !== "мест нет");
  const lines = list.map(
    (g, i) =>
      `${i + 1}. gid=${g.gid} филиал=${g.branchId} · ${g.name} · ${g.short} · ${g.when} · ${g.seats} · через ${g.wait} дн.`,
  );
  return [
    `Живое расписание, ${list.length} слотов (${open.length} со свободными местами), сначала ближайшие. Назови 5–8: день, время, филиал, места. Не выдумывай.`,
    open.length
      ? "Есть места — предложи конкретные слоты и open_group."
      : "Во всех найденных группах мест сейчас нет. Скажи это честно и предложи пробное в свободный день или другой филиал.",
    ...lines,
  ].join("\n");
}

function branchIdOf(raw: string) {
  const s = (raw || "").toLowerCase();
  if (/^1$|гражданск/.test(s)) return 1;
  if (/^2$|октябрь|340/.test(s)) return 2;
  if (/^3$|луховиц|пушкин/.test(s)) return 3;
  return 0;
}

const COURSE_ALIAS: { ask: RegExp; hay: RegExp }[] = [
  { ask: /робот/, hay: /робот|robot/ },
  { ask: /худож|рисов|живопис|лепк|скульпт|манг|аним/, hay: /худож|рисов|живопис|лепк|скульпт|манг|аним|art-studio|sculptural|hudvuz|digitalart/ },
  { ask: /програм|питон|скретч|python|scratch|айти|\bit\b|create|криэйт|джуниор/, hay: /програм|python|scratch|питон|скретч|create|junior|gamedev|unity|blender|codebook/ },
  { ask: /наук|физик|steam|радио|беспилот|дрон/, hay: /наук|физик|steam|радио|tesla|science|radio|беспилот|дрон/ },
  { ask: /модельн|подиум/, hay: /модельн|подиум|model/ },
  { ask: /англий|язык|япон|коре/, hay: /англий|язык|english|japanese|vitamin|япон|коре/ },
  { ask: /подготовк|школ/, hay: /подготовк|preparation|happybricks|лего-матем/ },
];

function stemRu(word: string) {
  const w = word.toLowerCase();
  if (w.length <= 5) return w;
  return w.replace(/(ами|ями|ах|ях|ов|ев|ом|ем|ой|ый|ий|ая|ое|ые|ие|ия|ию|ью|ии|[аеёиоуыэюяь])$/i, "");
}

function courseMatch(session: CmsSession, course: string) {
  const q = course.trim().toLowerCase();
  if (!q || q === "/") return true;
  let decoded = q;
  try {
    decoded = decodeURIComponent(q);
  } catch {
    /* keep */
  }
  const path = (session.path || "").toLowerCase();
  const hay = `${path} ${session.group} ${session.courseFilter}`.toLowerCase();
  if (path && (decoded === path || decoded.endsWith(path) || path.endsWith(decoded))) return true;
  for (const a of COURSE_ALIAS) {
    if (a.ask.test(decoded) && a.hay.test(hay)) return true;
  }
  const words = decoded.split(/[^a-zа-яё0-9+]+/i).filter((w) => w.length > 3);
  if (!words.length) return true;
  const hit = (w: string) => hay.includes(w) || hay.includes(stemRu(w));
  if (words.every(hit)) return true;
  return words.filter(hit).length >= Math.min(2, words.length);
}

export function groupSignup(gid: string, branch?: string) {
  const n = String(gid).replace(/\D/g, "");
  const b = branchIdOf(branch || "") || Number(branch) || 0;
  if (n && b) return { gid: n, branchId: b, signup: signupUrl(b, n) };
  return null;
}