import { sessionCourseId } from "./group-status.ts";
import { toAlfaLessonDate } from "./crm-journal-periods.ts";

export function inboundTake(opts: { pending?: boolean }) {
  return opts.pending ? ("skip" as const) : ("alfa" as const);
}

/** Сорванная проба не трогает счёт. Неполная (окно) не занижает. Полная перепись (census) — правда Alfa, можно снизить. */
export function keepAlfaProbe(keep: number, alfa: number, probedOk: boolean, census = false) {
  const k = Number(keep) || 0;
  const a = Number(alfa) || 0;
  if (!probedOk) return { write: false, alfa: k, probed: k > 0 };
  if (census) return { write: true, alfa: a, probed: true };
  if (k > 0 && a < k) return { write: false, alfa: k, probed: true };
  return { write: true, alfa: a, probed: true };
}

/** Перепись ученика: в набор только id, который качка посадит (есть дата). Состав не фильтр. */
export function censusSeatLessonId(item: { id?: number; date?: string; lesson_date?: string } | null | undefined): number {
  const lid = Number(item?.id) || 0;
  if (!(lid > 0)) return 0;
  const day = toAlfaLessonDate(item?.date) || toAlfaLessonDate(item?.lesson_date);
  if (!day) return 0;
  return lid;
}

/** Посадка строк на диск не меняет счёт Alfa. Alfa пишет только полная перепись. */
export function bumpAlfaFromLanded(keep: number, _newAlfaIds?: number) {
  return Number(keep) || 0;
}

/** Курсор качки не закрывает cid, пока диск < известной Alfa. */
export function inboundFillClosed(disk: number, alfaKeep: number, cursorDone: boolean, aborted: boolean) {
  if (aborted) return false;
  const keep = Number(alfaKeep) || 0;
  const n = Number(disk) || 0;
  if (keep > 0 && n < keep) return false;
  return Boolean(cursorDone);
}

export function pendingEntityIds(
  jobs: { op: string; entityId?: number; body?: { localId?: number } }[],
  ops?: string[],
) {
  const hold = new Set<number>();
  for (const j of jobs) {
    if (ops && !ops.includes(j.op)) continue;
    const id = Number(j.entityId) || 0;
    if (id) hold.add(id);
    const local = Number(j.body?.localId) || 0;
    if (local) hold.add(local);
  }
  return hold;
}

function slotGroup(x: { group?: string; groupIds?: number[] }) {
  const gid = Number(x.groupIds?.[0]) || 0;
  return gid ? String(gid) : String(x.group || "");
}

function slotKey(x: { date?: string; from?: string; group?: string; groupIds?: number[] }) {
  return `${x.date || ""}|${x.from || ""}|${slotGroup(x)}`;
}

function sameSlot<T extends { date?: string; from?: string; group?: string; groupIds?: number[] }>(a: T, b: T) {
  if (String(a.date || "") !== String(b.date || "")) return false;
  if (String(a.from || "") !== String(b.from || "")) return false;
  const ga = slotGroup(a);
  const gb = slotGroup(b);
  if (!ga || !gb) return true;
  return ga === gb;
}

function lessonKey(x: { lessonId?: number; date?: string; from?: string; group?: string; groupIds?: number[] }) {
  const lid = Number(x.lessonId) || 0;
  return lid ? `id:${lid}` : `d:${slotKey(x)}`;
}

function idsOf(row: { customerIds?: number[] } | undefined) {
  return Array.isArray(row?.customerIds) && row.customerIds.length ? row.customerIds : undefined;
}

function gidsOf(row: { groupIds?: number[] } | undefined) {
  return Array.isArray(row?.groupIds) && row.groupIds.length ? row.groupIds : undefined;
}

