/** Ручная догрузка журнала: группа / школа / 10 учеников. Не весь API сразу. */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SCHOOL_ORDER } from "./crm-slots-core";
import { isCampStatus } from "./group-status";
import { alfaLinkedNow } from "./crm-alfa-link";
import { loadCachePolicy } from "./crm-cache-policy";
import { listAdminSlots } from "./alfacrm-schedule";
import { allDossierCrmIds, findDossier, dossiersInGroup } from "./dossiers";
import { loadGroupCard, loadCustomerCalendar } from "./group-cards";
import { customerSyncOf } from "./crm-customer-sync";
import { isPayJournalComplete } from "./crm-pay";

export type JournalPullKind = "group" | "school" | "students" | "balance";
export type JournalPullStudy = "1" | "2" | "all";

export type JournalPullGroup = {
  groupId: number;
  branchId: number;
  name: string;
  school: string;
  taken: number;
  archived?: boolean;
};

type PullStore = {
  at: string;
  note: string;
  groupIdx: number;
  schoolIdx: Record<string, number>;
  studentIdx: Record<string, number>;
};

function fileOf() {
  return join(process.cwd(), "storage", "crm-journal-pull.json");
}

function emptyStore(): PullStore {
  return { at: "", note: "", groupIdx: 0, schoolIdx: {}, studentIdx: {} };
}

function loadStore(): PullStore {
  try {
    if (!existsSync(fileOf())) return emptyStore();
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<PullStore>;
    return {
      at: String(raw.at || ""),
      note: String(raw.note || ""),
      groupIdx: Math.max(0, Number(raw.groupIdx) || 0),
      schoolIdx: raw.schoolIdx && typeof raw.schoolIdx === "object" ? raw.schoolIdx : {},
      studentIdx: raw.studentIdx && typeof raw.studentIdx === "object" ? raw.studentIdx : {},
    };
  } catch {
    return emptyStore();
  }
}

function saveStore(next: PullStore) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify(next, null, 0), "utf8");
  return next;
}

function schoolOf(s: { school?: string }) {
  return String(s.school || "").trim() || "Прочее";
}

