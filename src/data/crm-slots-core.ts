export const SCHOOL_ORDER = [
  "Художественная школа",
  "Школа робототехники",
  "Школа программирования",
  "Школа наук и инженерии",
  "Школа раннего развития",
  "Школа иностранных языков",
  "Модельная школа",
  "Прочее",
];

export type LessonBeat = {
  day: number;
  timeFrom: string;
  timeTo: string;
  lessonId: number;
};

export type CrmSlot = {
  id: string;
  lessonId: number;
  groupId: number;
  groupName: string;
  groupNote: string;
  statusId: number;
  limit: number;
  taken: number;
  subjectId: number;
  subject: string;
  school: string;
  course: string;
  /** ID курса в дереве сайта. Группа в папке курса только по этому полю / tree.assign. Имя курса — подпись. */
  courseId?: string;
  /** ID школы в дереве = course.schoolId. */
  schoolId?: string;
  path: string;
  age: string;
  day: number;
  dayLabel: string;
  timeFrom: string;
  timeTo: string;
  timesPerWeek: number;
  beats?: LessonBeat[];
  branchId: number;
  city: string;
  branch: string;
  signup: string;
  teacherId: number;
  teacherIds: number[];
  teacher: string;
  roomId: number;
  bDate: string;
  eDate: string;
  hashtags?: string;
  makeup?: string;
  description?: string;
  remarks?: string;
  levelId?: number;
  /** Выбранный абонемент студии для этой группы. Не поле AlfaCRM — живёт на сайте. */
  tariffId?: number;
  mismatch?: "soft" | "hard";
  mismatchText?: string;
};

export const GROUP_LEVELS = [
  { id: 7, name: "1 класс" },
  { id: 8, name: "2 класс" },
  { id: 9, name: "3 класс" },
  { id: 10, name: "4 класс" },
  { id: 11, name: "5 класс" },
  { id: 15, name: "Ознакомительный" },
  { id: 12, name: "Начальный" },
  { id: 13, name: "Средний" },
  { id: 14, name: "Продвинутый" },
] as const;

export function levelName(id?: number) {
  return GROUP_LEVELS.find((x) => x.id === Number(id))?.name || "";
}

export type GroupCalLesson = {
  date: string;
  from: string;
  to: string;
  status: number;
  type: string;
  typeId?: number;
  duration?: number;
  room?: string;
  teacher?: string;
  subject?: string;
  group?: string;
  topic?: string;
  homework?: string;
  attend?: number;
  total?: number;
  lessonId?: number;
};

export type SlotVersion = { at: string; reason: string; count: number; slots: CrmSlot[] };

export function validBeat(b?: LessonBeat | null): boolean {
  if (!b) return false;
  const day = Number(b.day);
  return day >= 1 && day <= 7 && /^\d{1,2}:\d{2}$/.test(String(b.timeFrom || ""));
}

export function beatsOf(s: CrmSlot): LessonBeat[] {
  const raw = s.beats?.length
    ? s.beats
    : [{ day: s.day, timeFrom: s.timeFrom, timeTo: s.timeTo, lessonId: s.lessonId }];
  const good = raw.filter(validBeat);
  if (good.length) return good;
  return [{ day: Number(s.day) || 1, timeFrom: s.timeFrom || "", timeTo: s.timeTo || "", lessonId: s.lessonId || 0 }];
}

const BRANCHES = [
  { id: 1, city: "Коломна", branch: "ул. Гражданская, 2", keys: ["гражданск", "гражданская"] },
  { id: 2, city: "Коломна", branch: "ЦМИТ, ул. Октябрьской революции, 340", keys: ["цмит", "октябрьск", "революц"] },
  { id: 3, city: "Луховицы", branch: "ул. Пушкина, 202А", keys: ["луховиц", "пушкин"] },
  { id: 4, city: "Коломна", branch: "летние программы", keys: ["летн", "лагер"] },
];

export function matchBranch(raw: string) {
  const t = String(raw || "").toLowerCase().replace(/ё/g, "е");
  return BRANCHES.find((b) => b.keys.some((k) => t.includes(k))) || BRANCHES[0];
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

export function defaultPeriod(from?: string, to?: string) {
  const start = isoDate(from);
  const end = to ? isoDate(to) : academicEndIso(start);
  return { bDate: ruFromIso(start), eDate: ruFromIso(end) };
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