function foldLesson<T extends { lessonId?: number; date?: string; from?: string; amount?: number; topic?: string; homework?: string; note?: string; customerIds?: number[]; groupIds?: number[]; group?: string }>(
  old: T,
  row: T,
): T {
  const lid = Number(row.lessonId) || Number(old.lessonId) || 0;
  return {
    ...old,
    ...row,
    lessonId: lid || old.lessonId,
    amount: Number(row.amount) > 0 ? row.amount : old.amount,
    topic: String(row.topic || "").trim() || old.topic,
    homework: String(row.homework || "").trim() || old.homework,
    note: String(row.note || "").trim() || old.note,
    customerIds: idsOf(row) || idsOf(old),
    groupIds: gidsOf(row) || gidsOf(old),
    group: String(row.group || "").trim() || old.group,
  };
}

/** Один урок — одна строка: номер занятия важнее пары дата+время. Два разных номера не склеиваем. */
export function collapseLessonRows<T extends { lessonId?: number; date?: string; from?: string; amount?: number; group?: string; groupIds?: number[] }>(list: T[]): T[] {
  const byId = new Map<number, T>();
  const noId: T[] = [];
  for (const row of list || []) {
    const lid = Number(row.lessonId) || 0;
    if (!lid) {
      noId.push(row);
      continue;
    }
    const prev = byId.get(lid);
    byId.set(lid, prev ? foldLesson(prev, row) : row);
  }
  const bySlot = new Map<string, T>();
  for (const row of noId) {
    const host = [...byId.values()].find((x) => sameSlot(x, row));
    if (host) {
      const lid = Number(host.lessonId) || 0;
      if (lid) byId.set(lid, foldLesson(row, host));
      continue;
    }
    if (!(row.date || row.from)) {
      bySlot.set(`${bySlot.size}|empty`, row);
      continue;
    }
    const s = slotKey(row);
    const prev = bySlot.get(s);
    bySlot.set(s, prev ? foldLesson(prev, row) : row);
  }
  return [...byId.values(), ...bySlot.values()].sort(
    (a, b) => String(a.date).localeCompare(String(b.date)) || String(a.from || "").localeCompare(String(b.from || "")),
  );
}


export function uniquePositiveIds(ids: Iterable<number | { lessonId?: number; id?: number }>): number[] {
  const keep = new Set<number>();
  for (const raw of ids) {
    const n = typeof raw === "object" ? Number(raw?.lessonId || raw?.id) || 0 : Number(raw) || 0;
    if (n > 0) keep.add(n);
  }
  return [...keep];
}

/** Перепись закрыта только живыми ответами. Пустой catch — не готово, снимать нельзя. */
export function canCloseLessonCensus(opts: { live?: boolean; aborted?: boolean }) {
  return Boolean(opts.live) && !opts.aborted;
}

export function canPruneCalendarFill(opts: { prune?: boolean; wantFull?: boolean; fillDone?: boolean }) {
  return Boolean(opts.prune) && Boolean(opts.wantFull) && Boolean(opts.fillDone);
}

function held(x: { lessonId?: number }, hold: Set<number>) {
  const lid = Number(x.lessonId) || 0;
  return lid < 0 || hold.has(lid);
}

function lessonDay(raw?: string) {
  const s = String(raw || "").trim();
  const ru = s.match(/^(\d{1,2})\.(\d{2})\.(\d{4})/);
  if (ru) return `${ru[3]}-${ru[2]}-${String(ru[1]).padStart(2, "0")}`;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : "";
}

export function pruneCalendarToAlfaIds<T extends { lessonId?: number; date?: string }>(
  disk: T[],
  alfaIds: Iterable<number>,
  holdIds: Iterable<number> = [],
  extraKeep: Iterable<number> = [],
  keepBefore = "",
  keepAfter = "",
): T[] {
  const keep = new Set<number>();
  for (const n of alfaIds) {
    const id = Number(n) || 0;
    if (id > 0) keep.add(id);
  }
  for (const n of extraKeep) {
    const id = Number(n) || 0;
    if (id > 0) keep.add(id);
  }
  const hold = new Set([...holdIds].map(Number).filter((n) => n));
  const from = lessonDay(keepBefore);
  const to = lessonDay(keepAfter);
  return (disk || []).filter((x) => {
    const lid = Number(x.lessonId) || 0;
    if (lid < 0 || hold.has(lid)) return true;
    if (!lid) return true;
    const day = lessonDay(x.date);
    if (from && day && day < from) return true;
    if (to && day && day > to) return true;
    return keep.has(lid);
  });
}

