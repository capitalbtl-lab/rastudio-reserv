import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CmsSession } from "@/data/cms";
import { request } from "@/data/alfacrm";
import { yandexJson } from "@/data/agent-channels";
import { type CrmSlot, type SlotVersion } from "@/data/crm-slots-core";

export { SCHOOL_ORDER, type CrmSlot, type SlotVersion } from "@/data/crm-slots-core";

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

export function stampTimes(slots: CrmSlot[]) {
  const n = new Map<string, number>();
  for (const s of slots) {
    const k = `${s.branchId}:${s.groupId}`;
    n.set(k, (n.get(k) || 0) + 1);
  }
  for (const s of slots) s.timesPerWeek = n.get(`${s.branchId}:${s.groupId}`) || 1;
  return slots;
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

const EDITABLE = new Set(["groupName", "age", "day", "timeFrom", "timeTo", "teacher", "limit", "groupNote", "course", "school"]);

export async function aiSchedulePatch(slots: CrmSlot[], prompt: string) {
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
    branch: s.branch,
    city: s.city,
    timesPerWeek: s.timesPerWeek,
  }));
  const llm = await yandexJson<{ changes?: { id?: string; field?: string; to?: string | number }[]; comment?: string }>(
    "Ты методист расписания студии «Развивайся». Меняй только то, что просит оператор. Поля: groupName, age, day (1-7), timeFrom, timeTo, teacher, limit, groupNote, course, school. Не выдумывай id. Ответ — JSON.",
    `Запрос: ${prompt.slice(0, 2000)}
JSON: {"comment":"что сделали","changes":[{"id":"crm-…","field":"timeFrom","to":"16:00"}]}
Слоты:
${JSON.stringify(slim).slice(0, 18000)}`,
    4000,
  );
  const changes: { id: string; field: string; from: string; to: string }[] = [];
  for (const c of llm?.changes || []) {
    if (!c.id || !c.field || !EDITABLE.has(c.field)) continue;
    const hit = slots.find((s) => s.id === c.id);
    if (!hit) continue;
    const from = String((hit as unknown as Record<string, unknown>)[c.field] ?? "");
    const to = String(c.to ?? "");
    if (from === to) continue;
    changes.push({ id: c.id, field: c.field, from, to });
  }
  return { comment: llm?.comment || (changes.length ? "Правки по запросу." : "Ничего не менял — уточните запрос."), changes };
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
      await request(
        `/v2api/${s.branchId}/regular-lesson/update`,
        {
          id: s.lessonId,
          related_id: s.groupId,
          subject_id: s.subjectId || undefined,
          day: s.day,
          time_from: s.timeFrom,
          time_to: s.timeTo,
          time_from_v: s.timeFrom,
          time_to_v: s.timeTo,
          teacher_ids: s.teacherIds.length ? s.teacherIds : s.teacherId ? [s.teacherId] : undefined,
        },
        t,
      );
      results.push({ id: s.id, ok: true });
    } catch (e) {
      results.push({ id: s.id, ok: false, error: e instanceof Error ? e.message.slice(0, 180) : "ошибка CRM" });
    }
  }
  return results;
}
