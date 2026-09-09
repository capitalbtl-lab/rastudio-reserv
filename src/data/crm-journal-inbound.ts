import { loadGroupCard, saveGroupCard, saveGroupCards, mergeLocalCalendar, fanOutLessonWriteoffs, loadCustomerCalendar, replaceCustomerCalendar } from "./group-cards";
import { rememberLessons } from "./crm-lessons";
import { pendingExportIds } from "./crm-export-queue";
import { alfaLinkedNow } from "./crm-alfa-link";
import { stampJournalCursor, stampLessonsCursor } from "./crm-cache-policy";
import { journalFingerprint } from "./crm-inbound-core";
import type { GroupCalLesson, CrmSlot } from "./crm-slots-core";
import { pupilNameOk, mergeLessonPupils, lessonRosterThin } from "./crm-slots-core";
import { findDossier } from "./dossiers";
import { cardPays } from "./crm-pay";
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
  markLessonFillBusy,
  LESSON_STATUSES,
  LESSON_INBOUND_RUN,
  LESSON_RECENT_DAYS,
  customerLessonsNeedAttend,
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
  const s = String(raw || "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (ru) return `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}`;
  return s.slice(0, 10);
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
  opts?: { token?: string; slots?: CrmSlot[]; hold?: Set<number>; dateFrom?: string; dateTo?: string; defer?: boolean; deep?: boolean },
) {
  if (!alfaLinkedNow() || !gid) return { ok: true as const, extra: "без Alfa", count: 0, calendar: [] as GroupCalLesson[] };
  const slots = opts?.slots || (await import("./alfacrm-schedule")).listAdminSlots();
  const slot = slots.find((s) => s.groupId === gid && s.branchId === branch) || slots.find((s) => s.groupId === gid);
  const cached = loadGroupCard(branch, gid);
  const { token, request } = await import("./alfacrm");
  const t = opts?.token || (await token());
  const ctx = {
    groupName: String(cached?.name || slot?.groupName || `группа ${gid}`),
    from: String(slot?.timeFrom || ""),
    to: String(slot?.timeTo || ""),
    teacher: String(slot?.teacher || ""),
    subject: String(cached?.subject || slot?.subject || ""),
  };
  const dateFrom = opts?.dateFrom || ruShift(-2600);
  const dateTo = opts?.dateTo || ruShift(90);
  const byKey = new Map<string, GroupCalLesson>();
  async function pull(status: number, date_from: string, date_to: string, pages: number, pageSize: number) {
    for (let page = 0; page < pages; page++) {
      const les = await request<{ items?: Parameters<typeof packLight>[0][] }>(
        `/v2api/${branch}/lesson/index`,
        { page, pageSize, status, group_id: gid, date_from, date_to, removed: 0 },
        t,
      ).catch(() => ({ items: [] as Parameters<typeof packLight>[0][] }));
      const chunk = les.items || [];
      for (const item of chunk) {
        const gids = (item.group_ids || []).map(Number).filter((n) => n > 0);
        if (gids.length && !gids.includes(gid)) continue;
        if (!gids.length && Number(item.lesson_type_id || 0) === 2) continue;
        const packed = packLight(item, ctx);
        if (!packed) continue;
        byKey.set(`${packed.lessonId || 0}|${packed.date}|${packed.from}`, withPupilNames(packed));
      }
      if (chunk.length < pageSize) break;
    }
  }
  await Promise.all([
    pull(1, dateFrom, dateTo, 8, 100),
    pull(2, dateFrom, dateTo, 4, 100),
    pull(3, dateFrom, dateTo, 10, 100),
  ]);
  const pulled = [...byKey.values()];
  const hold = opts?.hold || pendingExportIds(["lesson.update", "lesson.create"]);
  const calendar = mergeLocalCalendar(pulled, cached?.calendar, hold, "union");
  const samePrint = cached && journalFingerprint(calendar) === journalFingerprint(cached.calendar || []);
  const sameMoney = cached && lessonPupilsKey(calendar) === lessonPupilsKey(cached.calendar || []);
  if (samePrint && sameMoney) {
    if (opts?.deep) {
      const enriched = await enrichCalendarDetails(branch, calendar, { token: t, take: 16 });
      if (enriched.changed) {
        const card0 = { ...(cached || { id: gid, branchId: branch, name: ctx.groupName, calendar: [] as GroupCalLesson[], at: "", subject: ctx.subject, subjectId: Number(slot?.subjectId || 0) }), calendar: enriched.calendar };
        if (!opts?.defer) {
          saveGroupCard(card0);
          rememberLessons(enriched.calendar);
          fanOutLessonWriteoffs(enriched.calendar);
        }
        return { ok: true as const, extra: `журнал ${gid}: ${enriched.calendar.length}, детали ${enriched.filled}`, count: enriched.calendar.length, calendar: enriched.calendar, card: card0 };
      }
    }
    return { ok: true as const, extra: `журнал ${gid}: без изменений`, count: calendar.length, calendar };
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
  };
  if (!opts?.defer) {
    saveGroupCard(card);
    rememberLessons(calendar);
    fanOutLessonWriteoffs(calendar);
  }
  if (opts?.deep && calendar.length) {
    const enriched = await enrichCalendarDetails(branch, calendar, { token: t, take: 16 });
    if (enriched.changed) {
      card.calendar = enriched.calendar;
      if (!opts?.defer) {
        saveGroupCard(card);
        rememberLessons(enriched.calendar);
        fanOutLessonWriteoffs(enriched.calendar);
      }
      return { ok: true as const, extra: `журнал ${gid}: ${enriched.calendar.length}, детали ${enriched.filled}`, count: enriched.calendar.length, calendar: enriched.calendar, card };
    }
  }
  return { ok: true as const, extra: `журнал ${gid}: ${calendar.length}`, count: calendar.length, calendar, card };
}

