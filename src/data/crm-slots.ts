/**
 * Слоты расписания кабинета. Связи группы — courseId / schoolId / subjectId / groupId.
 * stampSubjects только обновляет имя по subjectId; не подбирает предмет по названию группы.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CmsSession } from "@/data/cms";
import { request } from "@/data/alfacrm";
import { yandexJson } from "@/data/agent-channels";
import { loadSubjects, pickSubjectForSlot } from "@/data/crm-subjects";
import { teachersAtBranch, listTeachers, teacherIdsOfSlot } from "@/data/crm-teachers";
import { type CrmSlot, type SlotVersion, type LessonBeat, beatsOf, validBeat, levelName } from "@/data/crm-slots-core";
import { loadSiteTree } from "@/data/site-tree";
import { subjectIdOfCourse } from "@/data/ids";
import { loadScheduleMap } from "@/data/schedule-map";
import { groupSignupUrl } from "@/data/site-signup-core";
import { readPriority } from "./group-status";
import { bulkPriorityFromPrompt, bulkLimitFromPrompt } from "./schedule-bulk";

export { bulkPriorityFromPrompt, bulkLimitFromPrompt } from "./schedule-bulk";

export { SCHOOL_ORDER, beatsOf, validBeat, type CrmSlot, type SlotVersion, type LessonBeat } from "@/data/crm-slots-core";

function signupOf(branch: number, gid: string | number) {
  return `https://studiyarazvivaysya.s20.online/common/${branch}/lead/create?gid=${gid}`;
}

const DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

const COLS = [
  "id",
  "lessonId",
  "groupId",
  "groupName",
  "subject",
  "school",
  "course",
  "age",
  "day",
  "dayLabel",
  "timeFrom",
  "timeTo",
  "timesPerWeek",
  "city",
  "branch",
  "branchId",
  "signup",
  "teacher",
  "teacherId",
  "limit",
  "taken",
  "groupNote",
  "path",
  "statusId",
  "roomId",
  "bDate",
  "eDate",
] as const;

function schoolFile() {
  return join(process.cwd(), "storage", "crm-schedule-versions.json");
}

/** Имя предмета из справочника по subjectId. Не подставляет чужой предмет по названию группы. */
export function stampSubjects(slots: CrmSlot[]): CrmSlot[] {
  const list = loadSubjects();
  return slots.map((s) => {
    const current = list.find((x) => x.id === s.subjectId);
    if (current) {
      if (s.subject === current.name && s.subjectId === current.id) return s;
      return { ...s, subjectId: current.id, subject: current.name };
    }
    return s;
  });
}

export function schoolOf(_path: string, _subject: string, _group: string) {
  return "";
}

export function courseOf(subject: string, group: string, path: string) {
  return (subject || group || path || "Курс").replace(/\s+/g, " ").trim();
}

export function normalizeArtSlot(s: CrmSlot): CrmSlot {
  if (s.subjectId === 92 || s.subjectId === 115) {
    return { ...s, age: s.age || "10–15 лет" };
  }
  if (s.subjectId === 5) {
    return { ...s, age: s.age && /1[4-7]/.test(s.age) ? s.age : "от 14 лет" };
  }
  return s;
}

export function dayLabel(day?: number) {
  return DAYS[(Number(day) || 1) - 1] || "День";
}

export function mergeGroupBeats(slots: CrmSlot[]): CrmSlot[] {
  const order: string[] = [];
  const map = new Map<string, CrmSlot>();
  for (const raw of slots) {
    const s = { ...raw };
    const k = s.groupId ? `${s.branchId}:${s.groupId}` : s.id;
    const extra = beatsOf(s).filter((b) => validBeat(b) || b.lessonId);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, { ...s, beats: extra.length ? extra : beatsOf(s), timesPerWeek: Math.max(1, extra.length) });
      order.push(k);
      continue;
    }
    const have = new Set((prev.beats || []).map((b) => `${b.day}|${b.timeFrom}|${b.lessonId}`));
    const beats = [...(prev.beats || [])];
    for (const b of extra) {
      const key = `${b.day}|${b.timeFrom}|${b.lessonId}`;
      if (!have.has(key)) {
        beats.push(b);
        have.add(key);
      }
    }
    const cleaned = beats.filter((b) => validBeat(b) || b.lessonId);
    map.set(k, { ...prev, beats: cleaned.length ? cleaned : beats.slice(0, 1), timesPerWeek: Math.max(1, cleaned.length) });
  }
  return order.map((k) => {
    const s = map.get(k)!;
    const beats = beatsOf(s);
    const a = beats[0];
    return { ...s, beats, timesPerWeek: beats.length, day: a.day, dayLabel: dayLabel(a.day), timeFrom: a.timeFrom, timeTo: a.timeTo };
  });
}

export function stampTimes(slots: CrmSlot[]) {
  return mergeGroupBeats(slots);
}

export function toSession(s: CrmSlot): CmsSession {
  const when =
    s.timeFrom && s.timeTo ? `${s.dayLabel} с ${s.timeFrom} до ${s.timeTo}` : s.timeFrom ? `${s.dayLabel} в ${s.timeFrom}` : s.dayLabel;
  return {
    id: s.id,
    group: s.groupName,
    age: s.age,
    when,
    teacherId: String(s.teacherId || ""),
    signup: /^https?:\/\//i.test(String(s.signup || ""))
      ? String(s.signup)
      : s.groupId
        ? groupSignupUrl(s.branchId, s.groupId)
        : "",
    city: s.city,
    branch: s.branch,
    directionId: String(s.subjectId),
    courseId: s.courseId || "",
    ageTag: s.age,
    courseFilter: s.course || s.subject,
    path: s.path,
    teacher: s.teacher || "",
    groupId: s.groupId || 0,
    branchId: s.branchId || 0,
    limit: s.limit || 0,
    taken: s.taken || 0,
    levelId: s.levelId || 0,
    level: levelName(s.levelId),
    timeFrom: s.timeFrom,
    timeTo: s.timeTo,
    day: s.day,
    siteCourseId: s.courseId || s.path || "",
    statusId: s.statusId || 0,
    priority: readPriority(s.priority),
  };
}