export type RecheckDays = 32 | 92 | 182 | 1095 | 2555 | 4000;

export const RECHECK_DAY_OPTS = [
  { days: 32 as const, label: "± месяц" },
  { days: 92 as const, label: "± три" },
  { days: 182 as const, label: "± шесть" },
  { days: 1095 as const, label: "за 3 года" },
  { days: 2555 as const, label: "за 7 лет" },
  { days: 4000 as const, label: "с начала · 2015" },
] as const;

export function clampRecheckDays(raw: unknown): RecheckDays {
  const n = Number(raw) || 0;
  if (n === 92 || n === 182 || n === 1095 || n === 2555 || n === 4000) return n;
  return 32;
}

function ymdOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Окно синей перепроверки. ±32/92/182 — обе стороны. 3 года / 7 лет / 2015 — назад + 32 дня вперёд. */
export function recheckWindowYmd(days: unknown, now = new Date()): { from: string; to: string } {
  const n = clampRecheckDays(days);
  const shift = (k: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k);
    return ymdOf(d);
  };
  const yearsBack = (y: number) => {
    const d = new Date(now.getFullYear() - y, now.getMonth(), now.getDate());
    return ymdOf(d);
  };
  if (n === 4000) return { from: "2015-01-01", to: shift(32) };
  if (n === 2555) return { from: yearsBack(7), to: shift(32) };
  if (n === 1095) return { from: yearsBack(3), to: shift(32) };
  return { from: shift(-n), to: shift(n) };
}

