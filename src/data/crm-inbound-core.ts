import { isAdminGroup, isCampStatus, isArchivedGroup, publishOf, readPriority, sessionCourseId, slotActiveToday, slotDateIso, todayIsoMsk, type StatusPublish } from "./group-status.ts";

export function inboundTake(opts: { pending?: boolean }) {
  return opts.pending ? ("skip" as const) : ("alfa" as const);
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

function slotKey(x: { date?: string; from?: string }) {
  return `${x.date || ""}|${x.from || ""}`;
}

function lessonKey(x: { lessonId?: number; date?: string; from?: string }) {
  const lid = Number(x.lessonId) || 0;
  return lid ? `id:${lid}` : `d:${slotKey(x)}`;
}

/** Один урок — одна строка: номер занятия важнее пары дата+время. Два разных номера не склеиваем. */
export function collapseLessonRows<T extends { lessonId?: number; date?: string; from?: string }>(list: T[]): T[] {
  const byId = new Map<number, T>();
  const noId: T[] = [];
  for (const row of list || []) {
    const lid = Number(row.lessonId) || 0;
    if (!lid) {
      noId.push(row);
      continue;
    }
    const prev = byId.get(lid);
    byId.set(lid, prev ? { ...prev, ...row, lessonId: lid } : row);
  }
  const slots = new Set([...byId.values()].map(slotKey));
  const bySlot = new Map<string, T>();
  for (const row of noId) {
    const s = slotKey(row);
    if (slots.has(s)) continue;
    const prev = bySlot.get(s);
    bySlot.set(s, prev ? { ...prev, ...row } : row);
  }
  return [...byId.values(), ...bySlot.values()].sort(
    (a, b) => String(a.date).localeCompare(String(b.date)) || String(a.from || "").localeCompare(String(b.from || "")),
  );
}

function held(x: { lessonId?: number }, hold: Set<number>) {
  const lid = Number(x.lessonId) || 0;
  return lid < 0 || hold.has(lid);
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
      if (held(p, hold)) continue;
      const k = lessonKey(p);
      const cur = map.get(k);
      if (cur && held(cur, hold)) continue;
      map.set(k, p);
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

export type NightGroupRow = {
  branchId: number;
  groupId: number;
  statusId?: number;
  bDate?: string;
  eDate?: string;
  name?: string;
};

export type NightGroupHit = NightGroupRow & {
  kind: "added" | "revived" | "prolonged";
  name: string;
  statusId: number;
  bDate: string;
  eDate: string;
};

function gk(branchId: number, groupId: number) {
  return `${Number(branchId) || 0}:${Number(groupId) || 0}`;
}

function liveIncoming(statusId?: number) {
  return isAdminGroup(statusId);
}

/** eDate входящей позже диска, или диск уже не действует, а входящая снова сегодня. */
export function groupProlonged(disk: NightGroupRow | undefined, incoming: NightGroupRow, today = todayIsoMsk()) {
  if (!disk || !liveIncoming(disk.statusId) || !liveIncoming(incoming.statusId)) return false;
  const diskE = slotDateIso(disk.eDate);
  const inE = slotDateIso(incoming.eDate);
  if (inE && diskE && inE > diskE) return true;
  if (!slotActiveToday(disk, today) && slotActiveToday(incoming, today)) return true;
  return false;
}

export function nightGroupDiff(opts: {
  disk: NightGroupRow[];
  prev?: NightGroupRow[];
  incoming: NightGroupRow[];
  today?: string;
}): NightGroupHit[] {
  const today = opts.today || todayIsoMsk();
  const diskMap = new Map<string, NightGroupRow>();
  for (const s of opts.disk) {
    const id = Number(s.groupId) || 0;
    if (!id) continue;
    diskMap.set(gk(s.branchId, id), s);
  }
  const prevMap = new Map<string, NightGroupRow>();
  for (const s of opts.prev || []) {
    const id = Number(s.groupId) || 0;
    if (!id) continue;
    prevMap.set(gk(s.branchId, id), s);
  }
  const out: NightGroupHit[] = [];
  const seen = new Set<string>();
  for (const g of opts.incoming) {
    const groupId = Number(g.groupId) || 0;
    const branchId = Number(g.branchId) || 0;
    if (!groupId || !branchId) continue;
    if (!liveIncoming(g.statusId)) continue;
    const key = gk(branchId, groupId);
    if (seen.has(key)) continue;
    seen.add(key);
    const disk = diskMap.get(key);
    const prev = prevMap.get(key);
    const row: NightGroupHit = {
      kind: "added",
      branchId,
      groupId,
      name: String(g.name || `группа ${groupId}`),
      statusId: Number(g.statusId) || 0,
      bDate: String(g.bDate || ""),
      eDate: String(g.eDate || ""),
    };
    const diskLive = Boolean(disk && liveIncoming(disk.statusId));
    if (!diskLive) {
      const wasDead = Boolean(prev && (isArchivedGroup(prev.statusId) || isCampStatus(prev.statusId)));
      row.kind = wasDead ? "revived" : "added";
      out.push(row);
      continue;
    }
    const datesSame = slotDateIso(disk?.bDate) === slotDateIso(g.bDate) && slotDateIso(disk?.eDate) === slotDateIso(g.eDate);
    if (datesSame) continue;
    if (groupProlonged(disk, g, today)) {
      row.kind = "prolonged";
      out.push(row);
    }
  }
  return out;
}

export function nightOnSiteReason(
  slot: {
    statusId?: number;
    priority?: number;
    courseId?: string;
    path?: string;
    siteCourseId?: string;
    bDate?: string;
    eDate?: string;
  },
  table?: Record<string, StatusPublish> | null,
): { onSite: boolean; reason: string } {
  if (!isAdminGroup(slot.statusId)) return { onSite: false, reason: "архив" };
  if (!slotActiveToday(slot)) return { onSite: false, reason: "срок кончился" };
  if (readPriority(slot.priority) <= 0) return { onSite: false, reason: "priority=0" };
  if (!publishOf(slot.statusId, table).schedule) return { onSite: false, reason: "statusPublish.schedule=false" };
  if (!sessionCourseId(slot)) return { onSite: false, reason: "no courseId" };
  return { onSite: true, reason: "yes" };
}

const LOCK_STALE_MS = 3 * 60 * 60 * 1000;

export function nightLockBusy(raw: { pid?: number; at?: string } | null, now: number, alive: (pid: number) => boolean) {
  if (!raw || !raw.at) return false;
  const t = Date.parse(raw.at);
  if (!Number.isFinite(t) || now - t > LOCK_STALE_MS) return false;
  const pid = Number(raw.pid) || 0;
  if (!pid) return true;
  return alive(pid);
}
