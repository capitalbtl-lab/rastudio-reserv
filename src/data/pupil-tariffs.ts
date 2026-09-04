import type { CrmSlot } from "./crm-slots-core";
import type { CrmTariff } from "./crm-tariffs";
import { matchTariffs, tariffFitsSlot } from "./crm-tariffs";
import { UNMAPPED_SCHOOL } from "./group-status";

export type PupilGroup = {
  key: string;
  groupId: number;
  branchId: number;
  name: string;
  school: string;
  course: string;
  age: string;
  teacher: string;
  taken: number;
  limit: number;
  subjectId: number;
};

export type PupilTariffItem = {
  customerId: number;
  name: string;
  status: string;
  groupId: number;
  branchId: number;
  groupName: string;
  school: string;
  tariffId: number;
  tariffName: string;
  price: number;
  periodCount: number;
  periodType: number;
  calcType: number;
  subjectIds: number[];
  lessonTypeIds: number[];
  lessonsCount: number;
  eDate?: string;
  skip?: "no-tariff" | "already" | "lead";
  activeTariffs?: { id: number; tariffId: number; name: string }[];
};

export const ASSIGN_CHUNK = 5;
export const ASSIGN_GAP_MS = 900;
export const ASSIGN_BATCH_PAUSE_MS = 2500;
export const ASSIGN_REST_EVERY = 40;
export const ASSIGN_REST_MS = 8000;
/** Сколько групп мастер читает за один запрос к CRM — иначе прокси обрывает длинное чтение. */
export const PLAN_GROUP_CHUNK = 6;

export function assignEtaMin(n: number) {
  const count = Math.max(0, Number(n) || 0);
  const batches = Math.ceil(count / ASSIGN_CHUNK) || 0;
  const rests = Math.floor(count / ASSIGN_REST_EVERY);
  const ms = count * (ASSIGN_GAP_MS + 450) + batches * ASSIGN_BATCH_PAUSE_MS + rests * ASSIGN_REST_MS;
  return Math.max(1, Math.ceil(ms / 60000));
}

