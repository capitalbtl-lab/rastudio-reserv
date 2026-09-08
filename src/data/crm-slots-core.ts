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
  /** Период этого регулярного урока. Второй урок в группе копирует первый. */
  bDate?: string;
  eDate?: string;
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
  /** Учится в группе (is_study=1). Состав, не явка. */
  takenStudy?: number;
  /** Лиды в группе (is_study=0). */
  takenLead?: number;
  /** custom_prioritet: 1 первая запись, 0 не выкладывать на сайт. Пусто = 0. */
  priority?: number;
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

/** Отметка педагога на занятии: явка и сумма списания. */
export type LessonPupil = {
  customerId: number;
  name?: string;
  attend: boolean;
  amount?: number;
  cttId?: number;
  reasonId?: number;
  reason?: string;
  grade?: string;
  homeworkGrade?: string;
  note?: string;
  /** Остаток абонемента, как в Alfa: «0 / 8 ост». */
  rest?: string;
};

export type LessonRosterPerson = {
  id: number;
  name?: string;
  rest?: string;
  status?: string;
};

export type GroupCalLesson = {
  date: string;
  from: string;
  to: string;
  status: number;
  type: string;
  typeId?: number;
  duration?: number;
  room?: string;
  roomId?: number;
  teacher?: string;
  teacherIds?: number[];
  subject?: string;
  subjectId?: number;
  group?: string;
  groupIds?: number[];
  topic?: string;
  homework?: string;
  note?: string;
  attend?: number;
  total?: number;
  lessonId?: number;
  customerIds?: number[];
  amount?: number;
  cttId?: number;
  pupils?: LessonPupil[];
};

export type SlotVersion = { at: string; reason: string; count: number; slots: CrmSlot[] };

export function pupilNameOk(name?: string) {
  const s = String(name || "").trim();
  return s && !/^клиент\s+\d+$/i.test(s) ? s : "";
}

/** Собрать состав из двух журналов: имена и суммы не теряются, если в одном источнике дырка. */
export function mergeLessonPupils(a?: LessonPupil[], b?: LessonPupil[]): LessonPupil[] | undefined {
  const map = new Map<number, LessonPupil>();
  for (const src of [a || [], b || []]) {
    for (const p of src) {
      const id = Number(p.customerId) || 0;
      if (!id) continue;
      const prev = map.get(id);
      if (!prev) {
        map.set(id, { ...p, customerId: id });
        continue;
      }
      map.set(id, {
        ...prev,
        ...p,
        customerId: id,
        name: pupilNameOk(p.name) || pupilNameOk(prev.name) || p.name || prev.name,
        amount: Number(p.amount) > 0 ? p.amount : prev.amount,
        cttId: Number(p.cttId) > 0 ? p.cttId : prev.cttId,
        attend: p.attend ?? prev.attend,
        rest: p.rest || prev.rest,
      });
    }
  }
  return map.size ? [...map.values()] : undefined;
}

/** Проведённое без ФИО или сумм — тянуть Alfa, не отдавать дырявый диск. */
export function lessonRosterThin(hit?: { status?: number; pupils?: LessonPupil[]; customerIds?: number[] } | null) {
  if (!hit) return false;
  if (Number(hit.status) !== 3) return false;
  const pupils = hit.pupils || [];
  if (!pupils.length) return true;
  if (pupils.some((p) => !pupilNameOk(p.name))) return true;
  if (!pupils.some((p) => Number(p.amount) > 0)) return true;
  return false;
}

/** Цвет ячейки как в виджете посещений Alfa. */
export type LessonTileTone = "today" | "done" | "missed" | "overdue" | "planned" | "cancelled";

export function lessonTileTone(
  l: Pick<GroupCalLesson, "date" | "status" | "pupils" | "amount">,
  today: string,
  customerId?: number,
): LessonTileTone {
  if (Number(l.status) === 2) return "cancelled";
  const ymd = String(l.date || "").slice(0, 10);
  const isToday = Boolean(ymd && ymd === today);
  if (Number(l.status) === 3) {
    if (customerId) {
      const mine = (l.pupils || []).find((p) => Number(p.customerId) === customerId);
      if (mine && mine.attend === false && !(Number(mine.amount ?? l.amount) > 0)) return "missed";
    }
    return isToday ? "today" : "done";
  }
  if (ymd && ymd < today) return "overdue";
  if (isToday) return "today";
  return "planned";
}

