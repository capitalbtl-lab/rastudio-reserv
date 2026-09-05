import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { logAdmin } from "./admin-settings";
import { loadScheduleSettings, saveScheduleSettings, markLastPull } from "./schedule-settings";
import {
  crmScheduleMeta,
  listAdminSlots,
  refreshCrmSchedule,
  saveAdminSlots,
  bumpGroupTaken,
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
import { loadSubjects, saveSubjects, pullSubjectsFromCrm, pushSubjectsToCrm, createLocalSubject } from "./crm-subjects";
import type { GroupCalLesson } from "./crm-slots-core";
import { beatsOf } from "./crm-slots-core";
import { rememberLessons } from "./crm-lessons";
import { loadGroupCard, saveGroupCard, nextLocalLessonId, upsertGroupCalendar, mergeLocalCalendar } from "./group-cards";
import { scheduleVoiceTurn } from "./schedule-voice";
import { loadSiteTree, addTreeSchool, addTreeCourse, deleteTreeCourse, deleteTreeSchool, moveSlotsToCourse, saveSiteTree, slotTreeKey } from "./site-tree";
import { listTeachers, teachersAtBranch, mergeTeacher, saveTeachers, loadTeachers } from "./crm-teachers";
import { searchClientViews, findDossier, upsertDossier, applyCrmCustomer } from "./dossiers";
import { isPhoneLike } from "./client-display";
import { clientCardId, CRM_BRANCH } from "./ids";
import { trialLocalId } from "./trial-disk";
import { formatRuPhone } from "./ru-phone";
import { loadTariffs, pullTariffsFromCrm, matchTariffs, groupTariffPack, subjectTariffStats, saveTariffEdits, pushTariffsToCrm, archiveTariffsInCrm, aiTariffsParse, applyTariffChanges, probeCreateTariff, probeDeleteTariff, subjectsWithHref, tariffGroupHits, courseSubjectIndex } from "./crm-tariffs";
import { loadScheduleMap } from "./schedule-map";
import { packSubjectRows, bindSubjectCourse } from "./subject-admin";
import { isAdminGroup, readPriority, crmPriorityOf } from "./group-status";

function isoish(raw: string) {
  const s = String(raw || "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (ru) return `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}`;
  return s;
}

function crmGroupSubjectId(g: Record<string, unknown> | null | undefined) {
  if (!g) return 0;
  const one = Number(g.subject_id || 0);
  if (one) return one;
  const arr = Array.isArray(g.subject_ids) ? g.subject_ids : [];
  for (const x of arr) {
    const n = Number(x);
    if (n) return n;
  }
  return 0;
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

const PEOPLE_TTL_MS = 12 * 60 * 1000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type PeopleBag = {
  at: number;
  cgi: Map<number, number[]>;
  cgiBranch: Map<number, number>;
  customer: Map<number, Record<string, unknown>>;
};

function peopleSlot() {
  return globalThis as { __raPeople?: PeopleBag };
}

async function pagedCrm(
  request: typeof import("./alfacrm").request,
  t: string,
  path: string,
  body: Record<string, unknown>,
) {
  const { CRM_READ_GAP_MS } = await import("./pupil-tariffs");
  const items: Record<string, unknown>[] = [];
  for (let page = 0; page < 40; page += 1) {
    if (page) await sleep(CRM_READ_GAP_MS);
    const res = await request<{ items?: Record<string, unknown>[]; total?: number }>(path, { page, pageSize: 200, ...body }, t).catch(
      () => ({ items: [] as Record<string, unknown>[] }),
    );
    const batch = res.items || [];
    items.push(...batch);
    const total = Number(res.total || 0);
    if (batch.length < 200 || (total > 0 && items.length >= total)) break;
  }
  return items;
}

async function loadPeopleBag(
  request: typeof import("./alfacrm").request,
  t: string,
): Promise<PeopleBag> {
  const slot = peopleSlot();
  if (slot.__raPeople && Date.now() - slot.__raPeople.at < PEOPLE_TTL_MS) {
    return slot.__raPeople;
  }
  const { cgiCustomerId, CRM_READ_GAP_MS } = await import("./pupil-tariffs");
  const cgi = new Map<number, number[]>();
  const cgiBranch = new Map<number, number>();
  const customer = new Map<number, Record<string, unknown>>();
  function addCgi(gid: number, cid: number, branch: number) {
    if (!gid || !cid) return;
    const list = cgi.get(gid) || [];
    if (!list.includes(cid)) list.push(cid);
    cgi.set(gid, list);
    if (!cgiBranch.has(gid)) cgiBranch.set(gid, branch);
  }
  for (const branch of [1, 2, 3, 4]) {
    await sleep(CRM_READ_GAP_MS);
    const rows = await pagedCrm(request, t, `/v2api/${branch}/cgi/index`, {});
    for (const it of rows) {
      if (Number(it.removed || it.is_removed || 0)) continue;
      const rec = it as { group?: { id?: number } };
      const gid = Number(it.group_id || it.groupId || rec.group?.id || 0);
      addCgi(gid, cgiCustomerId(it), branch);
    }
    for (const study of [1, 0] as const) {
      await sleep(CRM_READ_GAP_MS);
      const people = await pagedCrm(request, t, `/v2api/${branch}/customer/index`, { is_study: study, removed: 0 });
      for (const c of people) {
        const id = Number(c.id || 0);
        if (id && !customer.has(id)) customer.set(id, c);
      }
    }
  }
  const bag = { at: Date.now(), cgi, cgiBranch, customer };
  slot.__raPeople = bag;
  return bag;
}

function packPupilGroups(groups: import("./pupil-tariffs").PupilGroup[]) {
  const sorted = [...groups].sort(
    (a, b) =>
      Number(b.taken > 0) - Number(a.taken > 0) ||
      a.school.localeCompare(b.school, "ru") ||
      a.name.localeCompare(b.name, "ru"),
  );
  const schools = [...new Set(sorted.map((g) => g.school).filter(Boolean))];
  const unbound = sorted.filter((g) => g.school === "Без школы на сайте").length;
  const byBranch: Record<number, { total: number; withPeople: number; kids: number }> = {};
  for (const g of sorted) {
    const b = byBranch[g.branchId] || { total: 0, withPeople: 0, kids: 0 };
    b.total += 1;
    if (g.taken > 0) b.withPeople += 1;
    b.kids += Number(g.taken) || 0;
    byBranch[g.branchId] = b;
  }
  return {
    ok: true as const,
    groups: sorted,
    schools,
    unbound,
    byBranch,
    withPeople: sorted.filter((g) => g.taken > 0).length,
    kids: sorted.reduce((n, g) => n + (Number(g.taken) || 0), 0),
  };
}

async function membersFromDisk(branch: number, gid: number): Promise<{ active: GroupMember[]; archive: GroupMember[] }> {
  const { dossiersInGroup } = await import("./dossiers");
  const active: GroupMember[] = [];
  const archive: GroupMember[] = [];
  const seen = new Set<number>();
  for (const d of dossiersInGroup(branch, gid)) {
    const id = Number(d.crmId || 0);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const hit = (d.groupLinks || []).find((g) => g.id === gid);
    const study = Number(d.extras?.is_study);
    const archived = hit?.active === false || study === 2 || d.status === "архив";
    const dob = String(d.child.dob || "");
    const phones = (d.phones || []).filter(Boolean);
    const row: GroupMember = {
      id,
      name: d.child.fio || "",
      parent: d.parent.fio || "",
      dob,
      age: ageLabel(dob),
      phone: phones[0] || "",
      phones,
      email: "",
      gender: d.child.gender || "",
      from: "",
      to: "",
      archived,
      status: archived ? "архив" : study === 0 || d.status === "лид" ? "лид" : "учится",
    };
    if (archived) archive.push(row);
    else active.push(row);
  }
  return { active, archive };
}

async function loadGroupMembers(
  request: typeof import("./alfacrm").request,
  t: string,
  branch: number,
  gid: number,
  opts?: { skipArchive?: boolean; fresh?: boolean },
) {
  return pullGroupMembersCrm(request, t, branch, gid, opts);
}

async function pullGroupMembersCrm(
  request: typeof import("./alfacrm").request,
  t: string,
  branch: number,
  gid: number,
  opts?: { skipArchive?: boolean },
) {
  const seen = new Set<number>();
  const active: GroupMember[] = [];
  const archive: GroupMember[] = [];
  function take(c: Record<string, unknown>, forceArchive = false) {
    const id = Number(c.id || 0);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const m = packMember(c, forceArchive);
    if (m.archived) archive.push(m);
    else active.push(m);
  }
  const { cgiCustomerId, CRM_READ_GAP_MS } = await import("./pupil-tariffs");
  const cgiIds: number[] = [];
  for (let page = 0; page < 5; page += 1) {
    if (page) await sleep(CRM_READ_GAP_MS);
    const json = await request<{ items?: Record<string, unknown>[] }>(
      `/v2api/${branch}/cgi/index?group_id=${gid}`,
      { page, pageSize: 50, group_id: gid },
      t,
    ).catch(() => ({ items: [] as Record<string, unknown>[] }));
    const batch = json.items || [];
    for (const it of batch) {
      const id = cgiCustomerId(it);
      if (id && !cgiIds.includes(id) && !Number(it.removed || it.is_removed || 0)) cgiIds.push(id);
    }
    if (batch.length < 50) break;
  }
  async function pull(extra: Record<string, unknown>, forceArchive = false) {
    for (let page = 0; page < 3; page += 1) {
      const json = await request<{ items?: Record<string, unknown>[] }>(
        `/v2api/${branch}/customer/index`,
        { page, pageSize: 50, group_id: gid, ...extra },
        t,
      ).catch(() => ({ items: [] as Record<string, unknown>[] }));
      const items = json.items || [];
      for (const c of items) take(c, forceArchive);
      if (items.length < 50) break;
    }
  }
  await pull({});
  if (!active.some((m) => m.status === "лид")) await pull({ is_study: 0 });
  if (!opts?.skipArchive && !archive.length) await pull({ is_study: 2 }, true);
  const missing = cgiIds.filter((id) => !seen.has(id));
  for (let i = 0; i < missing.length; i += 3) {
    if (i) await sleep(CRM_READ_GAP_MS);
    await Promise.all(
      missing.slice(i, i + 3).map(async (id) => {
        const json = await request<{ items?: Record<string, unknown>[] }>(
          `/v2api/${branch}/customer/index`,
          { page: 0, pageSize: 5, id },
          t,
        ).catch(() => ({ items: [] as Record<string, unknown>[] }));
        const c = (json.items || []).find((x) => Number(x.id) === id) || { id, name: `ученик ${id}`, is_study: 1 };
        take(c);
      }),
    );
  }
  if (!active.length && cgiIds.length) {
    for (const id of cgiIds) take({ id, name: `ученик ${id}`, is_study: 1 });
  }
  return { active, archive };
}

async function loadBranchActiveTariffs(
  request: typeof import("./alfacrm").request,
  t: string,
  branch: number,
  catalog?: { id: number; name: string; archive?: boolean; price?: number }[],
  _opts?: { fresh?: boolean },
) {
  const { pagedIndex } = await import("./alfacrm");
  const { customerTariffIndexBranchPath, splitCustomerTariffs } = await import("./pupil-tariffs");
  const items: Record<string, unknown>[] = [];
  await pagedIndex(
    customerTariffIndexBranchPath(branch),
    {},
    t,
    (it: Record<string, unknown>) => items.push(it),
    { pageSize: 100, pages: 16 },
  );
  return splitCustomerTariffs(items, catalog);
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
  const { customerTariffPayload, customerTariffCreatePath } = await import("./pupil-tariffs");
  const customerId = Number(opts.customerId) || 0;
  const tariffId = Number(opts.tariffId) || 0;
  const branch = Number(opts.branch) || 1;
  if (!customerId) return { ok: false as const, error: "Нет customer_id ученика." };
  if (!tariffId) return { ok: false as const, error: "Выберите абонемент." };
  if (!String(opts.bDate || "").trim()) return { ok: false as const, error: "Нет даты начала абонемента." };
  const full = customerTariffPayload(opts);
  const tries: Record<string, unknown>[] = [
    full,
    { ...full, is_separate_balance: 1, calculation_type: 2 },
    { ...full, is_separate_balance: 0, calculation_type: 1 },
  ];
  let last = "";
  for (const body of tries) {
    if (body.customer_id == null || body.customer_id === "" || Number(body.customer_id) === 0) continue;
    try {
      const res = await request<{ success?: boolean; errors?: unknown }>(customerTariffCreatePath(branch, customerId), body, t);
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
const teacherCache = new Map<number, { at: number; items: { id: number; name: string }[] }>();

async function roomsOfBranch(request: typeof import("./alfacrm").request, t: string, branch: number) {
  const hit = roomCache.get(branch);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.items;
  try {
    const { roomsOfBranchList } = await import("./crm-rooms");
    const rm = await request<{ items?: Record<string, unknown>[] }>(`/v2api/${branch}/room/index`, { page: 0, pageSize: 100 }, t);
    const items = roomsOfBranchList(rm.items || [], branch);
    roomCache.set(branch, { at: Date.now(), items });
    return items;
  } catch {
    return hit?.items || [];
  }
}

async function teachersOfBranch(request: typeof import("./alfacrm").request, t: string, branch: number) {
  const hit = teacherCache.get(branch);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.items;
  const items: { id: number; name: string }[] = [];
  const seen = new Set<number>();
  try {
    for (let page = 0; page < 2; page++) {
      const pack = await request<{ items?: { id?: number; name?: string }[] }>(`/v2api/${branch}/teacher/index`, { page, pageSize: 200 }, t);
      const chunk = pack.items || [];
      for (const x of chunk) {
        const id = Number(x.id || 0);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        items.push({ id, name: String(x.name || "").trim() || `педагог ${id}` });
      }
      if (chunk.length < 100) break;
    }
    items.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    teacherCache.set(branch, { at: Date.now(), items });
    const bag = loadTeachers();
    for (const x of items) mergeTeacher(bag, x.id, x.name, branch);
    saveTeachers(bag);
    return items;
  } catch {
    return hit?.items || teachersAtBranch(branch, listTeachers(listAdminSlots())).map((x) => ({ id: x.id, name: x.name }));
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

async function cgiAndLessonGroups(
  request: typeof import("./alfacrm").request,
  t: string,
  branch: number,
  customerId: number,
) {
  const { cgiCustomerId } = await import("./pupil-tariffs");
  const out: { id: number; name: string; branchId: number }[] = [];
  const seen = new Set<number>();
  const branches = [branch, 1, 2, 3, 4].filter((b, i, a) => b > 0 && a.indexOf(b) === i);
  for (const b of branches) {
    try {
      const json = await request<{ items?: Record<string, unknown>[] }>(
        `/v2api/${b}/cgi/index?customer_id=${customerId}`,
        { page: 0, pageSize: 80, customer_id: customerId },
        t,
      );
      for (const it of json.items || []) {
        if (Number(it.removed || it.is_removed || 0) === 1) continue;
        const cid = cgiCustomerId(it);
        if (cid && cid !== customerId) continue;
        const rec = it as { group?: { id?: number; name?: string } };
        const gid = Number(it.group_id || it.groupId || rec.group?.id || 0);
        if (!gid || seen.has(gid)) continue;
        seen.add(gid);
        out.push({ id: gid, name: String(it.group_name || rec.group?.name || ""), branchId: b });
      }
    } catch {
      /* next branch */
    }
    if (out.length) break;
  }
  return out;
}

async function setGroupMembership(
  request: <T = { success?: boolean; errors?: unknown }>(path: string, body: unknown, t?: string) => Promise<T>,
  t: string,
  opts: { customerId: number; groupId: number; branch: number; drop: boolean; bDate?: string; eDate?: string; current?: Record<string, unknown> },
) {
  const ids = new Set(groupIdsFromCustomer(opts.current || {}));
  if (!opts.drop && ids.has(opts.groupId)) return { ok: true as const, already: true };
  if (opts.drop) ids.delete(opts.groupId);
  else ids.add(opts.groupId);
  const next = [...ids];
  const period: Record<string, unknown> = {};
  if (!opts.drop) {
    if (opts.bDate) period.b_date = opts.bDate;
    if (opts.eDate) period.e_date = opts.eDate;
  }
  const tries: [string, Record<string, unknown>][] = [
    [`/v2api/${opts.branch}/customer/update?id=${opts.customerId}`, { id: opts.customerId, group_ids: next, ...period }],
  ];
  if (!opts.drop) {
    tries.push([`/v2api/${opts.branch}/customer/update?id=${opts.customerId}`, { id: opts.customerId, group_ids: next, is_study: 1, ...period }]);
  } else {
    tries.push([`/v2api/${opts.branch}/customer/update?id=${opts.customerId}`, { id: opts.customerId, group_ids: next, groups: next }]);
  }
  try {
    const les = await request(
      `/v2api/${opts.branch}/regular-lesson/index`,
      { page: 0, pageSize: 20, group_id: opts.groupId },
      t,
    ) as { items?: Record<string, unknown>[] };
    for (const it of les.items || []) {
      const lid = Number(it.id || 0);
      if (!lid) continue;
      const cids = Array.isArray(it.customer_ids) ? it.customer_ids.map(Number).filter(Boolean) : [];
      if (opts.drop && cids.includes(opts.customerId)) {
        tries.push([`/v2api/${opts.branch}/regular-lesson/update?id=${lid}`, { id: lid, customer_ids: cids.filter((x) => x !== opts.customerId) }]);
      } else if (!opts.drop && !cids.includes(opts.customerId)) {
        tries.push([`/v2api/${opts.branch}/regular-lesson/update?id=${lid}`, { id: lid, customer_ids: [...cids, opts.customerId] }]);
      }
    }
  } catch {
    /* fallback customer/update only */
  }
  let last = "";
  let ok = false;
  for (const [path, body] of tries) {
    try {
      const res = await request(path, body, t);
      if (res.success === false) {
        last = JSON.stringify(res.errors || res);
        continue;
      }
      ok = true;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  if (!ok) return { ok: false as const, error: last || (opts.drop ? "AlfaCRM не сняла с группы." : "AlfaCRM не добавила в группу.") };
  return { ok: true as const, already: false };
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
  const { activeGroupsForCard } = await import("./crm-membership");
  const { mergeCgiGroupLinks } = await import("./crm-group-disk");
  const cgiGroups = await cgiAndLessonGroups(request, t, useBranch, customerId);
  const linked = activeGroupsForCard({
    cgi: cgiGroups.map((g) => ({ id: g.id, name: g.name, branchId: g.branchId })),
    dossier: fromDossier,
  });
  const packedGroups = linked.map((g) => {
    const packed = packGroupLink(g.id, g.branchId, g.name || "", g.active);
    return {
      ...packed,
      school: g.school || packed.school,
      subjectId: g.subjectId || packed.subjectId,
      courseId: g.courseId || packed.courseId,
    };
  });
  const days = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const slots = listAdminSlots();
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
    const { customerTariffLabel, customerTariffOnCard } = await import("./pupil-tariffs");
    const catalogTariffs = loadTariffs().items.map((x) => ({ id: x.id, name: x.name, archive: x.archive, price: x.price }));
    const json = await request<{ items?: Record<string, unknown>[] }>(
      `/v2api/${useBranch}/customer-tariff/index?customer_id=${customerId}`,
      { page: 0, pageSize: 40, customer_id: customerId },
      t,
    );
    for (const it of json.items || []) {
      const nested = it.tariff && typeof it.tariff === "object" ? (it.tariff as Record<string, unknown>) : {};
      const tariffId = Number(it.tariff_id || it.tariffId || nested.id || 0);
      tariffs.push({
        id: Number(it.id || 0),
        tariffId,
        name: customerTariffLabel({ ...it, tariff_id: tariffId, tariff_name: it.tariff_name || nested.name }, catalogTariffs),
        rest: Number(it.balance ?? it.rest ?? it.paid ?? 0),
        lessons: Number(it.lessons_count ?? it.paid_count ?? it.lesson_count ?? nested.lessons_count ?? 0),
        archived: !customerTariffOnCard(it),
        bDate: String(it.b_date || it.bDate || ""),
        eDate: String(it.e_date || it.eDate || ""),
        price: Number(nested.price ?? it.price ?? 0),
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
  if (cgiGroups.length) {
    upsertDossier({
      crmId: customerId,
      branchId: useBranch,
      groupLinks: mergeCgiGroupLinks(
        fromDossier,
        packedGroups.map((g) => ({
          id: g.id,
          name: g.name,
          branchId: g.branchId,
          school: g.school || "",
          active: true,
          subjectId: g.subjectId,
          courseId: g.courseId,
        })),
      ),
      source: "alfacrm",
      crmWins: true,
    });
  }
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

function addMins(from: string, mins: number) {
  const m = String(from || "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return "";
  const n = Number(m[1]) * 60 + Number(m[2]) + (Number(mins) || 0);
  const wrap = ((n % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(wrap / 60)).padStart(2, "0")}:${String(wrap % 60).padStart(2, "0")}`;
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
    note?: string | null;
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
    note: String(item.note || "").trim(),
    attend,
    total,
    lessonId: Number(item.id || 0) || undefined,
    roomId: Number(item.room_id || 0) || undefined,
    teacherIds: (item.teacher_ids || []).map(Number).filter((n) => n > 0),
    subjectId: Number(item.subject_id || 0) || undefined,
    groupIds: (item.group_ids || []).map(Number).filter((n) => n > 0),
    customerIds: (item.customer_ids || []).map(Number).filter((n) => n > 0),
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
          | "customerCreate"
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
          | "lessonGet"
          | "lessonSave"
          | "lessonStatus"
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
          | "pupilTariffCounts"
          | "pupilTariffPlan"
          | "pupilTariffActive"
          | "pupilTariffAssign"
          | "pupilTariffClear"
          | "clientsLiveTariffs"
          | "cachePolicyGet"
          | "cachePolicySave"
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
        parent?: string;
        phone?: string;
        description?: string;
        remarks?: string;
        bDate?: string;
        eDate?: string;
        levelId?: number;
        priority?: number;
        limit?: number;
        groupName?: string;
        teacher?: string;
        teacherIds?: number[];
        tariff?: import("./crm-tariffs").CrmTariff;
        tariffs?: import("./crm-tariffs").CrmTariff[];
        pullN?: number;
        pullUnit?: "min" | "hour" | "day" | "week";
        schoolId?: string;
        courseId?: string;
        funnelAuto?: import("./funnel-auto").FunnelAuto;
        offset?: number;
        take?: number;
        force?: boolean;
        cachePolicy?: import("./crm-cache-policy").CachePolicy;
        groupKeys?: { branchId: number; groupId: number }[];
        pupilItems?: import("./pupil-tariffs").PupilTariffItem[];
        includeLeads?: boolean;
        skipExisting?: boolean;
        onlyActive?: boolean;
        mode?: "create" | "close" | "delete";
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
        customerIds?: number[];
        groupIds?: number[];
        timeTo?: string;
        lessonId?: number;
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
      const flagChanges = allowed.filter((c) => c.field === "priority" || c.field === "statusId");
      if (flagChanges.length) {
        const { enqueueExport } = await import("./crm-export-queue");
        const byGroup = new Map<string, { branchId: number; entityId: number; body: Record<string, unknown> }>();
        for (const c of flagChanges) {
          const s = next.find((x) => x.id === c.id);
          if (!s?.groupId) continue;
          const key = `${s.branchId || 1}:${s.groupId}`;
          const cur = byGroup.get(key) || { branchId: s.branchId || 1, entityId: s.groupId, body: {} };
          if (c.field === "priority") cur.body.custom_prioritet = readPriority(c.to);
          if (c.field === "statusId") cur.body.status_id = Number(c.to);
          byGroup.set(key, cur);
        }
        for (const job of byGroup.values()) {
          enqueueExport({ op: "group.update", branchId: job.branchId, entityId: job.entityId, body: job.body });
        }
      }
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
      const branch = Number(data.branchId) || 1;
      const gid = Number(data.groupId) || 0;
      if (!gid) return { ok: true as const, names: [] as string[] };
      const { dossiersInGroup } = await import("./dossiers");
      const names = dossiersInGroup(branch, gid)
        .filter((d) => Number(d.extras?.is_study) !== 2)
        .map((d) => String(d.child?.fio || d.parent?.fio || "").trim())
        .filter(Boolean);
      return { ok: true as const, fromCache: true, names };
    }
    if (data.action === "groupMembers") {
      const branch = Number(data.branchId) || 1;
      const gid = Number(data.groupId) || 0;
      if (!gid) return { ok: true as const, names: [] as string[], active: [] as GroupMember[], archive: [] as GroupMember[] };
      const disk = await membersFromDisk(branch, gid);
      const slot = listAdminSlots().find((s) => s.groupId === gid && s.branchId === branch) || listAdminSlots().find((s) => s.groupId === gid);
      const taken = Number(slot?.taken) || 0;
      const { overlayCgiNeeded } = await import("./crm-group-disk");
      if (!data.diskOnly && overlayCgiNeeded(disk.active.length, taken) && !data.fresh) {
        void import("./crm-packet-queue").then((q) => {
          q.enqueueGroupPacket(branch, gid, slot?.groupName);
          void q.tickCrmQueue(1);
        });
      }
      return {
        ok: true as const,
        fromCache: true,
        names: disk.active.map((m) => m.name).filter(Boolean),
        active: disk.active,
        archive: disk.archive,
      };
    }
    if (data.action === "customerGet") {
      const branch = Number(data.branchId) || 1;
      const customerId = Number(data.customerId) || 0;
      if (!customerId) return { ok: false as const, error: "Нет номера ученика." };
      const d = findDossier({ crmId: customerId });
      if (d && !data.fresh) {
        const { cardFromDossier } = await import("./customer-card-disk");
        return { ok: true as const, fromCache: true, customer: cardFromDossier(d, branch) };
      }
      if (!d && customerId < 0) return { ok: false as const, error: "Ученик не найден на сайте." };
      const { token, request } = await import("./alfacrm");
      const t = await token();
      const customer = await loadCustomerCard(request, t, branch, customerId);
      if (!customer) return { ok: false as const, error: "Ученик не найден в AlfaCRM." };
      return { ok: true as const, customer };
    }
    if (data.action === "customerSave") {
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
      const { upsertDossier, findDossier } = await import("./dossiers");
      const study = data.isStudy === 0 || data.isStudy === 1 || data.isStudy === 2 ? data.isStudy : undefined;
      const saved = upsertDossier({
        crmId: customerId,
        branchId: branch,
        child: patch.name ? String(patch.name) : undefined,
        parent: patch.parent ? String(patch.parent) : undefined,
        phone: patch.phone ? String(patch.phone) : undefined,
        dob: patch.dob ? String(patch.dob) : undefined,
        address: patch.address ? String(patch.address) : undefined,
        status: study === 0 ? "лид" : study === 2 ? "архив" : study === 1 ? "учится" : undefined,
        extras: {
          ...(study != null ? { is_study: String(study) } : {}),
          ...(Number(data.studyStatusId) > 0 ? { study_status_id: String(data.studyStatusId) } : {}),
        },
        source: "admin",
      });
      const { enqueueExport } = await import("./crm-export-queue");
      if (customerId < 0) {
        const phone = patch.phone ? formatRuPhone(String(patch.phone)) : saved.phones?.[0] || "";
        enqueueExport({
          op: "customer.create",
          branchId: branch,
          entityId: customerId,
          body: {
            name: saved.child.fio || String(patch.name || ""),
            legal_name: saved.parent.fio || String(patch.parent || ""),
            legal_type: 1,
            ...(phone ? { phone: [phone] } : {}),
            ...(saved.child.dob ? { dob: saved.child.dob } : {}),
            is_study: study == null ? Number(saved.extras?.is_study) || 1 : study,
            branch_ids: [branch],
            localId: customerId,
          },
        });
      } else {
        enqueueExport({ op: "customer.update", branchId: branch, entityId: customerId, body });
      }
      logAdmin(`Клиент ${customerId}: на сайте, выгрузка в очередь`);
      const d = findDossier({ crmId: customerId }) || saved;
      const st = Number(d.extras?.is_study);
      return {
        ok: true as const,
        queued: true,
        customer: {
          id: customerId,
          cardId: clientCardId(customerId),
          branchId: Number(d.branchId || branch),
          name: d.child.fio || String(patch.name || ""),
          parent: d.parent.fio || String(patch.parent || ""),
          dob: d.child.dob || "",
          age: ageLabel(d.child.dob || ""),
          gender: d.child.gender || "",
          phones: d.phones || [],
          emails: patch.email ? [String(patch.email)] : [],
          address: d.address || "",
          status: d.status || "",
          isStudy: Number.isFinite(st) ? st : study,
          studyStatusId: Number(data.studyStatusId) || Number(d.extras?.study_status_id) || undefined,
          note: String(patch.note || ""),
          paidTill: "",
          url: d.url || "",
          schools: d.schools || [],
          groups: (d.groupLinks || []).map((g) => ({
            id: g.id,
            name: g.name,
            branchId: g.branchId,
            school: g.school,
            active: g.active,
            subjectId: g.subjectId,
            courseId: g.courseId,
          })),
          comms: [] as CustomerComm[],
        },
      };
    }
    if (data.action === "customerLesson") {
      const { resolveLessonType, formatRuDob } = await import("./alfacrm");
      const { enqueueExport } = await import("./crm-export-queue");
      const branch = Number(data.branchId) || 1;
      const customerId = Number(data.customerId) || 0;
      if (!customerId) return { ok: false as const, error: "Нет customerId." };
      const d = findDossier({ crmId: customerId });
      const wantedGid = Number(data.groupId) || 0;
      const link = (d?.groupLinks || []).find((x) => x.id === wantedGid) || (d?.groupLinks || []).find((x) => x.active !== false);
      const gid = wantedGid || Number(link?.id) || 0;
      const slot = gid
        ? listAdminSlots().find((s) => s.groupId === gid && s.branchId === branch) || listAdminSlots().find((s) => s.groupId === gid)
        : undefined;
      const type = resolveLessonType(String(data.lessonType || "trial")) || resolveLessonType("trial")!;
      const subjectId = Number(data.subjectId) || Number(slot?.subjectId) || Number(link?.subjectId) || 0;
      if (!subjectId) return { ok: false as const, error: "Нет subjectId у группы клиента — выберите группу." };
      const date = formatRuDob(data.date) || (() => {
        const now = new Date();
        return `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
      })();
      const time = String(data.time || slot?.timeFrom || "16:00").replace(".", ":").slice(0, 5);
      const duration = Number(data.duration) || 90;
      const to = String(data.timeTo || "").slice(0, 5) || addMins(time, duration);
      const teacherId = Number(data.teacherId) || Number(slot?.teacherId) || 0;
      const roomId = Number(data.roomId) || 0;
      const localId = nextLocalLessonId();
      const dateIso = isoish(date);
      const useBranch = Number(slot?.branchId || branch);
      if (gid) {
        upsertGroupCalendar(
          useBranch,
          gid,
          {
            date: dateIso,
            from: time,
            to,
            status: 1,
            type: type.name,
            typeId: type.id,
            duration,
            subjectId,
            teacherIds: teacherId ? [teacherId] : [],
            roomId: roomId || undefined,
            groupIds: [gid],
            customerIds: [customerId],
            topic: String(data.topic || ""),
            note: String(data.note || `${type.name} с сайта rastudio.org`),
            lessonId: localId,
          },
          { name: slot?.groupName, subjectId: slot?.subjectId, subject: slot?.subject },
        );
      }
      enqueueExport({
        op: "lesson.create",
        branchId: useBranch,
        entityId: localId,
        body: {
          localId,
          lesson_type_id: type.id,
          lesson_date: date,
          time_from: time,
          time_to: to,
          duration,
          subject_id: subjectId,
          customer_ids: [customerId],
          ...(gid ? { group_ids: [gid] } : {}),
          ...(teacherId ? { teacher_ids: [teacherId] } : {}),
          ...(roomId ? { room_id: roomId } : {}),
          ...(data.topic ? { topic: String(data.topic) } : {}),
          note: data.note || `${type.name} с сайта rastudio.org`,
        },
      });
      logAdmin(`Клиент ${customerId}: занятие ${type.name} id ${localId} на диске, очередь AlfaCRM`);
      const study = Number(d?.extras?.is_study);
      return {
        ok: true as const,
        queued: true,
        lesson: { ok: true as const, id: localId, date: dateIso, time, duration, type: type.name, typeId: type.id },
        customer: {
          id: customerId,
          cardId: clientCardId(customerId),
          branchId: Number(d?.branchId || branch),
          name: d?.child.fio || "",
          parent: d?.parent.fio || "",
          dob: d?.child.dob || "",
          age: ageLabel(d?.child.dob || ""),
          gender: d?.child.gender || "",
          phones: d?.phones || [],
          emails: [] as string[],
          address: d?.address || "",
          status: d?.status || "",
          isStudy: Number.isFinite(study) ? study : undefined,
          note: "",
          paidTill: "",
          url: d?.url || "",
          schools: d?.schools || [],
          groups: (d?.groupLinks || []).map((g) => ({
            id: g.id,
            name: g.name,
            branchId: g.branchId,
            school: g.school,
            active: g.active,
            subjectId: g.subjectId,
            courseId: g.courseId,
          })),
          comms: [] as CustomerComm[],
        },
      };
    }
    if (data.action === "customerPay") {
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
      const d = findDossier({ crmId: customerId });
      const prev = Number(d?.extras?.balance || 0);
      const nextBal = kind === "refund" ? prev - sum : kind === "correct" ? sum : prev + (kind === "product" ? 0 : sum);
      upsertDossier({
        crmId: customerId,
        extras: { ...(d?.extras || {}), balance: String(nextBal) },
        source: "admin",
      } as never);
      const { enqueueExport } = await import("./crm-export-queue");
      enqueueExport({
        op: "pay.create",
        branchId: branch,
        entityId: customerId,
        body: { customer_id: customerId, document_date: ru, income, expenditure, note },
      });
      logAdmin(`Клиент ${customerId}: ${note} ${sum} в очереди`);
      if (kind !== "refund") {
        void import("./funnel-auto").then((m) =>
          m.applyFunnelAuto("tariff", { customerId, branchId: branch, isStudy: Number(d?.extras?.is_study), statusId: Number(d?.extras?.lead_status_id || 0) }),
        );
      }
      const study = Number(d?.extras?.is_study);
      return {
        ok: true as const,
        queued: true,
        customer: {
          id: customerId,
          cardId: clientCardId(customerId),
          branchId: Number(d?.branchId || branch),
          name: d?.child.fio || "",
          parent: d?.parent.fio || "",
          dob: d?.child.dob || "",
          age: ageLabel(d?.child.dob || ""),
          gender: d?.child.gender || "",
          phones: d?.phones || [],
          emails: [] as string[],
          address: d?.address || "",
          status: d?.status || "",
          isStudy: Number.isFinite(study) ? study : undefined,
          note: "",
          paidTill: "",
          url: d?.url || "",
          schools: d?.schools || [],
          groups: (d?.groupLinks || []).map((g) => ({
            id: g.id,
            name: g.name,
            branchId: g.branchId,
            school: g.school,
            active: g.active,
            subjectId: g.subjectId,
            courseId: g.courseId,
          })),
          comms: [] as CustomerComm[],
        },
      };
    }
    if (data.action === "customerTariff") {
      const { formatRuDob } = await import("./alfacrm");
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
      const eDate = formatRuDob(data.eDate) || "";
      const { upsertDossier, findDossier, stampDossierLiveTariff } = await import("./dossiers");
      upsertDossier({
        crmId: customerId,
        branchId: branch,
        tariff: offer?.name || `абонемент ${tariffId}`,
        extras: { live_tariff: "1", tariff_id: String(tariffId) },
        source: "admin",
      });
      stampDossierLiveTariff([customerId], true);
      const { enqueueExport } = await import("./crm-export-queue");
      enqueueExport({
        op: "customer-tariff.create",
        branchId: branch,
        entityId: customerId,
        body: {
          tariffId,
          bDate,
          eDate,
          groupId: Number(data.groupId) || 0,
          calcType: Number(data.calcType ?? data.isSeparateBalance) || 0,
          subjectIds: Array.isArray(data.subjectIds) ? (data.subjectIds as unknown[]).map(Number).filter(Boolean) : offer?.subjectIds,
          lessonTypeIds: Array.isArray(data.lessonTypeIds) ? (data.lessonTypeIds as unknown[]).map(Number).filter(Boolean) : offer?.lessonTypeIds,
          periodCount: Number(data.periodCount) || offer?.periodCount,
          periodType: Number(data.periodType) || offer?.periodType,
          note: data.note ? String(data.note) : "",
          lessonsCount: offer?.lessonsCount,
        },
      });
      logAdmin(`Клиент ${customerId}: абонемент ${tariffId} в очереди`);
      void import("./funnel-auto").then((m) =>
        m.applyFunnelAuto("tariff", { customerId, branchId: branch, isStudy: 1, statusId: 0 }),
      );
      const d = findDossier({ crmId: customerId });
      const study = Number(d?.extras?.is_study);
      return {
        ok: true as const,
        queued: true,
        customer: {
          id: customerId,
          cardId: clientCardId(customerId),
          branchId: Number(d?.branchId || branch),
          name: d?.child.fio || "",
          parent: d?.parent.fio || "",
          dob: d?.child.dob || "",
          age: ageLabel(d?.child.dob || ""),
          gender: d?.child.gender || "",
          phones: d?.phones || [],
          emails: [] as string[],
          address: d?.address || "",
          status: d?.status || "",
          isStudy: Number.isFinite(study) ? study : undefined,
          note: "",
          paidTill: "",
          url: d?.url || "",
          schools: d?.schools || [],
          groups: (d?.groupLinks || []).map((g) => ({
            id: g.id,
            name: g.name,
            branchId: g.branchId,
            school: g.school,
            active: g.active,
            subjectId: g.subjectId,
            courseId: g.courseId,
          })),
          comms: [] as CustomerComm[],
        },
      };
    }
    if (data.action === "customerCreate") {
      const branch = Number(data.branchId) || 1;
      const groupId = Number(data.groupId) || 0;
      const name = String(data.name || "").trim();
      const parent = String(data.parent || "").trim();
      const phone = formatRuPhone(String(data.phone || "").trim());
      if (!name) return { ok: false as const, error: "Укажите имя ученика." };
      const bDate = String(data.bDate || "").trim();
      const eDate = String(data.eDate || "").trim();
      const slot = groupId
        ? listAdminSlots().find((s) => s.groupId === groupId && (!branch || s.branchId === branch)) ||
          listAdminSlots().find((s) => s.groupId === groupId)
        : undefined;
      const useBranch = Number(slot?.branchId) || branch;
      const existing = phone ? findDossier({ phone }) : null;
      const existingId = Number(existing?.crmId || 0);
      const groupLink = groupId
        ? {
            id: groupId,
            name: slot?.groupName || `группа ${groupId}`,
            branchId: useBranch,
            school: slot?.school || "",
            active: true,
            subjectId: slot?.subjectId || undefined,
            courseId: slot?.courseId,
          }
        : undefined;
      const pack = (id: number) => ({
        ok: true as const,
        queued: true,
        pending: id < 0,
        customerId: id,
        customer: {
          id,
          cardId: clientCardId(id),
          branchId: useBranch,
          name,
          parent,
          dob: existing?.child.dob || "",
          age: ageLabel(existing?.child.dob || ""),
          gender: existing?.child.gender || "",
          phones: phone ? [phone] : existing?.phones || [],
          emails: [] as string[],
          address: existing?.address || "",
          status: "учится",
          isStudy: 1,
          note: "",
          paidTill: "",
          url: existing?.url || "",
          schools: existing?.schools || [],
          groups: groupId
            ? [{ id: groupId, name: groupLink?.name || `группа ${groupId}`, branchId: useBranch, school: slot?.school || "", active: true }]
            : (existing?.groupLinks || []).map((g) => ({
                id: g.id,
                name: g.name,
                branchId: g.branchId,
                school: g.school,
                active: g.active,
              })),
          comms: [] as CustomerComm[],
        },
      });
      if (existingId > 0) {
        const had = (existing?.groupLinks || []).some((g) => g.id === groupId && g.active !== false);
        upsertDossier({
          crmId: existingId,
          branchId: useBranch,
          child: name,
          parent,
          phone: phone || undefined,
          extras: { is_study: "1" },
          status: "учится",
          source: "admin",
          ...(groupLink ? { groupLink } : {}),
        });
        const { enqueueExport } = await import("./crm-export-queue");
        enqueueExport({
          op: "customer.update",
          branchId: useBranch,
          entityId: existingId,
          body: { id: existingId, name, legal_name: parent, ...(phone ? { phone: [phone] } : {}), is_study: 1 },
        });
        if (groupId) {
          enqueueExport({
            op: "cgi.apply",
            branchId: useBranch,
            entityId: existingId,
            body: { groupId, drop: false, bDate, eDate },
          });
          if (!had) bumpGroupTaken(useBranch, groupId, 1);
        }
        logAdmin(`Клиент ${existingId}: уже на диске${groupId ? `, группа ${groupId} в очереди` : ""}`);
        return pack(existingId);
      }
      const localId = existingId < 0 ? existingId : trialLocalId();
      upsertDossier({
        crmId: localId,
        branchId: useBranch,
        child: name,
        parent,
        phone: phone || undefined,
        extras: { is_study: "1", local_id: String(localId) },
        status: "учится",
        source: "admin",
        ...(groupLink ? { groupLink } : {}),
      });
      const { enqueueExport } = await import("./crm-export-queue");
      enqueueExport({
        op: "customer.create",
        branchId: useBranch,
        entityId: localId,
        body: {
          name,
          legal_name: parent,
          legal_type: 1,
          ...(phone ? { phone: [phone] } : {}),
          is_study: 1,
          branch_ids: [useBranch],
          localId,
          ...(groupId ? { group_ids: [groupId], bDate, eDate } : {}),
        },
      });
      if (groupId) {
        const had = (existing?.groupLinks || []).some((g) => g.id === groupId && g.active !== false);
        if (!had) bumpGroupTaken(useBranch, groupId, 1);
      }
      logAdmin(`Клиент ${localId}: на сайте${groupId ? `, группа ${groupId}` : ""}, Alfa в очереди`);
      return pack(localId);
    }
    if (data.action === "customerGroup") {
      const customerId = Number(data.customerId) || 0;
      const groupId = Number(data.groupId) || 0;
      const branch = Number(data.branchId) || 1;
      const drop = Boolean((data as { remove?: boolean }).remove);
      if (!customerId) return { ok: false as const, error: "Нет customerId." };
      if (!groupId) return { ok: false as const, error: "Выберите группу." };
      const slot = listAdminSlots().find((s) => s.groupId === groupId && (!branch || s.branchId === branch))
        || listAdminSlots().find((s) => s.groupId === groupId);
      const useBranch = Number(slot?.branchId) || branch;
      const { upsertDossier, findDossier } = await import("./dossiers");
      const before = findDossier({ crmId: customerId });
      const had = (before?.groupLinks || []).some((g) => g.id === groupId && g.active !== false);
      upsertDossier({
        crmId: customerId,
        branchId: useBranch,
        groupLink: {
          id: groupId,
          name: slot?.groupName || `группа ${groupId}`,
          branchId: useBranch,
          school: slot?.school || "",
          active: !drop,
          subjectId: slot?.subjectId || undefined,
          courseId: slot?.courseId,
        },
        source: "admin",
      });
      if (!drop && !had) bumpGroupTaken(useBranch, groupId, 1);
      if (drop && had) bumpGroupTaken(useBranch, groupId, -1);
      const { enqueueExport } = await import("./crm-export-queue");
      enqueueExport({
        op: "cgi.apply",
        branchId: useBranch,
        entityId: customerId,
        body: {
          groupId,
          drop,
          bDate: String(data.bDate || "").trim(),
          eDate: String(data.eDate || "").trim(),
        },
      });
      logAdmin(drop ? `Клиент ${customerId}: снят с группы ${groupId} (очередь)` : `Клиент ${customerId}: группа ${groupId} (очередь)`);
      if (!drop) {
        void import("./funnel-auto").then((m) =>
          m.applyFunnelAuto("group", {
            customerId,
            branchId: useBranch,
            isStudy: Number(before?.extras?.is_study),
            statusId: 0,
          }),
        );
      }
      const d = findDossier({ crmId: customerId });
      const study = Number(d?.extras?.is_study);
      return {
        ok: true as const,
        queued: true,
        customer: {
          id: customerId,
          cardId: clientCardId(customerId),
          branchId: Number(d?.branchId || useBranch),
          name: d?.child.fio || "",
          parent: d?.parent.fio || "",
          dob: d?.child.dob || "",
          age: ageLabel(d?.child.dob || ""),
          gender: d?.child.gender || "",
          phones: d?.phones || [],
          emails: [] as string[],
          address: d?.address || "",
          status: d?.status || "",
          isStudy: Number.isFinite(study) ? study : undefined,
          note: "",
          paidTill: "",
          url: d?.url || "",
          schools: d?.schools || [],
          groups: (d?.groupLinks || []).map((g) => ({
            id: g.id,
            name: g.name,
            branchId: g.branchId,
            school: g.school,
            active: g.active,
            subjectId: g.subjectId,
            courseId: g.courseId,
          })),
          comms: [] as CustomerComm[],
        },
      };
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
        const hint = Number(data.subjectId) || 0;
        const existing = hint ? loadSubjects().find((s) => s.id === hint) : undefined;
        const sub = existing || createLocalSubject(name);
        const courseId = String((data as { courseId?: string }).courseId || "");
        if (sub.id && courseId) bindSubjectCourse(sub.id, courseId);
        if (!existing || existing.local || existing.id >= 9000) {
          const { enqueueExport } = await import("./crm-export-queue");
          enqueueExport({
            op: "subject.create",
            branchId: branch,
            entityId: sub.id,
            body: { name: sub.name, localId: sub.id },
          });
        }
        logAdmin(`Предмет «${sub.name}» id ${sub.id} на сайте${existing && existing.id < 9000 ? "" : ", Alfa в очереди"}`);
        return { ...decorateSubjects(loadSubjects()), created: sub, queued: !existing || existing.local || existing.id >= 9000 };
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
      if (data.fresh && q.length >= 3 && items.length < 8) {
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
      const { cacheMoveLead } = await import("./crm-leads");
      const { leadMoveFields } = await import("./crm-leads-stages");
      const { enqueueExport } = await import("./crm-export-queue");
      const branch = Number(data.branchId) || 1;
      const leadId = Number(data.leadId) || 0;
      const statusId = Number(data.leadStatusId);
      if (!leadId) return { ok: false as const, error: "Нет номера лида." };
      if (!Number.isFinite(statusId)) return { ok: false as const, error: "Нет этапа воронки." };
      const sort = Number.isFinite(Number(data.sort)) ? Number(data.sort) : undefined;
      cacheMoveLead(branch, leadId, statusId, sort);
      const d = findDossier({ crmId: leadId });
      upsertDossier({
        crmId: leadId,
        extras: { ...(d?.extras || {}), lead_status_id: String(statusId), is_study: "0" },
      } as never);
      enqueueExport({
        op: "customer.update",
        branchId: branch,
        entityId: leadId,
        body: { ...leadMoveFields(statusId, sort) },
      });
      logAdmin(`Лид ${leadId}: этап ${statusId} на диске, очередь AlfaCRM`);
      return { ok: true as const, queued: true, leadStatusId: statusId };
    }
    if (data.action === "leadArchive") {
      const { cacheArchiveLead } = await import("./crm-leads");
      const { enqueueExport } = await import("./crm-export-queue");
      const branch = Number(data.branchId) || 1;
      const leadId = Number(data.leadId) || 0;
      if (!leadId) return { ok: false as const, error: "Нет номера лида." };
      cacheArchiveLead(branch, leadId);
      const d = findDossier({ crmId: leadId });
      upsertDossier({ crmId: leadId, extras: { ...(d?.extras || {}), is_study: "0", removed: "1" } } as never);
      enqueueExport({
        op: "customer.update",
        branchId: branch,
        entityId: leadId,
        body: { removed: 1, is_study: 2 },
      });
      logAdmin(`Лид ${leadId}: в архив на диске, очередь AlfaCRM`);
      return { ok: true as const, queued: true };
    }
    if (data.action === "leadStageSave") {
      const { diskSaveLeadStage, cachedLeadBoard } = await import("./crm-leads");
      const { colorPatch } = await import("./crm-leads-stages");
      const { enqueueExport } = await import("./crm-export-queue");
      const id = Number(data.stageId);
      const name = String(data.name || "").trim();
      const color = String(data.color || "").trim();
      if (!Number.isFinite(id) || (!name && !color)) return { ok: false as const, error: "Нет названия этапа." };
      diskSaveLeadStage(id, { name: name || undefined, color: color || undefined });
      const board = cachedLeadBoard(Number(data.branchId) || 0);
      const hit = board.stages.find((s) => s.id === id);
      if (id < 0) {
        enqueueExport({
          op: "lead-status.create",
          branchId: 1,
          entityId: id,
          body: {
            name: hit?.name || name,
            color: hit?.color || color,
            localId: id,
            pipeline_id: 1,
            is_enabled: 1,
            ...colorPatch(hit?.color || color || "#2563eb"),
          },
        });
      } else if (id > 0) {
        enqueueExport({
          op: "lead-status.update",
          branchId: 1,
          entityId: id,
          body: {
            ...(name ? { name } : {}),
            ...(color ? colorPatch(color) : {}),
          },
        });
      }
      logAdmin(`Этап лида ${id}: ${name || color} на диске, очередь AlfaCRM`);
      return { ok: true as const, stages: board.stages, items: board.items, queued: true };
    }
    if (data.action === "leadStageCreate") {
      const { diskCreateLeadStage, cachedLeadBoard } = await import("./crm-leads");
      const { colorPatch } = await import("./crm-leads-stages");
      const { enqueueExport } = await import("./crm-export-queue");
      const name = String(data.name || "").trim() || "Новый этап";
      const color = String(data.color || "#2563eb");
      const made = diskCreateLeadStage(name, color);
      enqueueExport({
        op: "lead-status.create",
        branchId: 1,
        entityId: made.id,
        body: {
          name: made.name,
          color: made.color,
          localId: made.id,
          pipeline_id: 1,
          is_enabled: 1,
          ...colorPatch(made.color),
        },
      });
      logAdmin(`Этап лида: «${made.name}» на диске, очередь AlfaCRM`);
      const board = cachedLeadBoard(Number(data.branchId) || 0);
      return { ok: true as const, stages: board.stages, items: board.items, stageId: made.id, queued: true };
    }
    if (data.action === "leadStageDelete") {
      const { diskDeleteLeadStage, cachedLeadBoard } = await import("./crm-leads");
      const { enqueueExport } = await import("./crm-export-queue");
      const id = Number(data.stageId);
      if (!Number.isFinite(id) || id === 0) return { ok: false as const, error: "Этот столбец нельзя удалить." };
      try {
        diskDeleteLeadStage(id);
        enqueueExport({
          op: "lead-status.delete",
          branchId: 1,
          entityId: id,
          body: { id },
        });
        logAdmin(`Этап лида ${id}: удалён на диске${id > 0 ? ", очередь AlfaCRM" : ""}`);
        const board = cachedLeadBoard(Number(data.branchId) || 0);
        return { ok: true as const, stages: board.stages, items: board.items, queued: id > 0 };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Не удалось удалить этап." };
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
      return packPupilGroups(uniqueLiveGroups(listAdminSlots()).map((g) => ({ ...g, taken: 0 })));
    }
    if (data.action === "pupilTariffCounts") {
      const { uniqueLiveGroups } = await import("./pupil-tariffs");
      const { dossiersInGroup } = await import("./dossiers");
      const groups = uniqueLiveGroups(listAdminSlots()).map((g) => {
        const disk = dossiersInGroup(g.branchId, g.groupId).filter((d) => {
          const hit = (d.groupLinks || []).find((x) => x.id === g.groupId);
          return hit?.active !== false;
        }).length;
        return { ...g, taken: Math.max(Number(g.taken) || 0, disk) };
      });
      return packPupilGroups(groups);
    }
    if (data.action === "pupilTariffPlan") {
      const { uniqueLiveGroups, pupilRowFromMember, pickBestTariff } = await import("./pupil-tariffs");
      const keys = Array.isArray(data.groupKeys) ? data.groupKeys : [];
      const includeLeads = Boolean(data.includeLeads);
      const slots = listAdminSlots();
      const all = uniqueLiveGroups(slots);
      const want = new Set(keys.map((k) => `${Number(k.branchId)}:${Number(k.groupId)}`));
      const groups = keys
        .map((k) => {
          const key = `${Number(k.branchId)}:${Number(k.groupId)}`;
          return (
            all.find((g) => g.key === key) || {
              key,
              groupId: Number(k.groupId) || 0,
              branchId: Number(k.branchId) || 1,
              name: `группа ${k.groupId}`,
              school: "Без школы на сайте",
              schoolId: "",
              course: "",
              age: "",
              teacher: "",
              taken: 0,
              limit: 0,
              subjectId: 0,
            }
          );
        })
        .filter((g) => want.has(g.key) && g.groupId);
      const tariffs = loadTariffs().items;
      const { guessTariffLinks } = await import("./tariff-map");
      const { loadSiteTree } = await import("./site-tree");
      const tree = loadSiteTree();
      const linkBy = new Map(guessTariffLinks(tariffs).map((l) => [l.tariffId, l]));
      const items = [];
      const byGroup: Record<string, { tariffId: number; tariffName: string; options: { id: number; name: string; price: number; school?: string }[] }> = {};
      let crm: { token: string; request: typeof import("./alfacrm").request } | null = null;
      for (const g of groups) {
        const slot = slots.find((s) => s.groupId === g.groupId && s.branchId === g.branchId);
        const pack = groupTariffPack(slot);
        const best = slot ? pickBestTariff(slot, tariffs) : null;
        const offer = best || tariffs.find((t) => t.id === pack.tariffId) || null;
        byGroup[g.key] = {
          tariffId: offer?.id || 0,
          tariffName: offer?.name || "",
          options: pack.tariffs.map((o) => {
            const t = tariffs.find((x) => x.id === o.id);
            const schoolId = linkBy.get(o.id)?.schoolId || "";
            const school = tree.schools.find((s) => s.id === schoolId)?.label || "";
            return {
              id: o.id,
              name: o.name,
              price: o.price,
              school,
              subjectIds: t?.subjectIds || [],
              lessonTypeIds: t?.lessonTypeIds || [2],
              periodCount: t?.periodCount || 0,
              periodType: t?.periodType || 3,
              calculationType: t?.calculationType || 0,
              lessonsCount: t?.lessonsCount || o.lessonsCount,
            };
          }),
        };
        let mem = await membersFromDisk(g.branchId, g.groupId);
        if (!mem.active.length && !mem.archive.length) {
          if (!crm) {
            const { token, request } = await import("./alfacrm");
            crm = { token: await token(), request };
          }
          mem = await loadGroupMembers(crm.request, crm.token, g.branchId, g.groupId, { skipArchive: true });
        }
        g.taken = mem.active.length;
        for (const m of mem.active) {
          const row = pupilRowFromMember(m, g, offer, includeLeads);
          if (row) items.push(row);
        }
      }
      return { ok: true as const, items, byGroup, total: items.length, scanned: items.length, groups: groups.length, archivedOnly: 0 };
    }
    if (data.action === "pupilTariffActive") {
      const { keepPupilsWithActiveTariffs, withCatalogNames, formatTariffNames, countArchivedOnlyPupils, customerTariffIndexPath, splitCustomerTariffs, CRM_READ_GAP_MS } = await import("./pupil-tariffs");
      const items = Array.isArray(data.pupilItems) ? data.pupilItems : [];
      const tariffs = loadTariffs().items;
      const catalog = tariffs.map((x) => ({ id: x.id, name: x.name, archive: x.archive, price: x.price }));
      const byCustomer = new Map<string, { id: number; tariffId: number; name: string }[]>();
      const byArchived = new Map<string, { id: number; tariffId: number; name: string }[]>();
      const { findDossier } = await import("./dossiers");
      for (const row of items) {
        const customerId = Number(row.customerId) || 0;
        if (!customerId) continue;
        const k = `${Number(row.branchId)}:${customerId}`;
        const d = findDossier({ crmId: customerId });
        const stamp = d?.extras?.live_tariff;
        if (stamp !== "1" && stamp !== "0") continue;
        if (stamp === "1") {
          const tariffId = Number(d?.extras?.tariff_id) || Number(row.tariffId) || 0;
          const name = d?.tariff || catalog.find((x) => x.id === tariffId)?.name || row.tariffName || `абонемент ${tariffId}`;
          byCustomer.set(k, [{ id: tariffId, tariffId, name }]);
        } else {
          byCustomer.set(k, []);
        }
      }
      const missing = items.filter((row) => {
        const k = `${Number(row.branchId)}:${Number(row.customerId)}`;
        return Number(row.customerId) && !byCustomer.has(k) && !byArchived.has(k);
      });
      if (missing.length) {
        const { token, request } = await import("./alfacrm");
        const t = await token();
        const branches = [...new Set(missing.map((row) => Number(row.branchId) || 0).filter(Boolean))];
        if (missing.length > 24) {
          for (const branch of branches) {
            const bulk = await loadBranchActiveTariffs(request, t, branch, catalog, { fresh: Boolean(data.fresh) });
            for (const [cid, list] of bulk.live) {
              const k = `${branch}:${cid}`;
              if (!byCustomer.has(k)) byCustomer.set(k, list);
            }
            for (const [cid, list] of bulk.archived) {
              const k = `${branch}:${cid}`;
              if (!byArchived.has(k)) byArchived.set(k, list);
            }
          }
        }
        const still = missing.filter((row) => {
          const k = `${Number(row.branchId)}:${Number(row.customerId)}`;
          return !byCustomer.has(k) && !byArchived.has(k);
        });
        for (let i = 0; i < still.length; i += 3) {
          if (i) await sleep(CRM_READ_GAP_MS);
          await Promise.all(
            still.slice(i, i + 3).map(async (row) => {
              const branch = Number(row.branchId) || 1;
              const customerId = Number(row.customerId) || 0;
              const json = await request<{ items?: Record<string, unknown>[] }>(
                customerTariffIndexPath(branch, customerId),
                { page: 0, pageSize: 50, customer_id: customerId },
                t,
              ).catch(() => ({ items: [] as Record<string, unknown>[] }));
              const split = splitCustomerTariffs(json.items, catalog);
              const k = `${branch}:${customerId}`;
              byCustomer.set(k, split.live.get(customerId) || []);
              byArchived.set(k, split.archived.get(customerId) || []);
            }),
          );
        }
      }
      const decorated = items.map((row) => {
        const k = `${Number(row.branchId)}:${Number(row.customerId)}`;
        const activeTariffs = withCatalogNames(byCustomer.get(k) || [], catalog);
        const offer = activeTariffs[0] && catalog.length ? tariffs.find((x) => x.id === activeTariffs[0].tariffId) : null;
        return {
          ...row,
          activeTariffs,
          tariffName: formatTariffNames(activeTariffs) || row.tariffName,
          price: offer?.price || row.price,
        };
      });
      const kept = keepPupilsWithActiveTariffs(decorated, byCustomer);
      return {
        ok: true as const,
        fromCache: missing.length === 0,
        items: decorated,
        live: kept,
        total: decorated.length,
        liveCount: kept.length,
        scanned: items.length,
        archivedOnly: countArchivedOnlyPupils(items, byCustomer, byArchived),
      };
    }
    if (data.action === "pupilTariffAssign") {
      const { formatRuDob } = await import("./alfacrm");
      const { assignable, addPeriod } = await import("./pupil-tariffs");
      const fromIso = String(data.date || "").slice(0, 10);
      const bDate = formatRuDob(fromIso) || formatRuDob(new Date().toISOString().slice(0, 10));
      const rows = assignable(Array.isArray(data.pupilItems) ? data.pupilItems : []);
      const catalog = loadTariffs().items;
      const { enqueueExport } = await import("./crm-export-queue");
      const { stampDossierLiveTariff, upsertDossier } = await import("./dossiers");
      const done: number[] = [];
      const skipped: { id: number; name: string; reason: string }[] = [];
      const failed: { id: number; name: string; error: string }[] = [];
      for (const row of rows) {
        const customerId = Number(row.customerId || (row as { id?: number }).id || 0);
        if (!customerId) {
          failed.push({ id: 0, name: row.name, error: "Нет customer_id ученика." });
          continue;
        }
        const offer = catalog.find((x) => x.id === row.tariffId);
        const periodCount = Number(row.periodCount) || offer?.periodCount || 0;
        const periodType = Number(row.periodType) || offer?.periodType || 1;
        const eIso = row.eDate || addPeriod(fromIso, periodCount, periodType);
        const lessonTypeIds = (row.lessonTypeIds?.length ? row.lessonTypeIds : offer?.lessonTypeIds?.length ? offer.lessonTypeIds : [2]).map(Number).filter((n) => n > 0);
        upsertDossier({
          crmId: customerId,
          branchId: row.branchId,
          tariff: offer?.name || row.tariffName || `абонемент ${row.tariffId}`,
          extras: { live_tariff: "1", tariff_id: String(row.tariffId) },
          source: "admin",
        });
        enqueueExport({
          op: "customer-tariff.create",
          branchId: row.branchId,
          entityId: customerId,
          body: {
            tariffId: Number(row.tariffId),
            bDate,
            eDate: formatRuDob(eIso) || "",
            groupId: Number(row.groupId) || 0,
            calcType: Number(row.calcType) || 0,
            subjectIds: row.subjectIds?.length ? row.subjectIds : offer?.subjectIds,
            lessonTypeIds,
            periodCount,
            periodType,
            lessonsCount: row.lessonsCount || offer?.lessonsCount,
          },
        });
        done.push(customerId);
      }
      stampDossierLiveTariff(done, true);
      logAdmin(`Мастер учеников: в очередь ${done.length}, ошибок ${failed.length}`);
      return { ok: true as const, queued: true, done: done.length, skipped, failed, total: rows.length };
    }
    if (data.action === "pupilTariffClear") {
      const { formatRuDob } = await import("./alfacrm");
      const { enqueueExport } = await import("./crm-export-queue");
      const { stampDossierLiveTariff } = await import("./dossiers");
      const mode = data.mode === "delete" ? "delete" : "close";
      const eDate = formatRuDob(String(data.date || "").slice(0, 10)) || formatRuDob(new Date().toISOString().slice(0, 10));
      const rows = (Array.isArray(data.pupilItems) ? data.pupilItems : []).filter((x) => Number(x.customerId) > 0);
      const done: number[] = [];
      const skipped: { id: number; name: string; reason: string }[] = [];
      const failed: { id: number; name: string; error: string }[] = [];
      for (const row of rows) {
        const customerId = Number(row.customerId) || 0;
        const branch = Number(row.branchId) || 1;
        const marked = findDossier({ crmId: customerId })?.extras?.live_tariff;
        if (marked === "0") {
          skipped.push({ id: customerId, name: row.name, reason: "нет абонемента" });
          continue;
        }
        stampDossierLiveTariff([customerId], false);
        enqueueExport({
          op: "customer-tariff.clear",
          branchId: branch,
          entityId: customerId,
          body: { mode, eDate },
        });
        done.push(customerId);
      }
      logAdmin(`Мастер учеников: ${mode === "delete" ? "удаление" : "закрытие"} в очередь ${done.length}, пропуск ${skipped.length}`);
      return { ok: true as const, queued: true, done: done.length, skipped, failed, total: rows.length, mode };
    }
    if (data.action === "clientsLiveTariffs") {
      const { liveTariffIdsFromStore, overlayAdminGroups } = await import("./dossiers");
      const { loadCachePolicy } = await import("./crm-cache-policy");
      const force = Boolean(data.force);
      const pol = loadCachePolicy();
      const ids = liveTariffIdsFromStore();
      if (force) {
        void import("./crm-packet-queue").then((q) => {
          q.enqueueCrmOverlay(true);
          void q.tickCrmQueue(3);
        });
      }
      return {
        ok: true as const,
        ids,
        total: overlayAdminGroups().length || 1,
        live: ids.length,
        fromCache: true,
        done: true,
        next: pol.overlayNext,
        scanned: ids.length,
        extra: "из хранилища сайта",
      };
    }
    if (data.action === "cachePolicyGet") {
      const { loadCachePolicy, CACHE_KIND_META } = await import("./crm-cache-policy");
      return { ok: true as const, policy: loadCachePolicy(), kinds: CACHE_KIND_META };
    }
    if (data.action === "cachePolicySave") {
      const { saveCachePolicy, loadCachePolicy, CACHE_KIND_META } = await import("./crm-cache-policy");
      const raw = data.cachePolicy && typeof data.cachePolicy === "object" ? (data.cachePolicy as Parameters<typeof saveCachePolicy>[0]) : loadCachePolicy();
      return { ok: true as const, policy: saveCachePolicy(raw), kinds: CACHE_KIND_META };
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
      const branch = Number(data.branchId) || 1;
      const gid = Number(data.groupId) || 0;
      if (!gid) return { ok: false as const, error: "Нет номера группы." };
      const slot = listAdminSlots().find((s) => s.groupId === gid && s.branchId === branch) || listAdminSlots().find((s) => s.groupId === gid);
      const cached = loadGroupCard(branch, gid);
      if (!data.fresh) {
        if (!cached && !slot) return { ok: false as const, error: "Группа не на сайте." };
        const group = cached || {
          id: gid,
          branchId: Number(slot?.branchId) || branch,
          name: slot?.groupName || `группа ${gid}`,
          note: slot?.groupNote || "",
          description: slot?.description || slot?.groupNote || "",
          remarks: slot?.remarks || "",
          hashtags: slot?.hashtags || "",
          makeup: slot?.makeup || "",
          statusId: slot?.statusId || 0,
          bDate: slot?.bDate || "",
          eDate: slot?.eDate || "",
          levelId: slot?.levelId || 0,
          signup: slot?.signup || `https://studiyarazvivaysya.s20.online/common/${branch}/lead/create?gid=${gid}`,
          subjectId: Number(slot?.subjectId || 0),
          subject: slot?.subject || "",
          priority: readPriority(slot?.priority),
          calendar: [] as GroupCalLesson[],
          at: new Date().toISOString(),
        };
        return {
          ok: true as const,
          fromCache: true,
          subjects: subjectsWithHref(),
          levels: SEED_LEVELS,
          group,
          ...groupTariffPack(slot),
        };
      }
      const { token, request } = await import("./alfacrm");
      const t = await token();
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
      const crmPriority = crmPriorityOf(g);
      if (crmPriority != null && slot && slot.priority !== crmPriority) {
        saveAdminSlots(
          listAdminSlots().map((s) => (s.groupId === gid && s.branchId === branch ? { ...s, priority: crmPriority } : s)),
        );
      }
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
          priority: crmPriority ?? readPriority(slot?.priority),
          signup: slot?.signup || `https://studiyarazvivaysya.s20.online/common/${branch}/lead/create?gid=${gid}`,
          subjectId: crmGroupSubjectId(g) || Number(slot?.subjectId || 0),
          subject: slot?.subject || "",
          calendar: cached?.calendar || [],
          at: new Date().toISOString(),
        };
        if (!cached) saveGroupCard(group);
        return {
          ok: true as const,
          fromCache: false,
          subjects: subjectsWithHref(),
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
          for (const x of await roomsOfBranch(request, t, branch)) rooms.set(x.id, x.name);
        } catch { /* rooms optional */ }
        try {
          for (const x of await teachersOfBranch(request, t, branch)) teachers.set(x.id, x.name);
        } catch { /* teachers optional */ }
        const regs: {
          id?: number;
          related_id?: number;
          day?: number;
          time_from_v?: string;
          time_to_v?: string;
        }[] = [];
        const packRegs = await request<{ items?: typeof regs }>(`/v2api/${branch}/regular-lesson/index`, { page: 0, pageSize: 50, related_id: gid }, t).catch(() => ({ items: [] as typeof regs }));
        for (const r of packRegs.items || []) if (Number(r.related_id) === gid) regs.push(r);
        const mine = regs.length ? regs : [];
        const groupName = String(g.name || slot?.groupName || "");
        const fallbackTeacher = String(slot?.teacher || "");
        const fallbackFrom = hm(mine[0]?.time_from_v) || String(slot?.timeFrom || "");
        const fallbackTo = hm(mine[0]?.time_to_v) || String(slot?.timeTo || "");
        const ctx = { rooms, teachers, subjects, groupName, fallbackFrom, fallbackTo, fallbackTeacher };
        async function pullLessons(extra: Record<string, unknown>) {
          for (const status of [1, 2, 3]) {
            for (let page = 0; page < 2; page++) {
              const les = await request<{ items?: Parameters<typeof packCrmLesson>[0][] }>(
                `/v2api/${branch}/lesson/index`,
                { page, pageSize: 200, status, ...extra },
                t,
              );
              const chunk = les.items || [];
              for (const item of chunk) {
                const gids = (item.group_ids || []).map(Number);
                if (gids.length && !gids.includes(gid)) continue;
                const packed = packCrmLesson(item, ctx);
                if (packed) byDate.set(packed.date, packed);
              }
              if (chunk.length < 200) break;
            }
          }
        }
        await pullLessons({ group_id: gid });
      } catch {
        /* календарь не должен ломать карточку */
      }
      const calendar = mergeLocalCalendar(
        [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
        cached?.calendar,
      );
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
          priority: crmPriority ?? readPriority(slot?.priority),
          signup: slot?.signup || `https://studiyarazvivaysya.s20.online/common/${branch}/lead/create?gid=${gid}`,
          subjectId: crmGroupSubjectId(g) || Number(slot?.subjectId || 0),
          subject: loadSubjects().find((x) => x.id === (crmGroupSubjectId(g) || Number(slot?.subjectId || 0)))?.name || slot?.subject || "",
          calendar,
          at: new Date().toISOString(),
      };
      saveGroupCard(group);
      if (group.subjectId && slot && slot.subjectId !== group.subjectId) {
        saveAdminSlots(
          listAdminSlots().map((s) =>
            s.groupId === gid && s.branchId === branch ? { ...s, subjectId: group.subjectId, subject: group.subject } : s,
          ),
        );
      }
      const liveTeachers = await teachersOfBranch(request, t, branch).catch(() => [] as { id: number; name: string }[]);
      return {
        ok: true as const,
        fromCache: false,
        subjects: subjectsWithHref(),
        levels,
        group,
        teachers: liveTeachers.map((x) => ({ id: x.id, name: x.name, branchIds: [branch] })),
        ...groupTariffPack(slot),
      };
    }
    if (data.action === "groupSave") {
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
      const current = listAdminSlots();
      const found =
        (slotId ? current.find((s) => s.id === slotId) : undefined) ||
        (gid ? current.find((s) => s.groupId === gid && s.branchId === branch) : undefined) ||
        (gid ? current.find((s) => s.groupId === gid) : undefined);
      if (!found) return { ok: false as const, error: "Группа не найдена в расписании на сайте." };
      branch = Number(found.branchId) || branch;
      const subject = loadSubjects().find((x) => x.id === (subjectId || found.subjectId));
      const teacherIds = Array.isArray(data.teacherIds)
        ? data.teacherIds.map(Number).filter((n) => n > 0)
        : found.teacherIds || [];
      const teacherName = data.teacher != null ? String(data.teacher) : found.teacher;
      const teacherId = data.teacherId != null ? Number(data.teacherId) : found.teacherId;
      const groupName = String(data.groupName || found.groupName || "");
      const limit = data.limit != null ? Number(data.limit) || 0 : found.limit;
      const age = data.age != null ? String(data.age) : found.age;
      const patched = current.map((s) =>
        s.id === found.id
          ? {
              ...s,
              groupName: groupName || s.groupName,
              limit,
              age,
              teacher: teacherName,
              teacherId,
              teacherIds,
              subjectId: subjectId || s.subjectId,
              subject: subject?.name || s.subject,
              statusId: statusId || s.statusId || 1,
              bDate: bDate || s.bDate,
              eDate: eDate || s.eDate,
              groupNote: description || s.groupNote,
              description,
              remarks,
              hashtags,
              makeup,
              levelId: levelId || s.levelId,
              tariffId,
              priority,
            }
          : s,
      );
      const note = [description, remarks].map((x) => x.trim()).filter((x, i, a) => x && a.indexOf(x) === i).join("\n");
      if (gid) {
        const next = patched.map((s) =>
          s.id !== found.id && !(s.groupId === gid && s.branchId === branch)
            ? s
            : {
                ...s,
                groupId: gid,
                groupName: groupName || s.groupName,
                groupNote: description || s.groupNote,
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
                priority,
                limit,
                age,
                teacher: teacherName,
                teacherId,
                teacherIds,
              },
        );
        const saved = saveAdminSlots(next).slots;
        const prev = loadGroupCard(branch, gid);
        saveGroupCard({
          id: gid,
          branchId: branch,
          name: groupName || prev?.name || "",
          note,
          description,
          remarks,
          hashtags,
          makeup,
          statusId: statusId || prev?.statusId || 0,
          bDate: bDate || prev?.bDate || "",
          eDate: eDate || prev?.eDate || "",
          levelId: levelId || prev?.levelId || 0,
          signup: prev?.signup || `https://studiyarazvivaysya.s20.online/common/${branch}/lead/create?gid=${gid}`,
          subjectId: subjectId || prev?.subjectId || 0,
          subject: subject?.name || prev?.subject || "",
          priority,
          calendar: prev?.calendar || [],
          at: new Date().toISOString(),
        });
        const { enqueueExport } = await import("./crm-export-queue");
        enqueueExport({
          op: "group.update",
          branchId: branch,
          entityId: gid,
          body: {
            name: groupName,
            note,
            limit: limit || 0,
            branch_ids: [branch],
            status_id: statusId || undefined,
            b_date: bDate,
            e_date: eDate,
            custom_hashtagkursa: hashtags,
            custom_workingout: makeup,
            custom_prioritet: priority,
            ...(levelId ? { level_id: levelId } : { level_id: null }),
            ...(subjectId || found.subjectId
              ? { subject_id: subjectId || found.subjectId, subject_ids: [subjectId || found.subjectId] }
              : {}),
            ...(teacherIds.length ? { teacher_ids: teacherIds } : {}),
          },
        });
        const slotNow = next.find((s) => s.id === found.id) || found;
        for (const b of slotNow.beats?.length ? slotNow.beats : [{ day: slotNow.day, timeFrom: slotNow.timeFrom, timeTo: slotNow.timeTo, lessonId: slotNow.lessonId }]) {
          if (!b.lessonId) continue;
          enqueueExport({
            op: "regular-lesson.update",
            branchId: branch,
            entityId: b.lessonId,
            body: {
              related_class: "Group",
              related_id: gid,
              ...(subjectId || slotNow.subjectId ? { subject_id: subjectId || slotNow.subjectId } : {}),
              day: b.day,
              days: [b.day],
              time_from_v: b.timeFrom,
              time_to_v: b.timeTo,
              b_date: isoish(bDate),
              e_date: isoish(eDate),
              ...(teacherIds.length ? { teacher_ids: teacherIds } : {}),
            },
          });
        }
        logAdmin(`Группа ${gid}: на сайте, выгрузка в очередь`);
        return pack(saved, { groupId: gid, queued: true });
      }
      const saved = saveAdminSlots(patched).slots;
      const sid = Number(subjectId || found.subjectId || 0);
      if (!sid) {
        logAdmin(`Группа ${found.id}: на сайте, в Alfa нет subjectId`);
        return pack(saved, { queued: false, error: "Выберите subjectId филиала. Без предмета группу в AlfaCRM не создаём." });
      }
      const { enqueueExport } = await import("./crm-export-queue");
      const slotNow = saved.find((s) => s.id === found.id) || found;
      const noteNew = [description, remarks].map((x) => x.trim()).filter((x, i, a) => x && a.indexOf(x) === i).join("\n");
      enqueueExport({
        op: "group.create",
        branchId: branch,
        entityId: 0,
        body: {
          slotId: found.id,
          name: groupName || slotNow.groupName,
          note: noteNew,
          limit: limit || 0,
          branch_ids: [branch],
          subject_id: sid,
          subject_ids: [sid],
          status_id: statusId || slotNow.statusId || 1,
          b_date: bDate,
          e_date: eDate,
          custom_hashtagkursa: hashtags,
          custom_workingout: makeup,
          custom_prioritet: priority,
          ...(levelId ? { level_id: levelId } : {}),
          ...(teacherIds.length ? { teacher_ids: teacherIds } : {}),
          beats: (slotNow.beats?.length
            ? slotNow.beats
            : [{ day: slotNow.day, timeFrom: slotNow.timeFrom, timeTo: slotNow.timeTo, lessonId: slotNow.lessonId }]
          ).map((b) => ({ day: b.day, timeFrom: b.timeFrom, timeTo: b.timeTo, lessonId: b.lessonId || 0 })),
        },
      });
      logAdmin(`Группа ${found.id}: на сайте, создание в очереди Alfa`);
      return pack(saved, { queued: true, local: true });
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
          courseSubjects: courseSubjectIndex(),
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
          remaps: res.remaps || [],
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
      const { loadScheduleMap } = await import("./schedule-map");
      const { publicSiteBoard } = await import("./public-bind-core");
      const tariffs = guessTariffLinks(loadTariffs().items);
      const map = loadScheduleMap();
      const board = publicSiteBoard(slots, tree, map.courses, tariffs);
      return {
        ok: true as const,
        ...board,
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
    if (data.action === "lessonGet") {
      const branch = Number(data.branchId) || 1;
      const lessonId = Number(data.lessonId || 0);
      const gid = Number(data.groupId) || 0;
      const dateIso = isoish(String(data.date || ""));
      const slot = gid
        ? listAdminSlots().find((s) => s.groupId === gid && s.branchId === branch) || listAdminSlots().find((s) => s.groupId === gid)
        : undefined;
      const card = gid && (lessonId < 0 || !data.fresh) ? loadGroupCard(branch, gid) : null;
      const cal = card?.calendar || [];
      const hit =
        cal.find((x) => (lessonId ? Number(x.lessonId) === lessonId : false)) ||
        cal.find((x) => dateIso && isoish(x.date) === dateIso);
      const { listTeachers, teachersAtBranch } = await import("./crm-teachers");
      const teachers = teachersAtBranch(branch, listTeachers(listAdminSlots())).map((t) => ({ id: t.id, name: t.name }));
      const roomSeen = new Set<number>();
      const rooms: { id: number; name: string }[] = [];
      for (const x of cal) {
        const id = Number(x.roomId) || 0;
        if (!id || roomSeen.has(id)) continue;
        roomSeen.add(id);
        rooms.push({ id, name: x.room || `аудитория ${id}` });
      }
      const cachedRooms = roomCache.get(branch)?.items || [];
      for (const x of cachedRooms) {
        if (roomSeen.has(x.id)) continue;
        roomSeen.add(x.id);
        rooms.push(x);
      }
      const seen = new Set<number>();
      const groupList = listAdminSlots()
        .filter((s) => s.branchId === branch && s.groupId)
        .map((s) => ({ id: s.groupId, name: s.groupName || `группа ${s.groupId}` }))
        .filter((g) => (seen.has(g.id) ? false : (seen.add(g.id), true)));
      const catalog = lessonCatalogOf(branch);
      if (lessonId < 0 || (!data.fresh && (hit || slot))) {
        const { dossiersInGroup } = await import("./dossiers");
        const people = gid ? dossiersInGroup(branch, gid) : [];
        const customerIds = (hit?.customerIds?.length ? hit.customerIds : people.map((d) => d.crmId)).map(Number).filter((n) => n > 0);
        const from = hm(String(hit?.from || slot?.timeFrom || data.time || ""));
        const to = hm(String(hit?.to || slot?.timeTo || data.timeTo || ""));
        return {
          ok: true as const,
          fromCache: true,
          lesson: {
            id: Number(hit?.lessonId || lessonId || 0),
            date: isoish(String(hit?.date || dateIso)),
            from,
            to,
            duration: Number(hit?.duration || data.duration) || durationMins(from, to) || 90,
            status: Number(hit?.status || 1),
            typeId: Number(hit?.typeId || 2),
            type: String(hit?.type || "Групповое"),
            roomId: Number(hit?.roomId || 0),
            groupIds: (hit?.groupIds?.length ? hit.groupIds : gid ? [gid] : []).map(Number).filter((n) => n > 0),
            customerIds,
            customers: customerIds.map((cid) => {
              const d = people.find((x) => x.crmId === cid) || findDossier({ crmId: cid });
              const name = String(d?.child?.fio || d?.parent?.fio || "").trim();
              return { id: cid, name: name || `клиент ${cid}` };
            }),
            subjectId: Number(hit?.subjectId || slot?.subjectId || data.subjectId || 0),
            teacherIds: (hit?.teacherIds?.length ? hit.teacherIds : slot?.teacherId ? [slot.teacherId] : []).map(Number).filter((n) => n > 0),
            topic: String(hit?.topic || data.topic || ""),
            note: String(hit?.note || data.note || ""),
          },
          rooms,
          teachers,
          subjects: catalog.subjects,
          groups: groupList,
        };
      }
      const { token, request, formatRuDob } = await import("./alfacrm");
      const t = await token();
      const dateRu = dateIso ? formatRuDob(dateIso) : "";
      async function findLesson() {
        if (!lessonId && !dateIso) return null;
        const packs = await Promise.all(
          [1, 2, 3].map((status) =>
            request<{ items?: Record<string, unknown>[] }>(
              `/v2api/${branch}/lesson/index`,
              {
                page: 0,
                pageSize: 50,
                status,
                ...(gid ? { group_id: gid } : {}),
                ...(dateRu ? { date_from: dateRu, date_to: dateRu } : {}),
              },
              t,
            ).catch(() => ({ items: [] as Record<string, unknown>[] })),
          ),
        );
        for (const json of packs) {
          const hit = (json.items || []).find((x) =>
            lessonId ? Number(x.id) === lessonId : isoish(String(x.date || x.lesson_date || "")) === dateIso,
          );
          if (hit) return hit;
        }
        return null;
      }
      const [raw, alfaRooms, alfaTeachers] = await Promise.all([
        findLesson(),
        rooms.length ? Promise.resolve(rooms) : roomsOfBranch(request, t, branch),
        teachers.length ? Promise.resolve(teachers) : teachersOfBranch(request, t, branch),
      ]);
      const from = hm(String(raw?.time_from || data.time || ""));
      const to = hm(String(raw?.time_to || data.timeTo || ""));
      const teacherIds = (Array.isArray(raw?.teacher_ids) ? raw!.teacher_ids : data.teacherIds || []).map(Number).filter((n) => n > 0);
      const customerIds = (Array.isArray(raw?.customer_ids) ? raw!.customer_ids : data.customerIds || []).map(Number).filter((n) => n > 0);
      const groupIds = (Array.isArray(raw?.group_ids) ? raw!.group_ids : []).map(Number).filter((n) => n > 0);
      if (!groupIds.length && gid) groupIds.push(gid);
      const customers = customerIds.map((cid) => {
        const d = findDossier({ crmId: cid });
        const name = String(d?.child?.fio || d?.parent?.fio || "").trim();
        return { id: cid, name: name || `клиент ${cid}` };
      });
      return {
        ok: true as const,
        fromCache: false,
        lesson: {
          id: Number(raw?.id || lessonId || 0),
          date: isoish(String(raw?.date || raw?.lesson_date || dateIso)),
          from,
          to,
          duration: Number(raw?.duration || data.duration) || durationMins(from, to) || 90,
          status: Number(raw?.status || 1),
          typeId: Number(raw?.lesson_type_id || 2),
          type: String(raw?.lesson_type_name || "Групповое"),
          roomId: Number(raw?.room_id || data.roomId || 0),
          groupIds,
          customerIds,
          customers,
          subjectId: Number(raw?.subject_id || data.subjectId || 0),
          teacherIds,
          topic: String(raw?.topic || data.topic || ""),
          note: String(raw?.note || data.note || ""),
        },
        rooms: rooms.length ? rooms : alfaRooms,
        teachers: teachers.length ? teachers : alfaTeachers,
        subjects: catalog.subjects,
        groups: groupList,
      };
    }
    if (data.action === "lessonSave") {
      const { formatRuDob } = await import("./alfacrm");
      const { enqueueExport } = await import("./crm-export-queue");
      const branch = Number(data.branchId) || 1;
      const rawId = Number(data.lessonId || 0);
      const from = String(data.time || "").slice(0, 5);
      const duration = Number(data.duration) || 90;
      const to = String(data.timeTo || "").slice(0, 5) || addMins(from, duration);
      const dateIso = isoish(String(data.date || ""));
      const dateRu = formatRuDob(dateIso);
      const gid = Number(data.groupId) || Number((data.groupIds || [])[0]) || 0;
      const teacherIds = (data.teacherIds || []).map(Number).filter((n) => n > 0);
      const customerIds = (data.customerIds || []).map(Number).filter((n) => n > 0);
      const groupIds = (data.groupIds || []).map(Number).filter((n) => n > 0);
      if (!groupIds.length && gid) groupIds.push(gid);
      const subjectId = Number(data.subjectId) || 0;
      const roomId = Number(data.roomId) || 0;
      const lessonId = rawId || nextLocalLessonId();
      if (gid) {
        const slot = listAdminSlots().find((s) => s.groupId === gid && s.branchId === branch) || listAdminSlots().find((s) => s.groupId === gid);
        const prevHit = loadGroupCard(branch, gid)?.calendar.find(
          (x) => Number(x.lessonId) === lessonId || (dateIso && x.date === dateIso && x.from === from),
        );
        upsertGroupCalendar(
          branch,
          gid,
          {
            date: dateIso,
            from,
            to,
            duration,
            status: prevHit?.status || 1,
            type: prevHit?.type || "Групповое",
            typeId: prevHit?.typeId || 2,
            roomId: roomId || undefined,
            teacherIds,
            subjectId: subjectId || undefined,
            groupIds,
            customerIds,
            topic: String(data.topic || ""),
            note: String(data.note || ""),
            lessonId,
          },
          { name: slot?.groupName, subjectId: slot?.subjectId, subject: slot?.subject },
        );
      }
      if (lessonId < 0) {
        enqueueExport({
          op: "lesson.create",
          branchId: branch,
          entityId: lessonId,
          body: {
            localId: lessonId,
            date: dateIso,
            lesson_date: dateRu,
            time_from: from,
            time_to: to,
            duration,
            room_id: roomId || null,
            group_ids: groupIds,
            customer_ids: customerIds,
            subject_id: subjectId || undefined,
            teacher_ids: teacherIds,
            topic: String(data.topic || ""),
            note: String(data.note || ""),
            lesson_type_id: 2,
          },
        });
      } else {
        enqueueExport({
          op: "lesson.update",
          branchId: branch,
          entityId: lessonId,
          body: {
            date: dateIso,
            lesson_date: dateRu,
            time_from: from,
            time_to: to,
            duration,
            room_id: roomId || null,
            group_ids: groupIds,
            customer_ids: customerIds,
            subject_id: subjectId || undefined,
            teacher_ids: teacherIds,
            topic: String(data.topic || ""),
            note: String(data.note || ""),
            lesson_type_id: 2,
          },
        });
      }
      logAdmin(`Занятие ${lessonId}: на диске, очередь AlfaCRM`);
      return { ok: true as const, queued: true, lessonId, date: dateIso, from, to, duration };
    }
    if (data.action === "lessonStatus") {
      const { enqueueExport } = await import("./crm-export-queue");
      const branch = Number(data.branchId) || 1;
      const lessonId = Number(data.lessonId || 0);
      const status = Number(data.statusId || 0);
      const gid = Number(data.groupId) || 0;
      if (!lessonId || !status) return { ok: false as const, error: "Нет занятия или статуса." };
      if (gid) {
        const card = loadGroupCard(branch, gid);
        if (card) {
          saveGroupCard({
            ...card,
            calendar: (card.calendar || []).map((x) => (Number(x.lessonId) === lessonId ? { ...x, status } : x)),
          });
        }
      }
      enqueueExport({
        op: "lesson.update",
        branchId: branch,
        entityId: lessonId,
        body: { status, ...(status === 3 ? { init: 1 } : {}) },
      });
      logAdmin(`Занятие ${lessonId}: статус ${status} на диске, очередь AlfaCRM`);
      return { ok: true as const, queued: true, lessonId, status };
    }
    if (data.action === "groupFlags") {
      const branch = Number(data.branchId) || 1;
      const gid = Number(data.groupId) || 0;
      if (!gid) return { ok: false as const, error: "Нет номера группы." };
      const body: Record<string, unknown> = {};
      if (data.statusId != null) body.status_id = Number(data.statusId);
      if (data.priority != null) body.custom_prioritet = readPriority(data.priority);
      if (!Object.keys(body).length) return { ok: false as const, error: "Нечего сохранять." };
      const slots = saveAdminSlots(
        listAdminSlots().map((s) => {
          if (s.groupId !== gid || s.branchId !== branch) return s;
          return {
            ...s,
            ...(data.statusId != null ? { statusId: Number(data.statusId) } : {}),
            ...(data.priority != null ? { priority: readPriority(data.priority) } : {}),
          };
        }),
      ).slots;
      const { enqueueExport } = await import("./crm-export-queue");
      enqueueExport({ op: "group.update", branchId: branch, entityId: gid, body });
      const prev = loadGroupCard(branch, gid);
      if (prev) {
        saveGroupCard({
          ...prev,
          ...(data.statusId != null ? { statusId: Number(data.statusId) } : {}),
          ...(data.priority != null ? { priority: readPriority(data.priority) } : {}),
          at: new Date().toISOString(),
        });
      }
      logAdmin(`Группа ${gid}: флаги на сайте, выгрузка в очередь`);
      return { ok: true as const, queued: true, slots };
    }
    return { ok: false as const, error: "Неизвестное действие." };
  });
