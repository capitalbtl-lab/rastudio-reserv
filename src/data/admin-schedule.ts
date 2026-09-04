import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { logAdmin } from "./admin-settings";
import { loadScheduleSettings, saveScheduleSettings, markLastPull } from "./schedule-settings";
import {
  crmScheduleMeta,
  listAdminSlots,
  refreshCrmSchedule,
  saveAdminSlots,
  sessionsFromCrm,
  bindSubjectsOnSite,
  resetSlotCache,
} from "./alfacrm-schedule";
import {
  aiScheduleParse,
  applyChanges,
  buildSlot,
  loadVersions,
  parseSlotsCsv,
  pushSlotsToCrm,
  pushVersion,
  slotsToCsv,
  slotsToXls,
  versionSlots,
  defaultPeriod,
  type CrmSlot,
  type SlotDraft,
} from "./crm-slots";
import { loadSubjects, saveSubjects, pullSubjectsFromCrm, pushSubjectsToCrm, ensureCrmSubject } from "./crm-subjects";
import type { GroupCalLesson } from "./crm-slots-core";
import { beatsOf } from "./crm-slots-core";
import { rememberLessons } from "./crm-lessons";
import { loadGroupCard, saveGroupCard } from "./group-cards";
import { scheduleVoiceTurn } from "./schedule-voice";
import { loadSiteTree, addTreeSchool, addTreeCourse, deleteTreeCourse, deleteTreeSchool, moveSlotsToCourse, pinAllGuesses, saveSiteTree, slotTreeKey } from "./site-tree";
import { listTeachers, teachersAtBranch } from "./crm-teachers";
import { searchClientViews, findDossier, upsertDossier, applyCrmCustomer } from "./dossiers";
import { isPhoneLike } from "./client-display";
import { clientCardId, CRM_BRANCH } from "./ids";
import { loadTariffs, pullTariffsFromCrm, matchTariffs, groupTariffPack, subjectTariffStats, saveTariffEdits, pushTariffsToCrm, archiveTariffsInCrm, aiTariffsParse, applyTariffChanges, probeCreateTariff, probeDeleteTariff, subjectsWithHref, tariffGroupHits } from "./crm-tariffs";
import { loadScheduleMap, saveScheduleMap } from "./schedule-map";
import { packSubjectRows, bindSubjectCourse } from "./subject-admin";
import { isAdminGroup, readPriority } from "./group-status";