/** Состав карточки занятия: все ученики группы + имена с диска. Лиды и архив — только если уже в уроке. */
export function mergeLessonRoster(
  lesson: { pupils?: LessonPupil[]; customerIds?: number[] },
  people: LessonRosterPerson[] = [],
): LessonPupil[] {
  const fromLesson: LessonPupil[] = lesson.pupils?.length
    ? lesson.pupils
    : (lesson.customerIds || []).map((id) => ({ customerId: Number(id) || 0, attend: true }));
  const byId = new Map<number, LessonPupil>();
  for (const p of fromLesson) {
    const id = Number(p.customerId) || 0;
    if (!id) continue;
    byId.set(id, { ...p, customerId: id });
  }
  for (const m of people) {
    const id = Number(m.id) || 0;
    if (!id) continue;
    const skip = m.status === "архив" || m.status === "лид";
    if (skip && !byId.has(id)) continue;
    const prev = byId.get(id);
    byId.set(id, {
      customerId: id,
      attend: prev?.attend ?? true,
      amount: prev?.amount,
      cttId: prev?.cttId,
      reasonId: prev?.reasonId,
      reason: prev?.reason,
      grade: prev?.grade,
      homeworkGrade: prev?.homeworkGrade,
      note: prev?.note,
      name: pupilNameOk(prev?.name) || String(m.name || "").trim() || prev?.name || "",
      rest: prev?.rest || m.rest || "",
    });
  }
  return [...byId.values()].sort(
    (a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ru") || a.customerId - b.customerId,
  );
}

/** Подпись остатка как в Alfa: «0 / 8 ост», «128 ост», «0 / 6 ост, 27.06». */
export function lessonRestLabel(t?: { rest?: number; lessons?: number; eDate?: string } | null): string {
  if (!t) return "";
  const left = Number(t.rest) || 0;
  const total = Number(t.lessons) || 0;
  const till = String(t.eDate || "").replace(/^(\d{2})\.(\d{2})\.(\d{4})$/, "$1.$2");
  const core = total > 0 && total !== left ? `${left} / ${total} ост` : `${left} ост`;
  return till ? `${core}, ${till}` : core;
}

export function lessonRestLeft(raw?: string): number | null {
  if (!raw) return null;
  const m = String(raw).match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

export function validBeat(b?: LessonBeat | null): boolean {
  if (!b) return false;
  const day = Number(b.day);
  return day >= 1 && day <= 7 && /^\d{1,2}:\d{2}$/.test(String(b.timeFrom || ""));
}

export function beatsOf(s: CrmSlot): LessonBeat[] {
  const raw = s.beats?.length
    ? s.beats
    : [{ day: s.day, timeFrom: s.timeFrom, timeTo: s.timeTo, lessonId: s.lessonId, bDate: s.bDate, eDate: s.eDate }];
  const good = raw.filter(validBeat);
  if (good.length) return good;
  return [{ day: Number(s.day) || 1, timeFrom: s.timeFrom || "", timeTo: s.timeTo || "", lessonId: s.lessonId || 0, bDate: s.bDate, eDate: s.eDate }];
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

/** Дата или пусто. Не подставляет сегодня — иначе наследование периода врёт. */
export function isoDateOrEmpty(raw?: string) {
  const t = String(raw || "").trim();
  if (!t) return "";
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (ru) return `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}`;
  return "";
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

export type RegularPeriodHint = {
  bDate?: string;
  eDate?: string;
  b_date?: string;
  e_date?: string;
  id?: number;
  lessonId?: number;
};

function periodOfHint(row?: RegularPeriodHint | null) {
  if (!row) return null;
  const b = isoDateOrEmpty(row.bDate || row.b_date);
  const e = isoDateOrEmpty(row.eDate || row.e_date);
  return b && e ? { bDate: b, eDate: e } : null;
}

export function ruDate(raw?: string) {
  const iso = isoDateOrEmpty(raw);
  return iso ? ruFromIso(iso) : String(raw || "").trim();
}

/** Время HH:MM. Только 4 цифры, двоеточие само. */
export function maskHm(raw: string): string {
  const t = String(raw || "");
  if (t.includes(":")) {
    const [hPart, mPart = ""] = t.split(":");
    const h = hPart.replace(/\D/g, "").slice(0, 2);
    const min = mPart.replace(/\D/g, "").slice(0, 2);
    if (!h && !min) return "";
    return `${h}:${min}`;
  }
  const d = t.replace(/\D/g, "").slice(0, 4);
  if (!d) return "";
  if (d.length <= 2) return d.length === 2 ? `${d}:` : d;
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}

/** Дата дд.мм.гггг. Только 8 цифр, точки сами. */
export function maskRuDate(raw: string): string {
  const d = String(raw || "").replace(/\D/g, "").slice(0, 8);
  if (!d) return "";
  if (d.length <= 2) return d.length === 2 ? `${d}.` : d;
  if (d.length <= 4) return `${d.slice(0, 2)}.${d.slice(2)}${d.length === 4 ? "." : ""}`;
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`;
}

export function beatFollowsGroup(b: { bDate?: string; eDate?: string }, groupFrom?: string, groupTo?: string) {
  const bb = isoDateOrEmpty(b.bDate);
  const be = isoDateOrEmpty(b.eDate);
  if (!bb && !be) return true;
  return bb === isoDateOrEmpty(groupFrom) && be === isoDateOrEmpty(groupTo);
}

export function stampBeatsPeriod(beats: LessonBeat[], bDate: string, eDate: string): LessonBeat[] {
  return beats.map((b) => ({ ...b, bDate, eDate }));
}

export function stampBeatsPeriodIfFollow(beats: LessonBeat[], prevFrom: string, prevTo: string, bDate: string, eDate: string): LessonBeat[] {
  return beats.map((b) => (beatFollowsGroup(b, prevFrom, prevTo) ? { ...b, bDate, eDate } : b));
}

/**
 * Второй урок в группе берёт период первого, не учебный год до мая.
 * Известный regular — свои даты. Иначе первый sibling с датами. Иначе период группы.
 */
export function inheritRegularPeriod(opts: {
  siblings?: RegularPeriodHint[];
  groupFrom?: string;
  groupTo?: string;
  preferId?: number;
}): { bDate: string; eDate: string } {
  const rows = opts.siblings || [];
  const prefer = Number(opts.preferId) || 0;
  if (prefer) {
    const hit = periodOfHint(rows.find((x) => Number(x.id || x.lessonId) === prefer));
    if (hit) return hit;
  }
  for (const row of rows) {
    const hit = periodOfHint(row);
    if (hit) return hit;
  }
  const start = isoDateOrEmpty(opts.groupFrom) || isoDate(opts.groupFrom);
  const end = isoDateOrEmpty(opts.groupTo) || academicEndIso(start);
  return { bDate: start, eDate: end };
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