/** Id переписи окна, которых ещё нет на диске. */
export function windowNewLessonIds(censusIds: Iterable<number>, have: Iterable<number>): number[] {
  const onDisk = new Set([...have].map(Number).filter((n) => n > 0));
  const out: number[] = [];
  const seen = new Set<number>();
  for (const n of censusIds) {
    const id = Number(n) || 0;
    if (id <= 0 || onDisk.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Id, которые prune окна снял: были на диске, после нет. */
export function windowGoneLessonIds(haveBefore: Iterable<number>, haveAfter: Iterable<number>): number[] {
  const after = new Set([...haveAfter].map(Number).filter((n) => n > 0));
  const out: number[] = [];
  const seen = new Set<number>();
  for (const n of haveBefore) {
    const id = Number(n) || 0;
    if (id <= 0 || after.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function windowAlfaKeep(keep: number, newN: number, goneN: number) {
  return Math.max(0, (Number(keep) || 0) + Math.max(0, Number(newN) || 0) - Math.max(0, Number(goneN) || 0));
}

/** Дырки и лишние по lessonId. protect — hold и id с group-card. */
export function lessonsSetGap(have: Iterable<number>, seen: Iterable<number>, protect: Iterable<number> = []) {
  const H = new Set<number>();
  const S = new Set<number>();
  const P = new Set<number>();
  for (const n of have) {
    const id = Number(n) || 0;
    if (id > 0) H.add(id);
  }
  for (const n of seen) {
    const id = Number(n) || 0;
    if (id > 0) S.add(id);
  }
  for (const n of protect) {
    const id = Number(n) || 0;
    if (id > 0) P.add(id);
  }
  const hole: number[] = [];
  const extra: number[] = [];
  for (const id of S) if (!H.has(id)) hole.push(id);
  if (S.size > 0) {
    for (const id of H) if (!S.has(id) && !P.has(id)) extra.push(id);
  }
  return { hole, extra, seenComplete: S.size > 0 };
}

/** Ушедшие в окне группы. Пустой census при дочитанных страницах — все have, кроме hold. Ядро шага 2 (пустой seen) не трогаем. */
export function groupWindowGone(have: Iterable<number>, census: Iterable<number>, hold: Iterable<number> = [], pagesComplete = false) {
  if (!pagesComplete) return [] as number[];
  const seen = uniquePositiveIds(census);
  const disk = uniquePositiveIds(have);
  const protect = uniquePositiveIds(hold);
  if (!seen.length) return disk.filter((id) => !protect.includes(id));
  return lessonsSetGap(disk, seen, protect).extra;
}

export function canFanOutToCalendar<T extends { lessonId?: number; date?: string; from?: string }>(prev: T[] | undefined, lesson: T) {
  const lid = Number(lesson.lessonId) || 0;
  if (!lid) return false;
  for (const x of prev || []) {
    const xid = Number(x.lessonId) || 0;
    if (xid > 0 && xid !== lid && sameSlot(x, lesson)) return false;
  }
  return true;
}

export function countAlfaLessonRows<T extends { lessonId?: number }>(list: T[] | undefined) {
  let n = 0;
  for (const x of list || []) if (Number(x.lessonId) > 0) n += 1;
  return n;
}

/** Счёт журнала — уникальные lessonId, не строки. Дубли одной записи не extra. */
export function countAlfaLessonUniq<T extends { lessonId?: number }>(list: T[] | undefined) {
  return uniquePositiveIds((list || []).map((x) => Number(x.lessonId) || 0)).length;
}

/** Ярлык множества id, не ключ сущности. Расхождение всё равно разбирать по hole/extra. */
export function idsChecksum(ids: Iterable<number>): string {
  const list = uniquePositiveIds(ids).slice().sort((a, b) => a - b);
  let h = 2166136261;
  const s = list.join(",");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Готово только id + счёт. Длина без номеров и checksum без счёта — нет. */
export function journalIdsReady(p: {
  pagesComplete: boolean;
  holeN: number;
  extraN?: number;
  diskUniq: number;
  censusN: number;
  diskRows: number;
  short?: boolean;
  allowExtra?: boolean;
}) {
  if (!p.pagesComplete) return false;
  if ((Number(p.holeN) || 0) > 0) return false;
  if (p.short) return false;
  const diskUniq = Number(p.diskUniq);
  const censusN = Number(p.censusN);
  const diskRows = Number(p.diskRows);
  if (diskRows !== diskUniq) return false;
  if (p.allowExtra) return diskUniq >= censusN;
  if ((Number(p.extraN) || 0) > 0) return false;
  return diskUniq === censusN;
}

export function mergeSeenLessonIds(prev: number[] | undefined, pulled: { lessonId?: number }[]) {
  const set = new Set<number>();
  for (const n of prev || []) {
    const id = Number(n) || 0;
    if (id > 0) set.add(id);
  }
  for (const row of pulled || []) {
    const id = Number(row.lessonId) || 0;
    if (id > 0) set.add(id);
  }
  return [...set];
}


export function mergeJournalInbound<T extends { lessonId?: number; date?: string; from?: string }>(
  pulled: T[],
  prev: T[] | undefined,
  holdIds: Iterable<number> = [],
  mode: "replace" | "union" = "replace",
): T[] {
  const hold = new Set([...holdIds].map(Number).filter((n) => n));
  if (mode === "union") {
    const map = new Map<string, T>();
    for (const x of prev || []) map.set(lessonKey(x), x);
    for (const p of pulled) {
      const k = lessonKey(p);
      const cur = map.get(k);
      if (held(p, hold) && cur) continue;
      if (cur && held(cur, hold)) continue;
      map.set(k, cur ? (foldLesson(cur as never, p as never) as T) : p);
    }
    return collapseLessonRows(
      [...map.values()].sort(
        (a, b) => String(a.date).localeCompare(String(b.date)) || String(a.from || "").localeCompare(String(b.from || "")),
      ),
    );
  }
  const keep = (prev || []).filter((x) => held(x, hold));
  if (!keep.length) return collapseLessonRows(pulled);
  const out = [...pulled];
  for (const loc of keep) {
    const k = lessonKey(loc);
    const i = out.findIndex((c) => lessonKey(c) === k);
    if (i >= 0) out[i] = loc;
    else out.push(loc);
  }
  return collapseLessonRows(
    out.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.from || "").localeCompare(String(b.from || ""))),
  );
}

export function journalFingerprint(lessons: { lessonId?: number; status?: number; date?: string; from?: string; customerIds?: number[] }[]) {
  return (lessons || [])
    .map((x) => `${x.lessonId || 0}|${x.date || ""}|${x.from || ""}|${x.status || 0}|${(x.customerIds || []).join(",")}`)
    .sort()
    .join(";");
}

/** Курс с диска/карточки. Число CRM не курс. */
function diskSiteCourse(s?: { courseId?: string; path?: string; siteCourseId?: string } | null) {
  return s ? sessionCourseId(s) : "";
}

export type InboundSiteMerge = {
  subjectId: number;
  subject: string;
  courseId: string;
  schoolId: string;
  school: string;
  course: string;
  path: string;
  keepSite: boolean;
  skipAlfaIds: boolean;
};

/** Alfa даёт subjectId и даты. Курс сайта с диска, если уже был или очередь group.update ещё в пути. */
export function mergeInboundSiteFields(
  incoming: {
    groupId?: number;
    subjectId?: number;
    subject?: string;
    courseId?: string;
    schoolId?: string;
    school?: string;
    course?: string;
    path?: string;
  },
  disk?: {
    subjectId?: number;
    subject?: string;
    courseId?: string;
    schoolId?: string;
    school?: string;
    course?: string;
    path?: string;
  } | null,
  opts?: { pending?: boolean; hasAssign?: boolean },
): InboundSiteMerge {
  const skipAlfaIds = inboundTake({ pending: opts?.pending }) === "skip";
  const inSid = Number(incoming.subjectId) || 0;
  if (!disk) {
    return {
      subjectId: inSid,
      subject: String(incoming.subject || ""),
      courseId: String(incoming.courseId || ""),
      schoolId: String(incoming.schoolId || ""),
      school: String(incoming.school || ""),
      course: String(incoming.course || ""),
      path: String(incoming.path || ""),
      keepSite: false,
      skipAlfaIds,
    };
  }
  const keepSite = skipAlfaIds || Boolean(opts?.hasAssign) || Boolean(diskSiteCourse(disk));
  const subjectId = skipAlfaIds ? Number(disk.subjectId) || 0 : inSid || Number(disk.subjectId) || 0;
  const subject = skipAlfaIds ? String(disk.subject || incoming.subject || "") : String(incoming.subject || disk.subject || "");
  if (keepSite) {
    return {
      subjectId,
      subject,
      courseId: String(disk.courseId || ""),
      schoolId: String(disk.schoolId || ""),
      school: String(disk.school || ""),
      course: String(disk.course || incoming.course || ""),
      path: String(disk.path || ""),
      keepSite: true,
      skipAlfaIds,
    };
  }
  return {
    subjectId,
    subject,
    courseId: "",
    schoolId: "",
    school: "",
    course: String(incoming.course || disk.course || ""),
    path: "",
    keepSite: false,
    skipAlfaIds,
  };
}

export function inboundGroupLogLine(s: {
  groupId?: number;
  branchId?: number;
  subjectId?: number;
  courseId?: string;
  path?: string;
}, source: string) {
  const course = sessionCourseId(s) || s.courseId || "—";
  return `groupId ${Number(s.groupId) || 0} branchId ${Number(s.branchId) || 0} subjectId ${Number(s.subjectId) || 0} courseId ${course} source ${source}`;
}