export function journalPullGroups(): JournalPullGroup[] {
  const slots = listAdminSlots();
  const out: JournalPullGroup[] = [];
  const seen = new Set<string>();
  for (const s of slots) {
    const gid = Number(s.groupId) || 0;
    const bid = Number(s.branchId) || 0;
    if (!gid || !bid || isCampStatus(s.statusId)) continue;
    const k = `${bid}:${gid}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      groupId: gid,
      branchId: bid,
      name: String(s.groupName || `группа ${gid}`),
      school: schoolOf(s),
      taken: Number(s.taken) || 0,
      archived: Number(s.statusId) === 3,
    });
  }
  const schoolRank = (name: string) => {
    const i = SCHOOL_ORDER.indexOf(name as (typeof SCHOOL_ORDER)[number]);
    return i < 0 ? SCHOOL_ORDER.length : i;
  };
  return out.sort(
    (a, b) =>
      Number(a.archived) - Number(b.archived) ||
      schoolRank(a.school) - schoolRank(b.school) ||
      a.name.localeCompare(b.name, "ru") ||
      a.groupId - b.groupId,
  );
}

export function journalPullSchools() {
  const map = new Map<string, number>();
  for (const g of journalPullGroups()) map.set(g.school, (map.get(g.school) || 0) + 1);
  return SCHOOL_ORDER.filter((n) => map.has(n))
    .concat([...map.keys()].filter((n) => !SCHOOL_ORDER.includes(n as (typeof SCHOOL_ORDER)[number])).sort((a, b) => a.localeCompare(b, "ru")))
    .map((name) => ({ name, groups: map.get(name) || 0 }));
}

function rankedStudentIds(study: JournalPullStudy, group?: { groupId: number; branchId: number }, school?: string) {
  let pool: number[] = [];
  if (group && group.groupId) {
    pool = dossiersInGroup(group.branchId, group.groupId).map((d) => Number(d.crmId) || 0).filter(Boolean);
  } else if (school) {
    const seen = new Set<number>();
    for (const g of journalPullGroups().filter((x) => x.school === school)) {
      for (const d of dossiersInGroup(g.branchId, g.groupId)) {
        const id = Number(d.crmId) || 0;
        if (id) seen.add(id);
      }
    }
    pool = [...seen];
  } else {
    pool = allDossierCrmIds();
  }
  const rows = pool.map((cid) => {
    const d = findDossier({ crmId: cid });
    const st = Number(d?.extras?.is_study);
    return { cid, study: Number.isFinite(st) ? st : -1, branchId: Number(d?.branchId || 1) || 1 };
  });
  const filtered = rows.filter((x) => {
    if (x.study === 0) return false;
    if (study === "1") return x.study === 1;
    if (study === "2") return x.study === 2;
    return x.study === 1 || x.study === 2;
  });
  filtered.sort((a, b) => {
    const ra = a.study === 1 ? 0 : 1;
    const rb = b.study === 1 ? 0 : 1;
    return ra - rb || a.cid - b.cid;
  });
  return filtered;
}

function pickSlice<T>(list: T[], idx: number, take: number) {
  const start = list.length ? idx % list.length : 0;
  const slice = list.slice(start, start + take);
  const next = list.length ? (start + slice.length) % list.length : 0;
  const wrapped = Boolean(list.length) && start + take >= list.length;
  return { slice, next, start, wrapped };
}

const MISS_CAP = 40;

function fioOf(cid: number) {
  const d = findDossier({ crmId: cid });
  return String(d?.name || "").trim() || `клиент ${cid}`;
}

function packList<T>(rows: T[], cap = MISS_CAP) {
  return { total: rows.length, items: rows.slice(0, cap), more: Math.max(0, rows.length - cap) };
}

export function journalPullProgress() {
  const groups = journalPullGroups();
  const groupRows = groups.map((g) => {
    const card = loadGroupCard(g.branchId, g.groupId);
    const lessons = (card?.calendar || []).length;
    const done = Boolean(card?.at) && lessons > 0;
    return { ...g, lessons, done };
  });
  const groupsMiss = groupRows.filter((g) => !g.done).map((g) => ({
    groupId: g.groupId,
    branchId: g.branchId,
    name: g.name,
    school: g.school,
    extra: g.lessons ? `${g.lessons} зан. неполно` : "нет журнала",
  }));
  const groupsDone = groupRows.filter((g) => g.done).map((g) => ({
    groupId: g.groupId,
    branchId: g.branchId,
    name: g.name,
    school: g.school,
    extra: `${g.lessons} зан.`,
  }));

  function studentSide(study: JournalPullStudy) {
    const people = rankedStudentIds(study);
    const missJ: { id: number; name: string; extra: string }[] = [];
    const missC: { id: number; name: string; extra: string }[] = [];
    let journalDone = 0;
    let cardDone = 0;
    for (const p of people) {
      const sync = customerSyncOf(p.cid);
      const calN = loadCustomerCalendar(p.cid).length;
      const journal = Boolean(sync.lessonsAttend || sync.lessonsFull) || calN > 0;
      const pays = isPayJournalComplete(p.cid);
      const name = fioOf(p.cid);
      if (journal) journalDone += 1;
      else missJ.push({ id: p.cid, name, extra: "нет явки" });
      if (journal && pays) cardDone += 1;
      else missC.push({ id: p.cid, name, extra: journal ? "нет кассы" : "нет явки" });
    }
    return {
      total: people.length,
      journalDone,
      cardDone,
      missJournal: packList(missJ),
      missCard: packList(missC),
    };
  }

  const live = studentSide("1");
  const arch = studentSide("2");
  return {
    groups: {
      total: groups.length,
      done: groupsDone.length,
      miss: packList(groupsMiss, 80),
      doneList: packList(groupsDone, 20),
    },
    live,
    archive: arch,
  };
}

export function journalPullState() {
  const store = loadStore();
  const pol = loadCachePolicy();
  const groups = journalPullGroups();
  const schools = journalPullSchools();
  const all = rankedStudentIds("all");
  const live = rankedStudentIds("1");
  const arch = rankedStudentIds("2");
  return {
    ok: true as const,
    at: store.at,
    note: store.note,
    groupIdx: store.groupIdx,
    groups,
    schools,
    journalNext: Number(pol.journalNext) || 0,
    journalTotal: Number(pol.journalTotal) || groups.length,
    lessonsNext: Number(pol.lessonsNext) || 0,
    lessonsTotal: Number(pol.lessonsTotal) || all.length,
    students: { all: all.length, live: live.length, archive: arch.length },
    linked: alfaLinkedNow(),
    progress: journalPullProgress(),
  };
}

async function pullOneGroup(g: JournalPullGroup) {
  const { inboundJournalGroup } = await import("./crm-journal-inbound");
  return inboundJournalGroup(g.branchId, g.groupId, { deep: true });
}

async function pullOneStudent(cid: number, branchId: number, balance: boolean) {
  const { inboundCustomerLessons } = await import("./crm-journal-inbound");
  let lessons = 0;
  let done = false;
  for (let round = 0; round < 6; round += 1) {
    const res = await inboundCustomerLessons(branchId, cid, { take: 8, deep: 12, continueLater: false, full: true, force: true }).catch(() => ({
      count: 0,
      done: true as const,
      skipped: undefined as string | undefined,
    }));
    lessons += Number(res.count) || 0;
    if ("skipped" in res && res.skipped === "busy") {
      await new Promise((r) => setTimeout(r, 250));
      continue;
    }
    if (res.done !== false) {
      done = true;
      break;
    }
  }
  let pays = 0;
  let tariffs = 0;
  if (balance) {
    const { token, request } = await import("./alfacrm");
    const t = await token();
    const { inboundCustomerPays, paysOf } = await import("./crm-pay");
    await inboundCustomerPays(request, t, branchId, cid);
    pays = paysOf(cid).length;
    const { pullCustomerTariffs } = await import("./pupil-tariffs");
    const rows = await pullCustomerTariffs(branchId, cid).catch(() => []);
    tariffs = rows.length;
  }
  return { cid, lessons, done, pays, tariffs };
}

export async function journalPull(opts: {
  kind: JournalPullKind;
  groupId?: number;
  branchId?: number;
  school?: string;
  study?: JournalPullStudy;
}) {
  if (!alfaLinkedNow()) {
    return { ok: false as const, error: "Фон с AlfaCRM выключен.", ...journalPullState() };
  }
  const kind = opts.kind;
  const store = loadStore();
  const groups = journalPullGroups();
  const school = String(opts.school || "").trim();
  const study = (opts.study === "1" || opts.study === "2" ? opts.study : "all") as JournalPullStudy;
  const selectedGid = Number(opts.groupId) || 0;
  const selectedBid = Number(opts.branchId) || 0;

  if (kind === "group" || kind === "school") {
    const pool = school ? groups.filter((g) => g.school === school) : groups;
    if (!pool.length) {
      store.note = school ? `В школе «${school}» нет групп на сайте.` : "Сначала загрузите группы из Alfa.";
      store.at = new Date().toISOString();
      saveStore(store);
      return { ok: false as const, error: store.note, ...journalPullState() };
    }
    const take = kind === "school" ? 3 : 1;
    let slice: JournalPullGroup[] = [];
    let next = 0;
    let wrapped = false;
    if (kind === "group" && selectedGid) {
      const hit = pool.find((g) => g.groupId === selectedGid && (!selectedBid || g.branchId === selectedBid)) || pool.find((g) => g.groupId === selectedGid);
      slice = hit ? [hit] : [];
      next = store.groupIdx;
    } else {
      const key = school || "*";
      const idx = school ? Number(store.schoolIdx[key]) || 0 : store.groupIdx;
      const picked = pickSlice(pool, idx, take);
      slice = picked.slice;
      next = picked.next;
      wrapped = picked.wrapped;
      if (school) store.schoolIdx[key] = next;
      else store.groupIdx = next;
    }
    const parts: string[] = [];
    let n = 0;
    for (const g of slice) {
      const res = await pullOneGroup(g).catch(() => ({ extra: `${g.name}: ошибка`, count: 0 }));
      n += Number(res.count) || 0;
      parts.push(res.extra || `${g.name}: ${res.count}`);
    }
    store.note = `${parts.join(" · ")}${wrapped ? " · круг закрыт" : ""}`;
    store.at = new Date().toISOString();
    saveStore(store);
    return { ok: true as const, extra: store.note, count: n, scanned: slice.length, more: kind === "group" ? false : !wrapped, ...journalPullState() };
  }

  const group = selectedGid ? { groupId: selectedGid, branchId: selectedBid || 1 } : undefined;
  const people = rankedStudentIds(study, group, group ? "" : school);
  if (!people.length) {
    store.note = group
      ? "В этой группе нет учеников на диске."
      : school
        ? `В школе «${school}» нет учеников на диске.`
        : "Сначала загрузите клиентов и архив.";
    store.at = new Date().toISOString();
    saveStore(store);
    return { ok: false as const, error: store.note, more: false, ...journalPullState() };
  }
  const key = `${study}:${group ? `${group.branchId}:${group.groupId}` : school || "*"}`;
  const idx = Number(store.studentIdx[key]) || 0;
  const picked = pickSlice(people, idx, 10);
  store.studentIdx[key] = picked.next;
  const balance = kind === "balance";
  const rows: { cid: number; lessons: number; pays: number; tariffs: number }[] = [];
  for (const p of picked.slice) {
    const row = await pullOneStudent(p.cid, p.branchId, balance);
    rows.push(row);
  }
  const lessons = rows.reduce((s, r) => s + r.lessons, 0);
  const pays = rows.reduce((s, r) => s + r.pays, 0);
  store.note = balance
    ? `карточки ${picked.start + 1}–${picked.start + picked.slice.length}/${people.length}: уроков ${lessons}, платежей ${pays}`
    : `журналы ${picked.start + 1}–${picked.start + picked.slice.length}/${people.length}: уроков ${lessons}`;
  if (picked.wrapped) store.note += " · круг закрыт";
  store.at = new Date().toISOString();
  saveStore(store);
  return { ok: true as const, extra: store.note, count: lessons, scanned: picked.slice.length, more: !picked.wrapped, ...journalPullState() };
}
