/** История группы с диска. Не журнал ребёнка: только вход/выход из cgi. */

import { lessonStatusLabel } from "./crm-journal-core.ts";
import { groupStatusName, GROUP_PRIORITY } from "./group-status.ts";

export type GroupHistoryKind = "group" | "lesson" | "member";

export type GroupHistoryEvent = {
  id: string;
  at: string;
  kind: GroupHistoryKind;
  title: string;
  detail: string;
  lessonId?: number;
  customerId?: number;
  status?: number;
};

export type GroupHistoryMember = {
  customerId: number;
  name?: string;
  active: boolean;
  role?: string;
};

export type GroupHistoryLesson = {
  date: string;
  from?: string;
  to?: string;
  status?: number;
  lessonId?: number;
  type?: string;
  teacher?: string;
  room?: string;
  topic?: string;
  homework?: string;
  note?: string;
};

export type GroupHistoryInput = {
  branchId: number;
  groupId: number;
  name?: string;
  statusId?: number;
  bDate?: string;
  eDate?: string;
  subject?: string;
  subjectId?: number;
  teacher?: string;
  room?: string;
  priority?: number;
  age?: string;
  city?: string;
  branch?: string;
  course?: string;
  courseId?: string;
  limit?: number;
  taken?: number;
  takenStudy?: number;
  takenLead?: number;
  at?: string;
  journalAt?: string;
  journalFill?: { done?: string[]; pulled?: Record<string, string>; fail?: Record<string, string>; rechecked?: string[] };
  journalLife?: { from: string; to: string; source: string; at?: string };
  beats?: { day: number; timeFrom: string; timeTo: string; teacher?: string }[];
  calendar?: GroupHistoryLesson[];
  members?: GroupHistoryMember[];
};

const DAY = ["", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];

const QUARTER = [
  { q: 1, label: "I квартал", months: "январь–март", from: "01.01", to: "31.03" },
  { q: 2, label: "II квартал", months: "апрель–июнь", from: "01.04", to: "30.06" },
  { q: 3, label: "III квартал", months: "июль–сентябрь", from: "01.07", to: "30.09" },
  { q: 4, label: "IV квартал", months: "октябрь–декабрь", from: "01.10", to: "31.12" },
] as const;

const STATUS_HINT: Record<number, string> = {
  1: "идёт набор, обучение как «обучается» ещё не стартовало.",
  6: "занятия стартовали.",
  2: "группа учится, набор ещё открыт — на сайт можно выкладывать.",
  4: "группа учится, набор уже закрыт.",
  5: "набор на паузе, живое расписание обычно не светим.",
  10: "сейчас не учится, набор закрыт.",
  3: "обучение завершено — это архив.",
  7: "набор смены.",
  8: "смена идёт.",
  9: "смена завершена.",
};

export function ruDayName(day: number) {
  return DAY[Number(day) || 0] || "";
}

export function historyEventAt(raw: string, time?: string) {
  const s = String(raw || "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return time ? `${iso[1]}-${iso[2]}-${iso[3]}T${String(time).slice(0, 5)}` : `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (ru) {
    const ymd = `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}`;
    return time ? `${ymd}T${String(time).slice(0, 5)}` : ymd;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 16);
  return s.slice(0, 19);
}

export function ruHistoryWhen(at: string) {
  const s = String(at || "").trim();
  if (!s) return "дата на диске не записана";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return s;
  const day = `${m[3]}.${m[2]}.${m[1]}`;
  return m[4] ? `${day} ${m[4]}:${m[5]}` : day;
}

export function periodKeyLabel(key: string) {
  const k = String(key || "").trim();
  const q = /^(\d{4})q([1-4])$/.exec(k);
  if (q) {
    const m = QUARTER[Number(q[2]) - 1];
    return `${m.label} ${q[1]} (${m.months}, ${m.from}.${q[1]}–${m.to}.${q[1]})`;
  }
  const h = /^(\d{4})h([12])$/.exec(k);
  if (h) return h[2] === "1" ? `I полугодие ${h[1]} (январь–июнь)` : `II полугодие ${h[1]} (июль–декабрь)`;
  if (/^\d{4}$/.test(k)) return `${k} год`;
  return k;
}

