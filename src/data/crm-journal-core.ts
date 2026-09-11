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
  homework?: string;
  note?: string;
  amount?: number;
  cttId?: number;
  groupIds?: number[];
  pupils?: { customerId: number; name?: string; attend?: boolean; amount?: number; cttId?: number }[];
  branchId?: number;
};

export function journalIds(lesson: { customerIds?: number[] }) {
  return (lesson.customerIds || []).map(Number).filter((n) => n);
}

/** Список на занятии — источник явки. attend/total считаются с него. */
export function stampJournal<T extends JournalLesson>(lesson: T, customerIds?: number[]): T {
  const pupils = lesson.pupils || [];
  if (pupils.length) {
    const ids = pupils.map((p) => Number(p.customerId) || 0).filter((n) => n);
    const attend = pupils.filter((p) => p.attend !== false).length;
    return { ...lesson, customerIds: ids, attend, total: pupils.length } as T;
  }
  const ids = (customerIds ?? lesson.customerIds ?? []).map(Number).filter((n) => n);
  return { ...lesson, customerIds: ids, attend: ids.length, total: ids.length } as T;
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

/** Карточка ученика: только явка с её id. Пустой список — для журнала группы, не клиента. */
export function journalForCustomer<T extends JournalLesson>(lessons: T[], customerId: number): T[] {
  const id = Number(customerId) || 0;
  if (!id) return [];
  return (lessons || [])
    .filter((l) => journalIds(l).includes(id))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.from || "").localeCompare(String(b.from || "")));
}

export function isCustomerTrialLesson(lesson: { type?: string; typeId?: number; group?: string }) {
  return Number(lesson.typeId) === 3 || /пробн/i.test(`${lesson.type || ""} ${lesson.group || ""}`);
}

/** Карточка ученика: её группа, пробное, или урок уже в её журнале. */
export function calendarLessonForCard(
  lesson: { group?: string; type?: string; typeId?: number; groupIds?: number[]; customerIds?: number[]; pupils?: { customerId?: number }[] },
  groups: { id?: number; name?: string }[],
  customerId?: number,
) {
  if (isCustomerTrialLesson(lesson)) return true;
  const cid = Number(customerId) || 0;
  if (cid) {
    if ((lesson.customerIds || []).map(Number).includes(cid)) return true;
    if ((lesson.pupils || []).some((p) => Number(p.customerId) === cid)) return true;
  }
  const ids = new Set(groups.map((g) => Number(g.id) || 0).filter(Boolean));
  const names = new Set(groups.map((g) => String(g.name || "").trim()).filter(Boolean));
  const gids = (lesson.groupIds || []).map(Number).filter(Boolean);
  if (gids.length && ids.size) return gids.some((n) => ids.has(n));
  const name = String(lesson.group || "").trim();
  if (!name || !names.size) return false;
  return names.has(name);
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
    topic: String(lesson.topic || "").trim() || undefined,
    homework: String(lesson.homework || "").trim() || undefined,
    note: String(lesson.note || "").trim() || undefined,
    amount: Number(lesson.amount || 0) || undefined,
    cttId: Number(lesson.cttId || 0) || undefined,
    groupIds: (lesson.groupIds || []).map(Number).filter((n) => n) || undefined,
    customerIds: (lesson.customerIds || []).map(Number).filter((n) => n),
    attend: Number(lesson.attend || 0) || undefined,
    total: Number(lesson.total || 0) || undefined,
    pupils: lesson.pupils?.length ? lesson.pupils : undefined,
    branchId: Number(lesson.branchId) || undefined,
  };
}

/** Филиал урока: свой, иначе группа карточки, иначе запасной. */
export function lessonBranchOf(
  lesson: { branchId?: number; groupIds?: number[]; group?: string },
  groups: { id?: number; branchId?: number; name?: string }[],
  fallback = 0,
) {
  const own = Number(lesson.branchId) || 0;
  if (own) return own;
  for (const gid of (lesson.groupIds || []).map(Number)) {
    const g = groups.find((x) => Number(x.id) === gid);
    const bid = Number(g?.branchId) || 0;
    if (bid) return bid;
  }
  const name = String(lesson.group || "").trim();
  if (name) {
    const g = groups.find((x) => String(x.name || "").trim() === name);
    const bid = Number(g?.branchId) || 0;
    if (bid) return bid;
  }
  return Number(fallback) || 0;
}

function branchShort(id: number) {
  if (id === 1) return "Гражданская";
  if (id === 2) return "ЦМИТ";
  if (id === 3) return "Луховицы";
  if (id === 4) return "Лето";
  return `филиал ${id}`;
}

export function tallyPaysByBranch(pays: { branchId?: number }[], fallback = 0) {
  const map = new Map<number, number>();
  for (const p of pays || []) {
    const bid = Number(p.branchId) || fallback || 0;
    if (!bid) continue;
    map.set(bid, (map.get(bid) || 0) + 1);
  }
  return [...map.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([id, n]) => ({ id, n, short: branchShort(id) }));
}

export function tallyLessonsByBranch(lessons: { status?: number; branchId?: number }[], fallback = 0) {
  const map = new Map<number, { plan: number; fact: number }>();
  for (const l of lessons || []) {
    const st = Number(l.status);
    if (st === 2) continue;
    const bid = Number(l.branchId) || fallback || 0;
    if (!bid) continue;
    const cur = map.get(bid) || { plan: 0, fact: 0 };
    cur.plan += 1;
    if (st === 3) cur.fact += 1;
    map.set(bid, cur);
  }
  return [...map.entries()]
    .filter(([, v]) => v.plan > 0 || v.fact > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([id, v]) => ({ id, plan: v.plan, fact: v.fact, short: branchShort(id) }));
}

export function formatPayTally(rows: { n: number; short: string }[]) {
  if (!rows.length) return "нет платежей";
  return rows.map((r) => `${r.n} шт ${r.short}`).join(", ");
}

export function formatLessonTally(rows: { plan: number; fact: number; short: string }[]) {
  if (!rows.length) return "";
  return rows.map((r) => `п ${r.plan} / ф ${r.fact} ${r.short}`).join(", ");
}