export function uniqueLiveGroups(slots: CrmSlot[]): PupilGroup[] {
  const seen = new Set<string>();
  const out: PupilGroup[] = [];
  for (const s of slots) {
    if (!s.groupId) continue;
    const key = `${s.branchId}:${s.groupId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      groupId: s.groupId,
      branchId: s.branchId,
      name: s.groupName || `группа ${s.groupId}`,
      school: s.school || UNMAPPED_SCHOOL,
      course: s.course || s.subject || "",
      age: s.age || "",
      teacher: s.teacher || "",
      taken: Number(s.taken || 0) || Number(s.takenStudy || 0) + Number(s.takenLead || 0),
      limit: Number(s.limit || 0),
      subjectId: Number(s.subjectId || 0),
    });
  }
  out.sort(
    (a, b) =>
      a.school.localeCompare(b.school, "ru") ||
      a.course.localeCompare(b.course, "ru") ||
      a.name.localeCompare(b.name, "ru"),
  );
  return out;
}

/** Группа в мастере, если есть хоть кто-то: ученик, лид или архив. */
export function groupHasBoundPupils(taken: number, active: number, archive: number) {
  return Number(taken) > 0 || Number(active) > 0 || Number(archive) > 0;
}

export function pickBestTariff(slot: Pick<CrmSlot, "subjectId" | "branchId" | "timeFrom" | "timeTo" | "tariffId" | "courseId" | "schoolId">, list: CrmTariff[]) {
  const saved = Number(slot.tariffId) || 0;
  if (saved) {
    const hit = list.find((t) => t.id === saved && !t.archive);
    if (hit && tariffFitsSlot(hit, slot as CrmSlot)) return hit;
  }
  return matchTariffs(slot as CrmSlot, list)[0] || null;
}

export function pupilRowFromMember(
  m: { id: number; name: string; status: string; archived?: boolean },
  group: PupilGroup,
  tariff: CrmTariff | null,
  includeLeads: boolean,
): PupilTariffItem | null {
  if (!m.id) return null;
  if (m.archived || m.status === "архив") return null;
  if (m.status === "лид" && !includeLeads) return null;
  const skip = !tariff ? ("no-tariff" as const) : m.status === "лид" ? ("lead" as const) : undefined;
  const subjects = [...new Set([...(tariff?.subjectIds || []), group.subjectId].filter(Boolean))];
  const lessons = tariff?.lessonTypeIds?.length ? [...tariff.lessonTypeIds] : [2];
  return {
    customerId: m.id,
    name: m.name || `ученик ${m.id}`,
    status: m.status,
    groupId: group.groupId,
    branchId: group.branchId,
    groupName: group.name,
    school: group.school,
    tariffId: tariff?.id || 0,
    tariffName: tariff?.name || "",
    price: tariff?.price || 0,
    periodCount: tariff?.periodCount || 0,
    periodType: tariff?.periodType || 1,
    calcType: tariff && Number(tariff.calculationType) === 2 ? 1 : 0,
    subjectIds: subjects,
    lessonTypeIds: lessons,
    lessonsCount: tariff?.lessonsCount || 0,
    skip,
  };
}

export function addPeriod(iso: string, count: number, type: number) {
  if (!iso || !count) return "";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  if (type === 1) d.setDate(d.getDate() + count);
  else if (type === 2) d.setDate(d.getDate() + count * 7);
  else if (type === 3) d.setMonth(d.getMonth() + count);
  else if (type === 4) d.setFullYear(d.getFullYear() + count);
  else return "";
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function assignable(items: PupilTariffItem[]) {
  return items.filter((x) => x.tariffId && x.customerId && x.skip !== "no-tariff" && x.skip !== "already");
}

/** Тело customer-tariff/create. customer_id и lesson_type_ids всегда в корне.
 *  В AlfaCRM customer_id ещё и в query: /create?customer_id= */
export function customerTariffCreatePath(branch: number, customerId: number) {
  return `/v2api/${Number(branch) || 1}/customer-tariff/create?customer_id=${Number(customerId) || 0}`;
}

export function customerTariffIndexPath(branch: number, customerId: number) {
  return `/v2api/${Number(branch) || 1}/customer-tariff/index?customer_id=${Number(customerId) || 0}`;
}

export function customerTariffIndexBranchPath(branch: number) {
  return `/v2api/${Number(branch) || 1}/customer-tariff/index`;
}

export function customerTariffUpdatePath(branch: number, tariffRowId: number, customerId: number) {
  return `/v2api/${Number(branch) || 1}/customer-tariff/update?id=${Number(tariffRowId) || 0}&customer_id=${Number(customerId) || 0}`;
}

export function customerTariffDeletePath(branch: number, tariffRowId: number, customerId: number) {
  return `/v2api/${Number(branch) || 1}/customer-tariff/delete?id=${Number(tariffRowId) || 0}&customer_id=${Number(customerId) || 0}`;
}

export function tariffDateToIso(raw: string) {
  const s = String(raw || "").trim();
  if (!s || /^0{2,4}[-.]0{1,2}[-.]0{1,4}/.test(s)) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const y = Number(iso[1]);
    if (y < 2000) return "";
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (ru) {
    const y = Number(ru[3]);
    if (y < 2000) return "";
    return `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}`;
  }
  return "";
}

export type CatalogTariff = { id: number; name: string; archive?: boolean; price?: number };

/** Актуальный сегодня: не удалён, уже начался, ещё не закончился. Пустая «до» = бессрочный. */
export function customerTariffLive(it: Record<string, unknown>, _catalog?: CatalogTariff[], today = todayIso()) {
  if (Number(it.removed || it.is_archived || it.is_archive || 0) === 1) return false;
  if (!(Number(it.id) > 0)) return false;
  const tariffId = Number(it.tariff_id || it.tariffId || 0);
  if (!tariffId) return false;
  const from = tariffDateToIso(String(it.b_date || it.bDate || ""));
  const to = tariffDateToIso(String(it.e_date || it.eDate || ""));
  if (from && from > today) return false;
  if (to && to < today) return false;
  return true;
}

export function preferCurrentTariffs(
  list: { id: number; tariffId: number; name: string }[],
  catalog?: CatalogTariff[],
) {
  if (!list.length || !catalog?.length) return list;
  const liveIds = new Set(catalog.filter((c) => !c.archive).map((c) => c.id));
  if (!liveIds.size) return list;
  const preferred = list.filter((t) => liveIds.has(t.tariffId));
  return preferred.length ? preferred : list;
}

export function customerTariffLabel(it: Record<string, unknown>, catalog?: CatalogTariff[]) {
  const tariffId = Number(it.tariff_id || it.tariffId || 0);
  const raw = String(it.tariff_name || it.tariffName || "").trim();
  if (raw && !/^абонемент(#\s*\d+)?$/i.test(raw)) return raw;
  const live = catalog?.find((t) => t.id === tariffId && !t.archive);
  if (live?.name) return live.name;
  const any = catalog?.find((t) => t.id === tariffId);
  if (any?.name) return any.name;
  return tariffId ? `абонемент #${tariffId}` : "абонемент";
}

