import { loadGroupCard, saveGroupCard, saveGroupCards, mergeLocalCalendar, fanOutLessonWriteoffs, loadCustomerCalendar, replaceCustomerCalendar } from "./group-cards";
import { rememberLessons } from "./crm-lessons";
import { pendingExportIds } from "./crm-export-queue";
import { alfaLinkedNow } from "./crm-alfa-link";
import { stampJournalCursor, stampLessonsCursor } from "./crm-cache-policy";
import { journalFingerprint, mergeSeenLessonIds, pruneCalendarToAlfaIds, countAlfaLessonUniq, countAlfaLessonRows, canPruneCalendarFill, uniquePositiveIds, canCloseLessonCensus, inboundFillClosed, keepAlfaProbe, clampRecheckDays, recheckWindowYmd, iceWindowOrNow, lessonsSetGap, groupWindowGone, idsChecksum, journalIdsReady, censusSeatLessonId } from "./crm-inbound-core";
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
  noteAlfaLessonsLanded,
  lessonFillStart,
  lessonFillStartMonth,
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
  ownsStudentAlfa,
  lessonsStampShort,
  wasLessonGreen,
  stampLessonSetGap,
} from "./crm-customer-sync";

function hm(raw?: string) {
  const m = String(raw || "").match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

function lessonBidOf(l: { groupIds?: number[] }, slots: { groupId?: number; branchId?: number }[], home: number) {
  const gid = Number((l.groupIds || [])[0] || 0);
  if (gid) {
    const hit =
      slots.find((s) => Number(s.groupId) === gid && Number(s.branchId) > 0) ||
      slots.find((s) => Number(s.groupId) === gid);
    const b = Number(hit?.branchId || 0);
    if (b) return b;
  }
  return Number(home) || 1;
}

function ruShift(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function ymd(raw?: string) {
  return toAlfaLessonDate(raw);
}

/** Состав урока: cid в списке / пусто (группа) / чужой непустой. */
export function lessonSeatForCustomer(item: Record<string, unknown>, customerId: number): "own" | "empty" | "foreign" {
  const cid = Number(customerId) || 0;
  const ids = lessonCustomerIds(item);
  if (cid && ids.includes(cid)) return "own";
  if (!ids.length) return "empty";
  return "foreign";
}

export function recheckCensusWindow(_sync: Parameters<typeof wasLessonGreen>[0], days?: unknown) {
  return recheckWindowYmd(days);
}

export function recheckCensusDateFrom(sync: Parameters<typeof wasLessonGreen>[0], days?: unknown) {
  return recheckCensusWindow(sync, days).from;
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
  const date = ymd(item.date || "");
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
  opts?: { token?: string; slots?: CrmSlot[]; hold?: Set<number>; dateFrom?: string; dateTo?: string; defer?: boolean; deep?: boolean; lite?: boolean; recheck?: boolean; recheckDays?: number; groupName?: string },
) {
  if (!alfaLinkedNow() || !gid) return { ok: true as const, extra: "без Alfa", count: 0, calendar: [] as GroupCalLesson[], capped: false, hole: [] as number[], gone: [] as number[], pagesComplete: true };
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
  const recheck = Boolean(opts?.recheck);
  const days = clampRecheckDays(opts?.recheckDays);
  const winRecheck = recheck ? iceWindowOrNow(true, opts?.dateFrom, opts?.dateTo, days) : null;
  const dateFrom = winRecheck ? winRecheck.from : opts?.dateFrom || ruShift(opts?.lite ? -400 : -2600);
  const dateTo = winRecheck ? winRecheck.to : opts?.dateTo || ruShift(90);
  const winFrom = ymd(dateFrom);
  const winTo = ymd(dateTo);
  const inWin = (l: GroupCalLesson) => {
    const d = ymd(l.date);
    return Boolean(d && winFrom && winTo && d >= winFrom && d <= winTo);
  };
  const sliceWin = (list: GroupCalLesson[]) => (!winFrom || !winTo ? list : list.filter(inWin));
  const byKey = new Map<string, GroupCalLesson>();
  const census = new Set<number>();
  let alfaOk = 0;
  let lastErr = "";
  let hitCap = false;
  let reported = 0;
  let loaded = 0;
  async function pull(status: number, date_from: string, date_to: string) {
    let got = 0;
    let total = 0;
    let live = false;
    for (let page = 0; page < 80; page++) {
      try {
        const raw = await request<unknown>(
          `/v2api/${branch}/lesson/index`,
          { page, pageSize: 100, status, group_id: gid, date_from: ymd(date_from), date_to: ymd(date_to) },
          t,
        );
        alfaOk += 1;
        live = true;
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
          const lid = Number(packed.lessonId) || 0;
          if (lid > 0) {
            census.add(lid);
            byKey.set(`id:${lid}`, withPupilNames(packed));
          }
        }
        const lastShort = !chunk.length || (total > 0 ? got >= total : chunk.length < 100);
        if (lastShort) break;
        if (page === 79) hitCap = true;
      } catch (e) {
        lastErr = e instanceof Error ? e.message.replace(/^alfacrm\s+/i, "") : "сеть";
        hitCap = true;
        break;
      }
    }
    if (!live) hitCap = true;
    if (total > 0 && got < total) hitCap = true;
    if (total > reported) reported = total;
  }
  await pull(3, dateFrom, dateTo);
  await pull(1, dateFrom, dateTo);
  await pull(2, dateFrom, dateTo);
  if (!alfaOk) {
    return { ok: false as const, extra: `«${ctx.groupName}»: Alfa не ответила${lastErr ? ` (${lastErr.slice(0, 80)})` : ""}`, count: 0, calendar: cached?.calendar || [], capped: true, hole: [] as number[], gone: [] as number[], pagesComplete: false };
  }
  const pulled = [...byKey.values()];
  const hold = opts?.hold || pendingExportIds(["lesson.update", "lesson.create"]);
  const holdIds = [...hold];
  const pagesComplete = !hitCap;
  let calendar = mergeLocalCalendar(pulled, cached?.calendar, hold, "union");
  if (recheck && pagesComplete) {
    calendar = pruneCalendarToAlfaIds(calendar, census, hold, [], winFrom, winTo);
  }
  const have = uniquePositiveIds(sliceWin(calendar).map((l) => Number(l.lessonId) || 0));
  const hole = lessonsSetGap(have, census, holdIds).hole;
  const gone = groupWindowGone(have, census, holdIds, pagesComplete);
  const censusN = census.size;
  const diskUniq = have.length;
  const diskRows = countAlfaLessonRows(sliceWin(calendar));
  const checksum = idsChecksum(census);
  const ready = journalIdsReady({
    pagesComplete,
    holeN: hole.length,
    extraN: gone.length,
    diskUniq,
    censusN,
    diskRows,
    allowExtra: false,
  });
  const beforeIds = new Set((cached?.calendar || []).map((l) => Number(l.lessonId) || 0).filter((n) => n > 0));
  const seatedNew = pulled.filter((l) => {
    const id = Number(l.lessonId) || 0;
    return id > 0 && !beforeIds.has(id);
  });
  const now = new Date().toISOString();
  const noteOf = (n: number, suffix = "") =>
    n > 0 ? `«${ctx.groupName}»: ${n} зан.${suffix}` : `«${ctx.groupName}»: в Alfa занятий нет${suffix}`;
  const gapNote = `${hole.length ? `, дырок ${hole.length}` : ""}${gone.length ? `, ушло ${gone.length}` : ""}`;
  const samePrint = cached && journalFingerprint(calendar) === journalFingerprint(cached.calendar || []);
  const sameMoney = cached && lessonPupilsKey(calendar) === lessonPupilsKey(cached.calendar || []);
  const gap = { hole, gone, pagesComplete, capped: !pagesComplete, censusN, diskUniq, diskRows, checksum, ready };
  if (samePrint && sameMoney && !recheck) {
    if (opts?.deep) {
      const enriched = await enrichCalendarDetails(branch, calendar, { token: t, take: 16 });
      if (enriched.changed) {
        const card0 = { ...(cached || { id: gid, branchId: branch, name: ctx.groupName, calendar: [] as GroupCalLesson[], at: "", subject: ctx.subject, subjectId: Number(slot?.subjectId || 0) }), calendar: enriched.calendar, journalAt: now, at: now };
        if (!opts?.defer) {
          saveGroupCard(card0);
          rememberLessons(seatedNew);
          fanOutLessonWriteoffs(seatedNew);
        }
        return { ok: true as const, extra: noteOf(sliceWin(enriched.calendar).length, `, детали ${enriched.filled}${gapNote}`), count: sliceWin(enriched.calendar).length, calendar: enriched.calendar, card: card0, ...gap };
      }
    }
    if (cached) saveGroupCard({ ...cached, calendar, journalAt: now, at: cached.at || now });
    return { ok: true as const, extra: noteOf(sliceWin(calendar).length, calendar.length ? `, без изменений${gapNote}` : gapNote), count: sliceWin(calendar).length, calendar, ...gap };
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
    rememberLessons(seatedNew);
    fanOutLessonWriteoffs(seatedNew);
  }
  if (opts?.deep && calendar.length) {
    const enriched = await enrichCalendarDetails(branch, calendar, { token: t, take: 16 });
    if (enriched.changed) {
      card.calendar = enriched.calendar;
      card.journalAt = now;
      if (!opts?.defer) {
        saveGroupCard(card);
        rememberLessons(seatedNew);
        fanOutLessonWriteoffs(seatedNew);
      }
      return { ok: true as const, extra: noteOf(sliceWin(enriched.calendar).length, `, детали ${enriched.filled}${gapNote}`), count: sliceWin(enriched.calendar).length, calendar: enriched.calendar, card, ...gap };
    }
  }
  return { ok: true as const, extra: noteOf(sliceWin(calendar).length, gapNote), count: sliceWin(calendar).length, calendar, card, alfaTotal: reported, ...gap };
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
): Promise<{ ok: true; items: LessonIndexItem[]; total: number } | { ok: false; error: string }> {
  const { request } = await import("./alfacrm");
  let last = "Alfa не ответила";
  for (let i = 0; i < tries; i += 1) {
    try {
      const raw = await request<unknown>(`/v2api/${bid}/lesson/index`, body, t);
      const pack = crmUnwrapIndex(raw);
      return { ok: true as const, items: (pack.items || []) as LessonIndexItem[], total: Number(pack.total) || 0 };
    } catch (e) {
      last = e instanceof Error && e.message ? e.message : "Alfa не ответила";
      if (i + 1 >= tries) return { ok: false as const, error: last };
      await pauseMs(800 * (i + 1));
    }
  }
  return { ok: false as const, error: last };
}

/** Филиалы с карточки: группы + уроки на диске. Пусто — все четыре. */
export function studentCardBranches(cid: number, home = 0): number[] {
  const d = findDossier({ crmId: cid });
  const homeN = Number(home) || Number(d?.branchId) || 1;
  const bids = new Set<number>();
  const add = (b: number) => {
    const n = Number(b) || 0;
    if (n >= 1 && n <= 4) bids.add(n);
  };
  add(homeN);
  const links = d?.groupLinks || [];
  for (const link of links) add(Number((link as { branchId?: number }).branchId) || 0);
  const cal = loadCustomerCalendar(cid) || [];
  const have = new Set(cal.map((l) => Number(l.lessonId) || 0).filter((n) => n > 0));
  const gids = new Set<number>();
  for (const l of cal) {
    add(Number(l.branchId) || 0);
    for (const raw of l.groupIds || []) {
      const gid = Number(raw) || 0;
      if (gid) gids.add(gid);
    }
  }
  for (const link of links) {
    const gid = Number((link as { id?: number }).id) || 0;
    if (gid) gids.add(gid);
  }
  if (have.size) {
    for (const gid of gids) {
      for (const bid of uniqueBranches(homeN)) {
        const card = loadGroupCard(bid, gid);
        if (!card) continue;
        if ((card.calendar || []).some((x) => have.has(Number(x.lessonId) || 0))) add(bid);
      }
    }
  }
  if (!bids.size) return uniqueBranches(homeN);
  return uniqueBranches(homeN).filter((b) => bids.has(b));
}

/** Сколько занятий у ученика в Alfa: перепись уникальных номеров. Пустой catch ≠ конец. Полная страница на потолке — не закрыта. */
export async function censusCustomerLessonIds(
  branch: number,
  customerId: number,
  opts?: { dateFrom?: string; dateTo?: string; token?: string; branches?: number[] },
) {
  const id = Number(customerId) || 0;
  if (id <= 0) return { ids: [] as number[], ok: false as const, pages: 0, error: "нет id" };
  const { token } = await import("./alfacrm");
  const t = opts?.token || (await token());
  const dateFrom = ymd(opts?.dateFrom) || "2015-01-01";
  const dateTo = ymd(opts?.dateTo) || ymd(ruShift(90));
  const branches = opts?.branches?.length ? opts.branches : uniqueBranches(branch);
  const ids = new Set<number>();
  const noDate: number[] = [];
  let pages = 0;
  let aborted = false;
  const pageSize = 500;
  const pageCap = 12;
  for (const bid of branches) {
    for (const status of LESSON_STATUSES) {
      let received = 0;
      for (let page = 0; page < pageCap; page += 1) {
        const live = await pullLessonPage(
          bid,
          { page, pageSize, status, customer_id: id, date_from: dateFrom, date_to: dateTo },
          t,
        );
        pages += 1;
        if (!live.ok) return { ids: uniquePositiveIds(ids), ok: false as const, pages, error: live.error };
        for (const item of live.items) {
          const lid = censusSeatLessonId(item);
          if (lid) ids.add(lid);
          else {
            const raw = Number((item as { id?: number }).id) || 0;
            if (raw > 0) noDate.push(raw);
          }
        }
        received += live.items.length;
        if (live.total > 0) {
          if (!live.items.length && received < live.total) {
            aborted = true;
            break;
          }
          if (received >= live.total) break;
        } else if (!live.items.length || live.items.length < pageSize) {
          break;
        }
        if (page === pageCap - 1) aborted = true;
      }
    }
  }
  if (noDate.length) console.warn(`census cid=${id} dropped no-date: ${uniquePositiveIds(noDate).slice(0, 40).join(",")}`);
  return { ids: uniquePositiveIds(ids), ok: canCloseLessonCensus({ live: true, aborted }), pages };
}

function lessonIdsOnStudentGroups(cid: number) {
  const d = findDossier({ crmId: cid });
  const links = d?.groupLinks || [];
  const ids = new Set<number>();
  for (const link of links) {
    const gid = Number((link as { id?: number }).id) || 0;
    if (!gid) continue;
    const bid = Number((link as { branchId?: number }).branchId) || Number(d?.branchId) || 0;
    const card = bid ? loadGroupCard(bid, gid) : null;
    for (const les of card?.calendar || []) {
      const lid = Number(les.lessonId) || 0;
      if (lid > 0) ids.add(lid);
    }
  }
  return [...ids];
}

export function studentProtectLessonIds(cid: number) {
  void cid;
  return uniquePositiveIds(pendingExportIds(["lesson.update", "lesson.create"]));
}

/** Жёлтая «С нуля»: календарь с диска. Счёт Alfa снимаем — следующая проба пишет живой. В очередь не пишет. */
export function resetStudentLessonDisk(customerId: number) {
  const id = Number(customerId) || 0;
  if (!id) return { ok: false as const, disk: 0, alfa: 0 };
  const prev = loadCustomerCalendar(id);
  const hold = pendingExportIds(["lesson.update", "lesson.create"]);
  const next = pruneCalendarToAlfaIds(prev, [], hold, [], "");
  replaceCustomerCalendar(id, next);
  const disk = countAlfaLessonUniq(next);
  stampCustomerSync(id, {
    lessonsDisk: disk,
    lessonsAlfa: 0,
    lessonsFull: false,
    lessonsAttend: false,
    lessonsSeenIds: [],
    lessonsHoleN: 0,
    lessonsExtraN: 0,
    lessonsRecheckAt: "",
    lessonsAlfaAt: "",
    lessonsResetAt: new Date().toISOString(),
    lessonFill: undefined,
    lessonsAt: new Date().toISOString(),
    lessonsWindowDays: 0,
  });
  return { ok: true as const, disk, alfa: 0 };
}

export function applyCustomerLessonCensus(customerId: number, ids: number[], closed: boolean, keepBefore = "", keepAfter = "") {
  const id = Number(customerId) || 0;
  if (!closed) return { ok: false as const, disk: countAlfaLessonUniq(loadCustomerCalendar(id)), alfa: 0, pruned: 0 };
  const holeApproved = Boolean(customerSyncOf(id).journalHoleApprovedAt);
  if (holeApproved) {
    const disk = countAlfaLessonUniq(loadCustomerCalendar(id));
    return { ok: true as const, disk, alfa: Number(customerSyncOf(id).lessonsAlfa) || 0, pruned: 0 };
  }
  const held = ownsStudentAlfa(id);
  if (!held && !tryLockStudentAlfa(id)) return { ok: false as const, disk: countAlfaLessonUniq(loadCustomerCalendar(id)), alfa: 0, pruned: 0 };
  try {
  const prev = loadCustomerCalendar(id);
  const before = countAlfaLessonUniq(prev);
  const hold = pendingExportIds(["lesson.update", "lesson.create"]);
  const uniq = uniquePositiveIds(ids);
  const next = pruneCalendarToAlfaIds(prev, uniq, hold, [], keepBefore, keepAfter);
  replaceCustomerCalendar(id, next);
  const disk = countAlfaLessonUniq(next);
  const keepAlfa = Number(customerSyncOf(id).lessonsAlfa) || 0;
  const heldAlfa = keepBefore ? { write: false, alfa: keepAlfa, probed: keepAlfa > 0 } : keepAlfaProbe(keepAlfa, uniq.length, true, true);
  const alfa = keepBefore ? keepAlfa : heldAlfa.alfa;
  const gap = keepBefore
    ? {}
    : stampLessonSetGap({ lessonsSeenIds: uniq }, uniquePositiveIds(next.map((x) => Number(x.lessonId) || 0)), hold);
  stampCustomerSync(id, {
    lessonsDisk: disk,
    ...gap,
    ...(keepBefore
      ? {}
      : {
          lessonsSeenIds: uniq,
          ...(heldAlfa.write ? { lessonsAlfa: heldAlfa.alfa, lessonsAlfaAt: new Date().toISOString() } : {}),
        }),
    ...(keepBefore ? disk !== keepAlfa : disk !== alfa) ? { lessonsFull: false } : {},
  });
  return { ok: true as const, disk, alfa, pruned: Math.max(0, before - disk) };
  } finally {
    if (!held) unlockStudentAlfa(id);
  }
}

export async function probeCustomerLessons(branch: number, customerId: number, opts?: { token?: string; dateFrom?: string; dateTo?: string }) {
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
  const { listAdminSlots } = await import("./alfacrm-schedule");
  const slots = listAdminSlots();
  let filled = 0;
  for (const l of need) {
    const json = await request<{ items?: Parameters<typeof packLight>[0][] }>(
      `/v2api/${lessonBidOf(l, slots, home)}/lesson/index`,
      { page: 0, pageSize: 5, id: l.lessonId, status: Number(l.status) || 3 },
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

export function skipHoleInbound(id: number, force?: boolean) {
  if (force) return false;
  const s = customerSyncOf(id);
  if (!s.journalHoleApprovedAt) return false;
  return lessonsStampShort(s);
}

export async function inboundCustomerLessons(branch: number, customerId: number, opts?: { full?: boolean; continueLater?: boolean; take?: number; deep?: number; force?: boolean; homeOnly?: boolean; dateFrom?: string; dateTo?: string; prune?: boolean; resetSeen?: boolean; monthly?: boolean; resetAt?: string }) {
  const id = Number(customerId) || 0;
  if (id <= 0) return { ok: true as const, count: 0, done: true };
  if (skipHoleInbound(id, opts?.force)) return { ok: true as const, count: 0, skipped: "hole" as const, done: true };
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
  if (opts?.resetAt != null && String(customerSyncOf(id).lessonsResetAt || "") !== String(opts.resetAt)) {
    unlockStudentAlfa(id);
    return { ok: true as const, count: 0, skipped: "reset" as const, done: true };
  }
  if (skipHoleInbound(id, opts?.force)) {
    unlockStudentAlfa(id);
    return { ok: true as const, count: 0, skipped: "hole" as const, done: true };
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
    const dateTo = ymd(opts?.dateTo) || ruShift(90);
    const floor = deepHist ? "" : dateFrom;
    const slots = listAdminSlots();
    const homeLite = Boolean(opts?.homeOnly);
    const prune = Boolean(opts?.prune);
    const resetSeen = Boolean(opts?.resetSeen);
    const monthly = Boolean(opts?.monthly);
    const branches = homeLite ? [Number(branch) || 1] : wantFull ? uniqueBranches(branch) : [Number(branch) || 1];
    if (resetSeen) stampCustomerSync(id, { lessonFill: undefined, lessonsSeenIds: [] });
    const prevCal = loadCustomerCalendar(id);
    const prevMap = new Map(prevCal.map((l) => [String(l.lessonId || `${l.date}|${l.from}`), l] as const));
    const packs: { items?: Parameters<typeof packLight>[0][] }[] = [];
    let cur = resetSeen
      ? monthly
        ? lessonFillStartMonth(branches[0] || branch)
        : lessonFillStart(branches[0] || branch, dateFrom)
      : monthly
        ? lessonFillOf(customerSyncOf(id).lessonFill)?.to
          ? lessonFillOf(customerSyncOf(id).lessonFill)!
          : lessonFillStartMonth(branches[0] || branch)
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
      let received = 0;
      const pageEnd = (Number(cur.page) || 0) + maxPages;
      for (let page = cur.page; page < pageEnd && ran < maxRun && !cur.done; page += 1) {
        const winFrom = monthly ? ymd(cur.from) || ymd(from) : ymd(from);
        const winTo = monthly ? ymd(cur.to) || ymd(dateTo) : ymd(dateTo);
        const live = await pullLessonPage(
          bid,
          { page, pageSize: 100, status, customer_id: id, date_from: winFrom, date_to: winTo },
          t,
          monthly ? 8 : 3,
        );
        ran += 1;
        if (!live.ok) {
          if (monthly) break;
          aborted = true;
          break;
        }
        if (live.items.length) packs.push({ items: live.items });
        progressed = true;
        received += live.items.length;
        const lastShort = !live.items.length || (live.total > 0 ? received >= live.total : live.items.length < 100);
        cur = lastShort ? lessonFillAdvance({ ...cur, page }, true, branches) : { bid, statusIdx: cur.statusIdx, page: page + 1, from: cur.from, to: cur.to };
        if (floor && cur.from && String(cur.to || cur.from) < floor) cur = { ...cur, done: true };
        if (ran >= maxRun || cur.done || lastShort) break;
      }
      if (aborted) break;
      if (!progressed && !cur.done) break;
    }
    const droppedNoDate: number[] = [];
    const pulled: GroupCalLesson[] = [];
    for (const les of packs) {
      for (const item of les.items || []) {
        const rec = item as Record<string, unknown>;
        const ids = lessonCustomerIds(rec);
        const lid = Number(item.id || 0);
        const gid = Number((item.group_ids || [])[0] || 0);
        const slot = gid ? slots.find((s) => s.groupId === gid && s.branchId === branch) || slots.find((s) => s.groupId === gid) : undefined;
        const day = ymd(item.date) || ymd((item as { lesson_date?: string }).lesson_date);
        if (!day) {
          if (lid > 0) droppedNoDate.push(lid);
          continue;
        }
        const packed = packLight(
          { ...item, date: day, customer_ids: uniquePositiveIds([...ids, id]) },
          {
            groupName: slot?.groupName || String(item.lesson_type_name || "занятие"),
            from: hm(item.time_from) || "",
            to: hm(item.time_to) || "",
            teacher: slot?.teacher || "",
            subject: slot?.subject || "",
          },
          id,
        );
        if (!packed) {
          if (lid > 0) droppedNoDate.push(lid);
          continue;
        }
        packed.date = ymd(packed.date) || day;
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
        `/v2api/${lessonBidOf(l, slots, home)}/lesson/index`,
        { page: 0, pageSize: 5, id: l.lessonId, status: Number(l.status) || 3 },
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
    let next = mergeLocalCalendar(pulled, prevCal, hold, "union");
    if (prune) {
      const seen = mergeSeenLessonIds(resetSeen ? [] : customerSyncOf(id).lessonsSeenIds, pulled);
      stampCustomerSync(id, { lessonsSeenIds: seen });
    }
    replaceCustomerCalendar(id, next);
    const diskNow = countAlfaLessonUniq(next);
    const before = new Set((prevCal || []).map((l) => Number(l.lessonId) || 0).filter((n) => n > 0));
    noteAlfaLessonsLanded(
      id,
      diskNow,
      pulled.map((l) => Number(l.lessonId) || 0).filter((n) => n > 0 && !before.has(n)),
    );
    const keep = Number(customerSyncOf(id).lessonsAlfa) || 0;
    const walked = Boolean(cur.done) && !aborted;
    const fillDone = inboundFillClosed(diskNow, keep, walked, aborted);
    const wasFull = Boolean(customerSyncOf(id).lessonsFull);
    const gap = stampLessonSetGap(customerSyncOf(id), uniquePositiveIds(next.map((x) => Number(x.lessonId) || 0)), studentProtectLessonIds(id));
    const rows = countAlfaLessonRows(next);
    const fullOk = Boolean(fillDone && !(Number(gap.lessonsHoleN) || 0) && !(Number(gap.lessonsExtraN) || 0) && rows === diskNow);
    stampCustomerSync(id, {
      lessonsAt: new Date().toISOString(),
      lessonsFull: homeLite ? false : wantFull ? fullOk : wasFull,
      lessonsAttend: homeLite ? customerSyncOf(id).lessonsAttend : customerSyncOf(id).lessonsAttend || fullOk,
      lessonFill: fillDone || !wantFull ? undefined : cur,
      lessonsDisk: diskNow,
      ...gap,
    });
    if (droppedNoDate.length) {
      console.warn(`inbound lessons cid=${id} dropped no-date: ${droppedNoDate.slice(0, 40).join(",")}`);
    }
    if (!fillDone && keep > diskNow) {
      console.warn(`inbound lessons cid=${id} short disk=${diskNow} alfa=${keep} walked=${walked} pulled=${pulled.length}`);
    }
    return { ok: true as const, count: pulled.length, done: fillDone || !wantFull, aborted, dropped: droppedNoDate, walked };
  } finally {
    markLessonFillBusy(id, false);
    unlockStudentAlfa(id);
  }
}


/** Номера с переписи, которых нет на диске: один index по id, не повтор страниц. */
export async function inboundMissingCustomerLessons(
  branch: number,
  customerId: number,
  lessonIds: number[],
  opts?: { force?: boolean; take?: number },
) {
  const id = Number(customerId) || 0;
  const want = uniquePositiveIds(lessonIds).slice(0, Math.max(1, Math.min(50, Number(opts?.take) || 50)));
  if (id <= 0 || !want.length) return { ok: true as const, count: 0, dropped: [] as number[] };
  if (skipHoleInbound(id, opts?.force)) return { ok: true as const, count: 0, skipped: "hole" as const, dropped: want };
  const held = ownsStudentAlfa(id);
  if (!held && !(await waitLockStudentAlfa(id, Number(opts?.take) > 0 ? 20000 : 0))) {
    return { ok: true as const, count: 0, skipped: "busy" as const, dropped: want };
  }
  try {
  if (skipHoleInbound(id, opts?.force)) return { ok: true as const, count: 0, skipped: "hole" as const, dropped: want };
  if (!alfaLinkedNow() && !opts?.force) return { ok: true as const, count: 0, skipped: "offline" as const, dropped: want };
  const { token } = await import("./alfacrm");
  const t = await token();
  const { listAdminSlots } = await import("./alfacrm-schedule");
  const slots = listAdminSlots();
  const branches = uniqueBranches(branch);
  const prevCal = loadCustomerCalendar(id);
  const prevMap = new Map(prevCal.map((l) => [String(l.lessonId || `${l.date}|${l.from}`), l] as const));
  const pulled: GroupCalLesson[] = [];
  const dropped: number[] = [];
  const failed: number[] = [];
  const bodiesFor = (lid: number) =>
    LESSON_STATUSES.map((status) => ({ page: 0, pageSize: 5, id: lid, status })) as Record<string, unknown>[];
  console.warn(`inbound missing cid=${id} want ${want.length}`);
  for (let i = 0; i < want.length; i += 1) {
    const lid = want[i];
    if (i) await pauseMs(200);
    let packedRow: GroupCalLesson | undefined;
    let liveFail = false;
    let found = false;
    outer: for (const bid of branches) {
      for (const body of bodiesFor(lid)) {
        const live = await pullLessonPage(bid, body, t, 2);
        if (!live.ok) {
          liveFail = true;
          continue;
        }
        const hit = live.items.find((x) => Number(x.id) === lid);
        if (!hit) continue;
        found = true;
        const rec = hit as Record<string, unknown>;
        const seat = lessonSeatForCustomer(rec, id);
        if (seat === "foreign") {
          console.warn(`inbound missing cid=${id} foreign-seat lessonId=${lid} status=${String(body.status || "")} bid=${bid}`);
        }
        const day = ymd(hit.date) || ymd((hit as { lesson_date?: string }).lesson_date);
        if (!day) {
          console.warn(`inbound missing cid=${id} no-date lessonId=${lid} status=${String(body.status || "")}`);
          continue;
        }
        const gid = Number((hit.group_ids || [])[0] || 0);
        const slot = gid ? slots.find((s) => s.groupId === gid && s.branchId === branch) || slots.find((s) => s.groupId === gid) : undefined;
        const ctx = {
          groupName: slot?.groupName || String(hit.lesson_type_name || "занятие"),
          from: hm(hit.time_from) || "",
          to: hm(hit.time_to) || "",
          teacher: slot?.teacher || "",
          subject: slot?.subject || "",
        };
        const ids = lessonCustomerIds(rec);
        let packed = packLight(
          { ...hit, date: day, customer_ids: uniquePositiveIds([...ids, id]) },
          ctx,
          id,
        );
        if (!packed) continue;
        packed.date = ymd(packed.date) || day;
        if (!packed.customerIds?.length) packed.customerIds = [id];
        const prev = prevMap.get(String(packed.lessonId || `${packed.date}|${packed.from}`));
        if (prev) {
          if (!(Number(packed.amount) > 0) && Number(prev.amount) > 0) packed.amount = prev.amount;
          if (!(Number(packed.cttId) > 0) && Number(prev.cttId) > 0) packed.cttId = prev.cttId;
          const merged = mergeLessonPupils(prev.pupils, packed.pupils);
          if (merged?.length) packed.pupils = merged;
        }
        packedRow = withPupilNames(packed);
        break outer;
      }
    }
    if (packedRow) {
      pulled.push(packedRow);
      continue;
    }
    if (liveFail && !found) {
      failed.push(lid);
      continue;
    }
    if (found) {
      failed.push(lid);
      continue;
    }
    dropped.push(lid);
  }
  if (pulled.length) {
    const hold = pendingExportIds(["lesson.update", "lesson.create"]);
    const next = mergeLocalCalendar(pulled, prevCal, hold, "union");
    replaceCustomerCalendar(id, next);
    const before = new Set((prevCal || []).map((l) => Number(l.lessonId) || 0).filter((n) => n > 0));
    const haveNow = new Set((loadCustomerCalendar(id) || []).map((l) => Number(l.lessonId) || 0).filter((n) => n > 0));
    const landed = pulled.map((l) => Number(l.lessonId) || 0).filter((n) => n > 0 && haveNow.has(n) && !before.has(n));
    noteAlfaLessonsLanded(id, countAlfaLessonUniq(next), landed);
    const skippedHold = pulled
      .map((l) => Number(l.lessonId) || 0)
      .filter((n) => n > 0 && !haveNow.has(n));
    if (skippedHold.length) console.warn(`inbound missing cid=${id} hold-skip: ${skippedHold.slice(0, 20).join(",")}`);
    pulled.length = 0;
    for (const lid of landed) {
      const row = next.find((l) => Number(l.lessonId) === lid);
      if (row) pulled.push(row);
    }
  }
  const seen0 = uniquePositiveIds(customerSyncOf(id).lessonsSeenIds || []);
  const dropSet = new Set(dropped);
  const seenNext = seen0.filter((n) => !dropSet.has(n));
  const have = uniquePositiveIds((loadCustomerCalendar(id) || []).map((l) => Number(l.lessonId) || 0));
  const gap = stampLessonSetGap({ ...customerSyncOf(id), lessonsSeenIds: seenNext }, have, studentProtectLessonIds(id));
  stampCustomerSync(id, {
    lessonsFull: false,
    lessonsSeenIds: seenNext,
    ...gap,
  });
  if (dropped.length) console.warn(`inbound missing cid=${id} dropped: ${dropped.slice(0, 40).join(",")}`);
  if (failed.length) console.warn(`inbound missing cid=${id} failed: ${failed.slice(0, 40).join(",")}`);
  if (pulled.length) console.warn(`inbound missing cid=${id} seated ${pulled.length} of ${want.length}`);
  return { ok: true as const, count: pulled.length, dropped, failed };
  } finally {
    if (!held) unlockStudentAlfa(id);
  }
}

/** Дырки пачками, пока садятся или список пуст. +0 при живых id — стоп, не крутить вхолостую. */
export async function inboundMissingUntilSeated(
  branchId: number,
  customerId: number,
  ids: number[],
  opts?: { take?: number; rounds?: number; resetAt?: string },
) {
  const take = Math.max(1, Number(opts?.take) || 50);
  const rounds = Math.max(1, Number(opts?.rounds) || 20);
  let missing = uniquePositiveIds(ids);
  let count = 0;
  const dropped: number[] = [];
  for (let n = 0; n < rounds && missing.length; n += 1) {
    if (opts?.resetAt != null && String(customerSyncOf(customerId).lessonsResetAt || "") !== String(opts.resetAt)) {
      return { count, dropped: uniquePositiveIds(dropped), missing, skipped: "reset" as const };
    }
    const beforeN = missing.length;
    const gap = await inboundMissingCustomerLessons(branchId, customerId, missing, { force: true, take });
    count += Number(gap.count) || 0;
    if (Array.isArray(gap.dropped)) dropped.push(...gap.dropped);
    const have = new Set((loadCustomerCalendar(customerId) || []).map((l) => Number(l.lessonId) || 0).filter((x) => x > 0));
    const dropSet = new Set(uniquePositiveIds(gap.dropped || []));
    missing = missing.filter((id) => !have.has(id) && !dropSet.has(id));
    if (missing.length >= beforeN) break;
  }
  return { count, dropped: uniquePositiveIds(dropped), missing };
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
      const holeN = (res.hole || []).length;
      const weakSet = new Set(card.journalFill?.weak || []);
      if (ok && !res.capped && !holeN) {
        pulled[period.key] = at;
        if (!doneKeys.includes(period.key)) doneKeys.push(period.key);
        delete fail[period.key];
        weakSet.delete(period.key);
      } else if (ok) {
        pulled[period.key] = at;
        fail[period.key] = String(res.extra || "дырка");
        weakSet.add(period.key);
      } else {
        fail[period.key] = String(res.extra || "Alfa не ответила");
        weakSet.add(period.key);
      }
      saveGroupCard({
        ...card,
        journalFill: {
          done: [...new Set([...doneKeys, ...Object.keys(pulled)])],
          fail,
          pulled,
          weak: [...weakSet],
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
    if (skipHoleInbound(cid)) continue;
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