function priorityName(id?: number) {
  const n = Number(id);
  if (!Number.isFinite(n)) return "";
  return GROUP_PRIORITY.find((p) => p.id === n)?.name || `приоритет ${n}`;
}

function who(m: GroupHistoryMember) {
  const id = Number(m.customerId) || 0;
  const name = String(m.name || "").trim();
  if (name && name !== "Без имени") return `${name} (customerId ${id})`;
  return `клиент ${id}`;
}

function memberTitle(m: GroupHistoryMember) {
  if (!m.active) return "Вышел из группы";
  if (m.role === "лид") return "Лид в группе";
  return "Вошёл в группу";
}

function lessonTitle(status: number) {
  const st = Number(status) || 1;
  if (st === 3) return "Занятие проведено";
  if (st === 2) return "Занятие отменено";
  return "Занятие в плане";
}

function sent(...parts: (string | number | undefined | false)[]) {
  return parts
    .map((x) => (x == null || x === false ? "" : String(x).trim()))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".")
    .trim();
}

export function sortGroupHistory(events: GroupHistoryEvent[]) {
  return [...events].sort((a, b) => {
    if (!a.at && b.at) return 1;
    if (a.at && !b.at) return -1;
    return b.at.localeCompare(a.at) || a.id.localeCompare(b.id);
  });
}

