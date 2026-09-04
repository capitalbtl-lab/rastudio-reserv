/**
 * Загрузка групп из AlfaCRM. subjectId = group.subject_id || lesson.subject_id || URL в заметке.
 * courseId = SUBJECT_TO_COURSE[subjectId] / карта / assign. Имя группы не склеивает курс.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CmsSession } from "@/data/cms";
import { request, token } from "@/data/alfacrm";
import { agesOverlap } from "@/data/ages";
import { dayLabel, slotFromSession, stampTimes, toSession, normalizeArtSlot, beatsOf, stampSubjects, type CrmSlot } from "@/data/crm-slots";
import { applyScheduleMap } from "@/data/schedule-map";
import { mergeTeacher, saveTeachers, type CrmTeacher } from "@/data/crm-teachers";
import { SUBJECT_TO_COURSE } from "@/data/ids";
import { nextLessonDate } from "@/lib/trial-slot";
import { isAdminGroup, isArchivedGroup, isCampStatus, readPriority, slotOnPublicSchedule } from "./group-status";
import { loadSiteSignup } from "./site-signup";

const SKIP_SUBJECT = new Set([7, 54, 104, 85, 81, 1, 77, 106, 82, 105, 83, 90, 84, 88, 87]);
const DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const DAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

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
  teacher_ids?: Array<number | string>;
  branch_ids?: number[];
  b_date?: string;
  e_date?: string;
  subject_id?: number;
  custom_hashtagkursa?: string;
  custom_workingout?: string;
  custom_prioritet?: number | string;
  level_id?: number;
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

type SeatInfo = { limit: number; taken: number; study?: number; lead?: number };
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
  const st = Number(group.status_id || 0);
  if (isArchivedGroup(st) || isCampStatus(st)) return false;
  return true;
}

function isLiveSlot(s: CrmSlot) {
  return isAdminGroup(s.statusId);
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

function groupIdsOfCustomer(c: Record<string, unknown>): number[] {
  const ids = new Set<number>();
  const gids = c.group_ids;
  if (Array.isArray(gids)) {
    for (const x of gids) {
      const n = Number(x);
      if (n) ids.add(n);
    }
  }
  let raw: unknown = c.groups;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw as Record<string, unknown>) : [];
  for (const one of list) {
    if (one && typeof one === "object") {
      const rec = one as { id?: number; group_id?: number };
      const n = Number(rec.id || rec.group_id || 0);
      if (n) ids.add(n);
    } else {
      const n = Number(one);
      if (n) ids.add(n);
    }
  }
  return [...ids];
}

async function loadRoster(branch: number, t: string) {
  const study = new Map<number, number>();
  const lead = new Map<number, number>();
  async function pull(isStudy: 0 | 1, into: Map<number, number>) {
    for (let page = 0; page < 40; page += 1) {
      const res = await request<{ items?: Record<string, unknown>[] }>(
        `/v2api/${branch}/customer/index`,
        { page, pageSize: 50, is_study: isStudy, removed: 0 },
        t,
      ).catch(() => ({ items: [] as Record<string, unknown>[] }));
      const items = res.items || [];
      for (const c of items) {
        for (const gid of groupIdsOfCustomer(c)) {
          into.set(gid, (into.get(gid) || 0) + 1);
        }
      }
      if (items.length < 50) break;
    }
  }
  await pull(1, study);
  await pull(0, lead);
  return { study, lead };
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
  const pub = loadSiteSignup().statusPublish;
  return stampTimes(slots.map((s) => normalizeArtSlot({ ...s })))
    .filter((s) => slotOnPublicSchedule(s, pub) && !SKIP_SUBJECT.has(s.subjectId))
    .flatMap((s) => {
      const beats = beatsOf(s).filter((b) => /^\d{1,2}:\d{2}$/.test(b.timeFrom || ""));
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
        subjectId: Number(s.subjectId) || Number(old.subjectId) || 0,
        subject: s.subject || old.subject,
        school: s.school && s.school !== "Прочее" ? s.school : old.school,
        course: s.course || old.course,
        courseId: s.courseId || old.courseId || "",
        schoolId: s.schoolId || old.schoolId || "",
        path: s.path || old.path,
        age: s.age || old.age,
        beats: s.beats?.length ? s.beats : old.beats,
        remarks: old.remarks || s.remarks || "",
        description: s.description || s.groupNote || old.description || old.groupNote || "",
        hashtags: s.hashtags || old.hashtags || "",
        makeup: s.makeup || old.makeup || "",
        bDate: s.bDate || old.bDate || "",
        eDate: s.eDate || old.eDate || "",
        levelId: s.levelId || old.levelId || 0,
        tariffId: old.tariffId || s.tariffId || 0,
        priority: s.priority ?? old.priority,
        takenStudy: s.takenStudy ?? old.takenStudy,
        takenLead: s.takenLead ?? old.takenLead,
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

let listed: { at: number; slots: CrmSlot[] } | null = null;

export function resetSlotCache() {
  listed = null;
}

export function listAdminSlots(): CrmSlot[] {
  const snap = cache || readSnap();
  const at = snap?.at || 0;
  if (listed && listed.at === at && listed.slots.length) return listed.slots;
  const raw = snap?.slots?.length ? snap.slots : (snap?.sessions || []).map(slotFromSession);
  const slots = applyScheduleMap(stampSubjects(stampTimes(raw.map(normalizeArtSlot)))).filter(isLiveSlot);
  listed = { at, slots };
  return slots;
}

export function bindSubjectsOnSite() {
  const snap = cache || readSnap();
  const at = snap?.at || 0;
  if (listed && listed.at === at && listed.slots.length) return { slots: listed.slots, changed: false };
  const raw = snap?.slots?.length ? snap.slots : (snap?.sessions || []).map(slotFromSession);
  const stamped = stampTimes((raw || []).map(normalizeArtSlot));
  const bound = applyScheduleMap(stampSubjects(stamped));
  const changed = bound.some(
    (s, i) => s.subjectId !== stamped[i]?.subjectId || s.subject !== stamped[i]?.subject || s.school !== stamped[i]?.school || s.path !== stamped[i]?.path,
  );
  if (changed) saveAdminSlots(bound);
  else listed = { at, slots: bound.filter(isLiveSlot) };
  return { slots: listed?.slots || bound.filter(isLiveSlot), changed };
}

export function saveAdminSlots(slots: CrmSlot[]) {
  const stamped = applyScheduleMap(stampSubjects(stampTimes(slots.map((s) => normalizeArtSlot({ ...s }))))).filter(isLiveSlot);
  const sessions = sessionsFromSlots(stamped);
  const seats = cache?.seats || readSnap()?.seats || new Map();
  cache = { at: Date.now(), sessions, seats, slots: stamped };
  listed = { at: cache.at, slots: stamped };
  writeSnap(cache);
  return cache;
}

async function paged<T>(path: string, t: string): Promise<T[]> {
  const items: T[] = [];
  for (let page = 0; page < 30; page += 1) {
    const res = await request<{ items?: T[]; total?: number }>(path, { page, pageSize: 100 }, t);
    const batch = res.items || [];
    items.push(...batch);
    const total = Number(res.total || 0);
    if (!batch.length || (total > 0 && items.length >= total) || batch.length < 100) break;
  }
  return items;
}

function teacherOf(raw: unknown, teachers: Map<number, string>) {
  const arr = Array.isArray(raw) ? raw : [];
  const ids: number[] = [];
  const names: string[] = [];
  for (const x of arr) {
    const n = Number(x);
    if (Number.isFinite(n) && n > 0 && String(x).trim() === String(n)) {
      ids.push(n);
      names.push(teachers.get(n) || String(n));
    } else if (typeof x === "string" && x.trim()) names.push(x.trim());
  }
  return { ids, name: names.filter(Boolean).join(", ") };
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
  const seats = new Map<string, SeatInfo>();
  const subjects = new Map<number, string>();
  const teachers = new Map<number, string>();
  const teacherBag: CrmTeacher[] = [];
  const groupsById = new Map<number, { g: Group; fromBranch: number }>();
  const lessons: Lesson[] = [];
  const sub = await paged<Subject>("/v2api/2/subject/index", t);
  for (const s of sub) subjects.set(s.id, s.name);
  for (const branch of [1, 2, 3, 4]) {
    const tr = await paged<Teacher>(`/v2api/${branch}/teacher/index`, t).catch(() => [] as Teacher[]);
    for (const p of tr) {
      if (!p.id) continue;
      teachers.set(p.id, p.name || String(p.id));
      mergeTeacher(teacherBag, p.id, p.name || String(p.id), branch);
    }
    const groups = await paged<Group>(`/v2api/${branch}/group/index`, t);
    const roster = await loadRoster(branch, t).catch(() => ({ study: new Map<number, number>(), lead: new Map<number, number>() }));
    for (const g of groups) {
      if (!groupsById.has(g.id)) groupsById.set(g.id, { g, fromBranch: branch });
      const study = roster.study.get(g.id) || 0;
      const lead = roster.lead.get(g.id) || 0;
      seats.set(seatKey(branch, g.id), { limit: Number(g.limit) || 0, taken: study + lead, study, lead });
    }
    lessons.push(...(await paged<Lesson>(`/v2api/${branch}/regular-lesson/index`, t)));
  }
  saveTeachers(teacherBag);
  const lessonsByGid = new Map<number, Lesson[]>();
  for (const lesson of lessons) {
    const gid = Number(lesson.related_id || 0);
    if (!gid) continue;
    const list = lessonsByGid.get(gid) || [];
    list.push(lesson);
    lessonsByGid.set(gid, list);
  }
  const slots: CrmSlot[] = [];
  for (const { g, fromBranch } of groupsById.values()) {
    if (!isLiveGroup(g)) continue;
    const branchId = Number(g.branch_ids?.[0]) || Number(fromBranch) || 1;
    const meta = BRANCH[branchId] || BRANCH[fromBranch] || BRANCH[1];
    const groupLessons = lessonsByGid.get(g.id) || [];
    const first = groupLessons[0];
    const lessonSid = Number(first?.subject_id) || 0;
    const groupSid = Number(g.subject_id) || 0;
    const sid = groupSid || lessonSid || 0;
    const subjectName = (sid && subjects.get(sid)) || g.name;
    const path = SUBJECT_TO_COURSE[sid] || "";
    const teach = teacherOf(first?.teacher_ids || g.teacher_ids, teachers);
    const seat = seats.get(seatKey(branchId, g.id)) || seats.get(seatKey(fromBranch, g.id));
    const beats = groupLessons
      .map((lesson) => ({
        day: Number(lesson.day) || 1,
        timeFrom: String(lesson.time_from_v || lesson.time_from || "").slice(0, 5),
        timeTo: String(lesson.time_to_v || lesson.time_to || "").slice(0, 5),
        lessonId: Number(lesson.id) || 0,
      }))
      .filter((b) => b.lessonId || /^\d{1,2}:\d{2}$/.test(b.timeFrom))
      .sort((a, b) => a.day - b.day || a.timeFrom.localeCompare(b.timeFrom));
    const a = beats[0] || { day: 1, timeFrom: "", timeTo: "", lessonId: 0 };
    slots.push(
      normalizeArtSlot({
        id: first ? `crm-${first.id}` : `crm-g${g.id}`,
        lessonId: a.lessonId,
        groupId: g.id,
        groupName: g.name,
        groupNote: String(g.note || ""),
        statusId: Number(g.status_id || 0),
        limit: seat?.limit || Number(g.limit) || 0,
        taken: seat?.taken || 0,
        takenStudy: seat?.study || 0,
        takenLead: seat?.lead || 0,
        priority: readPriority(g.custom_prioritet),
        subjectId: sid,
        subject: subjectName,
        school: "",
        course: subjectName || g.name,
        courseId: path,
        path,
        age: ageOf(g.name) || ageOf(subjectName),
        day: a.day,
        dayLabel: dayLabel(a.day),
        timeFrom: a.timeFrom,
        timeTo: a.timeTo,
        timesPerWeek: Math.max(1, beats.length),
        beats: beats.length ? beats : undefined,
        branchId,
        city: meta.city,
        branch: meta.branch,
        signup: signupUrl(branchId, g.id),
        teacherId: teach.ids[0] || 0,
        teacherIds: teach.ids,
        teacher: teach.name,
        roomId: Number(first?.room_id) || 0,
        bDate: String(g.b_date || ""),
        eDate: String(g.e_date || ""),
        hashtags: String(g.custom_hashtagkursa || "").replace(/\s+/g, " ").trim(),
        makeup: String(g.custom_workingout || ""),
        description: String(g.note || ""),
        remarks: "",
        levelId: Number(g.level_id || 0),
      }),
    );
  }
  const stamped = stampTimes(slots.filter(isLiveSlot));
  const sessions = stamped.filter((s) => s.subjectId && !SKIP_SUBJECT.has(s.subjectId)).map(toSession);
  cache = { at: Date.now(), sessions, seats, slots: stamped };
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
  if (decoded === "/model-school") {
    return sessions.filter((s) => /model-school/.test(hrefOf(s)));
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
  teacher: string;
  timeFrom: string;
  timeTo: string;
  nextDate: string;
  courseId: string;
  priority: number;
  statusId: number;
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
  if (!listAdminSlots().length) {
    await loadCrm().catch(() => null);
  }
  const slots = listAdminSlots().filter((s) => isAdminGroup(s.statusId) && s.groupId);
  const bid = branchIdOf(q.branch || "");
  const kolomnaOnly = /коломн/.test((q.branch || "").toLowerCase()) && !bid;
  const seen = new Set<string>();
  const out: LiveGroup[] = [];
  for (const slot of slots) {
    const session = toSession(slot);
    const gid = String(slot.groupId);
    const branchId = Number(slot.branchId) || 0;
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
    const seats = seatsText(slot.limit, slot.taken);
    const next = nextLessonDate(session);
    const nextDate = next
      ? `${String(next.getDate()).padStart(2, "0")}.${String(next.getMonth() + 1).padStart(2, "0")}.${next.getFullYear()}`
      : "";
    const priority = readPriority(slot.priority);
    out.push({
      gid,
      branchId,
      name: slot.groupName,
      age: slot.age,
      when: session.when,
      city: slot.city,
      branch: slot.branch,
      short: BRANCH[branchId]?.short || slot.city,
      path: slot.path || "",
      signup: slot.signup,
      chip: chipLabel(session, branchId, seats),
      limit: slot.limit,
      taken: slot.taken,
      seats,
      wait: waitDays(crmDayOf(session.when)),
      teacher: slot.teacher || "",
      timeFrom: slot.timeFrom || "",
      timeTo: slot.timeTo || "",
      nextDate,
      courseId: slot.courseId || String(slot.subjectId || ""),
      priority,
      statusId: slot.statusId || 0,
    });
  }
  out.sort((a, b) => {
    const pa = a.priority === 0 ? 99 : a.priority;
    const pb = b.priority === 0 ? 99 : b.priority;
    return pa - pb || a.wait - b.wait || a.when.localeCompare(b.when, "ru");
  });
  return out.slice(0, 24);
}

export function formatGroups(list: LiveGroup[], age?: number) {
  if (!list.length) {
    return age
      ? `По фильтру живых групп на ${age} лет сейчас не видно. Это НЕ «мест нет». Не говори, что набор закрыт. Предложи заявку на пробное (дату согласуем) и другие направления на этот возраст. Телефон 8 (800) 511-34-01.`
      : "Группы не найдены. Спроси возраст и филиал.";
  }
  const first = list.filter((g) => g.priority === 1);
  const lines = list.map(
    (g, i) =>
      `${i + 1}. gid=${g.gid} филиал=${g.branchId} · приоритет=${g.priority} · ${g.name} · ${g.short} · ${g.when}${g.teacher ? ` · ${g.teacher}` : ""} · состав ${g.taken}/${g.limit || "—"} · ${g.seats} · ближайшее ${g.nextDate || "—"} ${g.timeFrom || ""} · через ${g.wait} дн.${g.priority === 0 ? " · набор с сайта закрыт" : ""}`,
  );
  return [
    `Все подходящие группы (${list.length}), сначала приоритет 1. Назови родителю ВСЕ, не только первые. gid вслух не читай.`,
    first.length
      ? `В первую очередь предлагай запись в группы с приоритетом 1 (${first.map((g) => g.name).join("; ")}). Остальные тоже перечисли.`
      : "Среди найденных нет приоритета 1 — назови все и уточни, куда удобнее.",
    "Пробное = submit_trial, в группу = book_lesson lesson_type=group. Форму AlfaCRM не открывай. Приоритет 0 — с сайта не записывать, скажи что набор через администратора или предложи группу с приоритетом 1.",
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
  { ask: /модельн|подиум|макияж|личностн/, hay: /модельн|подиум|model|макияж|личностн/ },
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