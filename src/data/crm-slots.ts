import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CmsSession } from "@/data/cms";
import { request } from "@/data/alfacrm";
import { yandexJson } from "@/data/agent-channels";
import { type CrmSlot, type SlotVersion, type LessonBeat } from "@/data/crm-slots-core";

export { SCHOOL_ORDER, type CrmSlot, type SlotVersion, type LessonBeat } from "@/data/crm-slots-core";

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

export function schoolOf(path: string, subject: string, group: string) {
  const t = `${path} ${subject} ${group}`.toLowerCase();
  if (/art-studio|hudvuz|sculptural|digitalart|манг|аним|живопис|лепк|худож|рисов|академическ/.test(t)) return "Художественная школа";
  if (/robot|робот/.test(t)) return "Школа робототехники";
  if (/python|scratch|питон|скретч|create|криэйт|junior|gamedev|unity|blender|codebook|програм|си\+\+|c\+\+|gamedesign|3d-model/.test(t))
    return "Школа программирования";
  if (/наук|физик|steam|радио|tesla|science|беспилот|дрон|инженер/.test(t)) return "Школа наук и инженерии";
  if (/подготовк|preparation|happybricks|лего|ранн/.test(t)) return "Школа раннего развития";
  if (/англий|язык|english|japanese|vitamin|япон|коре/.test(t)) return "Школа иностранных языков";
  if (/модельн|подиум|model/.test(t)) return "Модельная школа";
  return "Прочее";
}

export function courseOf(subject: string, group: string, path: string) {
  return (subject || group || path || "Курс").replace(/\s+/g, " ").trim();
}

const ART_SCHOOL_PATH = "/art-studio-9-13";
const ART_SCHOOL_COURSE = "Художественная школа 10–15 лет";
const HUDVUZ_PATH = "/podgotovka-v-hudvuz";
const HUDVUZ_COURSE = "Подготовка в художественные вузы";

/** В CRM часть групп 10–15 лет ошибочно висит на предмете «подготовка в вуз». URL /art-studio-9-13 не меняем. */
export function normalizeArtSlot(s: CrmSlot): CrmSlot {
  const hay = `${s.groupName} ${s.subject} ${s.course} ${s.age} ${s.path}`.toLowerCase().replace(/ё/g, "е");
  const tenFifteen = /10\s*[-–]\s*1[45]/.test(hay);
  const schoolByName = /художественн/.test(hay) && /школ/.test(hay) && tenFifteen;
  const portrait = /портрет/.test(hay);
  const isSchool =
    s.subjectId === 92 ||
    s.subjectId === 115 ||
    schoolByName ||
    portrait ||
    (s.path === ART_SCHOOL_PATH && !(/вуз/.test(hay) && !tenFifteen));
  if (isSchool) {
    return { ...s, path: ART_SCHOOL_PATH, course: ART_SCHOOL_COURSE, subject: ART_SCHOOL_COURSE, age: "10–15 лет" };
  }
  if (s.subjectId === 5 || s.path === HUDVUZ_PATH || (/вуз/.test(hay) && !tenFifteen)) {
    return {
      ...s,
      path: HUDVUZ_PATH,
      course: HUDVUZ_COURSE,
      subject: HUDVUZ_COURSE,
      age: s.age && /1[4-7]/.test(s.age) ? s.age : "от 14 лет",
    };
  }
  return s;
}

export function dayLabel(day?: number) {
  return DAYS[(Number(day) || 1) - 1] || "День";
}

export function beatsOf(s: CrmSlot): LessonBeat[] {
  if (s.beats?.length) return s.beats;
  return [{ day: s.day, timeFrom: s.timeFrom, timeTo: s.timeTo, lessonId: s.lessonId }];
}

export function mergeGroupBeats(slots: CrmSlot[]): CrmSlot[] {
  const order: string[] = [];
  const map = new Map<string, CrmSlot>();
  for (const raw of slots) {
    const s = { ...raw };
    const k = s.groupId ? `${s.branchId}:${s.groupId}` : s.id;
    const extra = beatsOf(s);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, { ...s, beats: extra, timesPerWeek: extra.length });
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
    map.set(k, { ...prev, beats, timesPerWeek: beats.length });
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
    signup: s.signup || (s.groupId ? signupOf(s.branchId, s.groupId) : s.path),
    city: s.city,
    branch: s.branch,
    directionId: String(s.subjectId),
    courseId: String(s.subjectId),
    ageTag: s.age,
    courseFilter: s.course || s.subject,
    path: s.path,
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
    subjectId: Number(s.courseId) || 0,
    subject: s.courseFilter,
    school: schoolOf(s.path || "", s.courseFilter, s.group),
    course: s.courseFilter || s.group,
    path: s.path || "",
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
    bDate: "",
    eDate: "",
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
      school: rec.school || prev.school || schoolOf(prev.path, rec.subject || prev.subject, rec.groupName || prev.groupName),
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
      course: hit.course,
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
  if (snapped.course && catalog.some((s) => s.course === snapped.course)) {
    next.course = snapped.course;
    next.school = snapped.school || next.school;
    next.age = snapped.age || next.age;
  } else if (/художественн|студи/.test(t)) {
    next.school = next.school || "Художественная школа";
    next.course = formatCourseName("Художественная студия", next.age);
  } else if (/робот/.test(t)) {
    next.school = next.school || "Школа робототехники";
    next.course = next.course || "Робототехника";
  }
  if (!next.school && next.course) next.school = schoolOf("", next.course, "");
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
  age: string;
  day: number;
  timeFrom: string;
  timeTo: string;
  branch: string;
  teacher: string;
  groupName?: string;
  limit?: number;
};