function isOneOffLesson(item: { lesson_type_id?: number; group_ids?: number[] }) {
  const typeId = Number(item.lesson_type_id || 0);
  const groups = (item.group_ids || []).map(Number).filter((n) => n > 0);
  if (typeId === 3 || typeId === 1 || typeId === 4 || typeId === 5 || typeId === 10 || typeId === 11) return true;
  return groups.length === 0 && typeId !== 2;
}

function lessonNeedsDetails(l: GroupCalLesson) {
  if (!(Number(l.lessonId) > 0)) return false;
  if (Number(l.status) === 3 && lessonRosterThin(l)) return true;
  if (Number(l.status) === 3 && !String(l.topic || l.homework || l.note || "").trim()) return true;
  return false;
}

/** Тема, ДЗ, комментарий и явка с суммами — lesson/index по id, не весь журнал. */
export async function enrichCalendarDetails(
  branch: number,
  calendar: GroupCalLesson[],
  opts?: { token?: string; take?: number; customerId?: number },
) {
  const list = (calendar || []).slice();
  const need = list.filter(lessonNeedsDetails).slice(0, Math.max(1, Math.min(24, Number(opts?.take) || 12)));
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

export async function inboundCustomerLessons(branch: number, customerId: number, opts?: { full?: boolean; continueLater?: boolean; take?: number; deep?: number; force?: boolean }) {
  const id = Number(customerId) || 0;
  if (!alfaLinkedNow() || id <= 0) return { ok: true as const, count: 0, done: true };
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
  const wantFull = Boolean(opts?.full) || !customerSyncOf(id).lessonsFull || customerLessonsNeedAttend(id);
  if (!wantFull && customerLessonsFresh(id)) return { ok: true as const, count: 0, skipped: "fresh" as const, done: true };
  markLessonFillBusy(id, true);
  try {
    const { token, request } = await import("./alfacrm");
    const { listAdminSlots } = await import("./alfacrm-schedule");
    const t = await token();
    const dateFrom = ruShift(-2600);
    const dateTo = ruShift(90);
    const slots = listAdminSlots();
    const branches = wantFull ? uniqueBranches(branch) : [Number(branch) || 1];
    const prevCal = loadCustomerCalendar(id);
    const prevMap = new Map(prevCal.map((l) => [String(l.lessonId || `${l.date}|${l.from}`), l] as const));
    const packs: { items?: Parameters<typeof packLight>[0][] }[] = [];
    let cur = wantFull ? lessonFillOf(customerSyncOf(id).lessonFill) || lessonFillStart(branches[0] || branch) : lessonFillStart(branches[0] || branch);
    let ran = 0;
    const maxRun = Number(opts?.take) > 0 ? Math.min(LESSON_INBOUND_RUN, Number(opts.take)) : wantFull ? LESSON_INBOUND_RUN : LESSON_STATUSES.length;
    const maxPages = wantFull ? 12 : 2;
    const from = wantFull ? dateFrom : ruShift(LESSON_RECENT_DAYS);
    while (ran < maxRun && !cur.done) {
      const bid = cur.bid;
      const status = LESSON_STATUSES[cur.statusIdx] || 1;
      if (!branches.includes(bid)) {
        cur = lessonFillAdvance(cur, true, branches);
        continue;
      }
      let progressed = false;
      for (let page = cur.page; page < maxPages; page += 1) {
        const les = await request<{ items?: Parameters<typeof packLight>[0][] }>(
          `/v2api/${bid}/lesson/index`,
          { page, pageSize: 100, status, customer_id: id, date_from: from, date_to: dateTo },
          t,
        ).catch(() => ({ items: [] as Parameters<typeof packLight>[0][] }));
        const chunk = les.items || [];
        if (chunk.length) packs.push(les);
        ran += 1;
        progressed = true;
        const lastShort = chunk.length < 100;
        cur = lastShort ? lessonFillAdvance({ ...cur, page }, true, branches) : { bid, statusIdx: cur.statusIdx, page: page + 1 };
        if (ran >= maxRun || cur.done || lastShort) break;
      }
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
    const next = mergeLocalCalendar(pulled, prevCal, hold, "union");
    replaceCustomerCalendar(id, next);
    const done = Boolean(cur.done) || !wantFull;
    stampCustomerSync(id, {
      lessonsAt: new Date().toISOString(),
      lessonsFull: customerSyncOf(id).lessonsFull || done,
      lessonsAttend: customerSyncOf(id).lessonsAttend || done,
      lessonFill: done ? undefined : cur,
    });
    if (wantFull && !done && opts?.continueLater !== false) {
      setTimeout(() => {
        void inboundCustomerLessons(branch, id).catch(() => null);
      }, 700);
    }
    return { ok: true as const, count: pulled.length, done };
  } finally {
    markLessonFillBusy(id, false);
  }
}


export async function inboundJournalChunk(offset = 0, take = 2) {
  if (!alfaLinkedNow()) {
    return { ok: true as const, done: true, next: 0, total: 0, extra: "без Alfa", ids: [] as number[], live: 0, fromCache: true };
  }
  const { overlayAdminGroups } = await import("./dossiers");
  const { listAdminSlots } = await import("./alfacrm-schedule");
  const { token } = await import("./alfacrm");
  const groups = overlayAdminGroups();
  const total = groups.length;
  const size = Math.max(1, Math.min(2, Number(take) || 2));
  const from = Math.max(0, Number(offset) || 0);
  const slice = groups.slice(from, from + size);
  const slots = listAdminSlots();
  const hold = pendingExportIds(["lesson.update", "lesson.create"]);
  const t = await token();
  const results = await Promise.all(
    slice.map((g) => inboundJournalGroup(g.branchId, g.groupId, { token: t, slots, hold, defer: true })),
  );
  const cards = results.flatMap((r) => (r.card ? [r.card] : []));
  if (cards.length) {
    saveGroupCards(cards);
    rememberLessons(cards.flatMap((c) => c.calendar || []));
    fanOutLessonWriteoffs(cards.flatMap((c) => c.calendar || []));
  }
  const n = results.reduce((s, r) => s + r.count, 0);
  const next = from + slice.length;
  const done = next >= total || !slice.length;
  stampJournalCursor(done ? total : next, total);
  return {
    ok: true as const,
    done,
    next: done ? total : next,
    total,
    extra: `журнал ${from + 1}–${Math.min(next, total)}/${total}`,
    ids: [] as number[],
    live: n,
    scanned: slice.length,
  };
}

/** Очередь: полная явка по текущим и архиву. Лидов не гоняем. */
export async function inboundCustomerLessonsChunk(offset = 0, take = 2) {
  if (!alfaLinkedNow()) {
    return { ok: true as const, done: true, next: 0, total: 0, extra: "без Alfa", ids: [] as number[], live: 0 };
  }
  const { allDossierCrmIds } = await import("./dossiers");
  const ranked = allDossierCrmIds()
    .map((cid) => {
      const d = findDossier({ crmId: cid });
      const study = Number(d?.extras?.is_study);
      return { cid, study: Number.isFinite(study) ? study : -1 };
    })
    .filter((x) => x.study !== 0)
    .sort((a, b) => {
      const ra = a.study === 1 ? 0 : a.study === 2 ? 1 : 2;
      const rb = b.study === 1 ? 0 : b.study === 2 ? 1 : 2;
      return ra - rb || a.cid - b.cid;
    });
  const ids = ranked.map((x) => x.cid);
  const total = ids.length;
  const size = Math.max(1, Math.min(3, Number(take) || 2));
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