export function withCatalogNames(
  list: { id: number; tariffId: number; name: string }[],
  catalog?: CatalogTariff[],
) {
  if (!catalog?.length) return list;
  return list.map((t) => {
    const live = catalog.find((c) => c.id === t.tariffId && !c.archive);
    if (live?.name) return { ...t, name: live.name };
    const any = catalog.find((c) => c.id === t.tariffId);
    if (any?.name) return { ...t, name: any.name };
    if (t.name && !/^абонемент(#\s*\d+)?$/i.test(t.name)) return t;
    return { ...t, name: t.tariffId ? `абонемент #${t.tariffId}` : "абонемент" };
  });
}

export function formatTariffNames(list: { name: string }[] | undefined) {
  const order: string[] = [];
  const count = new Map<string, number>();
  for (const t of list || []) {
    const name = String(t.name || "").trim() || "абонемент";
    if (!count.has(name)) order.push(name);
    count.set(name, (count.get(name) || 0) + 1);
  }
  return order.map((n) => {
    const c = count.get(n) || 1;
    return c > 1 ? `${n} ×${c}` : n;
  }).join(", ");
}

export function activeCustomerTariffs(
  items: Record<string, unknown>[] | undefined,
  catalog?: CatalogTariff[],
) {
  return (items || []).filter((it) => customerTariffLive(it, catalog)).map((it) => ({
    id: Number(it.id),
    tariffId: Number(it.tariff_id || it.tariffId || 0),
    name: customerTariffLabel(it, catalog),
  }));
}

/** Индекс живых абонементов филиала: customer_id → список. Один index вместо запроса на каждого ученика. */
export function splitCustomerTariffs(
  items: Record<string, unknown>[] | undefined,
  catalog?: CatalogTariff[],
) {
  const live = new Map<number, { id: number; tariffId: number; name: string }[]>();
  const archived = new Map<number, { id: number; tariffId: number; name: string }[]>();
  for (const it of items || []) {
    if (Number(it.removed || it.is_archived || it.is_archive || 0) === 1) continue;
    const id = Number(it.id) || 0;
    const customerId = Number(it.customer_id ?? it.customerId ?? 0);
    const tariffId = Number(it.tariff_id || it.tariffId || 0);
    if (!id || !customerId || !tariffId) continue;
    const row = { id, tariffId, name: customerTariffLabel(it, catalog) };
    const bucket = customerTariffLive(it, catalog) ? live : archived;
    const list = bucket.get(customerId) || [];
    list.push(row);
    bucket.set(customerId, list);
  }
  if (catalog?.length) {
    for (const [cid, list] of live) live.set(cid, preferCurrentTariffs(list, catalog));
  }
  return { live, archived };
}

export function indexActiveTariffsByCustomer(
  items: Record<string, unknown>[] | undefined,
  catalog?: CatalogTariff[],
) {
  return splitCustomerTariffs(items, catalog).live;
}

export function countArchivedOnlyPupils<T extends { customerId: number; branchId: number }>(
  pupils: T[],
  live: Map<string, unknown[]>,
  archived: Map<string, unknown[]>,
) {
  const seen = new Set<string>();
  let n = 0;
  for (const row of pupils) {
    const key = `${row.branchId}:${row.customerId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if ((live.get(key) || []).length) continue;
    if ((archived.get(key) || []).length) n += 1;
  }
  return n;
}

export function keepPupilsWithActiveTariffs<T extends { customerId: number; branchId: number }>(
  items: T[],
  byCustomer: Map<string, { id: number; tariffId: number; name: string }[]>,
) {
  const out: (T & { activeTariffs: { id: number; tariffId: number; name: string }[] })[] = [];
  for (const row of items) {
    const list = byCustomer.get(`${row.branchId}:${row.customerId}`) || [];
    if (!list.length) continue;
    out.push({ ...row, activeTariffs: list });
  }
  return out;
}

/** Удаление/изменение — по человеку, не по «человек × группа». Кто в двух группах, одна строка. */
export function collapsePupilsByCustomer(items: PupilTariffItem[]) {
  const map = new Map<string, PupilTariffItem>();
  for (const it of items) {
    const key = `${it.branchId}:${it.customerId}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...it });
      continue;
    }
    const groups = [...new Set([prev.groupName, it.groupName].filter(Boolean))];
    const tariffs = [...(prev.activeTariffs || []), ...(it.activeTariffs || [])].filter(
      (t, i, a) => a.findIndex((x) => x.id === t.id) === i,
    );
    map.set(key, {
      ...prev,
      groupName: groups.join(" · "),
      activeTariffs: tariffs.length ? tariffs : prev.activeTariffs,
    });
  }
  return [...map.values()];
}