export function slotFromSession(s: CmsSession): CrmSlot {
  const day = DAYS.findIndex((d) => s.when.startsWith(d)) + 1 || 1;
  const tm = s.when.match(/(\d{1,2}:\d{2}).*?(\d{1,2}:\d{2})/);
  return {
    id: s.id,
    lessonId: Number(String(s.id).replace(/\D/g, "")) || 0,
    groupId: Number(s.signup.match(/gid=(\d+)/)?.[1] || 0),
    groupName: s.group,
    groupNote: "",
    statusId: 0,
    limit: 0,
    taken: 0,
    subjectId: Number(s.directionId) || (String(s.courseId || "").startsWith("/") ? 0 : Number(s.courseId)) || 0,
    subject: s.courseFilter,
    school: "",
    course: s.courseFilter || s.group,
    courseId: s.siteCourseId || (String(s.courseId || "").startsWith("/") ? s.courseId : ""),
    path: s.path || s.siteCourseId || "",
    age: s.age,
    day,
    dayLabel: dayLabel(day),
    timeFrom: tm?.[1] || "",
    timeTo: tm?.[2] || "",
    timesPerWeek: 1,
    branchId: Number(s.signup.match(/common\/(\d+)\//)?.[1] || 0),
    city: s.city,
    branch: s.branch,
    signup: s.signup,
    teacherId: Number(s.teacherId) || 0,
    teacherIds: s.teacherId ? [Number(s.teacherId)] : [],
    teacher: "",
    roomId: 0,
    ...defaultPeriod(),
  };
}

export function loadVersions(): SlotVersion[] {
  try {
    if (!existsSync(schoolFile())) return [];
    const raw = JSON.parse(readFileSync(schoolFile(), "utf8")) as { versions?: SlotVersion[] };
    return Array.isArray(raw.versions) ? raw.versions.slice(0, 12) : [];
  } catch {
    return [];
  }
}

export function pushVersion(reason: string, slots: CrmSlot[]) {
  const versions = [{ at: new Date().toISOString(), reason: reason.slice(0, 200), count: slots.length, slots }, ...loadVersions()].slice(0, 12);
  mkdirSync(dirname(schoolFile()), { recursive: true });
  writeFileSync(schoolFile(), JSON.stringify({ versions }, null, 0), "utf8");
  return versions.map((v) => ({ at: v.at, reason: v.reason, count: v.count }));
}

export function versionSlots(at: string) {
  return loadVersions().find((v) => v.at === at)?.slots || null;
}

function csvEscape(v: string | number) {
  const s = String(v ?? "");
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function slotsToCsv(slots: CrmSlot[]) {
  const head = COLS.join(";");
  const body = slots.map((s) => COLS.map((k) => csvEscape((s as unknown as Record<string, string | number>)[k] ?? "")).join(";")).join("\n");
  return `\uFEFF${head}\n${body}\n`;
}

export function slotsToXls(slots: CrmSlot[]) {
  const cell = (v: string | number) => `<Cell><Data ss:Type="${typeof v === "number" ? "Number" : "String"}">${String(v ?? "").replace(/&/g, "&").replace(/</g, "<")}</Data></Cell>`;
  const rows = [
    `<Row>${COLS.map((c) => cell(c)).join("")}</Row>`,
    ...slots.map((s) => `<Row>${COLS.map((k) => cell((s as unknown as Record<string, string | number>)[k] ?? "")).join("")}</Row>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Расписание"><Table>${rows.join("")}</Table></Worksheet>
</Workbook>`;
}

function splitLine(line: string, sep: string) {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (ch === sep && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseSlotsCsv(text: string, current: CrmSlot[]) {
  const raw = text.replace(/^\uFEFF/, "").trim();
  const first = raw.split(/\r?\n/, 1)[0] || "";
  const sep = first.includes(";") ? ";" : ",";
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return current;
  const head = splitLine(lines[0], sep).map((h) => h.trim());
  const byId = new Map(current.map((s) => [s.id, { ...s }]));
  for (const line of lines.slice(1)) {
    const cells = splitLine(line, sep);
    const rec: Record<string, string> = {};
    head.forEach((h, i) => {
      rec[h] = cells[i] ?? "";
    });
    const id = rec.id || `crm-${rec.lessonId}`;
    const prev = byId.get(id) || slotFromSession({
      id,
      group: rec.groupName || rec.course || "",
      age: rec.age || "",
      when: `${rec.dayLabel || ""} ${rec.timeFrom || ""}`,
      teacherId: rec.teacherId || "",
      signup: rec.signup || "",
      city: rec.city || "",
      branch: rec.branch || "",
      directionId: rec.subjectId || "",
      courseId: rec.subjectId || "",
      ageTag: rec.age || "",
      courseFilter: rec.subject || rec.course || "",
      path: rec.path || "",
    });
    const day = Number(rec.day) || prev.day;
    byId.set(id, {
      ...prev,
      groupName: rec.groupName || prev.groupName,
      subject: rec.subject || prev.subject,
      school: rec.school || prev.school,
      course: rec.course || prev.course,
      age: rec.age || prev.age,
      day,
      dayLabel: rec.dayLabel || dayLabel(day),
      timeFrom: rec.timeFrom || prev.timeFrom,
      timeTo: rec.timeTo || prev.timeTo,
      city: rec.city || prev.city,
      branch: rec.branch || prev.branch,
      branchId: Number(rec.branchId) || prev.branchId,
      signup: rec.signup || prev.signup,
      teacher: rec.teacher || prev.teacher,
      teacherId: Number(rec.teacherId) || prev.teacherId,
      limit: rec.limit !== undefined && rec.limit !== "" ? Number(rec.limit) : prev.limit,
      groupNote: rec.groupNote ?? prev.groupNote,
      path: rec.path || prev.path,
      groupId: Number(rec.groupId) || prev.groupId,
      lessonId: Number(rec.lessonId) || prev.lessonId,
    });
  }
  return stampTimes([...byId.values()]);
}

const BRANCHES = [
  { id: 1, city: "Коломна", branch: "ул. Гражданская, 2", keys: ["гражданск", "гражданская"] },
  { id: 2, city: "Коломна", branch: "ЦМИТ, ул. Октябрьской революции, 340", keys: ["цмит", "октябрьск", "революц"] },
  { id: 3, city: "Луховицы", branch: "ул. Пушкина, 202А", keys: ["луховиц", "пушкин"] },
  { id: 4, city: "Коломна", branch: "летние программы", keys: ["летн", "лагер"] },
];

export function matchBranch(raw: string) {
  const t = raw.toLowerCase().replace(/ё/g, "е");
  const hit = BRANCHES.find((b) => b.keys.some((k) => t.includes(k))) || BRANCHES[0];
  return hit;
}

export function eveningTime(raw: string) {
  const m = String(raw || "")
    .replace(".", ":")
    .replace(",", ":")
    .match(/(\d{1,2}):(\d{2})/);
  if (!m) return String(raw || "").slice(0, 5);
  let h = Number(m[1]);
  if (h >= 1 && h <= 9) h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export function formatCourseName(name: string, age = "") {
  let n = String(name || "")
    .replace(/\s+/g, " ")
    .trim();
  n = n.replace(/\s+\(30\s*[-–]\s*34[^)]*\)/gi, "");
  n = n.replace(/\s+(\d+\s*[-–—]\s*\d+\s*(?:лет|года|год))\s*$/i, " ($1)");
  const a = String(age || "").trim();
  if (a && !/\(/.test(n)) n = `${n} (${a})`;
  return n.replace(/\s+/g, " ").trim();
}

const AGE_GLUE: [string, RegExp][] = [
  ["3-4", /\b(?:30\s*[-–]?\s*34|34)\b/g],
  ["4-5", /\b(?:45)\b/g],
  ["5-6", /\b(?:56)\b/g],
  ["7-8", /\b(?:78)\b/g],
  ["7-9", /\b(?:79)\b/g],
  ["8-9", /\b(?:89)\b/g],
  ["10-12", /\b(?:1012)\b/g],
  ["10-14", /\b(?:1014)\b/g],
  ["10-15", /\b(?:1015)\b/g],
];

export function repairScheduleSpeech(prompt: string) {
  let t = String(prompt || "");
  t = t.replace(/три[-\s]?четыре/gi, "3-4");
  t = t.replace(/четыре[-\s]?пять/gi, "4-5");
  t = t.replace(/пять[-\s]?шесть/gi, "5-6");
  t = t.replace(/семь[-\s]?девять/gi, "7-9");
  t = t.replace(/семь[-\s]?восемь/gi, "7-8");
  t = t.replace(/десять[-\s]?(четырнадцать|пятнадцать)/gi, (_, b) => (String(b).startsWith("пят") ? "10-15" : "10-14"));
  for (const [range, re] of AGE_GLUE) t = t.replace(re, range);
  t = t.replace(/студи[яи]\s*3-4/gi, "студия 3-4");
  return t;
}

export function snapAge(age: string, catalog: CrmSlot[]) {
  let raw = repairScheduleSpeech(age || "");
  raw = raw.replace(/лет|года|год/gi, "").replace(/\s+/g, " ").trim();
  const m = raw.match(/(\d+)\s*[-–]\s*(\d+)/);
  const range = m ? `${m[1]}-${m[2]}` : "";
  if (!range) return age;
  const ages = [...new Set(catalog.map((s) => s.age).filter(Boolean))];
  const hit = ages.find((a) => a.replace(/\s/g, "").includes(range.replace("-", "")) || a.includes(range));
  if (hit) return hit;
  const low = Number(m![1]);
  return `${range} ${low <= 4 ? "года" : "лет"}`;
}

export function matchTeacher(raw: string, catalog: CrmSlot[]) {
  const t = raw.toLowerCase().replace(/ё/g, "е");
  if (!t) return "";
  const names = [...new Set(catalog.map((s) => s.teacher).filter(Boolean))];
  const hit = names.find((n) => n.toLowerCase().replace(/ё/g, "е").includes(t) || t.includes(n.toLowerCase().split(" ")[0]));
  return hit || raw.trim();
}

export function snapAdd(a: SlotDraft, catalog: CrmSlot[]): SlotDraft {
  const age = snapAge(a.age || a.course || "", catalog);
  const range = (age.match(/(\d+\s*[-–]\s*\d+)/) || [])[1] || "";
  const base = String(a.course || "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\d+\s*[-–]?\s*\d*.*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const hit = catalog.find((s) => {
    const c = s.course.toLowerCase();
    const okName = base.length > 4 && c.includes(base.slice(0, Math.min(22, base.length)));
    const okAge = !range || s.age.includes(range) || s.course.includes(range);
    return okName && okAge;
  }) || catalog.find((s) => base.length > 4 && s.course.toLowerCase().includes(base.slice(0, 18)));
  if (hit) {
    return {
      ...a,
      school: a.school || hit.school,
      schoolId: a.schoolId || hit.schoolId,
      course: hit.course,
      courseId: hit.courseId || a.courseId,
      subjectId: a.subjectId || hit.subjectId,
      age: hit.age || age,
      teacher: matchTeacher(a.teacher, catalog) || hit.teacher,
    };
  }
  return { ...a, course: formatCourseName(a.course || "Курс", age), age, teacher: matchTeacher(a.teacher, catalog) };
}

export function parseDraftFromSpeech(text: string, catalog: CrmSlot[], prev?: Partial<SlotDraft>): SlotDraft {
  const raw = repairScheduleSpeech(text);
  const t = raw.toLowerCase().replace(/ё/g, "е");
  const next: SlotDraft = {
    school: prev?.school || "",
    course: prev?.course || "",
    courseId: prev?.courseId || "",
    schoolId: prev?.schoolId || "",
    subjectId: prev?.subjectId,
    age: prev?.age || "",
    day: Number(prev?.day) || 0,
    timeFrom: prev?.timeFrom || "",
    timeTo: prev?.timeTo || "",
    branch: prev?.branch || "",
    teacher: prev?.teacher || "",
  };
  const days: [RegExp, number][] = [
    [/понедельник|\bпн\b/, 1],
    [/вторник|\bвт\b/, 2],
    [/сред[аыу]|\bср\b/, 3],
    [/четверг|\bчт\b/, 4],
    [/пятниц|\bпт\b/, 5],
    [/суббот|\bсб\b/, 6],
    [/воскресень|\bвс\b/, 7],
  ];
  for (const [re, d] of days) if (re.test(t)) next.day = d;
  const span = t.match(/с\s*(\d{1,2})(?:[:.](\d{2}))?\s*до\s*(\d{1,2})(?:[:.](\d{2}))?/);
  if (span) {
    next.timeFrom = eveningTime(`${span[1]}:${span[2] || "00"}`);
    next.timeTo = eveningTime(`${span[3]}:${span[4] || "00"}`);
  } else {
    const hm = [...t.matchAll(/(\d{1,2})[:.](\d{2})/g)].map((m) => eveningTime(`${m[1]}:${m[2]}`));
    if (hm[0]) next.timeFrom = hm[0];
    if (hm[1]) next.timeTo = hm[1];
  }
  if (/гражданск/.test(t)) next.branch = "Коломна, ул. Гражданская, 2";
  else if (/цмит|октябрьск|революц/.test(t)) next.branch = "Коломна, ЦМИТ, ул. Октябрьской революции, 340";
  else if (/луховиц|пушкин/.test(t)) next.branch = "Луховицы, ул. Пушкина, 202А";
  const teach = matchTeacher(raw, catalog);
  if (teach && catalog.some((s) => s.teacher === teach)) next.teacher = teach;
  else {
    const last = catalog.map((s) => s.teacher).find((n) => n && t.includes(n.toLowerCase().split(" ")[0].replace(/ё/g, "е")));
    if (last) next.teacher = last;
  }
  const ageHit = snapAge(raw, catalog);
  if (/\d/.test(ageHit) && /лет|год/.test(ageHit)) next.age = ageHit;
  const snapped = snapAdd({ ...next, course: next.course || raw }, catalog);
  if (snapped.course && (snapped.courseId || catalog.some((s) => s.courseId && s.courseId === snapped.courseId) || catalog.some((s) => s.course === snapped.course))) {
    next.course = snapped.course;
    next.courseId = snapped.courseId || next.courseId;
    next.schoolId = snapped.schoolId || next.schoolId;
    next.subjectId = snapped.subjectId || next.subjectId;
    next.school = snapped.school || next.school;
    next.age = snapped.age || next.age;
  }
  return next;
}

export function missingScheduleFields(d: Partial<SlotDraft>) {
  const miss: { key: string; ask: string }[] = [];
  if (!d.course) miss.push({ key: "course", ask: "Какой курс? Например, художественная студия 3–4 года." });
  if (!d.age) miss.push({ key: "age", ask: "Какой возраст детей?" });
  if (!d.day) miss.push({ key: "day", ask: "В какой день недели занятия?" });
  if (!d.timeFrom || !d.timeTo) miss.push({ key: "time", ask: "С какого по какое время? Например, с пяти до семи вечера." });
  if (!d.branch) miss.push({ key: "branch", ask: "Какой филиал: Гражданская, ЦМИТ или Луховицы?" });
  if (!d.teacher) miss.push({ key: "teacher", ask: "Кто педагог?" });
  return miss;
}

export type SlotDraft = {
  school: string;
  course: string;
  courseId?: string;
  schoolId?: string;
  subjectId?: number;
  age: string;
  day: number;
  timeFrom: string;
  timeTo: string;
  branch: string;
  teacher: string;
  groupName?: string;
  limit?: number;
};

/** Новая группа: courseId из дерева, subjectId из карты курса. Имя курса — подпись. */
export function buildSlot(draft: SlotDraft, catalog: CrmSlot[]): CrmSlot {
  const tree = loadSiteTree();
  const map = loadScheduleMap();
  const courseRow =
    tree.courses.find((c) => c.id && c.id === draft.courseId) ||
    tree.courses.find((c) => draft.courseId && c.href === draft.courseId);
  const schoolRow = tree.schools.find((s) => s.id && (s.id === draft.schoolId || s.id === courseRow?.schoolId));
  const br = matchBranch(`${draft.branch} ${courseRow?.label || draft.course}`);
  const school = schoolRow?.label || draft.school || "";
  const age = draft.age || courseRow?.age || (draft.course.match(/\(([^)]+)\)/)?.[1] || "");
  const course = courseRow?.label || (draft.course ? String(draft.course).trim() : formatCourseName("Курс", age));
  const twin =
    catalog.find((s) => courseRow?.id && s.courseId === courseRow.id) ||
    catalog.find((s) => s.schoolId && schoolRow?.id && s.schoolId === schoolRow.id);
  const teacher = matchTeacher(draft.teacher, catalog.filter((s) => !br.id || s.branchId === br.id));
  const teacherHit = catalog.find((s) => s.teacher === teacher && (!br.id || s.branchId === br.id));
  const day = Math.max(1, Math.min(7, Number(draft.day) || 1));
  const year = new Date().getFullYear();
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const mappedSid = courseRow?.id ? subjectIdOfCourse(courseRow.id, map.courses) : 0;
  const subjectId = Number(draft.subjectId) || Number(twin?.subjectId) || mappedSid || 0;
  const sub = subjectId ? loadSubjects().find((x) => x.id === subjectId) : undefined;
  return {
    id,
    lessonId: 0,
    groupId: 0,
    groupName: draft.groupName || `${year} ${course}`,
    groupNote: "",
    statusId: 1,
    limit: Number(draft.limit) || twin?.limit || 8,
    taken: 0,
    subjectId,
    subject: sub?.name || twin?.subject || course,
    school,
    course,
    courseId: courseRow?.id || "",
    schoolId: schoolRow?.id || courseRow?.schoolId || "",
    path: courseRow?.href || twin?.path || "",
    age: age || twin?.age || "",
    day,
    dayLabel: dayLabel(day),
    timeFrom: eveningTime(draft.timeFrom),
    timeTo: eveningTime(draft.timeTo),
    timesPerWeek: 1,
    beats: [{ day, timeFrom: eveningTime(draft.timeFrom), timeTo: eveningTime(draft.timeTo), lessonId: 0 }],
    branchId: br.id,
    city: br.city,
    branch: br.branch,
    signup: "",
    teacherId: teacherHit?.teacherId || 0,
    teacherIds: teacherHit?.teacherIds || [],
    teacher,
    roomId: 0,
    ...defaultPeriod(),
  };
}

const EDITABLE = new Set(["groupName", "age", "day", "timeFrom", "timeTo", "teacher", "limit", "groupNote", "course", "school", "branch", "priority", "statusId"]);

export async function aiSchedulePatch(slots: CrmSlot[], prompt: string) {
  return aiScheduleParse(slots, prompt, slots.map((s) => s.id));
}

export async function aiScheduleParse(slots: CrmSlot[], prompt: string, selectedIds: string[] = []) {
  const bulkPriority = bulkPriorityFromPrompt(prompt, slots, selectedIds);
  if (bulkPriority) return bulkPriority;
  const bulk = bulkLimitFromPrompt(prompt, slots, selectedIds);
  if (bulk) return bulk;
  const catalog = {
    schools: [...new Set(slots.map((s) => s.school).filter(Boolean))],
    courses: [...new Set(slots.map((s) => s.course).filter(Boolean))],
    branches: BRANCHES.map((b) => `${b.city}, ${b.branch}`),
    teachers: [...new Set(slots.map((s) => s.teacher).filter(Boolean))],
    ages: [...new Set(slots.map((s) => s.age).filter(Boolean))],
  };
  const asked = repairScheduleSpeech(prompt);
  const slim = slots.map((s) => ({
    id: s.id,
    groupName: s.groupName,
    subject: s.subject,
    school: s.school,
    course: s.course,
    age: s.age,
    day: s.day,
    dayLabel: s.dayLabel,
    timeFrom: s.timeFrom,
    timeTo: s.timeTo,
    teacher: s.teacher,
    limit: s.limit,
    branch: `${s.city}, ${s.branch}`,
    city: s.city,
    groupId: s.groupId,
    branchId: s.branchId,
    priority: readPriority(s.priority),
  }));
  const llm = await yandexJson<{
    changes?: { id?: string; field?: string; to?: string | number }[];
    adds?: SlotDraft[];
    comment?: string;
  }>(
    `Ты методист расписания студии «Развивайся».
Правила:
- Филиал пиши ТОЛЬКО одной из строк справочника, без своих формулировок.
- Курс бери ТОЧНО из справочника. «художественная студия 3-4 года» / «студия 34» = «Художественная студия (3-4 лет)» или «(3-4 года)» — как уже записано. Никогда 30-34 лет: это дети.
- Возраст только из справочника: ${JSON.stringify(catalog.ages).slice(0, 500)}
- Время кружков вечером: «с 6:30 до 8:30» = 18:30 и 20:30. Всегда ЧЧ:ММ с двоеточием. Часы 1–9 без «утра» считай вечерними (+12).
- Педагога бери точным ФИО из справочника.
- «места», «лимит» = поле limit. «приоритет 1/0» = поле priority. Если сказано «все группы» / «на Гражданской» — change на каждый подходящий id, не одну строку. Филиал только по branchId: 1 Гражданская, 2 ЦМИТ, 3 Луховицы, 4 лето. Имя и год в названии не фильтр.
- adds только если оператор явно просит ДОБАВИТЬ / СОЗДАТЬ группу. Несколько групп — отдельный объект adds на каждую.
- Если правит существующие — только changes с id из списка. Не выдумывай id и не добавляй лишние группы.
- Разрешённые id: все слоты ниже, если сказано «все» / филиал, иначе отмеченные.
Ответ JSON.`,
    `Запрос: ${asked.slice(0, 2000)}
JSON: {"comment":"что сделали","changes":[{"id":"crm-…","field":"limit","to":"8"}],"adds":[]}
Справочник филиалов: ${JSON.stringify(catalog.branches)}
Школы: ${JSON.stringify(catalog.schools)}
Курсы: ${JSON.stringify(catalog.courses).slice(0, 4000)}
Педагоги: ${JSON.stringify(catalog.teachers)}
Слоты:
${JSON.stringify(slim).slice(0, 14000)}`,
    4000,
  );
  const changes: { id: string; field: string; from: string; to: string }[] = [];
  for (const c of llm?.changes || []) {
    if (!c.id || !c.field || !EDITABLE.has(c.field)) continue;
    const hit = slots.find((s) => s.id === c.id);
    if (!hit) continue;
    let to = String(c.to ?? "");
    if (c.field === "timeFrom" || c.field === "timeTo") to = eveningTime(to);
    if (c.field === "course") to = formatCourseName(to);
    if (c.field === "branch") {
      const br = matchBranch(to);
      to = br.branch;
    }
    const from = String((hit as unknown as Record<string, unknown>)[c.field] ?? "");
    if (from === to) continue;
    changes.push({ id: c.id, field: c.field, from, to });
  }
  const adds: SlotDraft[] = [];
  for (const a of llm?.adds || []) {
    if (!a || !(a.course || a.school || a.groupName)) continue;
    const br = matchBranch(String(a.branch || ""));
    adds.push(
      snapAdd(
        {
          school: a.school || "",
          course: String(a.course || a.groupName || "Курс"),
          age: String(a.age || ""),
          day: Math.max(1, Math.min(7, Number(a.day) || 1)),
          timeFrom: eveningTime(String(a.timeFrom || "")),
          timeTo: eveningTime(String(a.timeTo || "")),
          branch: `${br.city}, ${br.branch}`,
          teacher: String(a.teacher || ""),
          groupName: a.groupName,
          limit: a.limit,
        },
        slots,
      ),
    );
  }
  const comment =
    llm?.comment ||
    (changes.length || adds.length ? "Правки по запросу." : "Ничего не менял — уточните запрос.");
  return { comment, changes, adds };
}

export function applyChanges(slots: CrmSlot[], changes: { id: string; field: string; to: string }[]) {
  const next = slots.map((s) => ({ ...s }));
  for (const c of changes) {
    const hit = next.find((s) => s.id === c.id);
    if (!hit || !EDITABLE.has(c.field)) continue;
    const rec = hit as unknown as Record<string, string | number>;
    if (c.field === "day") {
      hit.day = Math.max(1, Math.min(7, Number(c.to) || hit.day));
      hit.dayLabel = dayLabel(hit.day);
    } else if (c.field === "limit") hit.limit = Math.max(0, Number(c.to) || 0);
    else if (c.field === "priority") hit.priority = readPriority(c.to);
    else if (c.field === "statusId") hit.statusId = Number(c.to) || hit.statusId;
    else if (c.field === "branch") {
      const br = matchBranch(c.to);
      hit.branch = br.branch;
      hit.city = br.city;
      hit.branchId = br.id;
    } else if (c.field === "timeFrom" || c.field === "timeTo") rec[c.field] = eveningTime(c.to);
    else rec[c.field] = c.to;
  }
  return stampTimes(next);
}

function hhmm(s: string) {
  const m = String(s || "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return "";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function isoDate(raw?: string) {
  const t = String(raw || "").trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (ru) return `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}`;
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function academicEndIso(startIso: string) {
  const [y, m] = startIso.split("-").map(Number);
  const endY = m >= 6 ? y + 1 : y;
  return `${endY}-05-31`;
}

function ruFromIso(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

function laterIso(a: string, b: string) {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

function minBDateFromError(msg: string) {
  const m = String(msg).match(/меньше\s+(\d{1,2})[.](\d{1,2})[.](\d{4})/i);
  if (!m) return "";
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function asCrmDate(iso: string, ru: boolean) {
  return ru ? ruFromIso(iso) : iso;
}

export function defaultPeriod(from?: string, to?: string) {
  const start = isoDate(from);
  const end = to ? isoDate(to) : academicEndIso(start);
  return { bDate: ruFromIso(start), eDate: ruFromIso(end) };
}

function durationMin(from: string, to: string) {
  const a = hhmm(from).split(":").map(Number);
  const b = hhmm(to).split(":").map(Number);
  if (a.length < 2 || b.length < 2) return 90;
  const d = b[0] * 60 + b[1] - (a[0] * 60 + a[1]);
  return d > 0 ? d : 90;
}

function crmFieldErrors(raw: unknown) {
  if (!raw || typeof raw !== "object") return "";
  const parts: string[] = [];
  for (const v of Object.values(raw as Record<string, unknown>)) {
    if (Array.isArray(v)) parts.push(v.map(String).join("; "));
    else if (v) parts.push(String(v));
  }
  return parts.filter(Boolean).join(" ");
}

async function regularsOfGroup(branch: number, gid: number, t: string, request: typeof import("@/data/alfacrm").request) {
  type Reg = {
    id?: number;
    related_id?: number;
    day?: number;
    time_from?: string;
    time_from_v?: string;
    time_to?: string;
    time_to_v?: string;
    lesson_type_id?: number;
    branch_id?: number;
    subject_id?: number;
    b_date?: string;
    e_date?: string;
  };
  const items: Reg[] = [];
  for (let page = 0; page < 6; page++) {
    const pack = await request<{ items?: Reg[] }>(`/v2api/${branch}/regular-lesson/index`, { page, pageSize: 100 }, t);
    const chunk = pack.items || [];
    for (const x of chunk) if (Number(x.related_id) === gid) items.push(x);
    if (chunk.length < 100) break;
  }
  return items;
}

function groupNoteOf(s: CrmSlot) {
  const a = String(s.description || s.groupNote || "").trim();
  const b = String(s.remarks || "").trim();
  if (a && b && a !== b) return `${a}\n${b}`;
  return a || b;
}

export async function pushSlotsToCrm(slots: CrmSlot[], ids: string[]) {
  const { token, request, formatRuDob } = await import("@/data/alfacrm");
  const t = await token();
  const pick = new Set(ids.map(String));
  const list = slots.filter((s) => pick.has(s.id));
  const subjects = loadSubjects();
  const results: { id: string; ok: boolean; error?: string; groupId?: number; created?: boolean }[] = [];
  const next = slots.map((s) => ({ ...s, beats: beatsOf(s).map((b) => ({ ...b })) }));

  function crmId(res: unknown) {
    const r = res as { model?: { id?: number }; id?: number; success?: boolean; errors?: unknown };
    if (r && r.success === false) throw new Error(crmFieldErrors(r.errors) || JSON.stringify(r.errors || r).slice(0, 180));
    return Number(r?.model?.id || r?.id || 0);
  }

  async function postCrm(path: string, body: Record<string, unknown>) {
    try {
      return await request(path, body, t);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const min = minBDateFromError(msg);
      if (!min || body.b_date == null) throw e;
      const cur = isoDate(String(body.b_date));
      if (cur >= min) throw e;
      const ru = /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(String(body.b_date));
      const end = laterIso(isoDate(String(body.e_date || "")), academicEndIso(min));
      return await request(path, { ...body, b_date: asCrmDate(min, ru), e_date: asCrmDate(end, ru) }, t);
    }
  }

  for (const raw of list) {
    const s = next.find((x) => x.id === raw.id);
    if (!s) continue;
    const branch = s.branchId || 1;
    const branchSubs = subjects.filter((x) => next.some((slot) => slot.branchId === branch && slot.subjectId === x.id));
    const picked =
      (Number(s.subjectId) ? subjects.find((x) => x.id === Number(s.subjectId) && !x.local) : undefined) ||
      pickSubjectForSlot(s, branchSubs, loadScheduleMap().courses);
    const sub = picked;
    const subjectId = Number(sub?.id || 0);
    if (!subjectId) {
      results.push({
        id: s.id,
        ok: false,
        error: "В этом филиале нет такого предмета. Выберите из списка филиала или нажмите «Создать предмет».",
      });
      continue;
    }
    s.subjectId = subjectId;
    if (sub?.name) s.subject = sub.name;
    const roster = teachersAtBranch(branch, listTeachers(next));
    const teachers = teacherIdsOfSlot(s, branch, roster);
    if (s.teacher && !teachers.length) {
      s.teacherId = 0;
      s.teacherIds = [];
    } else if (teachers.length) {
      s.teacherId = teachers[0];
      s.teacherIds = teachers;
    }
    try {
      let groupId = Number(s.groupId) || 0;
      const wasNew = !groupId;
      let startIso = isoDate(s.bDate);
      let endIso = isoDate(s.eDate || academicEndIso(startIso));
      s.bDate = ruFromIso(startIso);
      s.eDate = ruFromIso(endIso);
      const teacherIds = teachers.map(Number).filter((n) => n > 0);
      const groupBody = {
        name: s.groupName || s.course,
        note: groupNoteOf(s),
        limit: Number(s.limit) || 0,
        branch_ids: [branch],
        subject_id: subjectId,
        subject_ids: [subjectId],
        status_id: s.statusId || 1,
        b_date: formatRuDob(startIso),
        e_date: formatRuDob(endIso),
        custom_prioritet: readPriority(s.priority),
        custom_hashtagkursa: String(s.hashtags || ""),
        custom_workingout: String(s.makeup || ""),
        ...(s.levelId ? { level_id: s.levelId } : { level_id: null }),
        ...(teacherIds.length ? { teacher_ids: teacherIds } : {}),
      };
      if (!groupId) {
        const created = await request(`/v2api/${branch}/group/create`, groupBody, t);
        groupId = crmId(created);
        if (!groupId) throw new Error("AlfaCRM не вернула номер группы после создания");
        s.groupId = groupId;
        s.branchId = branch;
        s.signup = signupOf(branch, groupId);
        try {
          const { loadSiteTree, saveSiteTree, slotTreeKey } = await import("./site-tree");
          const tree = loadSiteTree();
          const old = String(raw.id);
          const neu = slotTreeKey(s);
          if (neu && neu !== old) {
            if (tree.assign[old]) {
              tree.assign[neu] = tree.assign[old];
              delete tree.assign[old];
              saveSiteTree(tree);
            }
            s.id = neu;
          }
        } catch {
          s.id = `gid:${branch}:${groupId}`;
        }
      } else {
        await postCrm(`/v2api/${branch}/group/update`, { id: groupId, ...groupBody });
      }
      const beats = beatsOf(s).map((b) => ({
        ...b,
        timeFrom: hhmm(b.timeFrom || s.timeFrom),
        timeTo: hhmm(b.timeTo || s.timeTo),
        day: Math.max(1, Math.min(7, Number(b.day) || Number(s.day) || 1)),
      }));
      const existing = groupId ? await regularsOfGroup(branch, groupId, t, request).catch(() => []) : [];
      const fromCrm = existing.map((x) => isoDate(x.b_date || "")).filter(Boolean);
      if (fromCrm.length) startIso = laterIso(startIso, fromCrm.sort()[fromCrm.length - 1] || startIso);
      const used = new Set<number>();
      const savedBeats: LessonBeat[] = [];
      for (const b of beats) {
        if (!b.timeFrom || !b.timeTo) {
          savedBeats.push(b);
          continue;
        }
        let lessonId = Number(b.lessonId) || 0;
        if (lessonId && used.has(lessonId)) lessonId = 0;
        if (!lessonId) {
          const free = existing.filter((x) => x.id && !used.has(Number(x.id)));
          const sameDay = free.filter((x) => Number(x.day) === b.day);
          const exact = sameDay.find((x) => hhmm(String(x.time_from_v || x.time_from || "")) === b.timeFrom);
          const hit = exact || (sameDay.length === 1 ? sameDay[0] : null) || (free.length === 1 && beats.length === 1 ? free[0] : null);
          if (hit?.id) lessonId = Number(hit.id);
        }
        const known = existing.find((x) => Number(x.id) === lessonId);
        const bDate = laterIso(startIso, known?.b_date ? isoDate(known.b_date) : "");
        const eDate = laterIso(endIso, known?.e_date ? isoDate(known.e_date) : academicEndIso(bDate));
        const payload = {
          related_class: "Group",
          related_id: groupId,
          subject_id: subjectId,
          subject_ids: [subjectId],
          branch_id: branch,
          lesson_type_id: Number(known?.lesson_type_id) || 2,
          day: b.day,
          days: [b.day],
          time_from_v: b.timeFrom,
          time_to_v: b.timeTo,
          duration: durationMin(b.timeFrom, b.timeTo),
          b_date: bDate,
          e_date: eDate,
          ...(teacherIds.length ? { teacher_ids: teacherIds } : {}),
          ...(s.roomId ? { room_id: s.roomId } : {}),
        };
        if (lessonId) {
          await postCrm(`/v2api/${branch}/regular-lesson/update?id=${lessonId}`, { id: lessonId, ...payload });
          used.add(lessonId);
          savedBeats.push({ ...b, lessonId });
        } else {
          let created: unknown;
          try {
            created = await postCrm(`/v2api/${branch}/regular-lesson/create`, payload);
          } catch (e) {
            const msg = e instanceof Error ? e.message : "";
            if (/филиал не доступен для преподавател/i.test(msg) && "teacher_ids" in payload) {
              const { teacher_ids: _drop, ...rest } = payload as typeof payload & { teacher_ids?: number[] };
              created = await postCrm(`/v2api/${branch}/regular-lesson/create`, rest);
              s.teacherId = 0;
              s.teacherIds = [];
            } else {
              throw e;
            }
          }
          const newId = crmId(created) || 0;
          if (!newId) throw new Error("AlfaCRM не создала регулярное занятие — проверьте день и время.");
          await postCrm(`/v2api/${branch}/regular-lesson/update?id=${newId}`, {
            id: newId,
            related_class: "Group",
            related_id: groupId,
            lesson_type_id: 2,
            subject_id: subjectId,
            subject_ids: [subjectId],
            branch_id: branch,
            day: b.day,
            days: [b.day],
            time_from_v: b.timeFrom,
            time_to_v: b.timeTo,
            ...(teacherIds.length ? { teacher_ids: teacherIds } : {}),
            b_date: bDate,
            e_date: eDate,
          }).catch(() => null);
          used.add(newId);
          savedBeats.push({ ...b, lessonId: newId });
          if (!s.lessonId) s.lessonId = newId;
        }
      }
      s.beats = savedBeats;
      s.bDate = formatRuDob(startIso);
      s.eDate = formatRuDob(endIso);
      const first = savedBeats[0];
      if (first) {
        s.day = first.day;
        s.dayLabel = dayLabel(first.day);
        s.timeFrom = first.timeFrom;
        s.timeTo = first.timeTo;
        s.lessonId = first.lessonId;
        s.timesPerWeek = savedBeats.length;
      }
      results.push({ id: raw.id, ok: true, groupId, created: wasNew });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ошибка CRM";
      if (/филиал не доступен для преподавател/i.test(msg)) {
        results.push({
          id: raw.id,
          ok: false,
          error: "Этот педагог не работает в выбранном филиале AlfaCRM. Выберите педагога этого филиала — список уже отфильтрован.",
        });
        continue;
      }
      let shown = "AlfaCRM не приняла регулярное занятие.";
      const minB = minBDateFromError(msg);
      if (minB) {
        shown = `Дата начала в CRM не раньше ${ruFromIso(minB)}. Выгрузка подставит её сама — нажмите ещё раз.`;
      } else {
        const brace = msg.indexOf("{");
        if (brace >= 0) {
          try {
            const j = JSON.parse(msg.slice(brace));
            shown = crmFieldErrors(j.errors || j) || shown;
          } catch {
            const ru = msg.match(/"[^"]+":\s*\[\s*"([^"]+)"/);
            shown = ru?.[1] || msg.replace(/^alfacrm \d+\s+\S+\s*/, "").slice(0, 180) || shown;
          }
        } else if (/день недели/i.test(msg)) {
          shown = "Укажите день недели в строке группы (Пн–Вс) и нажмите ещё раз.";
        } else {
          shown = msg.replace(/^alfacrm \d+\s+\S+\s*/, "").slice(0, 180) || shown;
        }
      }
      results.push({ id: raw.id, ok: false, error: shown.slice(0, 220) });
    }
  }
  return { results, slots: next };
}
