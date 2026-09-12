/** История карточки группы: только диск, Alfa не трогает. */

import { loadGroupCard } from "./group-cards";
import { dossiersInGroup } from "./dossiers";
import { listAdminSlots } from "./alfacrm-schedule";
import { beatsOf } from "./crm-slots-core";
import { displayPersonName } from "./client-display";
import { personRole } from "./crm-person-role";
import {
  buildGroupHistory,
  historyKindCounts,
  type GroupHistoryMember,
} from "./crm-group-history-core";

export type { GroupHistoryEvent, GroupHistoryKind } from "./crm-group-history-core";
export { filterGroupHistory, historyKindCounts, ruHistoryWhen } from "./crm-group-history-core";

function membersOfGroup(branchId: number, groupId: number): GroupHistoryMember[] {
  const out: GroupHistoryMember[] = [];
  const seen = new Set<number>();
  for (const d of dossiersInGroup(branchId, groupId)) {
    const customerId = Number(d.crmId) || 0;
    if (!customerId || seen.has(customerId)) continue;
    seen.add(customerId);
    const hit = (d.groupLinks || []).find((g) => Number(g.id) === groupId);
    const role = personRole({
      is_study: d.extras?.is_study,
      removed: d.extras?.removed,
      lead_status_id: d.extras?.lead_status_id,
      crm_funnel: d.extras?.crm_funnel,
      status: d.status,
    });
    const archived = hit?.active === false || role === "архив" || role === "удалён";
    out.push({
      customerId,
      name: displayPersonName(d.child?.fio, d.parent?.fio),
      active: !archived,
      role: archived ? "архив" : role === "лид" ? "лид" : "учится",
    });
  }
  return out;
}

export function loadGroupHistory(branchId: number, groupId: number) {
  const bid = Number(branchId) || 1;
  const gid = Number(groupId) || 0;
  const card = gid ? loadGroupCard(bid, gid) : null;
  const slot =
    listAdminSlots().find((s) => s.groupId === gid && s.branchId === bid) ||
    listAdminSlots().find((s) => s.groupId === gid);
  const calendar = (card?.calendar || []).map((l) => ({
    date: l.date,
    from: l.from,
    to: l.to,
    status: l.status,
    lessonId: l.lessonId,
    type: l.type,
    teacher: l.teacher,
    room: l.room,
    topic: l.topic,
    homework: l.homework,
    note: l.note,
  }));
  const events = buildGroupHistory({
    branchId: bid,
    groupId: gid,
    name: card?.name || slot?.groupName,
    statusId: Number(card?.statusId || slot?.statusId || 0) || undefined,
    bDate: card?.bDate || slot?.bDate,
    eDate: card?.eDate || slot?.eDate,
    subject: card?.subject || slot?.subject,
    subjectId: Number(card?.subjectId || slot?.subjectId || 0) || undefined,
    teacher: slot?.teacher,
    room: undefined,
    priority: slot?.priority,
    age: slot?.age,
    at: card?.at,
    journalAt: card?.journalAt,
    journalFill: card?.journalFill,
    journalLife: card?.journalLife,
    beats: slot ? beatsOf(slot).map((b) => ({ day: b.day, timeFrom: b.timeFrom, timeTo: b.timeTo, teacher: b.teacher })) : [],
    calendar,
    members: gid ? membersOfGroup(bid, gid) : [],
  });
  const dates = events.map((e) => e.at).filter(Boolean).sort();
  return {
    branchId: bid,
    groupId: gid,
    name: card?.name || slot?.groupName || `группа ${gid}`,
    events,
    counts: historyKindCounts(events),
    from: dates[0] || "",
    to: dates[dates.length - 1] || "",
    at: card?.at || "",
  };
}

export type GroupHistoryPack = ReturnType<typeof loadGroupHistory>;