export function buildSlot(draft: SlotDraft, catalog: CrmSlot[]): CrmSlot {
  const br = matchBranch(`${draft.branch} ${draft.course}`);
  const school = draft.school || schoolOf("", draft.course, draft.groupName || "");
  const age = draft.age || (draft.course.match(/\(([^)]+)\)/)?.[1] || "");
  const course = formatCourseName(draft.course || "Курс", age);
  const twin =
    catalog.find((s) => s.school === school && (s.course === course || s.course.includes(course.split("(")[0].trim()))) ||
    catalog.find((s) => s.school === school);
  const teacher = matchTeacher(draft.teacher, catalog);
  const teacherHit = catalog.find((s) => s.teacher === teacher);
  const day = Math.max(1, Math.min(7, Number(draft.day) || 1));
  const year = new Date().getFullYear();
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    lessonId: 0,
    groupId: 0,
    groupName: draft.groupName || `${year} ${course}`,
    groupNote: "",
    statusId: 1,
    limit: Number(draft.limit) || twin?.limit || 8,
    taken: 0,
    subjectId: twin?.subjectId || 0,
    subject: twin?.subject || course,
    school,
    course,
    path: twin?.path || "",
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
    bDate: "",
    eDate: "",
  };
}

const EDITABLE = new Set(["groupName", "age", "day", "timeFrom", "timeTo", "teacher", "limit", "groupNote", "course", "school", "branch"]);

export async function aiSchedulePatch(slots: CrmSlot[], prompt: string) {
  return aiScheduleParse(slots, prompt, slots.map((s) => s.id));
}

export async function aiScheduleParse(slots: CrmSlot[], prompt: string, selectedIds: string[] = []) {
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
- Если оператор добавляет группу — массив adds. Несколько групп в одном запросе (разные дни, филиалы, возрасты, курсы) — отдельный объект adds на каждую, ничего не склеивай.
- Если правит существующие — changes только с id из списка разрешённых. Не выдумывай id.
- Разрешённые id для правки: ${selectedIds.length ? selectedIds.join(", ") : "нет — только adds, существующие не трогай"}.
Ответ JSON.`,
    `Запрос: ${asked.slice(0, 2000)}
JSON: {"comment":"что сделали","changes":[{"id":"crm-…","field":"timeFrom","to":"16:00"}],"adds":[{"school":"Художественная школа","course":"Художественная студия (5-6 лет)","age":"5-6 лет","day":2,"timeFrom":"18:30","timeTo":"20:00","branch":"Коломна, ул. Гражданская, 2","teacher":"Самсонова Ольга А"},{"school":"Художественная школа","course":"Художественная студия (7-9 лет)","age":"7-9 лет","day":4,"timeFrom":"18:30","timeTo":"20:00","branch":"Коломна, ЦМИТ, ул. Октябрьской революции, 340","teacher":"Самсонова Ольга А"}]}
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
          school: a.school || schoolOf("", String(a.course || ""), ""),
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

export async function pushSlotsToCrm(slots: CrmSlot[], dirtyIds?: string[]) {
  const { token } = await import("@/data/alfacrm");
  const t = await token();
  const list = dirtyIds?.length ? slots.filter((s) => dirtyIds.includes(s.id)) : slots;
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const s of list) {
    if (!s.branchId || !s.groupId || !s.lessonId) {
      results.push({ id: s.id, ok: false, error: "нет id группы или урока" });
      continue;
    }
    try {
      await request(
        `/v2api/${s.branchId}/group/update`,
        {
          id: s.groupId,
          name: s.groupName,
          note: s.groupNote,
          limit: s.limit,
          teacher_ids: s.teacherIds.length ? s.teacherIds : s.teacherId ? [s.teacherId] : undefined,
        },
        t,
      );
      for (const b of beatsOf(s)) {
        const payload = {
          related_id: s.groupId,
          subject_id: s.subjectId || undefined,
          day: b.day,
          time_from: b.timeFrom,
          time_to: b.timeTo,
          time_from_v: b.timeFrom,
          time_to_v: b.timeTo,
          teacher_ids: s.teacherIds.length ? s.teacherIds : s.teacherId ? [s.teacherId] : undefined,
        };
        if (b.lessonId) {
          await request(`/v2api/${s.branchId}/regular-lesson/update`, { id: b.lessonId, ...payload }, t);
        } else {
          await request(`/v2api/${s.branchId}/regular-lesson/create`, payload, t);
        }
      }
      results.push({ id: s.id, ok: true });
    } catch (e) {
      results.push({ id: s.id, ok: false, error: e instanceof Error ? e.message.slice(0, 180) : "ошибка CRM" });
    }
  }
  return results;
}
