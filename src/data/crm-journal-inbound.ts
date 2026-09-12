import { loadGroupCard, saveGroupCard, saveGroupCards, mergeLocalCalendar, fanOutLessonWriteoffs, loadCustomerCalendar, replaceCustomerCalendar } from "./group-cards";
import { rememberLessons } from "./crm-lessons";
import { pendingExportIds } from "./crm-export-queue";
import { alfaLinkedNow } from "./crm-alfa-link";
import { stampJournalCursor, stampLessonsCursor } from "./crm-cache-policy";
import { journalFingerprint, mergeSeenLessonIds, pruneCalendarToAlfaIds, countAlfaLessonRows, canPruneCalendarFill, uniquePositiveIds, canCloseLessonCensus } from "./crm-inbound-core";
import type { GroupCalLesson, CrmSlot } from "./crm-slots-core";
import { pupilNameOk, mergeLessonPupils, lessonNeedsDetails, lessonNeedsHomework } from "./crm-slots-core";
import { findDossier } from "./dossiers";
import { cardPays } from "./crm-pay";
import { crmUnwrapIndex } from "./crm-leads-stages";
import { parseLessonDate, toAlfaLessonDate } from "./crm-journal-periods";
import {
  uniqueBranches,
  packLessonPupils,
  lessonCustomerIds,
  chargeFromPupils,
  lessonWriteoffAmount,
  lessonWriteoffCtt,
  lessonPupilsKey,
} from "./crm-ledger-core";
import {
  customerLessonsFresh,
  customerSyncOf,
  stampCustomerSync,
  lessonFillStart,
  lessonFillOf,
  lessonFillAdvance,
  lessonFillBusy,
  lessonFillForWindow,
  markLessonFillBusy,
  LESSON_STATUSES,
  LESSON_INBOUND_RUN,
  LESSON_RECENT_DAYS,
  customerLessonsNeedAttend,
  tryLockStudentAlfa,
  waitLockStudentAlfa,
  unlockStudentAlfa,
} from "./crm-customer-sync";


