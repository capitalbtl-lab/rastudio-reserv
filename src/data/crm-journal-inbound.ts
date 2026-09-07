import { loadGroupCard, saveGroupCard, saveGroupCards, mergeLocalCalendar, fanOutLessonWriteoffs, loadCustomerCalendar, replaceCustomerCalendar } from "./group-cards";
import { rememberLessons } from "./crm-lessons";
import { pendingExportIds } from "./crm-export-queue";
import { alfaLinkedNow } from "./crm-alfa-link";
import { stampJournalCursor } from "./crm-cache-policy";
import { journalFingerprint } from "./crm-inbound-core";
import type { GroupCalLesson, CrmSlot } from "./crm-slots-core";
import {
  lessonWriteoffAmount,
  lessonWriteoffCtt,
  lessonCustomerIds,
  uniqueBranches,
  packLessonPupils,
  chargeFromPupils,
  lessonPupilsKey,
} from "./crm-ledger-core";

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

export async function inboundJournalGroup(
  branch: number,
  gid: number,
  opts?: { token?: string; slots?: CrmSlot[]; hold?: Set<number>; dateFrom?: string; dateTo?: string; defer?: boolean },
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
  const dateFrom = opts?.dateFrom || ruShift(-90);
  const dateTo = opts?.dateTo || ruShift(21);
  const doneFrom = opts?.dateFrom || ruShift(-800);
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
        byKey.set(`${packed.lessonId || 0}|${packed.date}|${packed.from}`, packed);
      }
      if (chunk.length < pageSize) break;
    }
  }
  await pull(1, dateFrom, dateTo, 2, 50);
  await pull(2, dateFrom, dateTo, 2, 50);
  await pull(3, doneFrom, dateTo, 6, 100);
  const pulled = [...byKey.values()];
  const hold = opts?.hold || pendingExportIds(["lesson.update", "lesson.create"]);
  const calendar = mergeLocalCalendar(pulled, cached?.calendar, hold, "union");
  const samePrint = cached && journalFingerprint(calendar) === journalFingerprint(cached.calendar || []);
  const sameMoney = cached && lessonPupilsKey(calendar) === lessonPupilsKey(cached.calendar || []);
  if (samePrint && sameMoney) {
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
  return { ok: true as const, extra: `журнал ${gid}: ${calendar.length}`, count: calendar.length, calendar, card };
}

function isOneOffLesson(item: { lesson_type_id?: number; group_ids?: number[] }) {
  const typeId = Number(item.lesson_type_id || 0);
  const groups = (item.group_ids || []).map(Number).filter((n) => n > 0);
  if (typeId === 3 || typeId === 1 || typeId === 4 || typeId === 5 || typeId === 10 || typeId === 11) return true;
  return groups.length === 0 && typeId !== 2;
}

export async function inboundCustomerLessons(branch: number, customerId: number) {
  const id = Number(customerId) || 0;
  if (!alfaLinkedNow() || id <= 0) return { ok: true as const, count: 0 };
  const { token, request } = await import("./alfacrm");
  const { replaceCustomerCalendar, loadCustomerCalendar } = await import("./group-cards");
  const { listAdminSlots } = await import("./alfacrm-schedule");
  const t = await token();
  const dateFrom = ruShift(-2200);
  const dateTo = ruShift(90);
  const slots = listAdminSlots();
  const packs: { items?: Parameters<typeof packLight>[0][] }[] = [];
  for (const bid of uniqueBranches(branch)) {
    for (const status of [1, 2, 3]) {
      for (let page = 0; page < 8; page++) {
        const les = await request<{ items?: Parameters<typeof packLight>[0][] }>(
          `/v2api/${bid}/lesson/index`,
          { page, pageSize: 100, status, customer_id: id, date_from: dateFrom, date_to: dateTo },
          t,
        ).catch(() => ({ items: [] as Parameters<typeof packLight>[0][] }));
        const chunk = les.items || [];
        if (chunk.length) packs.push(les);
        if (chunk.length < 100) break;
      }
    }
  }
  const pulled: GroupCalLesson[] = [];
  for (const les of packs) {
    for (const item of les.items || []) {
      const rec = item as Record<string, unknown>;
      const ids = lessonCustomerIds(rec);
      if (ids.length && !ids.includes(id)) continue;
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
      pulled.push(packed);
    }
  }
  const local = loadCustomerCalendar(id).filter((l) => Number(l.lessonId || 0) < 0);
  const seen = new Set<string>();
  const next = [...local, ...pulled].filter((l) => {
    const key = String(l.lessonId || `${l.date}|${l.from}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  replaceCustomerCalendar(id, next);
  return { ok: true as const, count: pulled.length };
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
