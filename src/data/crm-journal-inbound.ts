import { loadGroupCard, saveGroupCard, saveGroupCards, mergeLocalCalendar } from "./group-cards";
import { rememberLessons } from "./crm-lessons";
import { pendingExportIds } from "./crm-export-queue";
import { alfaLinkedNow } from "./crm-alfa-link";
import { stampJournalCursor } from "./crm-cache-policy";
import { journalFingerprint } from "./crm-inbound-core";
import type { GroupCalLesson, CrmSlot } from "./crm-slots-core";

function hm(raw?: string) {
  const m = String(raw || "").match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

function ruShift(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
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
    details?: { is_attend?: number | null }[];
    customer_ids?: number[];
    group_ids?: number[];
  },
  ctx: { groupName: string; from: string; to: string; teacher: string; subject: string },
): GroupCalLesson | null {
  const date = String(item.date || item.time_from || "").slice(0, 10);
  if (!date) return null;
  const from = hm(item.time_from) || ctx.from;
  const to = hm(item.time_to) || ctx.to;
  const ids = (item.customer_ids || []).map(Number).filter((n) => n > 0);
  const fromDetails = (item.details || []).filter((d) => d.is_attend === 1).length;
  const total = (item.details || []).length || ids.length;
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
    customerIds: ids,
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
  const dateFrom = opts?.dateFrom || ruShift(-45);
  const dateTo = opts?.dateTo || ruShift(21);
  const packs = await Promise.all(
    [1, 2, 3].map((status) =>
      request<{ items?: Parameters<typeof packLight>[0][] }>(
        `/v2api/${branch}/lesson/index`,
        { page: 0, pageSize: 50, status, group_id: gid, date_from: dateFrom, date_to: dateTo },
        t,
      ).catch(() => ({ items: [] as Parameters<typeof packLight>[0][] })),
    ),
  );
  const byKey = new Map<string, GroupCalLesson>();
  for (const les of packs) {
    for (const item of les.items || []) {
      const packed = packLight(item, ctx);
      if (!packed) continue;
      byKey.set(`${packed.lessonId || 0}|${packed.date}|${packed.from}`, packed);
    }
  }
  const pulled = [...byKey.values()];
  const hold = opts?.hold || pendingExportIds(["lesson.update", "lesson.create"]);
  const calendar = mergeLocalCalendar(pulled, cached?.calendar, hold, "union");
  if (cached && journalFingerprint(calendar) === journalFingerprint(cached.calendar || [])) {
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
  }
  return { ok: true as const, extra: `журнал ${gid}: ${calendar.length}`, count: calendar.length, calendar, card };
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
  const dateFrom = ruShift(-45);
  const dateTo = ruShift(21);
  const results = await Promise.all(
    slice.map((g) => inboundJournalGroup(g.branchId, g.groupId, { token: t, slots, hold, dateFrom, dateTo, defer: true })),
  );
  const cards = results.flatMap((r) => (r.card ? [r.card] : []));
  if (cards.length) {
    saveGroupCards(cards);
    rememberLessons(cards.flatMap((c) => c.calendar || []));
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