function isoish(raw: string) {
  const s = String(raw || "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (ru) return `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}`;
  return s;
}

export type GroupMember = {
  id: number;
  name: string;
  parent: string;
  dob: string;
  age: string;
  phone: string;
  phones: string[];
  email: string;
  gender: string;
  from: string;
  to: string;
  archived: boolean;
  status: string;
};

export type CustomerComm = {
  id: number;
  at: string;
  who: string;
  channel: string;
  text: string;
  incoming: boolean;
};

export type CustomerCard = {
  id: number;
  cardId?: string;
  branchId: number;
  name: string;
  parent: string;
  dob: string;
  age: string;
  gender: string;
  phones: string[];
  emails: string[];
  address: string;
  status: string;
  isStudy?: number;
  leadStatusId?: number;
  studyStatus?: string;
  studyStatusId?: number;
  note: string;
  paidTill: string;
  teacher?: string;
  balance?: number;
  lessonsLeft?: number;
  url: string;
  schools: string[];
  groups: { id: number; name: string; branchId: number; school: string; active: boolean; subjectId?: number; courseId?: string }[];
  regular?: {
    groupId: number;
    groupName: string;
    day: string;
    from: string;
    to: string;
    teacher: string;
    subject: string;
    branch: string;
    room?: string;
    lessonId?: number;
    subjectId?: number;
    teacherId?: number;
    roomId?: number;
  }[];
  calendar?: { id: number; date: string; from: string; to: string; type: string; typeId: number; group: string; teacher: string; status?: number; subject?: string; room?: string }[];
  tariffs?: { id: number; name: string; rest: number; lessons: number; archived?: boolean }[];
  comms: CustomerComm[];
  catalog?: { subjects: { id: number; name: string }[]; teachers: { id: number; name: string }[]; rooms: { id: number; name: string }[]; tariffs?: { id: number; name: string; price: number; lessons: number; subjectIds?: number[]; lessonTypeIds?: number[]; periodCount?: number; periodType?: number; periodLabel?: string; eDate?: string; calculationType?: number }[]; groups?: { id: number; name: string; branchId: number; subjectId?: number; teacher?: string; day?: string; from?: string; to?: string }[] };
};

function asStrList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x || "").trim()).filter(Boolean);
  if (v == null || v === "") return [];
  return String(v)
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function ageLabel(dob: string) {
  const m = String(dob || "").match(/^(\d{1,2})[.](\d{1,2})[.](\d{4})$/) || String(dob || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const y = m[1].length === 4 ? Number(m[1]) : Number(m[3]);
  const mo = m[1].length === 4 ? Number(m[2]) : Number(m[2]);
  const d = m[1].length === 4 ? Number(m[3]) : Number(m[1]);
  const now = new Date();
  let years = now.getFullYear() - y;
  let months = now.getMonth() + 1 - mo;
  if (now.getDate() < d) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return "";
  return months ? `${years} лет +${months}мес` : `${years} лет`;
}

function packMember(c: Record<string, unknown>, archived: boolean): GroupMember {
  const phones = asStrList(c.phone);
  const rawName = String(c.name || "").trim();
  const rawParent = String(c.legal_name || "").trim();
  if (isPhoneLike(rawName) && rawName && !phones.includes(rawName)) phones.unshift(rawName);
  const study = Number(c.is_study);
  const arch = archived || study === 2;
  const gender = c.gender === 1 || c.gender === "1" ? "мальчик" : c.gender === 2 || c.gender === "2" ? "девочка" : "";
  const dob = String(c.dob || "");
  return {
    id: Number(c.id || 0),
    name: isPhoneLike(rawName) ? "" : rawName,
    parent: isPhoneLike(rawParent) ? "" : rawParent,
    dob,
    age: ageLabel(dob),
    phone: phones[0] || "",
    phones,
    email: asStrList(c.email)[0] || "",
    gender,
    from: String(c.b_date || ""),
    to: String(c.e_date || c.paid_till || ""),
    archived: arch,
    status: study === 1 ? "учится" : arch ? "архив" : "лид",
  };
}

function packComm(it: Record<string, unknown>): CustomerComm {
  const text = String(it.comment || it.text || it.message || it.body || "").trim();
  const incoming = Number(it.is_incoming ?? it.incoming ?? 0) === 1 || /входящ|incoming/i.test(String(it.type_name || it.direction || ""));
  return {
    id: Number(it.id || 0),
    at: String(it.date || it.created_at || it.datetime || it.added || ""),
    who: String(it.user_name || it.employee_name || it.manager_name || it.user || "").trim(),
    channel: String(it.type_name || it.channel || it.source || it.provider || "сообщение").trim(),
    text,
    incoming,
  };
}

async function loadGroupMembers(request: typeof import("./alfacrm").request, t: string, branch: number, gid: number) {
  const key = `${branch}:${gid}`;
  const bag = globalThis as { __raGMem?: Map<string, { at: number; active: GroupMember[]; archive: GroupMember[] }> };
  if (!bag.__raGMem) bag.__raGMem = new Map();
  const hit = bag.__raGMem.get(key);
  if (hit && Date.now() - hit.at < 8 * 60 * 1000) return { active: hit.active, archive: hit.archive };
  const fresh = await pullGroupMembersCrm(request, t, branch, gid);
  bag.__raGMem.set(key, { at: Date.now(), active: fresh.active, archive: fresh.archive });
  return fresh;
}

async function pullGroupMembersCrm(request: typeof import("./alfacrm").request, t: string, branch: number, gid: number) {
  const seen = new Set<number>();
  const active: GroupMember[] = [];
  const archive: GroupMember[] = [];
  async function pull(extra: Record<string, unknown>, forceArchive = false) {
    for (let page = 0; page < 3; page += 1) {
      const json = await request<{ items?: Record<string, unknown>[] }>(
        `/v2api/${branch}/customer/index`,
        { page, pageSize: 50, group_id: gid, ...extra },
        t,
      ).catch(() => ({ items: [] as Record<string, unknown>[] }));
      const items = json.items || [];
      for (const c of items) {
        const id = Number(c.id || 0);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const m = packMember(c, forceArchive);
        if (m.archived) archive.push(m);
        else active.push(m);
      }
      if (items.length < 50) break;
    }
  }
  await pull({});
  if (!active.some((m) => m.status === "лид")) await pull({ is_study: 0 });
  if (!archive.length) await pull({ is_study: 2 }, true);
  return { active, archive };
}

async function loadCustomerRaw(
  request: typeof import("./alfacrm").request,
  t: string,
  branch: number,
  customerId: number,
): Promise<{ c: Record<string, unknown>; branch: number } | null> {
  const branches = [branch, 1, 2, 3, 4].filter((b, i, a) => b > 0 && a.indexOf(b) === i);
  const bodies = [
    { page: 0, pageSize: 10, id: customerId },
    { page: 0, pageSize: 10, ids: [customerId] },
  ];
  for (const b of branches) {
    for (const body of bodies) {
      const data = await request<{ items?: Record<string, unknown>[] }>(`/v2api/${b}/customer/index`, body, t).catch(
        () => ({ items: [] as Record<string, unknown>[] }),
      );
      const hit = (data.items || []).find((x) => Number(x.id) === customerId);
      if (hit) return { c: hit, branch: b };
    }
  }
  return null;
}

async function createCustomerTariff(
  request: typeof import("./alfacrm").request,
  t: string,
  opts: {
    branch: number;
    customerId: number;
    tariffId: number;
    bDate: string;
    eDate?: string;
    groupId?: number;
    calcType?: number;
    subjectIds?: number[];
    lessonTypeIds?: number[];
    periodCount?: number;
    periodType?: number;
    note?: string;
    lessonsCount?: number;
  },
) {
  const customerId = Number(opts.customerId) || 0;
  const tariffId = Number(opts.tariffId) || 0;
  const branch = Number(opts.branch) || 1;
  if (!customerId) return { ok: false as const, error: "Нет customerId." };
  if (!tariffId) return { ok: false as const, error: "Выберите абонемент." };
  const groupId = Number(opts.groupId) || 0;
  const calcType = Number(opts.calcType) || 0;
  const subjectIds = (opts.subjectIds || []).map(Number).filter(Boolean);
  const lessonTypeIds = (opts.lessonTypeIds || []).map(Number).filter(Boolean);
  const extra: Record<string, unknown> = {};
  if (opts.eDate) extra.e_date = opts.eDate;
  if (groupId) extra.group_id = groupId;
  extra.is_separate_balance = calcType ? 1 : 0;
  extra.calculation_type = calcType ? 2 : 1;
  if (subjectIds.length) extra.subject_ids = subjectIds;
  if (lessonTypeIds.length) extra.lesson_type_ids = lessonTypeIds;
  if (opts.lessonsCount) extra.lesson_count = opts.lessonsCount;
  if (opts.note) extra.note = String(opts.note);
  const unit = Number(opts.periodType) === 2 ? "weeks" : Number(opts.periodType) === 3 ? "months" : Number(opts.periodType) === 4 ? "years" : "days";
  if (Number(opts.periodCount)) extra.unit = unit;
  const tries: Record<string, unknown>[] = [
    { customer_id: customerId, tariff_id: tariffId, b_date: opts.bDate, ...extra },
    { customer_id: customerId, tariff_id: tariffId, b_date: opts.bDate, e_date: opts.eDate || undefined, group_id: groupId || undefined },
    { related_id: customerId, related_class: "Customer", tariff_id: tariffId, b_date: opts.bDate, ...extra },
  ];
  let last = "";
  for (const body of tries) {
    try {
      const res = await request<{ success?: boolean; errors?: unknown }>(`/v2api/${branch}/customer-tariff/create`, body, t);
      if (res.success === false) {
        last = JSON.stringify(res.errors || res);
        continue;
      }
      return { ok: true as const };
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  return { ok: false as const, error: last || "AlfaCRM не приняла абонемент." };
}

const roomCache = new Map<number, { at: number; items: { id: number; name: string }[] }>();

async function roomsOfBranch(request: typeof import("./alfacrm").request, t: string, branch: number) {
  const hit = roomCache.get(branch);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.items;
  try {
    const rm = await request<{ items?: { id?: number; name?: string; note?: string }[] }>(`/v2api/${branch}/room/index`, { page: 0, pageSize: 100 }, t);
    const items: { id: number; name: string }[] = [];
    for (const x of rm.items || []) {
      const id = Number(x.id || 0);
      if (!id) continue;
      const name = String(x.name || "").trim();
      const note = String(x.note || "").split("|")[0].trim();
      items.push({ id, name: note ? `${name} · ${note}` : name || `аудитория ${id}` });
    }
    roomCache.set(branch, { at: Date.now(), items });
    return items;
  } catch {
    return hit?.items || [];
  }
}

function lessonCatalogOf(branch: number) {
  const subjects = loadSubjects().map((s) => ({ id: s.id, name: s.name }));
  const teachers = teachersAtBranch(branch, listTeachers(listAdminSlots())).map((x) => ({ id: x.id, name: x.name }));
  return { subjects, teachers };
}

function groupIdsFromCustomer(c: Record<string, unknown>) {
  const out = new Set<number>();
  if (Array.isArray(c.group_ids)) {
    for (const x of c.group_ids) {
      const n = Number(x);
      if (n) out.add(n);
    }
  }
  if (out.size) return [...out];
  if (Array.isArray(c.groups) && c.groups.length > 0 && c.groups.length <= 8) {
    for (const g of c.groups) {
      const rec = g as { id?: number; group_id?: number };
      const n = Number(rec.id || rec.group_id || 0);
      if (n) out.add(n);
    }
  }
  return [...out];
}

function packGroupLink(id: number, branchId: number, name = "", active = true): CustomerCard["groups"][number] {
  const slots = listAdminSlots();
  const slot = slots.find((s) => s.groupId === id && s.branchId === branchId) || slots.find((s) => s.groupId === id);
  return {
    id,
    name: name || slot?.groupName || `группа ${id}`,
    branchId: slot?.branchId || branchId,
    school: slot?.school || "",
    active,
    subjectId: slot?.subjectId || undefined,
    courseId: slot?.courseId,
  };
}

function catalogGroups(branch: number) {
  const seen = new Set<string>();
  const out: { id: number; name: string; branchId: number; subjectId?: number; teacher?: string; day?: string; from?: string; to?: string }[] = [];
  for (const s of listAdminSlots()) {
    if (!s.groupId || !isAdminGroup(s.statusId)) continue;
    const key = `${s.branchId}:${s.groupId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: s.groupId,
      name: s.groupName,
      branchId: s.branchId,
      subjectId: s.subjectId || undefined,
      teacher: s.teacher,
      day: s.dayLabel,
      from: s.timeFrom,
      to: s.timeTo,
    });
  }
  return out.sort((a, b) => Number(b.branchId === branch) - Number(a.branchId === branch) || a.name.localeCompare(b.name, "ru"));
}

async function loadCustomerCard(request: typeof import("./alfacrm").request, t: string, branch: number, customerId: number): Promise<CustomerCard | null> {
  const found = await loadCustomerRaw(request, t, branch, customerId);
  const dossier = findDossier({ crmId: customerId });
  if (!found && !dossier) return null;
  const c = found?.c || {};
  const useBranch = found?.branch || dossier?.branchId || branch || 1;
  if (found?.c) {
    applyCrmCustomer(found.c, useBranch);
    const studyNow = Number(found.c.is_study);
    const { rememberCustomerAsLead, forgetLead } = await import("./crm-leads");
    if (studyNow === 1 || studyNow === 2) forgetLead(customerId, useBranch);
    else rememberCustomerAsLead(found.c, useBranch);
  }
  const phones = asStrList(c.phone);
  const emails = asStrList(c.email);
  const study = Number(c.is_study);
  const addr = asStrList(c.addr).join(", ") || String(c.custom_adresprozhivaniya || "").trim();
  const comms: CustomerComm[] = [];
  const tries: [string, Record<string, unknown>][] = [
    [`/v2api/${useBranch}/communication/index?class=Customer&related_id=${customerId}`, { page: 0, pageSize: 40 }],
    [`/v2api/${useBranch}/communication/index`, { page: 0, pageSize: 40, class: "Customer", related_id: customerId }],
    [`/v2api/${useBranch}/communication/index`, { page: 0, pageSize: 40, customer_id: customerId }],
  ];
  for (const [path, body] of tries) {
    try {
      const json = await request<{ items?: Record<string, unknown>[] }>(path, body, t);
      const items = json.items || [];
      if (items.length) {
        comms.push(...items.map(packComm).filter((x) => x.text));
        break;
      }
    } catch {
      /* next shape */
    }
  }
  const rawName = String(c.name || dossier?.child.fio || "").trim();
  const rawParent = String(c.legal_name || dossier?.parent.fio || "").trim();
  const name = isPhoneLike(rawName) ? "" : rawName;
  const parent = isPhoneLike(rawParent) ? "" : rawParent;
  const dob = String(c.dob || dossier?.child.dob || "");
  const fromDossier = dossier?.groupLinks || [];
  const crmNames = new Map<number, { name: string; branchId: number }>();
  if (Array.isArray(c.groups)) {
    for (const g of c.groups) {
      const rec = g as { id?: number; name?: string; branch_id?: number; group_id?: number };
      const id = Number(rec.id || rec.group_id || 0);
      if (id) crmNames.set(id, { name: String(rec.name || ""), branchId: Number(rec.branch_id || useBranch) });
    }
  }
  const crmIds = new Set(groupIdsFromCustomer(c));
  const byId = new Map<number, CustomerCard["groups"][number]>();
  if (crmIds.size) {
    for (const id of crmIds) {
      const hit = crmNames.get(id);
      byId.set(id, packGroupLink(id, hit?.branchId || useBranch, hit?.name || "", true));
    }
    for (const g of fromDossier) {
      const cur = byId.get(g.id);
      if (cur) byId.set(g.id, { ...cur, name: cur.name || g.name, school: cur.school || g.school, courseId: cur.courseId || g.courseId, subjectId: cur.subjectId || g.subjectId });
    }
  } else {
    for (const g of fromDossier.filter((x) => x.active)) byId.set(g.id, { ...g, active: true });
  }
  const groups = [...byId.values()];
  const slots = listAdminSlots();
  const packedGroups = groups.map((g) => {
    const slot = slots.find((s) => s.groupId === g.id && s.branchId === g.branchId) || slots.find((s) => s.groupId === g.id);
    return slot
      ? { ...g, subjectId: slot.subjectId || g.subjectId, courseId: slot.courseId || g.courseId, school: slot.school || g.school, name: g.name || slot.groupName }
      : g;
  });
  const days = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const regular: NonNullable<CustomerCard["regular"]> = [];
  for (const g of packedGroups) {
    const slot = slots.find((s) => s.groupId === g.id && s.branchId === g.branchId) || slots.find((s) => s.groupId === g.id);
    if (!slot) continue;
    for (const b of beatsOf(slot)) {
      regular.push({
        groupId: g.id,
        groupName: g.name || slot.groupName,
        day: slot.dayLabel || days[Number(b.day)] || "",
        from: b.timeFrom,
        to: b.timeTo,
        teacher: slot.teacher || "",
        subject: slot.subject || "",
        branch: CRM_BRANCH[slot.branchId]?.short || "",
        lessonId: b.lessonId,
        subjectId: slot.subjectId,
        teacherId: slot.teacherId || undefined,
        roomId: slot.roomId || undefined,
      });
    }
  }
  const calendar: NonNullable<CustomerCard["calendar"]> = [];
  try {
    const json = await request<{ items?: Record<string, unknown>[] }>(
      `/v2api/${useBranch}/lesson/index`,
      { page: 0, pageSize: 80, customer_id: customerId },
      t,
    );
    for (const it of json.items || []) {
      const date = isoish(String(it.date || it.lesson_date || ""));
      if (!date || date.length < 10) continue;
      calendar.push({
        id: Number(it.id || 0),
        date,
        from: hm(String(it.time_from || "")),
        to: hm(String(it.time_to || "")),
        type: String(it.lesson_type_name || ""),
        typeId: Number(it.lesson_type_id || 0),
        group: String(it.group_name || (Array.isArray(it.group_ids) ? it.group_ids[0] : "") || ""),
        teacher: "",
        status: Number(it.status || 0),
        subject: String(it.subject_name || ""),
        room: String(it.room_name || it.room_id || ""),
      });
    }
  } catch {
    /* calendar is optional */
  }
  const tariffs: NonNullable<CustomerCard["tariffs"]> = [];
  try {
    const json = await request<{ items?: Record<string, unknown>[] }>(
      `/v2api/${useBranch}/customer-tariff/index`,
      { page: 0, pageSize: 20, customer_id: customerId },
      t,
    );
    for (const it of json.items || []) {
      tariffs.push({
        id: Number(it.id || 0),
        name: String(it.tariff_name || it.name || "абонемент"),
        rest: Number(it.balance ?? it.rest ?? it.paid ?? 0),
        lessons: Number(it.lessons_count ?? it.paid_count ?? it.lesson_count ?? 0),
        archived: Number(it.removed || it.is_archived || 0) === 1,
      });
    }
  } catch {
    /* tariffs optional */
  }
  const studyStatusId = Number(c.study_status_id || 0);
  const statusName =
    studyStatusId === 1
      ? "Обучается"
      : studyStatusId === 4
        ? "Ожидает старта"
        : studyStatusId === 8
          ? "Ждём на занятиях"
          : studyStatusId === 5
            ? "Должник"
            : studyStatusId === 2
              ? "Завершил"
              : studyStatusId === 7
                ? "Пропустил 1 занятие"
                : studyStatusId === 10
                  ? "Пропустил 2 занятия"
                  : studyStatusId === 11
                    ? "Пропустил 3 занятия"
                    : studyStatusId === 9
                      ? "Без статуса"
                      : "";
  const rooms = await roomsOfBranch(request, t, useBranch);
  const subjectIds = packedGroups.map((g) => Number(g.subjectId) || 0).filter(Boolean);
  const offerTariffs = loadTariffs()
    .items.filter((t) => !t.archive && (!t.branchIds.length || t.branchIds.includes(useBranch)))
    .sort((a, b) => {
      const am = subjectIds.length && a.subjectIds.some((id) => subjectIds.includes(id)) ? 0 : 1;
      const bm = subjectIds.length && b.subjectIds.some((id) => subjectIds.includes(id)) ? 0 : 1;
      return am - bm || a.name.localeCompare(b.name, "ru");
    })
    .map((t) => ({
      id: t.id,
      name: t.name,
      price: t.price,
      lessons: t.lessonsCount,
      subjectIds: t.subjectIds,
      lessonTypeIds: t.lessonTypeIds,
      periodCount: t.periodCount,
      periodType: t.periodType,
      periodLabel: t.periodLabel,
      eDate: t.eDate,
      calculationType: t.calculationType,
    }));
  return {
    id: customerId,
    cardId: clientCardId(customerId),
    branchId: useBranch,
    name,
    parent,
    dob,
    age: ageLabel(dob) || (dossier?.age ? `${dossier.age} лет` : ""),
    gender: c.gender === 1 || c.gender === "1" ? "мальчик" : c.gender === 2 || c.gender === "2" ? "девочка" : dossier?.child.gender || "",
    phones: phones.length ? phones : dossier?.phones || [],
    emails,
    address: /введите адрес/i.test(addr) ? dossier?.address || "" : addr || dossier?.address || "",
    status: study === 1 ? "учится" : study === 2 ? "архив" : "лид",
    isStudy: Number.isFinite(study) ? study : undefined,
    leadStatusId: Number(c.lead_status_id ?? c.status_id ?? 0) || 0,
    studyStatus: statusName,
    studyStatusId,
    note: String(c.note || "").trim(),
    paidTill: String(c.paid_till || ""),
    teacher: String(c.teacher_name || "").trim(),
    balance: Number(c.balance ?? tariffs[0]?.rest ?? 0),
    lessonsLeft: Number(c.paid_count ?? tariffs.filter((x) => !x.archived).reduce((n, x) => n + x.lessons, 0) ?? 0),
    url: `https://studiyarazvivaysya.s20.online/company/${useBranch}/customer/view?id=${customerId}`,
    schools: dossier?.schools || [],
    groups: packedGroups,
    regular,
    calendar,
    tariffs,
    comms,
    catalog: { ...lessonCatalogOf(useBranch), rooms, tariffs: offerTariffs, groups: catalogGroups(useBranch) },
  };
}

function hm(raw?: string) {
  const m = String(raw || "").match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

function durationMins(from: string, to: string) {
  const a = from.split(":").map(Number);
  const b = to.split(":").map(Number);
  if (a.length < 2 || b.length < 2) return 0;
  const n = b[0] * 60 + b[1] - (a[0] * 60 + a[1]);
  return n > 0 && n <= 480 ? n : 0;
}

function packCrmLesson(
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
    homework?: string | null;
    details?: { is_attend?: number | null }[];
    customer_ids?: number[];
    group_ids?: number[];
  },
  ctx: {
    rooms: Map<number, string>;
    teachers: Map<number, string>;
    subjects: Map<number, string>;
    groupName: string;
    fallbackFrom: string;
    fallbackTo: string;
    fallbackTeacher: string;
  },
): GroupCalLesson | null {
  const date = String(item.date || item.time_from || "").slice(0, 10);
  if (!date) return null;
  const from = hm(item.time_from) || ctx.fallbackFrom;
  const to = hm(item.time_to) || ctx.fallbackTo;
  const teacher = (item.teacher_ids || []).map((id) => ctx.teachers.get(Number(id)) || "").filter(Boolean).join(", ") || ctx.fallbackTeacher;
  const attend = (item.details || []).filter((d) => d.is_attend === 1).length;
  const total = (item.details || []).length || (item.customer_ids || []).length;
  return {
    date,
    from,
    to,
    status: Number(item.status || 0),
    type: String(item.lesson_type_name || "Групповое"),
    typeId: Number(item.lesson_type_id || 0) || undefined,
    duration: durationMins(from, to),
    room: item.room_id ? ctx.rooms.get(Number(item.room_id)) || "" : "",
    teacher,
    subject: item.subject_id ? ctx.subjects.get(Number(item.subject_id)) || "" : "",
    group: ctx.groupName,
    topic: String(item.topic || "").trim(),
    homework: String(item.homework || "").trim(),
    attend,
    total,
    lessonId: Number(item.id || 0) || undefined,
  };
}

const SEED_LEVELS = [
  { id: 7, name: "1 класс" },
  { id: 8, name: "2 класс" },
  { id: 9, name: "3 класс" },
  { id: 10, name: "4 класс" },
  { id: 11, name: "5 класс" },
  { id: 15, name: "Ознакомительный" },
  { id: 12, name: "Начальный" },
  { id: 13, name: "Средний" },
  { id: 14, name: "Продвинутый" },
];

async function fetchLevels(t: string, branch: number) {
  const { request } = await import("./alfacrm");
  const paths = [`/v2api/${branch}/level/index`, `/v2api/2/level/index`, `/v2api/level/index`];
  for (const path of paths) {
    try {
      const json = await request<{ items?: { id?: number; name?: string }[] }>(path, { page: 0, pageSize: 100 }, t);
      const items = (json.items || [])
        .map((x) => ({ id: Number(x.id), name: String(x.name || "").trim() }))
        .filter((x) => x.id && x.name);
      if (items.length) return items;
    } catch {
      /* next path */
    }
  }
  return SEED_LEVELS;
}

const g = globalThis as {
  __raSchedPull?: ReturnType<typeof setInterval>;
  __raSchedLast?: number;
  __raSchedPullMs?: number;
  __raSchedPulling?: boolean;
  __raSchedPullJob?: { at: number; added: number; updated: number; error: string; count: number };
  __raGetPack?: { at: number; body: Record<string, unknown> };
};

async function runPullJob() {
  if (g.__raSchedPulling) return;
  const { startCrmSync, syncState } = await import("./crm-sync");
  const cur = syncState();
  if (cur.running && cur.kind !== "groups" && cur.kind !== "all") {
    g.__raSchedPullJob = {
      at: Date.now(),
      added: 0,
      updated: 0,
      error: `Сейчас уже идёт загрузка «${cur.kind}». Дождитесь окончания — AlfaCRM не любит два потока сразу.`,
      count: listAdminSlots().length,
    };
    return;
  }
  g.__raSchedPulling = true;
  g.__raSchedPullJob = { at: 0, added: 0, updated: 0, error: "", count: listAdminSlots().length };
  try {
    if (!cur.running) startCrmSync("groups");
    const t0 = Date.now();
    while (Date.now() - t0 < 170000) {
      await new Promise((r) => setTimeout(r, 800));
      const st = syncState();
      g.__raSchedPullJob = {
        at: Date.now(),
        added: st.added,
        updated: st.updated,
        error: st.error,
        count: st.counts.groups || listAdminSlots().length,
      };
      if (!st.running) break;
    }
    g.__raSchedLast = Date.now();
    markLastPull(g.__raSchedLast);
    const st = syncState();
    logAdmin(`Расписание из AlfaCRM: +${st.added} новых, ${st.updated} обновлено, всего ${st.counts.groups || listAdminSlots().length}`);
    g.__raSchedPullJob = {
      at: Date.now(),
      added: st.added,
      updated: st.updated,
      error: st.error,
      count: st.counts.groups || listAdminSlots().length,
    };
  } catch (e) {
    g.__raSchedPullJob = {
      at: Date.now(),
      added: 0,
      updated: 0,
      error: e instanceof Error ? e.message : "AlfaCRM не ответила.",
      count: listAdminSlots().length,
    };
  } finally {
    g.__raSchedPulling = false;
    g.__raGetPack = undefined;
  }
}

function ensureAutoPullTimer() {
  if (g.__raSchedPull) {
    clearInterval(g.__raSchedPull);
    g.__raSchedPull = undefined;
  }
}

function decorateSubjects(subjects?: { id: number; name: string; local?: boolean }[]) {
  return packSubjectRows(subjects);
}

function pinNewSlots(slots: { id: string; course?: string; courseId?: string; school?: string; path?: string; groupId?: number; branchId?: number; groupName?: string }[], ids: string[]) {
  const tree = loadSiteTree();
  let changed = false;
  for (const s of slots) {
    if (!ids.includes(s.id)) continue;
    const course =
      tree.courses.find((c) => c.id && c.id === s.courseId) ||
      tree.courses.find((c) => s.courseId && c.href === s.courseId) ||
      tree.courses.find((c) => s.path && (c.id === s.path || c.href === s.path));
    if (!course) continue;
    const k = slotTreeKey(s);
    if (k && tree.assign[k] !== course.id) {
      tree.assign[k] = course.id;
      changed = true;
    }
    s.courseId = course.id;
    s.course = course.label;
    if (course.href) s.path = course.href;
    const sch = tree.schools.find((x) => x.id === course.schoolId);
    if (sch) s.school = sch.label;
    changed = true;
  }
  if (changed) saveSiteTree(tree);
}

export const adminSchedule = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) => {
      const raw = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
      return {
        ...raw,
        groupKeys: Array.isArray(raw.groupKeys) ? raw.groupKeys : [],
        pupilItems: Array.isArray(raw.pupilItems) ? raw.pupilItems : [],
      } as {
        token?: string;
        action:
          | "get"
          | "pull"
          | "pullStatus"
          | "save"
          | "exportCsv"
          | "exportXls"
          | "import"
          | "push"
          | "aiPreview"
          | "aiApply"
          | "versions"
          | "rollback"
          | "students"
          | "groupMembers"
          | "customerGet"
          | "customerSave"
          | "customerLesson"
          | "customerPay"
          | "customerTariff"
          | "customerGroup"
          | "add"
          | "remove"
          | "subjectsGet"
          | "subjectCreate"
          | "subjectsBind"
          | "subjectsPull"
          | "subjectsSave"
          | "subjectsPush"
          | "subjectsAiPreview"
          | "subjectsAiApply"
          | "groupGet"
          | "groupSave"
          | "groupFlags"
          | "leadsBoard"
          | "leadMove"
          | "leadArchive"
          | "leadStageSave"
          | "leadStageCreate"
          | "leadStageDelete"
          | "leadStageSort"
          | "funnelAutoGet"
          | "funnelAutoSave"
          | "pupilTariffGroups"
          | "pupilTariffPlan"
          | "pupilTariffAssign"
          | "voiceAsk"
          | "customersSearch"
          | "tariffsGet"
          | "tariffsPull"
          | "tariffsSave"
          | "tariffsPush"
          | "tariffsDelete"
          | "tariffsAiPreview"
          | "tariffsAiApply"
          | "tariffsProbe"
          | "tariffsProbeDelete"
          | "treeAddSchool"
          | "treeAddCourse"
          | "treeDeleteCourse"
          | "treeDeleteSchool"
          | "treeDeleteSelected"
          | "treeMove"
          | "saveSettings"
          | "publicSiteGet"
          | "publicSiteSave";
        slots?: CrmSlot[];
        text?: string;
        prompt?: string;
        fresh?: boolean;
        lite?: boolean;
        changes?: { id: string; field: string; to: string }[];
        adds?: SlotDraft[];
        draft?: SlotDraft;
        dirtyIds?: string[];
        ids?: string[];
        groupId?: number;
        customerId?: number;
        leadId?: number;
        leadStatusId?: number;
        sort?: number;
        stageId?: number;
        stageIds?: number[];
        force?: boolean;
        delta?: boolean;
        color?: string;
        branchId?: number;
        isStudy?: number;
        studyStatusId?: number;
        sum?: number;
        lessonType?: string;
        date?: string;
        time?: string;
        duration?: number;
        payKind?: string;
        tariffId?: number;
        roomId?: number;
        teacherId?: number;
        topic?: string;
        patch?: {
          name?: string;
          parent?: string;
          phone?: string;
          email?: string;
          address?: string;
          note?: string;
          dob?: string;
        };
        at?: string;
        subjects?: { id: number; name: string; local?: boolean }[];
        q?: string;
        status?: string;
        ageBand?: string;
        note?: string;
        hashtags?: string;
        makeup?: string;
        statusId?: number;
        subjectId?: number;
        name?: string;
        description?: string;
        remarks?: string;
        bDate?: string;
        eDate?: string;
        levelId?: number;
        priority?: number;
        tariff?: import("./crm-tariffs").CrmTariff;
        tariffs?: import("./crm-tariffs").CrmTariff[];
        pullN?: number;
        pullUnit?: "min" | "hour" | "day" | "week";
        schoolId?: string;
        courseId?: string;
        funnelAuto?: import("./funnel-auto").FunnelAuto;
        groupKeys?: { branchId: number; groupId: number }[];
        pupilItems?: import("./pupil-tariffs").PupilTariffItem[];
        includeLeads?: boolean;
        skipExisting?: boolean;
        subjectIds?: number[];
        lessonTypeIds?: number[];
        periodCount?: number;
        periodType?: number;
        calcType?: number;
        isSeparateBalance?: number;
        schoolIds?: string[];
        courseIds?: string[];
        href?: string;
        label?: string;
        age?: string;
      };
    },
  )
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const pack = (slots: CrmSlot[], extra?: Record<string, unknown>) => {
      const meta = crmScheduleMeta();
      const settings = loadScheduleSettings();
      ensureAutoPullTimer();
      return {
        ok: true as const,
        at: meta.at,
        count: slots.length,
        slots,
        versions: loadVersions().map((v) => ({ at: v.at, reason: v.reason, count: v.count })),
        pullN: settings.pullN,
        pullUnit: settings.pullUnit,
        pullMs: 0,
        nextPullAt: "",
        pulling: Boolean(g.__raSchedPulling),
        pullJob: g.__raSchedPullJob || null,
        tree: loadSiteTree(),
        teachers: listTeachers(slots),
        ...extra,
      };
    };
    if (data.action === "pullStatus") {
      const meta = crmScheduleMeta();
      const settings = loadScheduleSettings();
      ensureAutoPullTimer();
      return {
        ok: true as const,
        pulling: Boolean(g.__raSchedPulling),
        pullJob: g.__raSchedPullJob || null,
        at: meta.at,
        count: meta.count,
        pullN: settings.pullN,
        pullUnit: settings.pullUnit,
        nextPullAt: "",
      };
    }
    if (data.action === "get") {
      const cached = g.__raGetPack;
      if (cached && Date.now() - cached.at < 2500) return cached.body as never;
      let slots = listAdminSlots();
      if (pinAllGuesses(slots)) {
        resetSlotCache();
        slots = saveAdminSlots(listAdminSlots()).slots;
      }
      const body = pack(slots);
      g.__raGetPack = { at: Date.now(), body };
      return body;
    }
    if (data.action === "saveSettings") {
      const settings = saveScheduleSettings({
        pullN: Number((data as { pullN?: number }).pullN),
        pullUnit: (data as { pullUnit?: "min" | "hour" | "day" | "week" }).pullUnit,
      });
      ensureAutoPullTimer();
      logAdmin("Автозагрузка расписания выключена");
      return pack(listAdminSlots(), { settings });
    }
    if (data.action === "pull") {
      void runPullJob();
      return pack(listAdminSlots(), { pulling: true, added: 0, updated: 0 });
    }
    if (data.action === "save") {
      const slots = saveAdminSlots(data.slots || listAdminSlots()).slots;
      pushVersion("Правка в кабинете", slots);
      logAdmin("Расписание сохранено на сайте");
      return pack(slots);
    }
    if (data.action === "exportCsv") {
      return { ok: true as const, filename: "raspisanije.csv", mime: "text/csv", text: slotsToCsv(listAdminSlots()) };
    }
    if (data.action === "exportXls") {
      return {
        ok: true as const,
        filename: "raspisanije.xls",
        mime: "application/vnd.ms-excel",
        text: slotsToXls(listAdminSlots()),
      };
    }
    if (data.action === "import") {
      const next = parseSlotsCsv(String(data.text || ""), listAdminSlots());
      const saved = saveAdminSlots(next).slots;
      pushVersion("Импорт Excel/CSV", saved);
      logAdmin(`Импорт расписания: ${saved.length} строк`);
      return pack(saved);
    }
    if (data.action === "push") {
      const ids = (data.ids || data.dirtyIds || []).map(String);
      if (!ids.length) return { ok: false as const, error: "Отметьте группы чекбоксом слева от названия." };
      const current = data.slots?.length ? data.slots : listAdminSlots();
      const { results, slots: next } = await pushSlotsToCrm(current, ids);
      const saved = saveAdminSlots(next).slots;
      const ok = results.filter((r) => r.ok).length;
      const created = results.filter((r) => r.ok && r.created).length;
      logAdmin(`Выгрузка в AlfaCRM: ${ok}/${results.length}, новых gid: ${created}`);
      return pack(saved, { results, pushed: ok, created, failed: results.length - ok });
    }
    if (data.action === "aiPreview") {
      const slots = listAdminSlots();
      const ids = Array.isArray(data.ids) ? data.ids.map(String) : [];
      const prompt = String(data.prompt || "");
      const preview = await aiScheduleParse(slots, prompt, ids);
      return pack(slots, preview);
    }
    if (data.action === "aiApply") {
      const slots = listAdminSlots();
      const ids = new Set((data.ids || []).map(String));
      const incoming = data.changes || [];
      const allowed = ids.size ? incoming.filter((c) => ids.has(c.id)) : incoming;
      const drafts = data.adds || [];
      if (!allowed.length && !drafts.length) {
        return { ok: false as const, error: "В предпросмотре нет правок. Нажмите стрелку отправки, затем «Опубликовать изменения»." };
      }
      let next = allowed.length ? applyChanges(slots, allowed) : slots.map((s) => ({ ...s }));
      const created: string[] = [];
      for (const d of drafts) {
        const slot = buildSlot(d, next);
        next = [...next, slot];
        created.push(slot.id);
      }
      pinNewSlots(next, created);
      const saved = saveAdminSlots(next).slots;
      const applied = [...new Set(allowed.map((c) => c.id).concat(created))];
      pushVersion(`ИИ: ${(data.prompt || "правка").slice(0, 80)}`, saved);
      logAdmin(`Расписание: ИИ ${allowed.length} правок, ${created.length} новых`);
      return pack(saved, { created, applied });
    }
    if (data.action === "add" && data.draft) {
      const slots = listAdminSlots();
      const slot = buildSlot(data.draft, slots);
      pinNewSlots([slot], [slot.id]);
      const saved = saveAdminSlots([...slots, slot]).slots;
      pushVersion(`Новая группа: ${slot.course}`, saved);
      logAdmin(`Расписание: добавлена ${slot.groupName}`);
      return pack(saved, { created: [slot.id] });
    }
    if (data.action === "remove") {
      const ids = new Set((data.ids || []).map(String));
      if (!ids.size) return pack(listAdminSlots(), { comment: "Нечего удалять." });
      const slots = listAdminSlots();
      const saved = saveAdminSlots(slots.filter((s) => !ids.has(s.id))).slots;
      pushVersion(`Удалено групп: ${ids.size}`, saved);
      logAdmin(`Расписание: удалено ${ids.size}`);
      return pack(saved);
    }
    if (data.action === "students") {
      const { token, request } = await import("./alfacrm");
      const t = await token();
      const branch = Number(data.branchId) || 1;
      const gid = Number(data.groupId) || 0;
      if (!gid) return { ok: true as const, names: [] as string[] };
      const json = await request<{ items?: { id?: number; name?: string; is_study?: number }[] }>(
        `/v2api/${branch}/customer/index`,
        { page: 0, pageSize: 80, group_id: gid, is_study: 1 },
        t,
      ).catch(async () =>
        request<{ items?: { id?: number; name?: string; is_study?: number }[] }>(
          `/v2api/${branch}/customer/index`,
          { page: 0, pageSize: 80, group_ids: [gid] },
          t,
        ),
      );
      const names = (json.items || [])
        .filter((c) => Number(c.is_study) !== 2)
        .map((c) => String(c.name || "").trim())
        .filter(Boolean);
      return { ok: true as const, names };
    }
    if (data.action === "groupMembers") {
      const { token, request } = await import("./alfacrm");
      const t = await token();
      const branch = Number(data.branchId) || 1;
      const gid = Number(data.groupId) || 0;
      if (!gid) return { ok: true as const, names: [] as string[], active: [] as GroupMember[], archive: [] as GroupMember[] };
      const { active, archive } = await loadGroupMembers(request, t, branch, gid);
      return {
        ok: true as const,
        names: active.map((m) => m.name).filter(Boolean),
        active,
        archive,
      };
    }
    if (data.action === "customerGet") {
      const { token, request } = await import("./alfacrm");
      const t = await token();
      const branch = Number(data.branchId) || 1;
      const customerId = Number(data.customerId) || 0;
      if (!customerId) return { ok: false as const, error: "Нет номера ученика." };
      const customer = await loadCustomerCard(request, t, branch, customerId);
      if (!customer) return { ok: false as const, error: "Ученик не найден в AlfaCRM." };
      return { ok: true as const, customer };
    }
    if (data.action === "customerSave") {
      const { token, request } = await import("./alfacrm");
      const t = await token();
      const branch = Number(data.branchId) || 1;
      const customerId = Number(data.customerId) || 0;
      if (!customerId) return { ok: false as const, error: "Нет customerId." };
      const patch = data.patch || {};
      const body: Record<string, unknown> = { id: customerId };
      if (patch.name) body.name = patch.name;
      if (patch.parent) body.legal_name = patch.parent;
      if (patch.phone) body.phone = [patch.phone];
      if (patch.email) body.email = [patch.email];
      if (patch.note != null) body.note = patch.note;
      if (patch.dob) body.dob = patch.dob;
      if (patch.address) body.custom_adresprozhivaniya = patch.address;
      if (data.isStudy === 0 || data.isStudy === 1 || data.isStudy === 2) body.is_study = data.isStudy;
      if (Number(data.studyStatusId) > 0) body.study_status_id = Number(data.studyStatusId);
      const upd = await request<{ success?: boolean; errors?: unknown }>(`/v2api/${branch}/customer/update?id=${customerId}`, body, t);
      if (upd.success === false) return { ok: false as const, error: JSON.stringify(upd.errors || upd) };
      logAdmin(`Клиент ${customerId}: правка карточки`);
      const customer = await loadCustomerCard(request, t, branch, customerId);
      return { ok: true as const, customer };
    }
    if (data.action === "customerLesson") {
      const { createAlfaLesson } = await import("./alfacrm");
      const { token, request } = await import("./alfacrm");
      const t = await token();
      const branch = Number(data.branchId) || 1;
      const customerId = Number(data.customerId) || 0;
      if (!customerId) return { ok: false as const, error: "Нет customerId." };
      try {
        const card = await loadCustomerCard(request, t, branch, customerId);
        const wantedGid = Number(data.groupId) || 0;
        const g = (card?.groups || []).find((x) => x.id === wantedGid) || card?.groups?.[0];
        const reg = (card?.regular || []).find((x) => x.groupId === (g?.id || wantedGid)) || card?.regular?.[0];
        const booked = await createAlfaLesson({
          branch,
          customerId,
          type: String(data.lessonType || "trial"),
          subjectId: Number(data.subjectId) || g?.subjectId || reg?.subjectId,
          gid: g?.id ? String(g.id) : wantedGid ? String(wantedGid) : undefined,
          date: data.date,
          time: data.time || reg?.from,
          duration: data.duration,
          note: data.note,
          topic: data.topic,
          roomId: data.roomId,
          teacherId: data.teacherId,
        });
        if (!booked.ok) return { ok: false as const, error: booked.error === "no-subject" ? "Нет subjectId у группы клиента — выберите группу." : "Не удалось поставить занятие." };
        logAdmin(`Клиент ${customerId}: занятие ${booked.type} #${booked.id}`);
        const customer = await loadCustomerCard(request, t, branch, customerId);
        return { ok: true as const, customer, lesson: booked };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Не удалось поставить занятие." };
      }
    }
    if (data.action === "customerPay") {
      const { token, request } = await import("./alfacrm");
      const t = await token();
      const branch = Number(data.branchId) || 1;
      const customerId = Number(data.customerId) || 0;
      const sum = Number(data.sum || 0);
      if (!customerId) return { ok: false as const, error: "Нет customerId." };
      if (!sum) return { ok: false as const, error: "Укажите сумму." };
      const kind = String(data.payKind || "income");
      const now = new Date();
      const ru = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
      const note = kind === "product" ? "продажа товара" : kind === "refund" ? "возврат средств" : kind === "correct" ? "корректировка" : "доход";
      const income = kind === "refund" ? 0 : sum;
      const expenditure = kind === "refund" ? sum : 0;
      const tries: Record<string, unknown>[] = [
        { customer_id: customerId, document_date: ru, income, expenditure, note },
        { customer_id: customerId, date: ru, sum, is_income: kind === "refund" ? 0 : 1, note },
        { related_id: customerId, related_class: "Customer", document_date: ru, income, note },
      ];
      let last = "";
      let ok = false;
      for (const body of tries) {
        try {
          const res = await request<{ success?: boolean; errors?: unknown; model?: { id?: number } }>(`/v2api/${branch}/pay/create`, body, t);
          if (res.success === false) {
            last = JSON.stringify(res.errors || res);
            continue;
          }
          ok = true;
          break;
        } catch (e) {
          last = e instanceof Error ? e.message : String(e);
        }
      }
      if (!ok) return { ok: false as const, error: last || "AlfaCRM не приняла платёж." };
      logAdmin(`Клиент ${customerId}: ${note} ${sum}`);
      if (kind !== "refund") {
        const { applyFunnelAuto } = await import("./funnel-auto");
        const raw = await loadCustomerRaw(request, t, branch, customerId);
        await applyFunnelAuto("tariff", {
          customerId,
          branchId: raw?.branch || branch,
          isStudy: Number(raw?.c?.is_study),
          statusId: Number(raw?.c?.lead_status_id ?? raw?.c?.status_id ?? 0),
        });
      }
      const customer = await loadCustomerCard(request, t, branch, customerId);
      return { ok: true as const, customer };
    }
    if (data.action === "customerTariff") {
      const { token, request, formatRuDob } = await import("./alfacrm");
      const t = await token();
      const branch = Number(data.branchId) || 1;
      const customerId = Number(data.customerId) || 0;
      const tariffId = Number(data.tariffId) || 0;
      if (!customerId) return { ok: false as const, error: "Нет customerId." };
      if (!tariffId) return { ok: false as const, error: "Выберите абонемент." };
      const offer = loadTariffs().items.find((x) => x.id === tariffId);
      const bDate = formatRuDob(data.date) || (() => {
        const now = new Date();
        return `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
      })();
      const made = await createCustomerTariff(request, t, {
        branch,
        customerId,
        tariffId,
        bDate,
        eDate: formatRuDob(data.eDate) || "",
        groupId: Number(data.groupId) || 0,
        calcType: Number(data.calcType ?? data.isSeparateBalance) || 0,
        subjectIds: Array.isArray(data.subjectIds) ? (data.subjectIds as unknown[]).map(Number).filter(Boolean) : offer?.subjectIds,
        lessonTypeIds: Array.isArray(data.lessonTypeIds) ? (data.lessonTypeIds as unknown[]).map(Number).filter(Boolean) : offer?.lessonTypeIds,
        periodCount: Number(data.periodCount) || offer?.periodCount,
        periodType: Number(data.periodType) || offer?.periodType,
        note: data.note ? String(data.note) : "",
        lessonsCount: offer?.lessonsCount,
      });
      if (!made.ok) return { ok: false as const, error: made.error };
      logAdmin(`Клиент ${customerId}: абонемент ${tariffId}`);
      {
        const { applyFunnelAuto } = await import("./funnel-auto");
        const raw = await loadCustomerRaw(request, t, branch, customerId);
        await applyFunnelAuto("tariff", {
          customerId,
          branchId: raw?.branch || branch,
          isStudy: Number(raw?.c?.is_study),
          statusId: Number(raw?.c?.lead_status_id ?? raw?.c?.status_id ?? 0),
        });
      }
      const customer = await loadCustomerCard(request, t, branch, customerId);
      return { ok: true as const, customer };
    }
    if (data.action === "customerGroup") {
      const { token, request } = await import("./alfacrm");
      const t = await token();
      const customerId = Number(data.customerId) || 0;
      const groupId = Number(data.groupId) || 0;
      const branch = Number(data.branchId) || 1;
      const drop = Boolean((data as { remove?: boolean }).remove);
      if (!customerId) return { ok: false as const, error: "Нет customerId." };
      if (!groupId) return { ok: false as const, error: "Выберите группу." };
      const found = await loadCustomerRaw(request, t, branch, customerId);
      const useBranch = found?.branch || branch;
      const ids = new Set(groupIdsFromCustomer(found?.c || {}));
      if (!drop && ids.has(groupId)) {
        const customer = await loadCustomerCard(request, t, useBranch, customerId);
        return { ok: true as const, customer };
      }
      if (drop) ids.delete(groupId);
      else ids.add(groupId);
      const next = [...ids];
      const bDate = String(data.bDate || "").trim();
      const eDate = String(data.eDate || "").trim();
      const period: Record<string, unknown> = {};
      if (!drop) {
        if (bDate) period.b_date = bDate;
        if (eDate) period.e_date = eDate;
      }
      const tries: [string, Record<string, unknown>][] = [
        [`/v2api/${useBranch}/customer/update?id=${customerId}`, { id: customerId, group_ids: next, ...period }],
      ];
      if (!drop) {
        tries.push([`/v2api/${useBranch}/customer/update?id=${customerId}`, { id: customerId, group_ids: next, is_study: 1, ...period }]);
      } else {
        tries.push([`/v2api/${useBranch}/customer/update?id=${customerId}`, { id: customerId, group_ids: next, groups: next }]);
      }
      try {
        const les = await request<{ items?: Record<string, unknown>[] }>(
          `/v2api/${useBranch}/regular-lesson/index`,
          { page: 0, pageSize: 20, group_id: groupId },
          t,
        );
        for (const it of les.items || []) {
          const lid = Number(it.id || 0);
          if (!lid) continue;
          const cids = Array.isArray(it.customer_ids) ? it.customer_ids.map(Number).filter(Boolean) : [];
          if (drop && cids.includes(customerId)) {
            tries.push([`/v2api/${useBranch}/regular-lesson/update?id=${lid}`, { id: lid, customer_ids: cids.filter((x) => x !== customerId) }]);
          } else if (!drop && !cids.includes(customerId)) {
            tries.push([`/v2api/${useBranch}/regular-lesson/update?id=${lid}`, { id: lid, customer_ids: [...cids, customerId] }]);
          }
        }
      } catch {
        /* fallback customer/update only */
      }
      let last = "";
      let ok = false;
      for (const [path, body] of tries) {
        try {
          const res = await request<{ success?: boolean; errors?: unknown }>(path, body, t);
          if (res.success === false) {
            last = JSON.stringify(res.errors || res);
            continue;
          }
          ok = true;
        } catch (e) {
          last = e instanceof Error ? e.message : String(e);
        }
      }
      if (!ok) return { ok: false as const, error: last || (drop ? "AlfaCRM не сняла с группы." : "AlfaCRM не добавила в группу.") };
      const slot = listAdminSlots().find((s) => s.groupId === groupId);
      try {
        upsertDossier({
          crmId: customerId,
          branchId: useBranch,
          groupLink: {
            id: groupId,
            name: slot?.groupName || `группа ${groupId}`,
            branchId: slot?.branchId || useBranch,
            school: slot?.school || "",
            active: !drop,
            subjectId: slot?.subjectId || undefined,
            courseId: slot?.courseId,
          },
          source: "alfacrm",
          crmWins: true,
        });
      } catch {
        /* local dossier is optional */
      }
      logAdmin(drop ? `Клиент ${customerId}: снят с группы ${groupId}` : `Клиент ${customerId}: группа ${groupId}`);
      if (!drop) {
        const { applyFunnelAuto } = await import("./funnel-auto");
        await applyFunnelAuto("group", {
          customerId,
          branchId: useBranch,
          isStudy: Number(found?.c?.is_study),
          statusId: Number(found?.c?.lead_status_id ?? found?.c?.status_id ?? 0),
        });
      }
      const customer = await loadCustomerCard(request, t, useBranch, customerId);
      return { ok: true as const, customer };
    }
    if (data.action === "versions") return pack(listAdminSlots());
    if (data.action === "subjectsGet") {
      try {
        return decorateSubjects(loadSubjects());
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Не удалось прочитать предметы." };
      }
    }
    if (data.action === "subjectsBind") {
      try {
        const subjectId = Number(data.subjectId) || 0;
        const courseId = String(data.courseId || "");
        if (!subjectId) return { ok: false as const, error: "Нет предмета." };
        const packed = bindSubjectCourse(subjectId, courseId);
        logAdmin(`Предмет ${subjectId} → курс сайта ${courseId || "—"}`);
        return packed;
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Не удалось записать курс сайта." };
      }
    }
    if (data.action === "subjectCreate") {
      try {
        const name = String(data.name || "").replace(/^20\d{2}\s+/, "").trim();
        const branch = Number(data.branchId) || 2;
        if (!name) return { ok: false as const, error: "Нет названия предмета." };
        const sub = await ensureCrmSubject(name, Number(data.subjectId) || 0, branch, "create");
        const courseId = String((data as { courseId?: string }).courseId || "");
        if (sub.id && courseId) {
          const tree = loadSiteTree();
          const course = tree.courses.find((c) => c.id === courseId);
          const school = course ? tree.schools.find((s) => s.id === course.schoolId) : undefined;
          const map = loadScheduleMap();
          const next = map.courses.filter((c) => c.subjectId !== sub.id);
          next.push({
            subjectId: sub.id,
            subjectName: sub.name,
            courseId: course?.id || courseId,
            schoolId: school?.id || course?.schoolId || "",
            siteHref: course?.href || course?.id || "",
            school: school?.label || "",
          });
          saveScheduleMap({ ...map, courses: next });
        }
        logAdmin(`Предмет «${sub.name}» id ${sub.id} для филиала ${branch}`);
        return { ...decorateSubjects(loadSubjects()), created: sub };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Не удалось создать предмет." };
      }
    }
    if (data.action === "subjectsPull") {
      try {
        const subjects = await pullSubjectsFromCrm();
        logAdmin(`Предметы из AlfaCRM: ${subjects.length}`);
        return decorateSubjects(subjects);
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Не удалось загрузить предметы." };
      }
    }
    if (data.action === "subjectsSave") {
      const subjects = saveSubjects(data.subjects || []);
      logAdmin(`Предметы сохранены: ${subjects.length}`);
      return decorateSubjects(subjects);
    }
    if (data.action === "subjectsPush") {
      try {
        const res = await pushSubjectsToCrm(data.subjects || loadSubjects());
        logAdmin(`Предметы в AlfaCRM: ${res.results.filter((r) => r.ok).length}`);
        return { ...decorateSubjects(res.items), results: res.results };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Не удалось выгрузить предметы." };
      }
    }
    if (data.action === "subjectsAiPreview") {
      const { aiSubjectsParse } = await import("./crm-subjects");
      const ids = (data.ids || []).map(Number).filter(Boolean);
      const preview = await aiSubjectsParse(loadSubjects(), String(data.prompt || ""), ids);
      return { ok: true as const, ...preview };
    }
    if (data.action === "subjectsAiApply") {
      const { applySubjectChanges } = await import("./crm-subjects");
      const changes = (data.changes || []).map((c) => ({ id: Number(c.id), field: c.field, from: "", to: String(c.to) }));
      const adds = Array.isArray(data.subjects)
        ? data.subjects.map((s) => ({ name: String(s.name || "") })).filter((s) => s.name)
        : [];
      if (!changes.length && !adds.length) return { ok: false as const, error: "В предпросмотре нет правок." };
      const items = applySubjectChanges(loadSubjects(), changes, adds);
      logAdmin(`Предметы ИИ: ${changes.length} правок, ${adds.length} новых`);
      return decorateSubjects(items);
    }
    if (data.action === "customersSearch") {
      try {
      const q = String(data.q || "").trim();
      const status = String(data.status || "").trim();
      const branchId = Number(data.branchId) || 0;
      const ageBand = String(data.ageBand || "").trim();
      const local = searchClientViews(q, 2500, status, branchId, ageBand);
      const items = local.items.map((d) => ({
        id: d.id,
        crmId: d.crmId,
        cardId: d.cardId,
        branchId: d.branchId,
        child: d.child,
        parent: d.parent,
        phone: d.phone,
        age: d.age,
        ageBand: d.ageBand,
        gender: d.gender,
        status: d.status,
        studyStatus: d.studyStatus,
        courses: d.coursesNow.length ? d.coursesNow : d.courses,
        schools: d.schools,
        city: d.city,
        branch: d.branch,
        groupLinks: d.groupLinks,
        archived: d.archived,
      }));
      if (q.length >= 3 && items.length < 8) {
        try {
          const { token, request } = await import("./alfacrm");
          const t = await token();
          const seen = new Set(items.map((x) => `${x.branchId}-${x.crmId}`));
          const needle = q.toLowerCase();
          for (const branch of [1, 2, 3, 4]) {
            const json = await request<{ items?: Record<string, unknown>[] }>(
              `/v2api/${branch}/customer/index`,
              { page: 0, pageSize: 30, name: q },
              t,
            ).catch(() => ({ items: [] as Record<string, unknown>[] }));
            for (const c of json.items || []) {
              const name = String(c.name || "");
              const parent = String(c.legal_name || "");
              const hay = `${name} ${parent}`.toLowerCase();
              if (!hay.includes(needle) && !needle.split(/\s+/).every((w) => hay.includes(w))) continue;
              const crmId = Number(c.id || 0);
              if (!crmId || seen.has(`${branch}-${crmId}`)) continue;
              seen.add(`${branch}-${crmId}`);
              const m = packMember(c, Number(c.is_study) === 2);
              items.push({
                id: `crm-${branch}-${crmId}`,
                crmId,
                cardId: clientCardId(crmId),
                branchId: branch,
                child: m.name,
                parent: m.parent,
                phone: m.phone,
                age: m.age ? Number(String(m.age).match(/\d+/)?.[0] || 0) || null : null,
                ageBand: "",
                gender: m.gender,
                status: m.status,
                studyStatus: "",
                courses: [],
                schools: [],
                city: branch === 3 ? "Луховицы" : "Коломна",
                branch: "",
                groupLinks: [],
                archived: m.archived,
              });
            }
          }
        } catch {
          /* local list is enough */
        }
      }
      return { ok: true as const, items, total: local.total, all: local.all, counts: local.counts, branchCounts: local.branchCounts, lastCrmSync: local.lastCrmSync };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Не удалось прочитать базу клиентов." };
      }
    }
    if (data.action === "leadsBoard") {
      const { loadLeadsBoard } = await import("./crm-leads");
      const branch = Number(data.branchId) || 0;
      try {
        const board = await loadLeadsBoard(branch, Boolean(data.force), Boolean(data.delta));
        return { ok: true as const, stages: board.stages, items: board.items, total: board.items.length, note: board.note, delta: Boolean((board as { delta?: boolean }).delta) };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Не удалось прочитать воронку лидов." };
      }
    }
    if (data.action === "leadMove") {
      const { moveLead } = await import("./crm-leads");
      const branch = Number(data.branchId) || 1;
      const leadId = Number(data.leadId) || 0;
      const statusId = Number(data.leadStatusId);
      if (!leadId) return { ok: false as const, error: "Нет номера лида." };
      if (!Number.isFinite(statusId)) return { ok: false as const, error: "Нет этапа воронки." };
      try {
        await moveLead(branch, leadId, statusId, Number.isFinite(Number(data.sort)) ? Number(data.sort) : undefined);
        const d = findDossier({ crmId: leadId });
        if (d) {
          upsertDossier({
            crmId: leadId,
            extras: { ...(d.extras || {}), lead_status_id: statusId },
          } as never);
        }
        logAdmin(`Лид ${leadId}: этап воронки ${statusId}`);
        return { ok: true as const, leadStatusId: statusId };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "AlfaCRM не сменила этап." };
      }
    }
    if (data.action === "leadArchive") {
      const { archiveLead } = await import("./crm-leads");
      const branch = Number(data.branchId) || 1;
      const leadId = Number(data.leadId) || 0;
      if (!leadId) return { ok: false as const, error: "Нет номера лида." };
      try {
        await archiveLead(branch, leadId);
        const d = findDossier({ crmId: leadId });
        if (d) upsertDossier({ crmId: leadId, extras: { ...(d.extras || {}), is_study: "0", removed: "1" } } as never);
        logAdmin(`Лид ${leadId}: в архив`);
        return { ok: true as const };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "AlfaCRM не отправила лид в архив." };
      }
    }
    if (data.action === "leadStageSave") {
      const { saveLeadStage, loadLeadsBoard } = await import("./crm-leads");
      const id = Number(data.stageId);
      const name = String(data.name || "").trim();
      const color = String(data.color || "").trim();
      if (!Number.isFinite(id) || (!name && !color)) return { ok: false as const, error: "Нет названия этапа." };
      try {
        await saveLeadStage(id, { name: name || undefined, color: color || undefined });
        logAdmin(`Этап лида ${id}: ${name || color}`);
        const board = await loadLeadsBoard(Number(data.branchId) || 0, true);
        return { ok: true as const, stages: board.stages, items: board.items };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "AlfaCRM не переименовала этап." };
      }
    }
    if (data.action === "leadStageCreate") {
      const { createLeadStage, loadLeadsBoard } = await import("./crm-leads");
      const name = String(data.name || "").trim() || "Новый этап";
      try {
        const made = await createLeadStage(name, String(data.color || "#2563eb"));
        logAdmin(`Этап лида: создан «${name}»`);
        const board = await loadLeadsBoard(Number(data.branchId) || 0, true);
        return { ok: true as const, stages: board.stages, items: board.items, stageId: made.id };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "AlfaCRM не создала этап." };
      }
    }
    if (data.action === "leadStageDelete") {
      const { deleteLeadStage, loadLeadsBoard } = await import("./crm-leads");
      const id = Number(data.stageId);
      if (!Number.isFinite(id) || id === 0) return { ok: false as const, error: "Этот столбец нельзя удалить." };
      try {
        await deleteLeadStage(id);
        logAdmin(`Этап лида ${id}: удалён`);
        const board = await loadLeadsBoard(Number(data.branchId) || 0, true);
        return { ok: true as const, stages: board.stages, items: board.items };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "AlfaCRM не удалила этап." };
      }
    }
    if (data.action === "leadStageSort") {
      const { sortLeadStages, loadLeadsBoard } = await import("./crm-leads");
      const ids = Array.isArray(data.stageIds) ? data.stageIds.map(Number).filter((n) => Number.isFinite(n)) : [];
      if (!ids.length) return { ok: false as const, error: "Нет порядка этапов." };
      try {
        await sortLeadStages(ids, Number(data.branchId) || 2);
        logAdmin(`Этапы воронки: порядок ${ids.filter((id) => id).join(",")}`);
        const board = await loadLeadsBoard(Number(data.branchId) || 0, true);
        const { mergeStages, pinUnsorted } = await import("./crm-leads");
        const order = pinUnsorted(ids);
        const stages = mergeStages(
          (board.stages || []).map((s) => ({ ...s, weight: Math.max(0, order.indexOf(s.id)) })),
          (board.items || []).map((x) => x.statusId),
        );
        return { ok: true as const, stages, items: board.items };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "AlfaCRM не сменила порядок этапов." };
      }
    }
    if (data.action === "funnelAutoGet") {
      const { loadFunnelAuto, funnelAutoHint } = await import("./funnel-auto");
      const rules = loadFunnelAuto();
      return { ok: true as const, rules, hint: funnelAutoHint(rules) };
    }
    if (data.action === "funnelAutoSave") {
      const { saveFunnelAuto, funnelAutoHint } = await import("./funnel-auto");
      const rules = saveFunnelAuto(data.funnelAuto || {});
      logAdmin(`Автоматизация воронки: ${JSON.stringify(funnelAutoHint(rules))}`);
      return { ok: true as const, rules, hint: funnelAutoHint(rules) };
    }
    if (data.action === "pupilTariffGroups") {
      const { uniqueLiveGroups } = await import("./pupil-tariffs");
      const groups = uniqueLiveGroups(listAdminSlots());
      const schools = [...new Set(groups.map((g) => g.school).filter(Boolean))];
      const unbound = groups.filter((g) => g.school === "Без школы на сайте").length;
      return { ok: true as const, groups, schools, unbound };
    }
    if (data.action === "pupilTariffPlan") {
      const { uniqueLiveGroups, pupilRowFromMember, pickBestTariff } = await import("./pupil-tariffs");
      const { token, request } = await import("./alfacrm");
      const t = await token();
      const keys = Array.isArray(data.groupKeys) ? data.groupKeys : [];
      const includeLeads = Boolean(data.includeLeads);
      const all = uniqueLiveGroups(listAdminSlots());
      const want = new Set(keys.map((k) => `${Number(k.branchId)}:${Number(k.groupId)}`));
      const groups = all.filter((g) => want.has(g.key));
      const tariffs = loadTariffs().items;
      const items = [];
      const byGroup: Record<string, { tariffId: number; tariffName: string; options: { id: number; name: string; price: number }[] }> = {};
      for (const g of groups) {
        const slot = listAdminSlots().find((s) => s.groupId === g.groupId && s.branchId === g.branchId);
        const options = slot ? matchTariffs(slot, tariffs) : [];
        const best = slot ? pickBestTariff(slot, tariffs) : options[0] || null;
        byGroup[g.key] = {
          tariffId: best?.id || 0,
          tariffName: best?.name || "",
          options: options.map((x) => ({
            id: x.id,
            name: x.name,
            price: x.price,
            subjectIds: x.subjectIds,
            lessonTypeIds: x.lessonTypeIds,
            periodCount: x.periodCount,
            periodType: x.periodType,
            calculationType: x.calculationType,
            lessonsCount: x.lessonsCount,
          })),
        };
        const mem = await loadGroupMembers(request, t, g.branchId, g.groupId);
        for (const m of mem.active) {
          const row = pupilRowFromMember(m, g, best, includeLeads);
          if (row) items.push(row);
        }
      }
      return { ok: true as const, items, byGroup, total: items.length };
    }
    if (data.action === "pupilTariffAssign") {
      const { token, request, formatRuDob } = await import("./alfacrm");
      const { assignable, addPeriod } = await import("./pupil-tariffs");
      const t = await token();
      const fromIso = String(data.date || "").slice(0, 10);
      const bDate = formatRuDob(fromIso) || formatRuDob(new Date().toISOString().slice(0, 10));
      const skipExisting = data.skipExisting !== false;
      const rows = assignable(Array.isArray(data.pupilItems) ? data.pupilItems : []);
      const done: number[] = [];
      const skipped: { id: number; name: string; reason: string }[] = [];
      const failed: { id: number; name: string; error: string }[] = [];
      const catalog = loadTariffs().items;
      for (const row of rows) {
        const offer = catalog.find((x) => x.id === row.tariffId);
        const periodCount = Number(row.periodCount) || offer?.periodCount || 0;
        const periodType = Number(row.periodType) || offer?.periodType || 1;
        const eIso = row.eDate || addPeriod(fromIso, periodCount, periodType);
        const made = await createCustomerTariff(request, t, {
          branch: row.branchId,
          customerId: Number(row.customerId),
          tariffId: Number(row.tariffId),
          bDate,
          eDate: formatRuDob(eIso) || "",
          groupId: Number(row.groupId) || 0,
          calcType: Number(row.calcType) || 0,
          subjectIds: row.subjectIds?.length ? row.subjectIds : offer?.subjectIds,
          lessonTypeIds: row.lessonTypeIds?.length ? row.lessonTypeIds : offer?.lessonTypeIds?.length ? offer.lessonTypeIds : [2],
          periodCount,
          periodType,
          lessonsCount: row.lessonsCount || offer?.lessonsCount,
        });
        if (skipExisting && /already|уже|duplicate|существ/i.test(made.ok ? "" : made.error)) {
          skipped.push({ id: row.customerId, name: row.name, reason: "уже есть" });
          continue;
        }
        if (!made.ok) {
          if (skipExisting) {
            try {
              const have = await request<{ items?: Record<string, unknown>[] }>(
                `/v2api/${row.branchId}/customer-tariff/index`,
                { page: 0, pageSize: 30, customer_id: row.customerId },
                t,
              ).catch(() => ({ items: [] as Record<string, unknown>[] }));
              const hit = (have.items || []).some((it) => Number(it.tariff_id || it.tariffId || 0) === row.tariffId && Number(it.removed || it.is_archived || 0) !== 1);
              if (hit) {
                skipped.push({ id: row.customerId, name: row.name, reason: "уже есть" });
                continue;
              }
            } catch {
              /* keep error */
            }
          }
          failed.push({ id: row.customerId, name: row.name, error: made.error });
          continue;
        }
        done.push(row.customerId);
      }
      logAdmin(`Мастер учеников: выдано ${done.length}, пропуск ${skipped.length}, ошибок ${failed.length}`);
      return { ok: true as const, done: done.length, skipped, failed, total: rows.length };
    }
    if (data.action === "voiceAsk") {
      const prompt = String(data.prompt || "").trim();
      if (!prompt) return { ok: false as const, error: "Пустой запрос." };
      try {
        const turn = await scheduleVoiceTurn(prompt, Array.isArray(data.ids) ? data.ids.map(String) : []);
        return { ok: true as const, ...turn };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Голосовой агент расписания не ответил." };
      }
    }
    if (data.action === "groupGet") {
      const { token, request } = await import("./alfacrm");
      const t = await token();
      const branch = Number(data.branchId) || 1;
      const gid = Number(data.groupId) || 0;
      if (!gid) return { ok: false as const, error: "Нет номера группы." };
      const slot = listAdminSlots().find((s) => s.groupId === gid && s.branchId === branch);
      const cached = !data.fresh ? loadGroupCard(branch, gid) : null;
      if (cached && (data.lite || cached.calendar?.length)) {
        return {
          ok: true as const,
          fromCache: true,
          subjects: subjectsWithHref(),
          levels: SEED_LEVELS,
          group: cached,
          ...groupTariffPack(slot),
        };
      }
      async function fetchGroupRow() {
        const byId = await request<{ items?: Record<string, unknown>[] }>(`/v2api/${branch}/group/index`, { id: gid, page: 0, pageSize: 1 }, t).catch(
          () => ({ items: [] as Record<string, unknown>[] }),
        );
        const hit = (byId.items || []).find((x) => Number(x.id) === gid);
        if (hit) return hit;
        const json = await request<{ items?: Record<string, unknown>[] }>(`/v2api/${branch}/group/index`, { page: 0, pageSize: 100 }, t);
        return (json.items || []).find((x) => Number(x.id) === gid) || null;
      }
      const g = await fetchGroupRow();
      if (!g) return { ok: false as const, error: "Группа не найдена в AlfaCRM." };
      if (data.lite) {
        const group = {
          id: gid,
          branchId: branch,
          name: String(g.name || slot?.groupName || ""),
          note: String(g.note || ""),
          description: String(g.note || slot?.description || slot?.groupNote || ""),
          remarks: slot?.remarks || "",
          hashtags: String(g.custom_hashtagkursa || slot?.hashtags || "").replace(/\s+/g, " ").trim(),
          makeup: String(g.custom_workingout || slot?.makeup || ""),
          statusId: Number(g.status_id || slot?.statusId || 0),
          bDate: String(g.b_date || slot?.bDate || ""),
          eDate: String(g.e_date || slot?.eDate || ""),
          levelId: Number(g.level_id || slot?.levelId || 0),
          priority: readPriority(g.custom_prioritet ?? slot?.priority),
          signup: slot?.signup || `https://studiyarazvivaysya.s20.online/common/${branch}/lead/create?gid=${gid}`,
          subjectId: Number(slot?.subjectId || g.subject_id || 0),
          subject: slot?.subject || "",
          calendar: cached?.calendar || [],
          at: new Date().toISOString(),
        };
        if (!cached) saveGroupCard(group);
        return {
          ok: true as const,
          fromCache: false,
          subjects: loadSubjects(),
          levels: SEED_LEVELS,
          group,
          ...groupTariffPack(slot),
        };
      }
      const byDate = new Map<string, GroupCalLesson>();
      try {
        const rooms = new Map<number, string>();
        const teachers = new Map<number, string>();
        const subjects = new Map<number, string>(loadSubjects().map((s) => [s.id, s.name]));
        try {
          const rm = await request<{ items?: { id?: number; name?: string; note?: string }[] }>(`/v2api/${branch}/room/index`, { page: 0, pageSize: 100 }, t);
          for (const x of rm.items || []) {
            const id = Number(x.id || 0);
            if (!id) continue;
            const name = String(x.name || "").trim();
            const note = String(x.note || "").split("|")[0].trim();
            rooms.set(id, note ? `${name} · ${note}` : name);
          }
        } catch { /* rooms optional */ }
        try {
          for (let page = 0; page < 4; page++) {
            const pack = await request<{ items?: { id?: number; name?: string }[] }>(`/v2api/${branch}/teacher/index`, { page, pageSize: 100 }, t);
            const chunk = pack.items || [];
            for (const x of chunk) if (x.id) teachers.set(Number(x.id), String(x.name || "").trim());
            if (chunk.length < 100) break;
          }
        } catch { /* teachers optional */ }
        const regs: {
          id?: number;
          related_id?: number;
          day?: number;
          time_from_v?: string;
          time_to_v?: string;
        }[] = [];
        for (let page = 0; page < 8; page++) {
          const pack = await request<{ items?: typeof regs }>(`/v2api/${branch}/regular-lesson/index`, { page, pageSize: 100 }, t);
          const chunk = pack.items || [];
          regs.push(...chunk);
          if (chunk.length < 100) break;
        }
        const mine = regs.filter((r) => Number(r.related_id) === gid);
        const groupName = String(g.name || slot?.groupName || "");
        const fallbackTeacher = String(slot?.teacher || "");
        const fallbackFrom = hm(mine[0]?.time_from_v) || String(slot?.timeFrom || "");
        const fallbackTo = hm(mine[0]?.time_to_v) || String(slot?.timeTo || "");
        const ctx = { rooms, teachers, subjects, groupName, fallbackFrom, fallbackTo, fallbackTeacher };
        async function pullLessons(extra: Record<string, unknown>) {
          for (const status of [1, 2, 3]) {
            for (let page = 0; page < 8; page++) {
              const les = await request<{ items?: Parameters<typeof packCrmLesson>[0][] }>(
                `/v2api/${branch}/lesson/index`,
                { page, pageSize: 100, status, ...extra },
                t,
              );
              const chunk = les.items || [];
              for (const item of chunk) {
                const gids = (item.group_ids || []).map(Number);
                if (gids.length && !gids.includes(gid)) continue;
                const packed = packCrmLesson(item, ctx);
                if (packed) byDate.set(packed.date, packed);
              }
              if (chunk.length < 100) break;
            }
          }
        }
        await pullLessons({ group_id: gid });
        if (!byDate.size) {
          for (const r of mine) {
            if (!r.id) continue;
            await pullLessons({ regular_id: r.id });
          }
        }
      } catch {
        /* календарь не должен ломать карточку */
      }
      const calendar = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
      rememberLessons(calendar);
      const levels = await fetchLevels(t, branch).catch(() => SEED_LEVELS);
      const group = {
          id: gid,
          branchId: branch,
          name: String(g.name || ""),
          note: String(g.note || ""),
          description: String(g.note || ""),
          remarks: slot?.remarks || "",
          hashtags: String(g.custom_hashtagkursa || "").replace(/\s+/g, " ").trim(),
          makeup: String(g.custom_workingout || ""),
          statusId: Number(g.status_id || 0),
          bDate: String(g.b_date || slot?.bDate || ""),
          eDate: String(g.e_date || slot?.eDate || ""),
          levelId: Number(g.level_id || slot?.levelId || 0),
          priority: readPriority(g.custom_prioritet ?? slot?.priority),
          signup: slot?.signup || `https://studiyarazvivaysya.s20.online/common/${branch}/lead/create?gid=${gid}`,
          subjectId: Number(slot?.subjectId || 0),
          subject: slot?.subject || "",
          calendar,
          at: new Date().toISOString(),
      };
      saveGroupCard(group);
      return {
        ok: true as const,
        fromCache: false,
        subjects: loadSubjects(),
        levels,
        group,
        ...groupTariffPack(slot),
      };
    }
    if (data.action === "groupSave") {
      const { token, request } = await import("./alfacrm");
      const t = await token();
      let branch = Number(data.branchId) || 1;
      let gid = Number(data.groupId) || 0;
      const slotId = String(data.ids?.[0] || "");
      const subjectId = Number(data.subjectId || 0);
      const description = String(data.description ?? data.note ?? "");
      const remarks = String(data.remarks || "");
      const hashtags = String(data.hashtags || "");
      const makeup = String(data.makeup || "");
      const statusId = Number(data.statusId || 0);
      const period = defaultPeriod(String(data.bDate || ""), String(data.eDate || ""));
      const bDate = String(data.bDate || "").trim() || period.bDate;
      const eDate = String(data.eDate || "").trim() || period.eDate;
      const levelId = Number(data.levelId || 0);
      const tariffId = Number(data.tariffId) || 0;
      const priority = readPriority(data.priority);
      if (!gid) {
        if (!slotId) return { ok: false as const, error: "Группа ещё без номера. Закройте карточку, отметьте строку и нажмите «Выгрузить в AlfaCRM» — или сохраните ещё раз, мы создадим её сами." };
        const current = listAdminSlots();
        const found = current.find((s) => s.id === slotId);
        if (!found) return { ok: false as const, error: "Группа не найдена в расписании на сайте." };
        const picked = subjectId || 0;
        if (!picked) {
          return { ok: false as const, error: "Выберите предмет филиала или нажмите «Создать предмет»." };
        }
        const patched = current.map((s) =>
          s.id === slotId
            ? {
                ...s,
                subjectId: picked || s.subjectId,
                statusId: statusId || s.statusId || 1,
                bDate: bDate || s.bDate,
                eDate: eDate || s.eDate,
                groupNote: description || s.groupNote,
                description,
                remarks,
                hashtags,
                makeup,
                levelId: levelId || s.levelId,
                priority,
              }
            : s,
        );
        const { results, slots: createdSlots } = await pushSlotsToCrm(patched, [slotId]);
        const r = results[0];
        saveAdminSlots(createdSlots);
        if (!r?.ok || !r.groupId) {
          return { ok: false as const, error: r?.error || "AlfaCRM не создала группу. Проверьте предмет, филиал и время занятий." };
        }
        gid = r.groupId;
        branch = createdSlots.find((s) => s.id === slotId)?.branchId || branch;
      }
      await request(`/v2api/${branch}/group/update`, {
        id: gid,
        note: description,
        status_id: statusId || undefined,
        custom_hashtagkursa: hashtags,
        custom_workingout: makeup,
        b_date: bDate,
        e_date: eDate,
        custom_prioritet: priority,
        ...(levelId ? { level_id: levelId } : { level_id: null }),
      }, t);
      const current = listAdminSlots();
      const subject = loadSubjects().find((x) => x.id === subjectId);
      const next = current.map((s) => {
        if (s.groupId !== gid || s.branchId !== branch) {
          if (slotId && s.id === slotId) {
            return {
              ...s,
              groupId: gid,
              groupNote: description,
              description,
              remarks,
              hashtags,
              makeup,
              statusId: statusId || s.statusId,
              bDate: bDate || s.bDate,
              eDate: eDate || s.eDate,
              levelId: levelId || s.levelId,
              tariffId,
              subjectId: subjectId || s.subjectId,
              subject: subject?.name || s.subject,
              signup: s.signup || `https://studiyarazvivaysya.s20.online/common/${branch}/lead/create?gid=${gid}`,
              priority,
            };
          }
          return s;
        }
        return {
          ...s,
          groupNote: description,
          description,
          remarks,
          hashtags,
          makeup,
          statusId: statusId || s.statusId,
          bDate: bDate || s.bDate,
          eDate: eDate || s.eDate,
          levelId: levelId || s.levelId,
          tariffId: tariffId || s.tariffId,
          subjectId: subjectId || s.subjectId,
          subject: subject?.name || s.subject,
          priority,
        };
      });
      if (subjectId) {
        const slot = next.find((s) => s.groupId === gid && s.branchId === branch) || next.find((s) => s.id === slotId);
        for (const b of (slot?.beats?.length ? slot.beats : slot ? [{ day: slot.day, timeFrom: slot.timeFrom, timeTo: slot.timeTo, lessonId: slot.lessonId }] : [])) {
          if (!b.lessonId) continue;
          await request(
            `/v2api/${branch}/regular-lesson/update?id=${b.lessonId}`,
            {
              id: b.lessonId,
              related_class: "Group",
              related_id: gid,
              subject_id: subjectId,
              day: b.day,
              days: [b.day],
              time_from_v: b.timeFrom,
              time_to_v: b.timeTo,
              b_date: isoish(bDate),
              e_date: isoish(eDate),
            },
            t,
          ).catch(() => null);
        }
      }
      const saved = saveAdminSlots(next).slots;
      const prev = loadGroupCard(branch, gid);
      if (prev) {
        saveGroupCard({
          ...prev,
          note: description,
          description,
          remarks,
          hashtags,
          makeup,
          statusId: statusId || prev.statusId,
          bDate: bDate || prev.bDate,
          eDate: eDate || prev.eDate,
          levelId: levelId || prev.levelId,
          subjectId: subjectId || prev.subjectId,
          subject: subject?.name || prev.subject,
        });
      }
      logAdmin(`Группа ${gid}: подробности сохранены в AlfaCRM`);
      return pack(saved, { groupId: gid });
    }
    if (data.action === "rollback" && data.at) {
      const prev = versionSlots(data.at);
      if (!prev) return { ok: false as const, error: "Снимок не найден." };
      const saved = saveAdminSlots(prev).slots;
      pushVersion(`Откат к ${data.at}`, saved);
      logAdmin("Расписание: откат версии");
      return pack(saved);
    }
    if (data.action === "tariffsGet") {
      try {
        const store = loadTariffs();
        return {
          ok: true as const,
          at: store.at,
          tariffs: store.items.map((t) => ({ ...t, groups: [] as { id: string; gid: number; name: string; branch: string; branchId: number; age: string; mins: number }[] })),
          lessonTypes: store.lessonTypes,
          branches: store.branches,
          subjects: subjectsWithHref(),
          tree: (await import("./site-tree")).loadSiteTree(),
          tariffMap: (await import("./tariff-map")).guessTariffLinks(store.items),
        };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Не удалось прочитать абонементы." };
      }
    }
    if (data.action === "tariffsPull") {
      try {
        const res = await pullTariffsFromCrm();
        const slots = listAdminSlots();
        const tariffs = res.items.map((t) => ({
          ...t,
          groups: tariffGroupHits(t, slots),
        }));
        logAdmin(`Абонементы из AlfaCRM: ${res.stats.active} активных, ${res.stats.withSubjects} с предметами`);
        return {
          ok: true as const,
          at: res.at,
          tariffs,
          lessonTypes: res.lessonTypes,
          branches: res.branches,
          subjects: subjectsWithHref(),
          stats: res.stats,
          tariffError: res.error || "",
        };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Не удалось загрузить абонементы." };
      }
    }
    if (data.action === "tariffsSave") {
      const list = Array.isArray(data.tariffs) ? data.tariffs : data.tariff ? [data.tariff] : [];
      if (!list.length) return { ok: false as const, error: "Нет абонементов для сохранения." };
      const store = saveTariffEdits(list);
      const slots = listAdminSlots();
      logAdmin(`Абонементы сохранены на сайте: ${list.length}`);
      return {
        ok: true as const,
        at: store.at,
        tariffs: store.items.map((t) => ({
          ...t,
          groups: tariffGroupHits(t, slots),
        })),
        lessonTypes: store.lessonTypes,
        branches: store.branches,
        subjects: loadSubjects(),
      };
    }
    if (data.action === "tariffsPush") {
      const list = Array.isArray(data.tariffs) && data.tariffs.length ? data.tariffs : data.tariff ? [data.tariff] : [];
      logAdmin(`Выгрузка абонементов в AlfaCRM: ${list.length} шт. ${list.map((t) => t.id).join(", ")}`);
      if (!list.length) return { ok: false as const, error: "Нет абонементов для выгрузки в AlfaCRM." };
      try {
        saveTariffEdits(list);
        const res = await pushTariffsToCrm(list);
        const store = loadTariffs();
        const slots = listAdminSlots();
        logAdmin(`Абонементы в AlfaCRM: ${res.pushed} ок, ${res.failed} сбоев`);
        return {
          ok: (res.failed === 0) as true,
          at: store.at,
          tariffs: store.items.map((t) => ({
            ...t,
            groups: tariffGroupHits(t, slots),
          })),
          lessonTypes: store.lessonTypes,
          branches: store.branches,
          subjects: subjectsWithHref(),
          pushed: res.pushed,
          failed: res.failed,
          error: res.error || undefined,
        };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Не удалось выгрузить абонементы." };
      }
    }
    if (data.action === "tariffsDelete") {
      const ids = (data.ids || []).map(Number).filter((n) => n);
      if (!ids.length) return { ok: false as const, error: "Отметьте абонементы для удаления." };
      try {
        const res = await archiveTariffsInCrm(ids);
        const store = loadTariffs();
        const slots = listAdminSlots();
        logAdmin(`Абонементы в архив CRM: ${ids.join(", ")}`);
        return {
          ok: res.ok as true,
          at: store.at,
          tariffs: store.items.map((t) => ({
            ...t,
            groups: tariffGroupHits(t, slots),
          })),
          lessonTypes: store.lessonTypes,
          branches: store.branches,
          subjects: subjectsWithHref(),
          error: res.ok ? undefined : "Часть абонементов CRM не архивировала.",
        };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Не удалось удалить абонементы." };
      }
    }
    if (data.action === "tariffsAiPreview") {
      const store = loadTariffs();
      const ids = (data.ids || []).map(Number).filter(Boolean);
      const preview = await aiTariffsParse(store.items, String(data.prompt || ""), ids);
      return { ok: true as const, ...preview };
    }
    if (data.action === "tariffsAiApply") {
      const store = loadTariffs();
      const changes = (data.changes || []).map((c) => ({ id: Number(c.id), field: c.field, from: "", to: String(c.to) }));
      const adds = Array.isArray(data.tariffs) ? data.tariffs : [];
      if (!changes.length && !adds.length) return { ok: false as const, error: "В предпросмотре нет правок." };
      const saved = applyTariffChanges(store.items, changes, adds);
      const slots = listAdminSlots();
      logAdmin(`Абонементы ИИ: ${changes.length} правок, ${adds.length} новых`);
      return {
        ok: true as const,
        at: saved.at,
        tariffs: saved.items.map((t) => ({
          ...t,
          groups: tariffGroupHits(t, slots),
        })),
        lessonTypes: saved.lessonTypes,
        branches: saved.branches,
        subjects: loadSubjects(),
      };
    }
    if (data.action === "tariffsProbe") {
      try {
        const probe = await probeCreateTariff();
        return { ok: probe.ok as true, probe };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Проверка абонемента не удалась." };
      }
    }
    if (data.action === "tariffsProbeDelete") {
      const id = Number(data.ids?.[0] || 0);
      const res = await probeDeleteTariff(id);
      return { ok: res.ok as true, error: res.error || undefined, probeDeleted: id };
    }
    if (data.action === "treeAddSchool") {
      const tree = addTreeSchool(String(data.label || data.text || ""), data.href);
      logAdmin(`Школа: ${data.label}`);
      return pack(listAdminSlots(), { tree });
    }
    if (data.action === "treeAddCourse") {
      const tree = addTreeCourse(String(data.schoolId || ""), String(data.label || data.text || ""), data.href, data.age);
      logAdmin(`Курс: ${data.label}`);
      return pack(listAdminSlots(), { tree });
    }
    if (data.action === "treeDeleteCourse") {
      const tree = deleteTreeCourse(String(data.courseId || data.ids?.[0] || ""));
      logAdmin("Курс удалён из структуры");
      return pack(listAdminSlots(), { tree });
    }
    if (data.action === "treeDeleteSchool") {
      const tree = deleteTreeSchool(String(data.schoolId || ""));
      logAdmin("Школа удалена из структуры");
      return pack(listAdminSlots(), { tree });
    }
    if (data.action === "treeDeleteSelected") {
      const courseIds = ((data as { courseIds?: string[] }).courseIds || []).filter((id) => id && !id.endsWith("#loose"));
      const schoolIds = ((data as { schoolIds?: string[] }).schoolIds || []).filter((id) => id && id !== "other");
      let tree = loadSiteTree();
      for (const id of courseIds) tree = deleteTreeCourse(id);
      for (const id of schoolIds) tree = deleteTreeSchool(id);
      const bits = [];
      if (schoolIds.length) bits.push(`школ ${schoolIds.length}`);
      if (courseIds.length) bits.push(`курсов ${courseIds.length}`);
      logAdmin(`Удалено из структуры: ${bits.join(", ") || "ничего"}`);
      return pack(listAdminSlots(), { tree });
    }
    if (data.action === "treeMove") {
      const ids = data.ids || [];
      const courseId = String(data.courseId || "");
      resetSlotCache();
      const moved = moveSlotsToCourse(listAdminSlots(), ids, courseId);
      const slots = saveAdminSlots(moved.slots).slots;
      g.__raGetPack = undefined;
      pushVersion("Группы перенесены в другой курс", slots);
      logAdmin(`Перенос ${ids.length} групп`);
      return pack(slots, { tree: moved.tree });
    }
    if (data.action === "publicSiteGet") {
      const tree = loadSiteTree();
      const slots = listAdminSlots();
      const { guessTariffLinks } = await import("./tariff-map");
      const { loadTariffs } = await import("./crm-tariffs");
      const { listTeachers } = await import("./crm-teachers");
      const tariffs = guessTariffLinks(loadTariffs().items);
      const teachers = listTeachers(slots);
      const schools = tree.schools.map((s) => {
        const courses = tree.courses.filter((c) => c.schoolId === s.id).map((c) => {
          const groups = slots.filter((g) => g.courseId === c.id);
          return {
            id: c.id,
            label: c.label,
            age: c.age,
            groups: groups.length,
            emptyTeacher: groups.filter((g) => !g.teacher).length,
            noPlaces: groups.filter((g) => !g.limit).length,
            tariffs: tariffs.filter((t) => t.courseId === c.id).map((t) => t.tariffId),
          };
        });
        return { id: s.id, label: s.label, courses };
      });
      const loose = slots.filter((g) => !g.courseId).map((g) => ({
        id: g.id,
        groupId: g.groupId,
        name: g.groupName,
        branchId: g.branchId,
      }));
      return {
        ok: true as const,
        schools,
        loose,
        teachers: teachers.map((t) => ({ id: t.id, name: t.name })),
        stats: {
          schools: tree.schools.length,
          courses: tree.courses.length,
          groups: slots.length,
          loose: loose.length,
          tariffs: tariffs.filter((t) => t.courseId).length,
          teachers: teachers.length,
        },
        signup: (await import("./site-signup")).loadSiteSignup(),
      };
    }
    if (data.action === "publicSiteSave") {
      const { saveSiteSignup } = await import("./site-signup");
      const raw = (data as { signup?: import("./site-signup-core").SiteSignup }).signup;
      if (!raw) return { ok: false as const, error: "Нет настроек сайта." };
      const signup = saveSiteSignup(raw);
      logAdmin(`Сайт: пробное ${signup.trialOn ? "вкл" : "выкл"}, запись в группу ${signup.groupOn ? "вкл" : "выкл"}`);
      return { ok: true as const, signup };
    }
    if (data.action === "groupFlags") {
      const { token, request } = await import("./alfacrm");
      const t = await token();
      const branch = Number(data.branchId) || 1;
      const gid = Number(data.groupId) || 0;
      if (!gid) return { ok: false as const, error: "Нет номера группы." };
      const body: Record<string, unknown> = { id: gid };
      if (data.statusId != null) body.status_id = Number(data.statusId);
      if (data.priority != null) body.custom_prioritet = readPriority(data.priority);
      if (Object.keys(body).length < 2) return { ok: false as const, error: "Нечего сохранять." };
      await request(`/v2api/${branch}/group/update`, body, t);
      const slots = listAdminSlots().map((s) => {
        if (s.groupId !== gid || s.branchId !== branch) return s;
        return {
          ...s,
          ...(data.statusId != null ? { statusId: Number(data.statusId) } : {}),
          ...(data.priority != null ? { priority: readPriority(data.priority) } : {}),
        };
      });
      saveAdminSlots(slots);
      return { ok: true as const, slots };
    }
    return { ok: false as const, error: "Неизвестное действие." };
  });