export function pupilListStats(items: PupilTariffItem[]) {
  const people = new Set(items.map((it) => `${it.branchId}:${it.customerId}`));
  const leads = new Set(items.filter((it) => it.status === "лид").map((it) => `${it.branchId}:${it.customerId}`));
  return {
    rows: items.length,
    unique: people.size,
    dual: Math.max(0, items.length - people.size),
    leads: leads.size,
  };
}
export function customerTariffPayload(opts: {
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
}) {
  const customerId = Number(opts.customerId) || 0;
  const tariffId = Number(opts.tariffId) || 0;
  const lessonTypeIds = (opts.lessonTypeIds || []).map(Number).filter((n) => n > 0);
  const subjectIds = (opts.subjectIds || []).map(Number).filter((n) => n > 0);
  const body: Record<string, unknown> = {
    customer_id: customerId,
    tariff_id: tariffId,
    b_date: String(opts.bDate || "").trim(),
    lesson_type_ids: lessonTypeIds.length ? lessonTypeIds : [2],
  };
  if (opts.eDate) body.e_date = String(opts.eDate);
  const groupId = Number(opts.groupId) || 0;
  if (groupId) body.group_id = groupId;
  if (subjectIds.length) body.subject_ids = subjectIds;
  if (Number(opts.lessonsCount) > 0) body.lesson_count = Number(opts.lessonsCount);
  if (opts.note) body.note = String(opts.note);
  const calcType = Number(opts.calcType) ? 1 : 0;
  body.is_separate_balance = calcType;
  body.calculation_type = calcType ? 2 : 1;
  const periodType = Number(opts.periodType) || 0;
  const periodCount = Number(opts.periodCount) || 0;
  if (periodCount) {
    body.period = periodCount;
    body.period_type = periodType || 1;
    body.unit = periodType === 2 ? "weeks" : periodType === 3 ? "months" : periodType === 4 ? "years" : "days";
  }
  return body;
}

/** Абонемент подходит к предмету группы, если предмет не задан или входит в карту абонемента. */
export function tariffMatchesSubject(tariff: { subjectIds?: number[] } | null | undefined, subjectId: number) {
  const id = Number(subjectId) || 0;
  if (!id) return true;
  const ids = tariff?.subjectIds || [];
  if (!ids.length) return false;
  return ids.includes(id);
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
