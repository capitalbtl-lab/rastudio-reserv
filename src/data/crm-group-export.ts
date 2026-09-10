import { request, token } from "./alfacrm";
import { beatsOf, isoDateOrEmpty, type CrmSlot } from "./crm-slots-core";
import { loadGroupCard } from "./group-cards";
import { loadTeachers } from "./crm-teachers";
import { teacherIdSet, beatTeacherIds, ownerTeacherIdsOf, hydrateGroupTeachers } from "./crm-group-teachers-core";
import {
  inspectGroupExport,
  exportIssueSummary,
  type AlfaRegularSnap,
  type ExportIssue,
} from "./crm-group-export-core";

function hm(raw?: string) {
  const m = String(raw || "").match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

function hasOverrides(it: Record<string, unknown>) {
  const list = (Array.isArray(it.customers) ? it.customers : Array.isArray(it.streaming) ? it.streaming : []) as Record<string, unknown>[];
  return list.some((row) => row && (row.time_from_v || row.teacher_ids || row.day));
}

async function pageRegulars(branch: number, t: string, gid: number) {
  const items: Record<string, unknown>[] = [];
  let filtered = true;
  for (let page = 0; page < 30; page++) {
    const res = await request<{ items?: Record<string, unknown>[]; total?: number }>(
      `/v2api/${branch}/regular-lesson/index`,
      filtered
        ? { page, pageSize: 50, group_id: gid, related_id: gid }
        : { page, pageSize: 100 },
      t,
    );
    const batch = res.items || [];
    const mine = batch.filter((it) => Number(it.related_id) === gid);
    if (filtered && page === 0 && batch.length && !mine.length) {
      filtered = false;
      page = -1;
      items.length = 0;
      continue;
    }
    items.push(...mine);
    if (!batch.length || batch.length < (filtered ? 50 : 100)) break;
    const total = Number(res.total || 0);
    if (filtered && total && items.length >= total) break;
    if (filtered && page >= 7) break;
  }
  return items;
}

export async function inspectSlotExport(slot: CrmSlot): Promise<{
  issues: ExportIssue[];
  allowFull: boolean;
  allowGroup: boolean;
  suggestOwner: boolean;
  summary: string;
  ownerTeacherIds: number[];
  beatTeacherIds: number[];
}> {
  const s = hydrateGroupTeachers(slot);
  const gid = Number(s.groupId) || 0;
  const branch = Number(s.branchId) || 0;
  const card = gid ? loadGroupCard(branch, gid) : null;
  const beats = beatsOf(s).map((b) => ({
    ...b,
    teacherIds: beatTeacherIds(b, s),
  }));
  const roster = loadTeachers();
  const branchTeacherIds = roster.filter((t) => (t.branchIds || []).includes(branch)).map((t) => t.id);
  if (!gid) {
    const empty = inspectGroupExport({
      beats,
      ownerTeacherIds: ownerTeacherIdsOf(s),
      groupFrom: s.bDate,
      groupTo: s.eDate,
      calendar: [],
      alfaRegulars: [],
      alfaOwnerIds: [],
      branchTeacherIds,
    });
    return { ...empty, summary: exportIssueSummary(empty.issues), ownerTeacherIds: ownerTeacherIdsOf(s), beatTeacherIds: beatTeacherIds(beats[0], s) };
  }
  let indexFailed = false;
  let alfaRegulars: AlfaRegularSnap[] = [];
  let alfaOwnerIds: number[] = [];
  let calendar = (card?.calendar || [])
    .map((c) => ({ date: isoDateOrEmpty(c.date) || c.date, from: c.from }))
    .filter((c) => c.date);
  try {
    const t = await token();
    const branches = [...new Set([branch, ...((s as { branchIds?: number[] }).branchIds || [])])].filter(Boolean);
    const seen = new Set<number>();
    for (const bid of branches) {
      const items = await pageRegulars(bid, t, gid);
      for (const it of items) {
        if (Number(it.related_id) !== gid) continue;
        const id = Number(it.id) || 0;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        alfaRegulars.push({
          id,
          day: Number(it.day) || 0,
          timeFrom: hm(String(it.time_from_v || it.time_from || "")),
          timeTo: hm(String(it.time_to_v || it.time_to || "")),
          bDate: String(it.b_date || ""),
          eDate: String(it.e_date || ""),
          teacherIds: teacherIdSet(it.teacher_ids),
          disabled: Number(it.disabled || it.is_disabled || 0) === 1,
          hasCustomerOverrides: hasOverrides(it),
          branchId: bid,
        });
      }
    }
    const g = await request<{ items?: { id?: number; teacher_ids?: unknown }[] }>(
      `/v2api/${branch}/group/index`,
      { id: gid, page: 0, pageSize: 1 },
      t,
    ).catch(() => ({ items: [] as { id?: number; teacher_ids?: unknown }[] }));
    const hit = (g.items || []).find((x) => Number(x.id) === gid);
    alfaOwnerIds = teacherIdSet(hit?.teacher_ids);
    if (!calendar.length) {
      for (const status of [3, 2, 1]) {
        const pack = await request<{ items?: Record<string, unknown>[] }>(
          `/v2api/${branch}/lesson/index`,
          { page: 0, pageSize: 20, group_id: gid, status },
          t,
        ).catch(() => ({ items: [] as Record<string, unknown>[] }));
        for (const it of pack.items || []) {
          const date = isoDateOrEmpty(String(it.date || it.lesson_date || ""));
          if (date) calendar.push({ date, from: hm(String(it.time_from || it.time_from_v || "")) });
        }
        if (calendar.length) break;
      }
    }
  } catch {
    indexFailed = true;
  }
  const got = inspectGroupExport({
    beats,
    ownerTeacherIds: ownerTeacherIdsOf(s),
    groupFrom: s.bDate,
    groupTo: s.eDate,
    calendar,
    alfaRegulars: indexFailed ? null : alfaRegulars,
    alfaOwnerIds,
    branchTeacherIds: branchTeacherIds.length ? branchTeacherIds : undefined,
    indexFailed,
  });
  return {
    ...got,
    summary: exportIssueSummary(got.issues),
    ownerTeacherIds: ownerTeacherIdsOf(s),
    beatTeacherIds: beatTeacherIds(beats[0], s),
  };
}