function hm(raw?: string) {
  const m = String(raw || "").match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

function ruShift(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function ymd(raw?: string) {
  return toAlfaLessonDate(raw);
}

function ruOf(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function ruAny(raw?: string) {
  const d = parseLessonDate(String(raw || ""));
  return d ? ruOf(d) : "";
}

function packLight(
  item: {
    id?: number;
    date?: string;
    time_from?: string;
    time_to?: string;
    status?: number;
    lesson_type_id?: number;
    lesson_type_name?: string;
    room_id?: number | null;
    teacher_ids?: number[];
    subject_id?: number;
    topic?: string | null;
    note?: string | null;
    homework?: string | null;
    details?: { is_attend?: number | null; commission?: number; cost?: number; customer_id?: number; ctt_id?: number; reason_id?: number; grade?: string; note?: string; homework_grade?: string; customer_name?: string }[];
    customer_ids?: number[];
    group_ids?: number[];
    duration?: number;
    ctt_id?: number;
    customer_id?: number;
    commission?: number;
    cost?: number;
  },
  ctx: { groupName: string; from: string; to: string; teacher: string; subject: string },
  customerId?: number,
): GroupCalLesson | null {
  const date = ymd(item.date || item.time_from || "");
  if (!date) return null;
  const from = hm(item.time_from) || ctx.from;
  const to = hm(item.time_to) || ctx.to;
  const rec = item as Record<string, unknown>;
  const ids = lessonCustomerIds(rec);
  const pupils = packLessonPupils(rec);
  const fromDetails = pupils.filter((p) => p.attend).length;
  const total = pupils.length || (item.details || []).length || ids.length;
  const cid = Number(customerId) || 0;
  const charge = cid ? chargeFromPupils({ pupils, amount: lessonWriteoffAmount(rec, cid), cttId: lessonWriteoffCtt(rec, cid) }, cid) : { amount: 0, cttId: 0 };
  const amount = cid ? charge.amount : 0;
  const cttId = cid ? charge.cttId : 0;
  return {
    date,
    from,
    to,
    status: Number(item.status || 0),
    type: String(item.lesson_type_name || "Групповое"),
    typeId: Number(item.lesson_type_id || 0) || undefined,
    room: item.room_id ? `аудитория ${item.room_id}` : "",
    teacher: ctx.teacher,
    subject: ctx.subject,
    group: ctx.groupName,
    topic: String(item.topic || "").trim(),
    homework: String(item.homework || "").trim(),
    note: String(item.note || "").trim(),
    attend: fromDetails || ids.length,
    total,
    lessonId: Number(item.id || 0) || undefined,
    roomId: Number(item.room_id || 0) || undefined,
    teacherIds: (item.teacher_ids || []).map(Number).filter((n) => n > 0),
    subjectId: Number(item.subject_id || 0) || undefined,
    groupIds: (item.group_ids || []).map(Number).filter((n) => n > 0),
    customerIds: cid && !ids.includes(cid) ? [...ids, cid] : ids.length ? ids : pupils.map((p) => p.customerId),
    amount: amount || undefined,
    cttId: cttId || undefined,
    duration: Number(item.duration || 0) || undefined,
    pupils: pupils.length ? pupils : undefined,
  };
}

function withPupilNames(lesson: GroupCalLesson): GroupCalLesson {
  const ids = (lesson.customerIds || []).map(Number).filter((n) => n > 0);
  const base = lesson.pupils?.length
    ? lesson.pupils
    : ids.map((customerId) => ({ customerId, attend: true as boolean }));
  if (!base.length) return lesson;
  let hit = !lesson.pupils?.length;
  const pupils = base.map((p) => {
    if (pupilNameOk(p.name)) return p;
    const d = findDossier({ crmId: p.customerId });
    let name = String(d?.child?.fio || d?.parent?.fio || "").trim();
    if (!name) {
      for (const row of cardPays(p.customerId)) {
        const pay = pupilNameOk(row.customerName);
        if (pay) {
          name = pay;
          break;
        }
      }
    }
    if (!name) return p;
    hit = true;
    return { ...p, name };
  });
  return hit ? { ...lesson, pupils, customerIds: ids.length ? ids : pupils.map((p) => p.customerId) } : lesson;
}

export async function inboundJournalGroup(
  branch: number,
  gid: number,
  opts?: { token?: string; slots?: CrmSlot[]; hold?: Set<number>; dateFrom?: string; dateTo?: string; defer?: boolean; deep?: boolean; lite?: boolean; recheck?: boolean; groupName?: string },
) {
  if (!alfaLinkedNow() || !gid) return { ok: true as const, extra: "без Alfa", count: 0, calendar: [] as GroupCalLesson[], capped: false };
  const slots = opts?.slots || (opts?.groupName ? [] : (await import("./alfacrm-schedule")).listAdminSlots());
  const slot = slots.find((s) => s.groupId === gid && s.branchId === branch) || slots.find((s) => s.groupId === gid);
  const cached = loadGroupCard(branch, gid);
  const { token, request } = await import("./alfacrm");
  const t = opts?.token || (await token());
  const ctx = {
    groupName: String(opts?.groupName || cached?.name || slot?.groupName || `группа ${gid}`),
    from: String(slot?.timeFrom || ""),
    to: String(slot?.timeTo || ""),
    teacher: String(slot?.teacher || ""),
    subject: String(cached?.subject || slot?.subject || ""),
  };
  const dateFrom = opts?.dateFrom || ruShift(opts?.lite ? -400 : -2600);
  const dateTo = opts?.dateTo || ruShift(90);
  const sliceWin = (list: GroupCalLesson[]) => {
    if (!opts?.dateFrom || !opts?.dateTo) return list;
    const a = parseLessonDate(opts.dateFrom);
    const b = parseLessonDate(opts.dateTo);
    if (!a || !b) return list;
    return list.filter((l) => {
      const d = parseLessonDate(l.date);
      return Boolean(d && d >= a && d <= b);
    });
  };
  const byKey = new Map<string, GroupCalLesson>();
  let alfaOk = 0;
  let lastErr = "";
  let hitCap = false;
  let reported = 0;
  let loaded = 0;
  async function pull(status: number, date_from: string, date_to: string, pages: number, pageSize: number) {
    let got = 0;
    let total = 0;
    for (let page = 0; page < pages; page++) {
      try {
        const raw = await request<unknown>(
          `/v2api/${branch}/lesson/index`,
          { page, pageSize, status, group_id: gid, date_from: ymd(date_from), date_to: ymd(date_to) },
          t,
        );
        alfaOk += 1;
        const pack = crmUnwrapIndex(raw);
        const chunk = (pack.items || []) as Parameters<typeof packLight>[0][];
        if (Number(pack.total) > total) total = Number(pack.total);
        got += chunk.length;
        loaded += chunk.length;
        for (const item of chunk) {
          const gids = (item.group_ids || []).map(Number).filter((n) => n > 0);
          if (gids.length && !gids.includes(gid)) continue;
          if (!gids.length && Number(item.lesson_type_id || 0) === 2) continue;
          const packed = packLight(item, ctx);
          if (!packed) continue;
          byKey.set(`${packed.lessonId || 0}|${packed.date}|${packed.from}`, withPupilNames(packed));
        }
        if (chunk.length < pageSize) break;
        if (page === pages - 1) hitCap = true;
      } catch (e) {
        lastErr = e instanceof Error ? e.message.replace(/^alfacrm\s+/i, "") : "сеть";
        if (alfaOk) hitCap = true;
        break;
      }
    }
    if (total > 0 && got < total) hitCap = true;
    if (total > reported) reported = total;
  }
  const windowed = Boolean(opts?.dateFrom && opts?.dateTo);
  const deepPages = Boolean(opts?.recheck);
  if (opts?.lite || windowed) {
    await Promise.all([
      pull(3, dateFrom, dateTo, deepPages ? 8 : 4, 50),
      pull(1, dateFrom, dateTo, deepPages ? 3 : 1, 50),
      pull(2, dateFrom, dateTo, deepPages ? 3 : 1, 50),
    ]);
  } else {
    await pull(3, dateFrom, dateTo, 10, 100);
    await pull(1, dateFrom, dateTo, 8, 100);
    await pull(2, dateFrom, dateTo, 4, 100);
  }
  if (!alfaOk) {
    return { ok: false as const, extra: `«${ctx.groupName}»: Alfa не ответила${lastErr ? ` (${lastErr.slice(0, 80)})` : ""}`, count: 0, calendar: cached?.calendar || [], capped: true };
  }
  const pulled = [...byKey.values()];
  const hold = opts?.hold || pendingExportIds(["lesson.update", "lesson.create"]);
  const calendar = mergeLocalCalendar(pulled, cached?.calendar, hold, "union");
  const now = new Date().toISOString();
  const noteOf = (n: number, suffix = "") =>
    n > 0 ? `«${ctx.groupName}»: ${n} зан.${suffix}` : `«${ctx.groupName}»: в Alfa занятий нет${suffix}`;
  const samePrint = cached && journalFingerprint(calendar) === journalFingerprint(cached.calendar || []);
  const sameMoney = cached && lessonPupilsKey(calendar) === lessonPupilsKey(cached.calendar || []);
  if (samePrint && sameMoney) {
    if (opts?.deep) {
      const enriched = await enrichCalendarDetails(branch, calendar, { token: t, take: 16 });
      if (enriched.changed) {
        const card0 = { ...(cached || { id: gid, branchId: branch, name: ctx.groupName, calendar: [] as GroupCalLesson[], at: "", subject: ctx.subject, subjectId: Number(slot?.subjectId || 0) }), calendar: enriched.calendar, journalAt: now, at: now };
        if (!opts?.defer) {
          saveGroupCard(card0);
          rememberLessons(sliceWin(enriched.calendar));
          fanOutLessonWriteoffs(sliceWin(enriched.calendar));
        }
        return { ok: true as const, extra: noteOf(enriched.calendar.length, `, детали ${enriched.filled}`), count: enriched.calendar.length, calendar: enriched.calendar, card: card0, capped: hitCap };
      }
    }
    if (cached) saveGroupCard({ ...cached, calendar, journalAt: now, at: cached.at || now });
    return { ok: true as const, extra: noteOf(calendar.length, calendar.length ? ", без изменений" : ""), count: calendar.length, calendar, capped: hitCap };
  }
  const card = {
    ...(cached || {
      id: gid,
      branchId: branch,
      name: ctx.groupName,
      note: slot?.groupNote || "",
      description: slot?.description || slot?.groupNote || "",
      remarks: slot?.remarks || "",
      hashtags: slot?.hashtags || "",
      makeup: slot?.makeup || "",
      statusId: slot?.statusId || 0,
      bDate: slot?.bDate || "",
      eDate: slot?.eDate || "",
      levelId: slot?.levelId || 0,
      signup: slot?.signup || "",
      subjectId: Number(slot?.subjectId || 0),
      subject: ctx.subject,
      calendar: [],
      at: "",
    }),
    calendar,
    journalAt: now,
    at: now,
  };
  if (!opts?.defer) {
    saveGroupCard(card);
    rememberLessons(sliceWin(calendar));
    fanOutLessonWriteoffs(sliceWin(calendar));
  }
  if (opts?.deep && calendar.length) {
    const enriched = await enrichCalendarDetails(branch, calendar, { token: t, take: 16 });
    if (enriched.changed) {
      card.calendar = enriched.calendar;
      card.journalAt = now;
      if (!opts?.defer) {
        saveGroupCard(card);
        rememberLessons(sliceWin(enriched.calendar));
        fanOutLessonWriteoffs(sliceWin(enriched.calendar));
      }
      return { ok: true as const, extra: noteOf(enriched.calendar.length, `, детали ${enriched.filled}`), count: enriched.calendar.length, calendar: enriched.calendar, card, capped: hitCap };
    }
  }
  return { ok: true as const, extra: noteOf(calendar.length), count: calendar.length, calendar, card, capped: hitCap, alfaTotal: reported };
}

/** Первая и последняя явка группы в Alfa + даты карточки. 2–3 запроса, не весь журнал. */
export async function probeGroupLife(branch: number, gid: number, opts?: { token?: string }) {
  if (!alfaLinkedNow() || !gid) return { from: "", to: "", lessons: 0, ok: false as const };
  const { token, request } = await import("./alfacrm");
  const t = opts?.token || (await token());
  let from = "";
  let to = "";
  try {
    const graw = await request<unknown>(`/v2api/${branch}/group/index`, { page: 0, pageSize: 1, id: gid }, t);
    const g = crmUnwrapIndex(graw).items[0] as { b_date?: string; e_date?: string; bDate?: string; eDate?: string } | undefined;
    if (g) {
      from = ruAny(String(g.b_date || g.bDate || ""));
      to = ruAny(String(g.e_date || g.eDate || ""));
    }
  } catch {
    /* слот останется */
  }
  const dateTo = ymd(ruShift(90));
  let lessons = 0;
  try {
    const newest = await request<unknown>(
      `/v2api/${branch}/lesson/index`,
      { page: 0, pageSize: 1, status: 3, group_id: gid, date_from: "2015-01-01", date_to: dateTo },
      t,
    );
    const pack = crmUnwrapIndex(newest);
    lessons = Number(pack.total) || pack.items.length;
    const a = pack.items[0] as { date?: string } | undefined;
    const da = ruAny(String(a?.date || ""));
    if (da) {
      if (!from || (parseLessonDate(da) && parseLessonDate(from) && parseLessonDate(da)! < parseLessonDate(from)!)) from = da;
      if (!to || (parseLessonDate(da) && parseLessonDate(to) && parseLessonDate(da)! > parseLessonDate(to)!)) to = da;
    }
    if (lessons > 1) {
      const oldest = await request<unknown>(
        `/v2api/${branch}/lesson/index`,
        { page: Math.max(0, lessons - 1), pageSize: 1, status: 3, group_id: gid, date_from: "2015-01-01", date_to: dateTo },
        t,
      );
      const b = crmUnwrapIndex(oldest).items[0] as { date?: string } | undefined;
      const db = ruAny(String(b?.date || ""));
      if (db) {
        if (!from || (parseLessonDate(db) && parseLessonDate(from) && parseLessonDate(db)! < parseLessonDate(from)!)) from = db;
        if (!to || (parseLessonDate(db) && parseLessonDate(to) && parseLessonDate(db)! > parseLessonDate(to)!)) to = db;
      }
    }
  } catch {
    /* оставляем даты карточки */
  }
  return { from, to, lessons, ok: true as const };
}

function pauseMs(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type LessonIndexItem = Parameters<typeof packLight>[0];

async function pullLessonPage(
  bid: number,
  body: Record<string, unknown>,
  t: string,
  tries = 3,
): Promise<{ ok: true; items: LessonIndexItem[]; total: number } | { ok: false }> {
  const { request } = await import("./alfacrm");
  for (let i = 0; i < tries; i += 1) {
    try {
      const raw = await request<unknown>(`/v2api/${bid}/lesson/index`, body, t);
      const pack = crmUnwrapIndex(raw);
      return { ok: true as const, items: (pack.items || []) as LessonIndexItem[], total: Number(pack.total) || 0 };
    } catch {
      if (i + 1 >= tries) return { ok: false as const };
      await pauseMs(800 * (i + 1));
    }
  }
  return { ok: false as const };
}

/** Сколько занятий у ученика в Alfa: перепись уникальных номеров. Пустой catch ≠ конец. */
export async function censusCustomerLessonIds(branch: number, customerId: number, opts?: { dateFrom?: string; token?: string }) {
  const id = Number(customerId) || 0;
  if (id <= 0) return { ids: [] as number[], ok: false as const, pages: 0 };
  const { token } = await import("./alfacrm");
  const t = opts?.token || (await token());
  const dateFrom = ymd(opts?.dateFrom) || "2015-01-01";
  const dateTo = ymd(ruShift(90));
  const branches = uniqueBranches(branch);
  const ids = new Set<number>();
  let pages = 0;
  for (const bid of branches) {
    for (const status of LESSON_STATUSES) {
      for (let page = 0; page < 12; page += 1) {
        const live = await pullLessonPage(
          bid,
          { page, pageSize: 100, status, customer_id: id, date_from: dateFrom, date_to: dateTo },
          t,
        );
        pages += 1;
        if (!live.ok) return { ids: uniquePositiveIds(ids), ok: false as const, pages };
        for (const item of live.items) {
          const lid = Number((item as { id?: number }).id) || 0;
          if (lid > 0) ids.add(lid);
        }
        if (live.items.length < 100) break;
      }
    }
  }
  return { ids: uniquePositiveIds(ids), ok: canCloseLessonCensus({ live: true, aborted: false }), pages };
}

export function applyCustomerLessonCensus(customerId: number, ids: number[], closed: boolean) {
  const id = Number(customerId) || 0;
  const prev = loadCustomerCalendar(id);
  const before = countAlfaLessonRows(prev);
  if (!closed) return { ok: false as const, disk: before, alfa: 0, pruned: 0 };
  const hold = pendingExportIds(["lesson.update", "lesson.create"]);
  const uniq = uniquePositiveIds(ids);
  const next = pruneCalendarToAlfaIds(prev, uniq, hold);
  replaceCustomerCalendar(id, next);
  const disk = countAlfaLessonRows(next);
  stampCustomerSync(id, {
    lessonsSeenIds: uniq,
    lessonsAlfa: uniq.length,
    lessonsAlfaAt: new Date().toISOString(),
    lessonsDisk: disk,
  });
  return { ok: true as const, disk, alfa: uniq.length, pruned: Math.max(0, before - disk) };
}

export async function probeCustomerLessons(branch: number, customerId: number, opts?: { token?: string; dateFrom?: string }) {
  const census = await censusCustomerLessonIds(branch, customerId, opts);
  if (!census.ok) return { total: 0, ok: false as const, ids: census.ids };
  return { total: census.ids.length, ok: true as const, ids: census.ids };
}

function isOneOffLesson(item: { lesson_type_id?: number; group_ids?: number[] }) {
  const typeId = Number(item.lesson_type_id || 0);
  const groups = (item.group_ids || []).map(Number).filter((n) => n > 0);
  if (typeId === 3 || typeId === 1 || typeId === 4 || typeId === 5 || typeId === 10 || typeId === 11) return true;
  return groups.length === 0 && typeId !== 2;
}

/** Тема, ДЗ, комментарий и явка с суммами — lesson/index по id, не весь журнал. */
export async function enrichCalendarDetails(
  branch: number,
  calendar: GroupCalLesson[],
  opts?: { token?: string; take?: number; customerId?: number },
) {
  const list = (calendar || []).slice();
  const need = list
    .filter(lessonNeedsDetails)
    .sort((a, b) => Number(lessonNeedsHomework(b)) - Number(lessonNeedsHomework(a)))
    .slice(0, Math.max(1, Math.min(24, Number(opts?.take) || 12)));
  if (!need.length) return { calendar: list, filled: 0, changed: false };
  const { token, request } = await import("./alfacrm");
  const t = opts?.token || (await token());
  const home = Number(branch) || 1;
  const cid = Number(opts?.customerId) || 0;
  let filled = 0;
  for (const l of need) {
    const json = await request<{ items?: Parameters<typeof packLight>[0][] }>(
      `/v2api/${home}/lesson/index`,
      { page: 0, pageSize: 5, id: l.lessonId, lesson_id: l.lessonId },
      t,
    ).catch(() => ({ items: [] as Parameters<typeof packLight>[0][] }));
    const raw = (json.items || []).find((x) => Number(x.id) === Number(l.lessonId));
    if (!raw) continue;
    const rec = raw as Record<string, unknown>;
    const pupils = packLessonPupils(rec);
    if (pupils.length) {
      const merged = mergeLessonPupils(l.pupils, pupils);
      if (merged?.length) l.pupils = merged;
      l.attend = (l.pupils || []).filter((p) => p.attend !== false).length;
      l.total = (l.pupils || []).length;
    }
    const topic = String(raw.topic || "").trim();
    const homework = String(raw.homework || "").trim();
    const note = String(raw.note || "").trim();
    if (topic) l.topic = topic;
    if (homework) l.homework = homework;
    if (note) l.note = note;
    l.detailsAt = new Date().toISOString();
    if (cid) {
      const charge = chargeFromPupils({ pupils: l.pupils, amount: lessonWriteoffAmount(rec, cid), cttId: lessonWriteoffCtt(rec, cid) }, cid);
      if (charge.amount > 0) l.amount = charge.amount;
      if (charge.cttId > 0) l.cttId = charge.cttId;
    }
    const named = withPupilNames(l);
    if (named.pupils) l.pupils = named.pupils;
    filled += 1;
  }
  return { calendar: list, filled, changed: filled > 0 };
}

export async function inboundCustomerLessons(branch: number, customerId: number, opts?: { full?: boolean; continueLater?: boolean; take?: number; deep?: number; force?: boolean; homeOnly?: boolean; dateFrom?: string; prune?: boolean; resetSeen?: boolean }) {
  const id = Number(customerId) || 0;
  if (id <= 0) return { ok: true as const, count: 0, done: true };
  if (!alfaLinkedNow() && !opts?.force) return { ok: true as const, count: 0, skipped: "offline" as const, done: true };
  const { wantAlfaPullChannel } = await import("./crm-alfa-link");
  if (!wantAlfaPullChannel("lessons") && !opts?.force) return { ok: true as const, count: 0, skipped: "канал" as const, done: true };
  if (lessonFillBusy(id)) {
    if (Number(opts?.take) > 0) {
      for (let i = 0; i < 16 && lessonFillBusy(id); i += 1) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    if (lessonFillBusy(id)) return { ok: true as const, count: 0, skipped: "busy" as const, done: false };
  }
  if (!(await waitLockStudentAlfa(id, Number(opts?.take) > 0 ? 20000 : 0))) {
    return { ok: true as const, count: 0, skipped: "busy" as const, done: false };
  }
  const wantFull = Boolean(opts?.full) || Boolean(opts?.prune) || !customerSyncOf(id).lessonsFull || customerLessonsNeedAttend(id);
  if (!wantFull && customerLessonsFresh(id)) {
    unlockStudentAlfa(id);
    return { ok: true as const, count: 0, skipped: "fresh" as const, done: true };
  }
  markLessonFillBusy(id, true);
  try {
    const { token, request } = await import("./alfacrm");
    const { listAdminSlots } = await import("./alfacrm-schedule");
    const t = await token();
    const dateFrom = ymd(opts?.dateFrom) || "2015-01-01";
    const deepHist = /^2015/.test(dateFrom);
    const dateTo = ruShift(90);
    const slots = listAdminSlots();
    const homeLite = Boolean(opts?.homeOnly);
    const prune = Boolean(opts?.prune);
    const resetSeen = Boolean(opts?.resetSeen);
    const branches = homeLite ? [Number(branch) || 1] : wantFull ? uniqueBranches(branch) : [Number(branch) || 1];
    if (resetSeen) stampCustomerSync(id, { lessonFill: undefined, lessonsSeenIds: [] });
    const prevCal = loadCustomerCalendar(id);
    const prevMap = new Map(prevCal.map((l) => [String(l.lessonId || `${l.date}|${l.from}`), l] as const));
    const packs: { items?: Parameters<typeof packLight>[0][] }[] = [];
    let cur = resetSeen
      ? lessonFillStart(branches[0] || branch, dateFrom)
      : wantFull
        ? lessonFillForWindow(lessonFillOf(customerSyncOf(id).lessonFill), dateFrom, branches[0] || branch)
        : lessonFillStart(branches[0] || branch, dateFrom);
    let ran = 0;
    const maxRun = homeLite ? LESSON_STATUSES.length : Number(opts?.take) > 0 ? Math.min(LESSON_INBOUND_RUN, Number(opts.take)) : wantFull ? LESSON_INBOUND_RUN : LESSON_STATUSES.length;
    const maxPages = homeLite ? 1 : deepHist ? 12 : Number(opts?.take) > 0 ? Math.min(3, wantFull ? 12 : 2) : wantFull ? 12 : 2;
    const from = wantFull ? dateFrom : ruShift(LESSON_RECENT_DAYS);
    let aborted = false;
    while (ran < maxRun && !cur.done && !aborted) {
      const bid = cur.bid;
      const status = LESSON_STATUSES[cur.statusIdx] || 1;
      if (!branches.includes(bid)) {
        cur = lessonFillAdvance(cur, true, branches);
        continue;
      }
      let progressed = false;
      for (let page = cur.page; page < maxPages; page += 1) {
        const live = await pullLessonPage(
          bid,
          { page, pageSize: 100, status, customer_id: id, date_from: ymd(from), date_to: ymd(dateTo) },
          t,
        );
        ran += 1;
        if (!live.ok) {
          aborted = true;
          break;
        }
        if (live.items.length) packs.push({ items: live.items });
        progressed = true;
        const lastShort = live.items.length < 100;
        cur = lastShort ? lessonFillAdvance({ ...cur, page }, true, branches) : { bid, statusIdx: cur.statusIdx, page: page + 1 };
        if (ran >= maxRun || cur.done || lastShort) break;
      }
      if (aborted) break;
      if (!progressed && !cur.done) cur = lessonFillAdvance(cur, true, branches);
    }
    const pulled: GroupCalLesson[] = [];
    for (const les of packs) {
      for (const item of les.items || []) {
        const rec = item as Record<string, unknown>;
        const ids = lessonCustomerIds(rec);
        if (ids.length && !ids.includes(id) && !packLessonPupils(rec).some((p) => p.customerId === id)) continue;
        const gid = Number((item.group_ids || [])[0] || 0);
        const slot = gid ? slots.find((s) => s.groupId === gid && s.branchId === branch) || slots.find((s) => s.groupId === gid) : undefined;
        const packed = packLight(
          { ...item, date: ymd(item.date), customer_ids: ids.length ? ids : [id] },
          {
            groupName: slot?.groupName || String(item.lesson_type_name || "занятие"),
            from: hm(item.time_from) || "",
            to: hm(item.time_to) || "",
            teacher: slot?.teacher || "",
            subject: slot?.subject || "",
          },
          id,
        );
        if (!packed) continue;
        packed.date = ymd(packed.date);
        if (!packed.customerIds?.length) packed.customerIds = [id];
        const prev = prevMap.get(String(packed.lessonId || `${packed.date}|${packed.from}`));
        if (prev) {
          if (!(Number(packed.amount) > 0) && Number(prev.amount) > 0) packed.amount = prev.amount;
          if (!(Number(packed.cttId) > 0) && Number(prev.cttId) > 0) packed.cttId = prev.cttId;
          const merged = mergeLessonPupils(prev.pupils, packed.pupils);
          if (merged?.length) packed.pupils = merged;
        }
        pulled.push(withPupilNames(packed));
      }
    }
    const detailCap = Number(opts?.deep) > 0 ? Math.min(24, Number(opts.deep)) : Number(opts?.take) > 0 ? 3 : 6;
    const home = Number(branches[0] || branch) || 1;
    const thin = pulled
      .filter((l) => {
        if (Number(l.status) !== 3 || !(Number(l.lessonId) > 0)) return false;
        if (lessonNeedsDetails(l)) return true;
        const mine = (l.pupils || []).find((p) => Number(p.customerId) === id);
        if (!mine) return true;
        if (mine.attend === false) return false;
        return !pupilNameOk(mine.name);
      })
      .slice(0, detailCap);
    for (const l of thin) {
      const json = await request<{ items?: Parameters<typeof packLight>[0][] }>(
        `/v2api/${home}/lesson/index`,
        { page: 0, pageSize: 5, id: l.lessonId, lesson_id: l.lessonId },
        t,
      ).catch(() => ({ items: [] as Parameters<typeof packLight>[0][] }));
      const raw = (json.items || []).find((x) => Number(x.id) === Number(l.lessonId));
      if (!raw) continue;
      const rec = raw as Record<string, unknown>;
      const pupils = packLessonPupils(rec);
      if (pupils.length) {
        const merged = mergeLessonPupils(l.pupils, pupils);
        if (merged?.length) l.pupils = merged;
      }
      const charge = chargeFromPupils({ pupils: l.pupils, amount: lessonWriteoffAmount(rec, id), cttId: lessonWriteoffCtt(rec, id) }, id);
      if (charge.amount > 0) l.amount = charge.amount;
      if (charge.cttId > 0) l.cttId = charge.cttId;
      l.attend = (l.pupils || []).filter((p) => p.attend !== false).length;
      l.total = (l.pupils || []).length;
      const topic = String(raw.topic || "").trim();
      const homework = String(raw.homework || "").trim();
      const note = String(raw.note || "").trim();
      if (topic) l.topic = topic;
      if (homework) l.homework = homework;
      if (note) l.note = note;
      const named = withPupilNames(l);
      if (named.pupils) l.pupils = named.pupils;
    }
    const hold = pendingExportIds(["lesson.update", "lesson.create"]);
    const fillDone = Boolean(cur.done) && !aborted;
    let next = mergeLocalCalendar(pulled, prevCal, hold, "union");
    if (prune) {
      const seen = mergeSeenLessonIds(resetSeen ? [] : customerSyncOf(id).lessonsSeenIds, pulled);
      stampCustomerSync(id, { lessonsSeenIds: seen });
    }
    replaceCustomerCalendar(id, next);
    stampCustomerSync(id, {
      lessonsAt: new Date().toISOString(),
      lessonsFull: homeLite ? false : customerSyncOf(id).lessonsFull || fillDone || !wantFull,
      lessonsAttend: homeLite ? customerSyncOf(id).lessonsAttend : customerSyncOf(id).lessonsAttend || fillDone || !wantFull,
      lessonFill: fillDone || !wantFull ? undefined : cur,
      lessonsDisk: countAlfaLessonRows(next),
    });
    if (wantFull && !fillDone && opts?.continueLater === true) {
      setTimeout(() => {
        void inboundCustomerLessons(branch, id, { full: true, force: opts?.force, prune, dateFrom, homeOnly: opts?.homeOnly }).catch(() => null);
      }, 700);
    }
    return { ok: true as const, count: pulled.length, done: fillDone || !wantFull, aborted };
  } finally {
    markLessonFillBusy(id, false);
    unlockStudentAlfa(id);
  }
}


export async function inboundJournalChunk(offset = 0, _take = 1) {
  if (!alfaLinkedNow()) {
    return { ok: true as const, done: true, next: 0, total: 0, extra: "без Alfa", ids: [] as number[], live: 0, fromCache: true };
  }
  const { journalPullGroups } = await import("./crm-journal-pull");
  const { journalPeriods, pulledPeriodKeys, nextPeriod, inPeriod } = await import("./crm-journal-periods");
  const groups = journalPullGroups();
  const total = groups.length;
  if (!total) {
    stampJournalCursor(0, 0);
    return { ok: true as const, done: true, next: 0, total: 0, extra: "нет групп", ids: [] as number[], live: 0 };
  }
  const periods = journalPeriods();
  const start = Math.max(0, Number(offset) || 0) % total;
  for (let i = 0; i < total; i += 1) {
    const idx = (start + i) % total;
    const g = groups[idx];
    const card0 = loadGroupCard(g.branchId, g.groupId);
    const have = pulledPeriodKeys(card0?.journalFill);
    const period = nextPeriod(have, periods);
    if (!period) continue;
    const res = await inboundJournalGroup(g.branchId, g.groupId, {
      lite: true,
      deep: false,
      dateFrom: period.from,
      dateTo: period.to,
    });
    const ok = res.ok !== false;
    const card = loadGroupCard(g.branchId, g.groupId);
    if (card) {
      const pulled = { ...(card.journalFill?.pulled || {}) };
      const doneKeys = pulledPeriodKeys({ done: card.journalFill?.done, pulled });
      const fail = { ...(card.journalFill?.fail || {}) };
      const at = new Date().toISOString();
      if (ok) {
        pulled[period.key] = at;
        if (!doneKeys.includes(period.key)) doneKeys.push(period.key);
        delete fail[period.key];
      } else {
        fail[period.key] = String(res.extra || "Alfa не ответила");
      }
      saveGroupCard({
        ...card,
        journalFill: {
          done: [...new Set([...doneKeys, ...Object.keys(pulled)])],
          fail,
          pulled,
          weak: card.journalFill?.weak,
          rechecked: card.journalFill?.rechecked,
        },
        journalAt: at,
      });
    }
    const n = (res.calendar || []).filter((l) => inPeriod(l.date, period.from, period.to)).length;
    const after = loadGroupCard(g.branchId, g.groupId);
    const still = after ? nextPeriod(pulledPeriodKeys(after.journalFill), periods) : null;
    const next = ok && still ? idx : (idx + 1) % total;
    const allDone = groups.every((row) => {
      const c = loadGroupCard(row.branchId, row.groupId);
      return !nextPeriod(pulledPeriodKeys(c?.journalFill), periods);
    });
    stampJournalCursor(allDone ? total : next, total);
    return {
      ok: true as const,
      done: allDone,
      next: allDone ? total : next,
      total,
      extra: ok
        ? `журнал «${g.name}»: ${period.label} · ${n} зан.`
        : String(res.extra || `«${g.name}»: ${period.label} — Alfa не ответила`),
      ids: [] as number[],
      live: n,
      scanned: 1,
    };
  }
  stampJournalCursor(total, total);
  return {
    ok: true as const,
    done: true,
    next: total,
    total,
    extra: "все полугодия групп проверены",
    ids: [] as number[],
    live: 0,
    scanned: 0,
  };
}

/** Очередь: полная явка по текущим и архиву. Лидов не гоняем. */
export async function inboundCustomerLessonsChunk(offset = 0, take = 1) {
  if (!alfaLinkedNow()) {
    return { ok: true as const, done: true, next: 0, total: 0, extra: "без Alfa", ids: [] as number[], live: 0 };
  }
  const { listDossierCrm } = await import("./dossiers");
  const { overlayAllowsCustomer, loadArchivePolicy } = await import("./crm-archive-policy");
  const pol = loadArchivePolicy();
  const ranked = listDossierCrm()
    .filter((x) => overlayAllowsCustomer(x.study, x.cid, pol) && x.status !== "удалён" && x.removed !== "1")
    .sort((a, b) => {
      const ra = a.study === 1 ? 0 : a.study === 2 ? 1 : 2;
      const rb = b.study === 1 ? 0 : b.study === 2 ? 1 : 2;
      return ra - rb || a.cid - b.cid;
    });
  const ids = ranked.map((x) => x.cid);
  const total = ids.length;
  const size = 1;
  const from = Math.max(0, Number(offset) || 0);
  const slice = ids.slice(from, from + size);
  let n = 0;
  for (const cid of slice) {
    const d = findDossier({ crmId: cid });
    const branch = Number(d?.branchId || 1) || 1;
    for (let round = 0; round < 6; round += 1) {
      const res = await inboundCustomerLessons(branch, cid, { continueLater: false }).catch(() => ({
        ok: true as const,
        count: 0,
        done: true as const,
        skipped: undefined as string | undefined,
      }));
      n += Number(res.count) || 0;
      if ("skipped" in res && res.skipped === "busy") {
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
      if (res.done !== false) break;
    }
  }
  const next = from + slice.length;
  const done = next >= total || !slice.length;
  stampLessonsCursor(done ? total : next, total);
  return {
    ok: true as const,
    done,
    next: done ? total : next,
    total,
    extra: `явка ${from + 1}–${Math.min(next, total)}/${total}`,
    ids: slice,
    live: n,
    scanned: slice.length,
  };
}