/** Все события группы. Явка, касса и календарь ребёнка не входят. */
export function buildGroupHistory(input: GroupHistoryInput): GroupHistoryEvent[] {
  const gid = Number(input.groupId) || 0;
  const bid = Number(input.branchId) || 0;
  const events: GroupHistoryEvent[] = [];
  const name = String(input.name || "").trim() || `группа ${gid}`;
  const lessonsN = (input.calendar || []).length;
  const inN = (input.members || []).filter((m) => m.active).length;
  const outN = (input.members || []).filter((m) => !m.active).length;

  if (gid) {
    const place = [input.city, input.branch].filter(Boolean).join(", ");
    events.push({
      id: `group:${bid}:${gid}:card`,
      at: historyEventAt(String(input.at || "")),
      kind: "group",
      title: "Карточка на диске",
      detail: sent(
        `На диске лежит карточка группы ${gid} филиала ${bid} (card:group:${bid}:${gid}).`,
        `Название: «${name}».`,
        input.subjectId ? `Предмет subjectId ${input.subjectId}${input.subject ? ` «${input.subject}»` : ""}.` : input.subject ? `Предмет «${input.subject}».` : "",
        input.courseId || input.course ? `Курс сайта${input.courseId ? ` courseId ${input.courseId}` : ""}${input.course ? ` «${input.course}»` : ""}.` : "",
        input.age ? `Возраст ${input.age}.` : "",
        place ? `Филиал: ${place}.` : "",
        input.teacher ? `Педагог занятий: ${input.teacher}.` : "",
        input.priority != null ? `Приоритет набора: ${priorityName(input.priority)}.` : "",
        input.limit != null ? `Мест ${input.limit}, в составе сейчас ${input.takenStudy ?? "—"} учится / ${input.takenLead ?? "—"} лид (всего ${input.taken ?? "—"}).` : "",
        `В календаре ${lessonsN} занятий, в составе на диске ${inN} живых и ${outN} вышедших.`,
        input.at ? `Карточку последний раз записали ${ruHistoryWhen(historyEventAt(input.at))}.` : "Время записи карточки на диске не стоит.",
      ),
    });
  }

  if (input.statusId) {
    const sid = Number(input.statusId) || 0;
    const label = groupStatusName(sid) || `statusId ${sid}`;
    events.push({
      id: `group:${bid}:${gid}:status`,
      at: historyEventAt(String(input.at || input.bDate || "")),
      kind: "group",
      title: "Статус группы",
      detail: sent(
        `Текущий статус группы ${gid}: ${sid} «${label}».`,
        STATUS_HINT[sid] || "Это код статуса Alfa, имя берём из справочника.",
        "Это снимок с диска, не лента смены статуса: когда именно поставили этот статус, отдельной записи нет.",
      ),
      status: sid,
    });
  }

  if (input.bDate || input.eDate) {
    events.push({
      id: `group:${bid}:${gid}:period`,
      at: historyEventAt(String(input.bDate || "")),
      kind: "group",
      title: "Период группы",
      detail: sent(
        `У группы ${gid} на диске период обучения: с ${ruHistoryWhen(historyEventAt(String(input.bDate || "")))} по ${ruHistoryWhen(historyEventAt(String(input.eDate || "")))}.`,
        "Это даты карточки / слота, ими же режут лишние порции журнала, если срок жизни не задан отдельно.",
      ),
    });
  }

  for (const beat of input.beats || []) {
    const day = ruDayName(beat.day) || `день ${beat.day}`;
    const time = beat.timeFrom && beat.timeTo ? `${beat.timeFrom}–${beat.timeTo}` : beat.timeFrom || "время не задано";
    events.push({
      id: `group:${bid}:${gid}:beat:${beat.day}:${beat.timeFrom || ""}`,
      at: historyEventAt(String(input.bDate || input.at || "")),
      kind: "group",
      title: "Регулярное занятие",
      detail: sent(
        `Шаблон расписания группы ${gid}: каждый ${day} ${time}.`,
        beat.teacher ? `Педагог этого шаблона: ${beat.teacher}.` : "Педагог шаблона на диске не записан.",
        "Это регулярка, а не одно занятие: конкретные даты смотрите во вкладке «Занятия».",
      ),
    });
  }

  if (input.journalAt) {
    events.push({
      id: `group:${bid}:${gid}:journalAt`,
      at: historyEventAt(input.journalAt),
      kind: "group",
      title: "Журнал группы дочитан",
      detail: sent(
        `Журнал занятий группы ${gid} дочитали с Alfa на диск ${ruHistoryWhen(historyEventAt(input.journalAt))}.`,
        "После этого календарь группы читается с диска. Alfa с этой кнопки истории не зовём.",
        lessonsN ? `Сейчас в календаре ${lessonsN} занятий.` : "В календаре пока нет ни одного занятия.",
      ),
    });
  }

  const life = input.journalLife;
  if (life?.from || life?.to) {
    const src = life.source === "alfa" ? "по первой и последней явке Alfa" : "по расписанию слота";
    events.push({
      id: `group:${bid}:${gid}:life`,
      at: historyEventAt(String(life.at || life.from || "")),
      kind: "group",
      title: "Срок жизни группы",
      detail: sent(
        `Для загрузки журнала у группы ${gid} задан срок жизни: с ${life.from || "?"} по ${life.to || "?"}.`,
        `Источник: ${src}.`,
        "Порции журнала за даты вне этого окна не качаем: иначе старые группы тянут историю с 2018 года.",
        life.at ? `Срок записали ${ruHistoryWhen(historyEventAt(life.at))}.` : "",
      ),
    });
  }

  const fill = input.journalFill;
  const pulled = { ...(fill?.pulled || {}) };
  for (const key of fill?.done || []) {
    if (!pulled[key]) pulled[key] = "";
  }
  for (const [key, at] of Object.entries(pulled)) {
    const fail = fill?.fail?.[key];
    events.push({
      id: `group:${bid}:${gid}:fill:${key}`,
      at: historyEventAt(String(at || input.journalAt || "")),
      kind: "group",
      title: "Порция журнала",
      detail: sent(
        fail
          ? `Порцию журнала ${periodKeyLabel(key)} для группы ${gid} снять не удалось: ${fail}.`
          : `С Alfa на диск сняли журнал группы ${gid} за ${periodKeyLabel(key)}.`,
        "В порции — занятия этой группы за эти даты: план, проведение, отмена. Явка конкретного ребёнка в этой истории не показывается.",
        at ? `Порцию отметили ${ruHistoryWhen(historyEventAt(at))}.` : "Точное время снятия порции на диске не стоит.",
        `Ключ порции: ${key}.`,
      ),
    });
  }
  for (const key of fill?.rechecked || []) {
    events.push({
      id: `group:${bid}:${gid}:recheck:${key}`,
      at: historyEventAt(String(pulled[key] || input.journalAt || "")),
      kind: "group",
      title: "Журнал перепроверен",
      detail: sent(
        `Повторно сверили журнал группы ${gid} за ${periodKeyLabel(key)}.`,
        "Новые занятия дописали, старые строки не затирали, дубли по lessonId не плодили. В Alfa ничего не писали.",
        `Ключ порции: ${key}.`,
      ),
    });
  }

  for (const lesson of input.calendar || []) {
    const date = String(lesson.date || "").trim();
    if (!date) continue;
    const lessonId = Number(lesson.lessonId) || 0;
    const status = Number(lesson.status) || 1;
    const when = [ruHistoryWhen(historyEventAt(date)), lesson.from && lesson.to ? `с ${lesson.from} до ${lesson.to}` : lesson.from ? `в ${lesson.from}` : ""]
      .filter(Boolean)
      .join(" ");
    const st = lessonStatusLabel(status);
    events.push({
      id: `lesson:${bid}:${gid}:${lessonId || date}:${lesson.from || ""}`,
      at: historyEventAt(date, lesson.from),
      kind: "lesson",
      title: lessonTitle(status),
      detail: sent(
        `${when} занятие группы ${gid} стоит как «${st}» (status ${status}${lessonId ? `, lessonId ${lessonId}` : ", без lessonId"}).`,
        lesson.type && lesson.type !== "Групповое" ? `Тип: ${lesson.type}.` : "Тип: групповое.",
        lesson.teacher ? `Педагог: ${lesson.teacher}.` : "",
        lesson.room ? `Аудитория: ${lesson.room}.` : "",
        lesson.topic ? `Тема: ${lesson.topic}.` : "",
        lesson.homework ? `Домашнее задание: ${lesson.homework}.` : "",
        lesson.note ? `Комментарий: ${lesson.note}.` : "",
        status === 3
          ? "Занятие провели. Кто из детей был и что списали — в карточке занятия, сюда не выносим."
          : status === 2
            ? "Занятие отменили. На состав группы это не влияет."
            : "Ещё не проводили: это план в календаре группы.",
      ),
      lessonId: lessonId || undefined,
      status,
    });
  }

  for (const m of input.members || []) {
    const customerId = Number(m.customerId) || 0;
    if (!customerId) continue;
    const person = who(m);
    events.push({
      id: `member:${bid}:${gid}:${customerId}:${m.active ? "in" : "out"}`,
      at: "",
      kind: "member",
      title: memberTitle(m),
      detail: sent(
        m.active
          ? m.role === "лид"
            ? `${person} сейчас в группе ${gid} как лид (ещё не «учится»).`
            : `${person} сейчас в живом составе группы ${gid}.`
          : `${person} вышел из живого состава группы ${gid} (архив связи).`,
        "Дата входа и выхода на диске не записана: в groupLinks есть только признак active, без b_date.",
        "Календарь, явка и касса этого человека сюда не входят — только членство в группе.",
      ),
      customerId,
    });
  }

  return sortGroupHistory(events);
}

export function historyKindCounts(events: GroupHistoryEvent[]) {
  const out = { all: events.length, group: 0, lesson: 0, member: 0 };
  for (const e of events) {
    if (e.kind === "group") out.group += 1;
    else if (e.kind === "lesson") out.lesson += 1;
    else if (e.kind === "member") out.member += 1;
  }
  return out;
}

export function filterGroupHistory(events: GroupHistoryEvent[], kind: GroupHistoryKind | "all") {
  if (!kind || kind === "all") return events;
  return events.filter((e) => e.kind === kind);
}
