/** История группы с диска. Не журнал ребёнка: только вход/выход из cgi. */

import { lessonStatusLabel } from "./crm-journal-core.ts";
import { groupStatusName } from "./group-status.ts";

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
  at?: string;
  journalAt?: string;
  journalFill?: { done?: string[]; pulled?: Record<string, string>; fail?: Record<string, string>; rechecked?: string[] };
  journalLife?: { from: string; to: string; source: string; at?: string };
  beats?: { day: number; timeFrom: string; timeTo: string; teacher?: string }[];
  calendar?: GroupHistoryLesson[];
  members?: GroupHistoryMember[];
};

const DAY = ["", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];

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

function joinDetail(parts: (string | number | undefined | false)[]) {
  return parts.map((x) => (x == null || x === false ? "" : String(x).trim())).filter(Boolean).join(" · ");
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

  if (gid) {
    events.push({
      id: `group:${bid}:${gid}:card`,
      at: historyEventAt(String(input.at || "")),
      kind: "group",
      title: "Карточка на диске",
      detail: joinDetail([
        `card:group:${bid}:${gid}`,
        name,
        input.subjectId ? `subjectId ${input.subjectId}` : "",
        input.subject,
        input.age,
        input.teacher,
        input.room,
        input.priority != null ? `приоритет ${Number(input.priority)}` : "",
      ]),
    });
  }

  if (input.statusId) {
    events.push({
      id: `group:${bid}:${gid}:status`,
      at: historyEventAt(String(input.at || input.bDate || "")),
      kind: "group",
      title: "Статус группы",
      detail: joinDetail([groupStatusName(input.statusId) || `statusId ${input.statusId}`, `statusId ${input.statusId}`]),
      status: Number(input.statusId) || 0,
    });
  }

  if (input.bDate || input.eDate) {
    events.push({
      id: `group:${bid}:${gid}:period`,
      at: historyEventAt(String(input.bDate || "")),
      kind: "group",
      title: "Период группы",
      detail: joinDetail([input.bDate || "—", input.eDate || "—"]),
    });
  }

  for (const beat of input.beats || []) {
    const day = ruDayName(beat.day);
    const id = `group:${bid}:${gid}:beat:${beat.day}:${beat.timeFrom || ""}`;
    events.push({
      id,
      at: historyEventAt(String(input.bDate || input.at || "")),
      kind: "group",
      title: "Регулярное занятие",
      detail: joinDetail([day, beat.timeFrom && beat.timeTo ? `${beat.timeFrom}–${beat.timeTo}` : beat.timeFrom, beat.teacher]),
    });
  }

  if (input.journalAt) {
    events.push({
      id: `group:${bid}:${gid}:journalAt`,
      at: historyEventAt(input.journalAt),
      kind: "group",
      title: "Журнал группы дочитан",
      detail: joinDetail(["с Alfa на диск", input.journalAt]),
    });
  }

  const life = input.journalLife;
  if (life?.from || life?.to) {
    events.push({
      id: `group:${bid}:${gid}:life`,
      at: historyEventAt(String(life.at || life.from || "")),
      kind: "group",
      title: "Срок жизни группы",
      detail: joinDetail([life.from, life.to, life.source === "alfa" ? "по явке Alfa" : "по расписанию"]),
    });
  }

  const fill = input.journalFill;
  const pulled = { ...(fill?.pulled || {}) };
  for (const key of fill?.done || []) {
    if (!pulled[key]) pulled[key] = "";
  }
  for (const [key, at] of Object.entries(pulled)) {
    events.push({
      id: `group:${bid}:${gid}:fill:${key}`,
      at: historyEventAt(String(at || input.journalAt || "")),
      kind: "group",
      title: "Порция журнала",
      detail: joinDetail([key, at ? "сняли с Alfa" : "на диске", fill?.fail?.[key] ? `сбой ${fill.fail[key]}` : ""]),
    });
  }
  for (const key of fill?.rechecked || []) {
    events.push({
      id: `group:${bid}:${gid}:recheck:${key}`,
      at: historyEventAt(String(pulled[key] || input.journalAt || "")),
      kind: "group",
      title: "Журнал перепроверен",
      detail: key,
    });
  }

  for (const lesson of input.calendar || []) {
    const date = String(lesson.date || "").trim();
    if (!date) continue;
    const lessonId = Number(lesson.lessonId) || 0;
    const status = Number(lesson.status) || 1;
    events.push({
      id: `lesson:${bid}:${gid}:${lessonId || date}:${lesson.from || ""}`,
      at: historyEventAt(date, lesson.from),
      kind: "lesson",
      title: lessonTitle(status),
      detail: joinDetail([
        lessonStatusLabel(status),
        lesson.from && lesson.to ? `${lesson.from}–${lesson.to}` : lesson.from,
        lesson.type,
        lesson.teacher,
        lesson.room,
        lessonId ? `lessonId ${lessonId}` : "",
        lesson.topic,
        lesson.homework ? `ДЗ: ${lesson.homework}` : "",
        lesson.note,
      ]),
      lessonId: lessonId || undefined,
      status,
    });
  }

  for (const m of input.members || []) {
    const customerId = Number(m.customerId) || 0;
    if (!customerId) continue;
    events.push({
      id: `member:${bid}:${gid}:${customerId}:${m.active ? "in" : "out"}`,
      at: "",
      kind: "member",
      title: memberTitle(m),
      detail: joinDetail([`customerId ${customerId}`, m.name || `клиент ${customerId}`]),
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
