/** Журнал уроков. Одно занятие — lessonId. Явка = customerIds. cgi не явка. */

export const LESSON_STATUS = { plan: 1, cancel: 2, done: 3 } as const;

export function lessonStatusLabel(status: number) {
  if (status === 3) return "проведено";
  if (status === 2) return "отмена";
  return "план";
}

export type JournalLesson = {
  lessonId?: number;
  date: string;
  from?: string;
  to?: string;
  status?: number;
  type?: string;
  typeId?: number;
  customerIds?: number[];
  attend?: number;
  total?: number;
  group?: string;
  subject?: string;
  teacher?: string;
  room?: string;
  topic?: string;
};

export function journalIds(lesson: { customerIds?: number[] }) {
  return (lesson.customerIds || []).map(Number).filter((n) => n);
}

/** Список на занятии — источник явки. attend/total считаются с него. */
export function stampJournal<T extends JournalLesson>(lesson: T, customerIds?: number[]): T {
  const ids = (customerIds ?? lesson.customerIds ?? []).map(Number).filter((n) => n);
  return { ...lesson, customerIds: ids, attend: ids.length, total: ids.length };
}

export function journalAttend(lesson: JournalLesson) {
  const ids = journalIds(lesson);
  const total = ids.length || Number(lesson.total) || 0;
  const marked = Number(lesson.attend);
  const attend = Number.isFinite(marked) && marked >= 0 ? marked : ids.length;
  return { attend, total };
}

/** Пустой список = занятие ещё не размечено, видно всей группе. */
export function lessonHasCustomer(lesson: { customerIds?: number[] }, customerId: number) {
  const id = Number(customerId) || 0;
  if (!id) return false;
  const ids = journalIds(lesson);
  if (!ids.length) return true;
  return ids.includes(id);
}

export function journalForCustomer<T extends JournalLesson>(lessons: T[], customerId: number): T[] {
  return (lessons || [])
    .filter((l) => lessonHasCustomer(l, customerId))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.from || "").localeCompare(String(b.from || "")));
}

export function clientLessonFromJournal(lesson: JournalLesson, groupName?: string) {
  return {
    id: Number(lesson.lessonId || 0),
    date: String(lesson.date || ""),
    from: String(lesson.from || ""),
    to: String(lesson.to || ""),
    type: String(lesson.type || ""),
    typeId: Number(lesson.typeId || 0),
    group: groupName || lesson.group || "",
    teacher: String(lesson.teacher || ""),
    status: Number(lesson.status || 0),
    subject: lesson.subject || "",
    room: String(lesson.room || ""),
  };
}
