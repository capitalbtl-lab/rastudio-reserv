/** Ручная догрузка журнала. Закон: по одному, пауза 5 с, пакетом нельзя. */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SCHOOL_ORDER, lessonNeedsHomework, pupilNameOk } from "./crm-slots-core";
import { isCampStatus } from "./group-status";
import { alfaLinkedNow } from "./crm-alfa-link";
import { loadCachePolicy } from "./crm-cache-policy";
import { listAdminSlots } from "./alfacrm-schedule";
import { loadScheduleMap } from "./schedule-map";
import { listDossierCrm, findDossier, dossiersInGroup, overlayAdminGroups } from "./dossiers";
import { loadGroupCard, saveGroupCard, loadCustomerCalendar, fanOutLessonWriteoffs, hydrateGroupCardsFromMonolith } from "./group-cards";
import { customerSyncOf, stampCustomerSync, studentAlfaOwner, lessonsJournalReady, lessonsCountShort, lessonsCountExtra, lessonsStampShort, lessonsStampExtra, stampLessonSetGap, waitLockStudentAlfa, unlockStudentAlfa, studentCensusRange, nextLessonWindowDays } from "./crm-customer-sync";
import { payCustomerFilled, payFillPending, payFillScanned, payFillEmpty, paysOf } from "./crm-pay";
import { balanceOf } from "./crm-pay-core";
import { writeoffSumOf } from "./crm-ledger-core";
import { journalPeriods, journalChunks, spanOf, inPeriod, groupAge, chunkOverlapsLife, lifeLabel, parseLessonDate, chunkDone, pulledPeriodKeys, clampGrain, earlierRu, laterRu, type Grain } from "./crm-journal-periods";
import { archiveFioOk, archiveWorkingSet, extraGroupKeys, formatArchiveCountNote, loadArchivePolicy, recountArchivePolicy, saveArchivePolicy, addArchiveWorking, type ArchiveCountReport } from "./crm-archive-policy";
import { journalJobSnapshot, parseJobItems } from "./crm-journal-job-core";
import { loadRosterPolicy } from "./crm-roster";
import { countAlfaLessonUniq, countAlfaLessonRows, keepAlfaProbe, uniquePositiveIds, clampRecheckDays, recheckWindowYmd, windowNewLessonIds, windowGoneLessonIds, windowAlfaKeep, journalIdsReady } from "./crm-inbound-core";

export type JournalPullKind = "group" | "school" | "students" | "balance" | "life" | "details" | "archives" | "archivesPupils" | "hydrateDisk" | "archiveCount" | "archiveCatalog" | "archiveAdd" | "audit" | "jobStart" | "jobStop" | "jobStatus" | "roster" | "rosterPolicy" | "holeApprove" | "holeApproveClear" | "lessonsReset" | "paysReset";
export type JournalPullStudy = "1" | "2" | "all";

export type JournalPullGroup = {
  groupId: number;
  branchId: number;
  name: string;
  school: string;
  taken: number;
  archived?: boolean;
  bDate?: string;
  eDate?: string;
};

type LifeReport = {
  at: string;
  school: string;
  total: number;
  young: number;
  mid: number;
  old: number;
  unknown: number;
  youngNames: string[];
  midNames: string[];
  oldNames: string[];
  unknownNames: string[];
  probed?: number;
  left?: number;
};

type StudentHit = {
  cid: number;
  branchId: number;
  name: string;
  groups: string[];
  lessons: number;
  pays: number;
  paysOk?: boolean;
  paysMore?: boolean;
  paysScanned?: boolean;
  paysEmpty?: boolean;
  cashRows?: number;
  rechecked?: boolean;
  paysRechecked?: boolean;
  done: boolean;
  ok: boolean;
  alfa?: number;
  short?: boolean;
  holeN?: number;
  dups?: boolean;
  seated?: number;
  holeApproved?: boolean;
};

type StudentsReport = {
  at: string;
  study: string;
  who: string;
  n: number;
  total: number;
  rows: StudentHit[];
};

let studentPullCid = 0;

type ArchivesReport = {
  at: string;
  added: number;
  total: number;
  branch: string;
  more: boolean;
  names: string[];
};

type ArchivesPupilsReport = {
  at: string;
  study: string;
  clients: number;
  uniqueIds: number;
  live: number;
  need: number;
  already: number;
  added: number;
  left: number;
  more: boolean;
  names: string[];
  missing: number[];
};

type FillHit = {
  pulled?: Record<string, string>;
  rechecked?: string[];
  weak?: string[];
  fail?: Record<string, string>;
  life?: { from: string; to: string; source: string };
  roster?: string;
};

type PullStore = {
  at: string;
  note: string;
  groupIdx: number;
  schoolIdx: Record<string, number>;
  studentIdx: Record<string, number>;
  lastLife?: LifeReport | null;
  lastArchives?: ArchivesReport | null;
  lastArchivesPupils?: ArchivesPupilsReport | null;
  lastStudents?: StudentsReport | null;
  lastArchivePolicy?: ArchiveCountReport | null;
  lastArchiveCatalog?: import("./dossiers").ArchiveCatalogReport | null;
  lastAudit?: import("./crm-balance-audit").AuditReport | null;
  fill?: Record<string, FillHit>;
};

function emptyStore(): PullStore {
  return { at: "", note: "", groupIdx: 0, schoolIdx: {}, studentIdx: {}, lastLife: null, lastArchives: null, lastArchivesPupils: null, lastStudents: null, lastArchivePolicy: null, lastArchiveCatalog: null, lastAudit: null, fill: {} };
}

function fileOf() {
  return join(process.cwd(), "storage", "crm-journal-pull.json");
}

let storeMem: { mtime: number; data: PullStore } | null = null;

function loadStore(): PullStore {
  try {
    const p = fileOf();
    if (!existsSync(p)) {
      storeMem = null;
      return emptyStore();
    }
    const mtime = statSync(p).mtimeMs;
    if (storeMem && storeMem.mtime === mtime) return storeMem.data;
    const raw = JSON.parse(readFileSync(p, "utf8")) as Partial<PullStore>;
    const data: PullStore = {
      at: String(raw.at || ""),
      note: String(raw.note || "")
        .replace(/\s*·\s*на диске архивных\s+\d+\.?\s*/gi, " ")
        .replace(/\s*Кто записан\s*[—–-]\s*слева\.?/gi, "")
        .replace(/\s{2,}/g, " ")
        .replace(/\s*·\s*$/g, "")
        .trim(),
      groupIdx: Math.max(0, Number(raw.groupIdx) || 0),
      schoolIdx: raw.schoolIdx && typeof raw.schoolIdx === "object" ? raw.schoolIdx : {},
      studentIdx: raw.studentIdx && typeof raw.studentIdx === "object" ? raw.studentIdx : {},
      lastLife: raw.lastLife && typeof raw.lastLife === "object" ? (raw.lastLife as LifeReport) : null,
      lastArchives: raw.lastArchives && typeof raw.lastArchives === "object" ? (raw.lastArchives as ArchivesReport) : null,
      lastArchivesPupils: raw.lastArchivesPupils && typeof raw.lastArchivesPupils === "object" ? (raw.lastArchivesPupils as ArchivesPupilsReport) : null,
      lastStudents: raw.lastStudents && typeof raw.lastStudents === "object" ? (raw.lastStudents as StudentsReport) : null,
      lastArchivePolicy: raw.lastArchivePolicy && typeof raw.lastArchivePolicy === "object" ? (raw.lastArchivePolicy as ArchiveCountReport) : null,
      lastArchiveCatalog: raw.lastArchiveCatalog && typeof raw.lastArchiveCatalog === "object" ? (raw.lastArchiveCatalog as PullStore["lastArchiveCatalog"]) : null,
      lastAudit: raw.lastAudit && typeof raw.lastAudit === "object" ? (raw.lastAudit as PullStore["lastAudit"]) : null,
      fill: raw.fill && typeof raw.fill === "object" ? (raw.fill as Record<string, FillHit>) : {},
    };
    storeMem = { mtime, data };
    return data;
  } catch {
    storeMem = null;
    return emptyStore();
  }
}

function saveStore(next: PullStore) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify(next, null, 0), "utf8");
  let mtime = Date.now();
  try {
    mtime = statSync(fileOf()).mtimeMs;
  } catch {
    /* */
  }
  storeMem = { mtime, data: next };
  return next;
}

type ArchiveBag = { at: string; branchIdx: number; items: JournalPullGroup[] };

function archiveFile() {
  return join(process.cwd(), "storage", "crm-journal-archive-groups.json");
}

function emptyArchive(): ArchiveBag {
  return { at: "", branchIdx: 0, items: [] };
}

export function loadJournalArchiveGroups(): JournalPullGroup[] {
  try {
    if (!existsSync(archiveFile())) return [];
    const raw = JSON.parse(readFileSync(archiveFile(), "utf8")) as Partial<ArchiveBag>;
    return Array.isArray(raw.items) ? raw.items.filter((g) => Number(g?.groupId) && Number(g?.branchId)) : [];
  } catch {
    return [];
  }
}

function loadArchiveBag(): ArchiveBag {
  try {
    if (!existsSync(archiveFile())) return emptyArchive();
    const raw = JSON.parse(readFileSync(archiveFile(), "utf8")) as Partial<ArchiveBag>;
    return {
      at: String(raw.at || ""),
      branchIdx: Math.max(0, Number(raw.branchIdx) || 0),
      items: Array.isArray(raw.items) ? raw.items.filter((g) => Number(g?.groupId) && Number(g?.branchId)) : [],
    };
  } catch {
    return emptyArchive();
  }
}

function saveArchiveBag(next: ArchiveBag) {
  mkdirSync(dirname(archiveFile()), { recursive: true });
  writeFileSync(archiveFile(), JSON.stringify(next, null, 0), "utf8");
  return next;
}

function schoolOfArchive(subjectId: number) {
  const hit = loadScheduleMap().courses.find((c) => c.subjectId === subjectId);
  if (hit?.school) return hit.school;
  const live = listAdminSlots().find((s) => Number(s.subjectId) === subjectId && s.school);
  return String(live?.school || "").trim() || "Прочее";
}

function pupilLinkCountMap(study: JournalPullStudy) {
  const map = new Map<string, number>();
  for (const p of rankedStudentIds(study)) {
    const d = findDossier({ crmId: p.cid });
    for (const g of d?.groupLinks || []) {
      const gid = Number(g.id) || 0;
      const bid = Number(g.branchId || p.branchId) || 1;
      if (!gid) continue;
      const k = `${bid}:${gid}`;
      map.set(k, (map.get(k) || 0) + 1);
    }
  }
  return map;
}

function pupilArchivePlan(study: "1" | "2") {
  const people = rankedStudentIds(study);
  const liveKeys = new Set(journalPullGroups().filter((g) => !g.archived).map((g) => `${g.branchId}:${g.groupId}`));
  const bagKeys = new Set(loadJournalArchiveGroups().map((g) => `${g.branchId}:${g.groupId}`));
  const unique = new Map<string, { groupId: number; branchId: number; n: number; name: string }>();
  for (const p of people) {
    const d = findDossier({ crmId: p.cid });
    for (const g of d?.groupLinks || []) {
      const gid = Number(g.id) || 0;
      const bid = Number(g.branchId || p.branchId) || 1;
      if (!gid) continue;
      const k = `${bid}:${gid}`;
      const cur = unique.get(k) || { groupId: gid, branchId: bid, n: 0, name: "" };
      cur.n += 1;
      if (!cur.name) cur.name = String(g.name || "").trim();
      unique.set(k, cur);
    }
  }
  let live = 0;
  const need: { groupId: number; branchId: number; n: number; name: string }[] = [];
  for (const row of unique.values()) {
    if (liveKeys.has(`${row.branchId}:${row.groupId}`)) live += 1;
    else need.push(row);
  }
  need.sort((a, b) => b.n - a.n || a.groupId - b.groupId);
  const already = need.filter((x) => bagKeys.has(`${x.branchId}:${x.groupId}`));
  const pending = need.filter((x) => !bagKeys.has(`${x.branchId}:${x.groupId}`));
  return {
    clients: people.length,
    uniqueIds: unique.size,
    live,
    need: need.length,
    already: already.length,
    pending,
  };
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
      bDate: String(s.bDate || ""),
      eDate: String(s.eDate || ""),
    });
  }
  for (const g of loadJournalArchiveGroups()) {
    const k = `${g.branchId}:${g.groupId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      groupId: g.groupId,
      branchId: g.branchId,
      name: g.name,
      school: schoolOf(g),
      taken: Number(g.taken) || 0,
      archived: true,
      bDate: String(g.bDate || ""),
      eDate: String(g.eDate || ""),
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

/** Живые группы всех филиалов 1–4: админка + сетка. Смены 7–9 не входят. */
export function liveAdminGroups(school?: string) {
  if (school) return journalPullGroups().filter((x) => !x.archived && x.school === school);
  const seen = new Set<string>();
  const out: JournalPullGroup[] = [];
  const push = (g: { groupId: number; branchId: number; name?: string; school?: string; taken?: number; archived?: boolean }) => {
    const gid = Number(g.groupId) || 0;
    const bid = Number(g.branchId) || 0;
    if (!gid || !bid || g.archived) return;
    const k = `${bid}:${gid}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({
      groupId: gid,
      branchId: bid,
      name: String(g.name || `группа ${gid}`),
      school: String(g.school || ""),
      taken: Number(g.taken) || 0,
      archived: false,
    });
  };
  for (const g of overlayAdminGroups()) push(g);
  for (const g of journalPullGroups()) if (!g.archived) push(g);
  return out;
}

function liveAttendeeCids(school?: string) {
  return new Set(rankedStudentIds("1", undefined, school).map((x) => x.cid));
}

function uniqueByCid<T extends { cid: number }>(list: T[]) {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const x of list) {
    if (!x.cid || seen.has(x.cid)) continue;
    seen.add(x.cid);
    out.push(x);
  }
  return out;
}

function rowFromDossier(
  d: { crmId?: number; extras?: Record<string, string>; branchId?: number; status?: string },
  branchId: number,
) {
  const st = Number(d?.extras?.is_study);
  return {
    cid: Number(d.crmId) || 0,
    study: Number.isFinite(st) ? st : -1,
    branchId: Number(d?.branchId || branchId || 1) || 1,
    status: String(d?.status || ""),
    removed: String(d?.extras?.removed || ""),
  };
}

function attendedSince(cid: number, days: number) {
  if (!days) return true;
  const cal = loadCustomerCalendar(cid) || [];
  if (!cal.length) return true;
  let max = 0;
  for (const l of cal) {
    const d = parseLessonDate(l.date);
    if (d) max = Math.max(max, d.getTime());
  }
  if (!max) return true;
  return Date.now() - max <= days * 86400000;
}

function linkHitsLiveGroup(
  links: { id: number; branchId?: number; active?: boolean }[] | undefined,
  g: { groupId: number; branchId: number },
  stamped: boolean,
) {
  return (links || []).some((l) => {
    if (Number(l.id) !== g.groupId) return false;
    if (l.branchId && Number(l.branchId) !== g.branchId) return false;
    if (stamped && l.active === false) return false;
    return true;
  });
}

function rankedStudentIds(study: JournalPullStudy, group?: { groupId: number; branchId: number }, school?: string) {
  const scoped = Boolean(group && group.groupId);
  let pool: { cid: number; study: number; branchId: number; status: string; removed: string }[] = [];
  if (group && group.groupId) {
    pool = dossiersInGroup(group.branchId, group.groupId).map((d) => rowFromDossier(d, group.branchId)).filter((x) => x.cid);
  } else if (study === "1") {
    const groups = liveAdminGroups(school);
    const gids = new Set(groups.map((g) => g.groupId));
    const stamped = new Set(groups.filter((g) => Boolean(fillOf(g.branchId, g.groupId).roster)).map((g) => `${g.branchId}:${g.groupId}`));
    const seen = new Set<number>();
    for (const g of groups) {
      const needActive = stamped.has(`${g.branchId}:${g.groupId}`);
      for (const d of dossiersInGroup(g.branchId, g.groupId)) {
        if (!linkHitsLiveGroup(d.groupLinks, g, needActive)) continue;
        const row = rowFromDossier(d, g.branchId);
        if (!row.cid || seen.has(row.cid)) continue;
        seen.add(row.cid);
        pool.push(row);
      }
    }
    if (!school) {
      for (const x of listDossierCrm()) {
        if (!x.cid || seen.has(x.cid)) continue;
        if (x.status === "удалён" || x.removed === "1") continue;
        const d = findDossier({ crmId: x.cid });
        const hit = (d?.groupLinks || []).some((l) => {
          if (!gids.has(Number(l.id))) return false;
          const key = `${Number(l.branchId || x.branchId) || 0}:${Number(l.id)}`;
          if (stamped.has(key) && l.active === false) return false;
          return true;
        });
        if (!hit) continue;
        seen.add(x.cid);
        pool.push(x);
      }
    }
  } else {
    pool = listDossierCrm();
  }
  const allow = !scoped ? archiveWorkingSet() : null;
  const live = !scoped && study === "2" ? liveAttendeeCids() : null;
  const pol = study === "1" ? loadRosterPolicy() : null;
  const filtered = pool.filter((x) => {
    if (!x.cid) return false;
    if (x.status === "удалён" || x.removed === "1") return false;
    const lead = x.study === 0 || x.status === "лид";
    if (lead) return study === "1";
    if (study === "1") {
      if (x.study === 2 && !pol?.archiveInLive) return false;
      if (pol?.attendDays && !attendedSince(x.cid, pol.attendDays)) return false;
      return true;
    }
    if (study === "2") {
      if (live && live.has(x.cid)) return false;
      return x.study === 2 && (scoped || Boolean(allow && allow.has(x.cid)));
    }
    if (x.study === 1) return true;
    if (x.study === 2) return scoped || Boolean(allow && allow.has(x.cid));
    return false;
  });
  filtered.sort((a, b) => {
    const ra = a.study === 1 ? 0 : 1;
    const rb = b.study === 1 ? 0 : 1;
    return ra - rb || a.cid - b.cid;
  });
  return uniqueByCid(filtered);
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
  const fromDossier = String(d?.child?.fio || d?.parent?.fio || "").trim();
  if (fromDossier && !/^клиент\s+\d+$/i.test(fromDossier)) return fromDossier;
  for (const row of paysOf(cid)) {
    const pay = pupilNameOk((row as { customerName?: string }).customerName);
    if (pay) return pay;
  }
  return `клиент ${cid}`;
}

function groupsOfStudent(cid: number) {
  const d = findDossier({ crmId: cid });
  return (d?.groupLinks || []).map((g) => String(g.name || "").trim()).filter(Boolean);
}

/** Клиенты Alfa без живого cgi. Не архив, не лид, не «сейчас ходят». */
export function peopleWithoutLiveGroup() {
  const live = new Set(rankedStudentIds("1").map((x) => x.cid));
  const out: { cid: number; branchId: number; name: string }[] = [];
  for (const x of listDossierCrm()) {
    if (!x.cid || live.has(x.cid)) continue;
    if (x.status === "удалён" || x.removed === "1") continue;
    if (x.study === 0 || x.status === "лид") continue;
    if (x.study !== 1) continue;
    out.push({ cid: x.cid, branchId: x.branchId || 1, name: fioOf(x.cid) });
  }
  return uniqueByCid(out);
}

function packList<T>(rows: T[], cap = MISS_CAP) {
  return { total: rows.length, items: rows.slice(0, cap), more: Math.max(0, rows.length - cap) };
}

function ruOfDate(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function fillKey(branchId: number, gid: number) {
  return `${branchId}-${gid}`;
}

function fillOf(branchId: number, gid: number): FillHit {
  return loadStore().fill?.[fillKey(branchId, gid)] || {};
}

function patchFill(branchId: number, gid: number, patch: FillHit) {
  const store = loadStore();
  const k = fillKey(branchId, gid);
  store.fill = store.fill || {};
  store.fill[k] = { ...store.fill[k], ...patch };
  saveStore(store);
}

function applyHydrateFills() {
  const h = hydrateGroupCardsFromMonolith();
  for (const x of h.fills) {
    const prev = fillOf(x.branchId, x.groupId);
    patchFill(x.branchId, x.groupId, {
      ...(x.pulled ? { pulled: { ...(prev.pulled || {}), ...x.pulled } } : {}),
      ...(x.rechecked ? { rechecked: [...new Set([...(prev.rechecked || []), ...x.rechecked])] } : {}),
      ...(x.weak ? { weak: x.weak } : {}),
      ...(x.fail ? { fail: { ...(prev.fail || {}), ...x.fail } } : {}),
      ...(x.life && !prev.life ? { life: x.life } : {}),
    });
  }
  return h;
}

function groupLife(g: JournalPullGroup) {
  const fill = fillOf(g.branchId, g.groupId);
  const from = String(fill.life?.from || g.bDate || "");
  let to = String(fill.life?.to || g.eDate || "");
  const end = parseLessonDate(to);
  const cap = new Date();
  cap.setMonth(cap.getMonth() + 3);
  if (end && end > cap) to = ruOfDate(cap);
  const source = fill.life?.source || (from || to ? "slot" : "");
  return { from, to, source };
}

export function groupFillRow(g: JournalPullGroup) {
  const periods = journalPeriods();
  const fill = fillOf(g.branchId, g.groupId);
  const pulledAt = fill.pulled || {};
  const done = pulledPeriodKeys({ done: Object.keys(pulledAt), pulled: pulledAt });
  const fail = fill.fail || {};
  const weak = new Set(fill.weak || []);
  const recheckedSet = new Set(fill.rechecked || []);
  const life = groupLife(g);
  const clipFrom = life.from;
  const clipTo = life.to;
  const age = groupAge(clipFrom, clipTo);
  const known = Boolean(clipFrom || clipTo);
  const cal = loadGroupCard(g.branchId, g.groupId)?.calendar || [];
  const firsts = cal.map((l) => parseLessonDate(l.date)).filter((d): d is Date => Boolean(d));
  const first = firsts.length ? new Date(Math.min(...firsts.map((d) => d.getTime()))) : null;
  const allParts = periods.map((p) => {
    let n = 0;
    let needDetails = 0;
    let conducted = 0;
    for (const l of cal) {
      if (!inPeriod(l.date, p.from, p.to)) continue;
      n += 1;
      if (Number(l.status) === 3) conducted += 1;
      if (lessonNeedsHomework(l)) needDetails += 1;
    }
    const stamped = done.includes(p.key) && !weak.has(p.key);
    const end = parseLessonDate(p.to);
    const emptyPrefix = Boolean(first && end && end < first && cal.length);
    return {
      key: p.key,
      label: p.label,
      from: p.from,
      to: p.to,
      done: stamped || emptyPrefix,
      weak: weak.has(p.key),
      rechecked: recheckedSet.has(p.key) && !weak.has(p.key),
      lessons: n,
      err: fail[p.key] || "",
      at: String(pulledAt[p.key] || ""),
      needDetails,
      conducted,
    };
  });
  const parts = known ? allParts.filter((p) => chunkOverlapsLife(p, clipFrom, clipTo)) : allParts.slice(0, 4);
  const next = parts.find((p) => !p.done);
  const lifeTxt = lifeLabel(life.from, life.to);
  const src = life.source === "alfa" ? "по журналу Alfa" : life.source === "slot" ? "по расписанию" : "";
  const fromLabel = !known ? "срок неизвестен — сначала определите сроки" : lifeTxt ? `${src} ${lifeTxt}`.trim() : "ещё не загружали";
  const complete = parts.length > 0 && parts.every((p) => p.done);
  const lessons = parts.reduce((s, p) => s + (Number(p.lessons) || 0), 0);
  return {
    groupId: g.groupId,
    branchId: g.branchId,
    name: g.name,
    school: g.school,
    archived: g.archived,
    lessons,
    done: parts.filter((p) => p.done).length,
    total: parts.length,
    next: next?.label || "",
    nextKey: next?.key || "",
    from: fromLabel,
    weight: "",
    complete,
    age: age.id,
    ageLabel: age.label,
    life: lifeTxt,
    roster: String(fill.roster || ""),
    extra: complete ? "вся информация загружена" : [age.label, lifeTxt, src].filter(Boolean).join(" · "),
    err: next && fail[next.key] ? fail[next.key] : "",
    source: life.source,
    parts,
  };
}

const blankPeople = (n: number) => ({
  total: n,
  journalDone: 0,
  cardDone: 0,
  missJournal: packList([] as { id: number; name: string; extra: string }[]),
  missCard: packList([] as { id: number; name: string; extra: string }[]),
  people: [] as {
    cid: number;
    branchId: number;
    name: string;
    groups: string[];
    lessons: number;
    alfa?: number;
    short?: boolean;
    holeApproved?: boolean;
    journal: boolean;
    pays: boolean;
    rechecked: boolean;
    paysRechecked: boolean;
    extra: string;
    at: string;
  }[],
});

export function journalPullProgress(opts?: { skipPeople?: boolean }) {
  applyHydrateFills();
  const groups = journalPullGroups();
  const nMap = opts?.skipPeople ? new Map<string, number>() : pupilLinkCountMap("1");
  const rows = groups.map((g) => {
    const row = groupFillRow(g);
    const pupilN = nMap.get(`${g.branchId}:${g.groupId}`) || 0;
    const extra = [row.extra, g.archived ? "архив" : "", pupilN ? `с карточек учеников ${pupilN}` : ""].filter(Boolean).join(" · ");
    return { ...row, extra, pupilN };
  });
  rows.sort((a, b) => {
    if (Boolean(a.archived) !== Boolean(b.archived)) return Number(a.archived) - Number(b.archived);
    if (a.archived) return (b.pupilN || 0) - (a.pupilN || 0) || a.name.localeCompare(b.name, "ru") || (a.groupId || 0) - (b.groupId || 0);
    return a.name.localeCompare(b.name, "ru") || (a.groupId || 0) - (b.groupId || 0);
  });
  const complete = rows.filter((r) => r.complete).length;
  const groupsMiss = rows.filter((r) => r.done < r.total).map((r) => ({
    groupId: r.groupId,
    branchId: r.branchId,
    name: r.name,
    school: r.school,
    extra: r.extra,
    archived: r.archived,
    lessons: r.lessons,
    done: r.done,
    total: r.total,
    next: r.next,
    from: r.from,
    weight: r.weight,
    err: r.err,
  }));
  const groupsDone = rows.filter((r) => r.done >= r.total).map((r) => ({
    groupId: r.groupId,
    branchId: r.branchId,
    name: r.name,
    school: r.school,
    extra: r.extra,
    archived: r.archived,
    lessons: r.lessons,
    done: r.done,
    total: r.total,
    next: "",
    from: r.from,
    weight: r.weight,
    err: "",
  }));

  function studentSide(study: JournalPullStudy) {
    const people = rankedStudentIds(study);
    const missJ: { id: number; name: string; extra: string }[] = [];
    const missC: { id: number; name: string; extra: string }[] = [];
    const peopleRows: {
      cid: number;
      branchId: number;
      name: string;
      groups: string[];
      lessons: number;
      alfa?: number;
      short?: boolean;
      holeN?: number;
      holeApproved?: boolean;
      dups?: boolean;
      journal: boolean;
      pays: boolean;
      rechecked: boolean;
      paysRechecked: boolean;
      extra: string;
      at: string;
    }[] = [];
    let journalDone = 0;
    let cardDone = 0;
    for (const p of people) {
      const sync = customerSyncOf(p.cid);
      const d = findDossier({ crmId: p.cid });
      const links = d?.groupLinks || [];
      const own = groups.filter((g) => links.some((l) => Number(l.id) === g.groupId && (!l.branchId || l.branchId === g.branchId)));
      const probed = Boolean(sync.lessonsAlfaAt);
      const alfaN = probed ? Number(sync.lessonsAlfa) || 0 : 0;
      const diskN = Number(sync.lessonsDisk) || 0;
      const short = lessonsStampShort(sync);
      const dups = lessonsStampExtra(sync);
      const journal = lessonsJournalReady(sync);
      const pays = payCustomerFilled(p.cid);
      const paysScanned = payFillScanned(p.cid);
      const name = fioOf(p.cid);
      const glist = groupsOfStudent(p.cid).slice(0, 3);
      const gnames = glist.join(", ") || own.map((g) => g.name).filter(Boolean).slice(0, 3).join(", ");
      if (journal) journalDone += 1;
      else missJ.push({ id: p.cid, name, extra: short ? `на диске ${diskN}, в Alfa ${alfaN}` : gnames ? gnames : own.length ? "группы ещё не сверены" : "нет полного журнала" });
      if (pays || paysScanned) cardDone += 1;
      else missC.push({ id: p.cid, name, extra: journal ? "нет кассы" : gnames || (own.length ? "группы ещё не сверены" : "нет явки") });
      peopleRows.push({
        cid: p.cid,
        branchId: p.branchId,
        name,
        groups: glist.length ? glist : own.map((g) => g.name).filter(Boolean).slice(0, 3),
        lessons: diskN,
        alfa: probed ? alfaN : undefined,
        short,
        holeApproved: Boolean(sync.journalHoleApprovedAt),
        holeN: sync.lessonsHoleN,
        dups,
        journal,
        pays,
        paysScanned,
        paysEmpty: payFillEmpty(p.cid),
        cashRows: paysOf(p.cid).filter((x) => !x.deleted).length,
        ...cashCardOf(p.cid),
        rechecked: Boolean(sync.lessonsRecheckAt) && !short && !dups,
        paysRechecked: Boolean(sync.paysRecheckAt),
        extra: probed ? `на диске ${diskN} · в Alfa ${alfaN}` : gnames,
        at: sync.lessonsAt || "",
      });
    }
    peopleRows.sort((a, b) => {
      const ao = archiveFioOk(a.name) ? 0 : 1;
      const bo = archiveFioOk(b.name) ? 0 : 1;
      return ao - bo || a.name.localeCompare(b.name, "ru") || a.cid - b.cid;
    });
    return {
      total: people.length,
      journalDone,
      cardDone,
      missJournal: packList(missJ),
      missCard: packList(missC),
      people: peopleRows,
    };
  }

  const ug = peopleWithoutLiveGroup();
  const ungrouped = { total: ug.length, items: ug, more: 0 };
  if (opts?.skipPeople) {
    const liveN = rankedStudentIds("1").length;
    const archN = rankedStudentIds("2").length;
    return {
      groups: {
        total: groups.length,
        done: complete,
        periods: journalPeriods().length,
        miss: packList(groupsMiss, 200),
        doneList: packList(groupsDone, 200),
        rows: rows.slice(0, 800),
      },
      live: { ...blankPeople(liveN), total: liveN },
      archive: { ...blankPeople(archN), total: archN },
      ungrouped,
    };
  }
  return {
    groups: {
      total: groups.length,
      done: complete,
      periods: journalPeriods().length,
      miss: packList(groupsMiss, 200),
      doneList: packList(groupsDone, 200),
      rows: rows.slice(0, 800),
    },
    live: studentSide("1"),
    archive: studentSide("2"),
    ungrouped,
  };
}

function cashCardOf(cid: number) {
  const live = paysOf(cid).filter((x) => !x.deleted);
  const cashPaySum = balanceOf(live);
  const cashWriteoff = writeoffSumOf(loadCustomerCalendar(cid), cid);
  const cashRemain = cashPaySum - cashWriteoff;
  const raw = Number(findDossier({ crmId: cid })?.extras?.balance);
  const cashHeader = Number.isFinite(raw) ? raw : null;
  return { cashPaySum, cashWriteoff, cashRemain, cashHeader };
}

export function journalPeopleSide(study: JournalPullStudy, opts?: { skipLeads?: boolean }) {
  let list = rankedStudentIds(study);
  if (opts?.skipLeads) list = list.filter((p) => p.study !== 0 && p.status !== "лид");
  const people = list.map((p) => {
    const sync = customerSyncOf(p.cid);
    const probed = Boolean(sync.lessonsAlfaAt);
    const alfaN = probed ? Number(sync.lessonsAlfa) || 0 : 0;
    const diskN = Number(sync.lessonsDisk) || 0;
    const short = lessonsStampShort(sync);
    const dups = lessonsStampExtra(sync);
    const journal = lessonsJournalReady(sync);
    const pays = payCustomerFilled(p.cid);
    return {
      cid: p.cid,
      branchId: p.branchId,
      name: fioOf(p.cid),
      groups: groupsOfStudent(p.cid).slice(0, 3),
      lessons: diskN,
      alfa: probed ? alfaN : undefined,
      short,
      holeApproved: Boolean(sync.journalHoleApprovedAt),
      dups,
      journal,
      pays,
      paysScanned: payFillScanned(p.cid),
      paysEmpty: payFillEmpty(p.cid),
      cashRows: paysOf(p.cid).filter((x) => !x.deleted).length,
      ...cashCardOf(p.cid),
      rechecked: Boolean(sync.lessonsRecheckAt) && !short && !dups,
      paysRechecked: Boolean(sync.paysRecheckAt),
      extra: probed ? `на диске ${diskN} · в Alfa ${alfaN}` : groupsOfStudent(p.cid).slice(0, 2).join(", "),
      at: sync.lessonsAt || "",
    };
  });
  return {
    total: list.length,
    journalDone: people.filter((r) => r.journal).length,
    cardDone: people.filter((r) => r.pays || r.paysScanned).length,
    missJournal: packList([] as { id: number; name: string; extra: string }[]),
    missCard: packList([] as { id: number; name: string; extra: string }[]),
    people,
  };
}

export function journalPullState(opts?: { skipPeople?: boolean }) {
  const store = loadStore();
  const pol = loadCachePolicy();
  const groups = journalPullGroups();
  const schools = journalPullSchools();
  const emptySide = (study: JournalPullStudy) => journalPeopleSide(study);
  let progress: ReturnType<typeof journalPullProgress>;
  try {
    progress = journalPullProgress({ skipPeople: Boolean(opts?.skipPeople) });
  } catch {
    progress = {
      groups: {
        total: groups.length,
        done: 0,
        periods: journalPeriods().length,
        miss: packList([]),
        doneList: packList([]),
        rows: groups.map((g) => groupFillRow(g)).slice(0, 800),
      },
      live: emptySide("1"),
      archive: emptySide("2"),
      ungrouped: packList([] as { cid: number; branchId: number; name: string }[]),
    };
  }
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
    lessonsTotal: Number(pol.lessonsTotal) || progress.live.total + progress.archive.total,
    students: { all: progress.live.total + progress.archive.total, live: progress.live.total, archive: progress.archive.total },
    linked: alfaLinkedNow(),
    progress,
    lastLife: store.lastLife || null,
    lastArchives: store.lastArchives || null,
    lastArchivesPupils: store.lastArchivesPupils || null,
    lastStudents: store.lastStudents
      ? {
          ...store.lastStudents,
          rows: Array.isArray(store.lastStudents.rows) ? store.lastStudents.rows.map((r) => scrubLastStudentRow(r)) : store.lastStudents.rows,
        }
      : null,
    lastArchivePolicy: store.lastArchivePolicy || null,
    lastArchiveCatalog: store.lastArchiveCatalog || null,
    lastAudit: store.lastAudit || null,
    job: journalJobSnapshot(),
    rosterPolicy: loadRosterPolicy(),
  };
}

function journalJobView(job = journalJobSnapshot()) {
  let groupRow = null as ReturnType<typeof groupFillRow> | null;
  if (job.fill?.groupId) {
    const gid = Number(job.fill.groupId) || 0;
    const bid = Number(job.fill.branchId) || 0;
    const g =
      liveAdminGroups().find((x) => x.groupId === gid && (!bid || x.branchId === bid)) ||
      journalPullGroups().find((x) => x.groupId === gid && (!bid || x.branchId === bid)) ||
      liveAdminGroups().find((x) => x.groupId === gid) ||
      journalPullGroups().find((x) => x.groupId === gid);
    if (g) groupRow = groupFillRow(g);
  }
  return {
    ok: true as const,
    extra: job.msg,
    ...litePullState(),
    job,
    groupRow,
  };
}

function scrubLastStudentRow<T extends { cid?: number; alfa?: number; lessons?: number; short?: boolean; done?: boolean; dups?: boolean }>(row: T): T {
  const cid = Number(row.cid) || 0;
  if (!cid) return row;
  const s = customerSyncOf(cid);
  if (!s.lessonsResetAt || s.lessonsAlfaAt) return row;
  return {
    ...row,
    lessons: Number(s.lessonsDisk) || 0,
    alfa: 0,
    short: true,
    done: false,
    dups: false,
  };
}

function litePullState() {
  const store = loadStore();
  const live = rankedStudentIds("1").length;
  const archive = rankedStudentIds("2").length;
  const last = store.lastStudents;
  return {
    at: store.at,
    note: store.note,
    lastLife: store.lastLife || null,
    lastArchives: store.lastArchives || null,
    lastArchivesPupils: store.lastArchivesPupils || null,
    lastStudents: last
      ? { ...last, rows: Array.isArray(last.rows) ? last.rows.map((r) => scrubLastStudentRow(r)) : last.rows }
      : null,
    lastArchivePolicy: store.lastArchivePolicy || null,
    lastArchiveCatalog: store.lastArchiveCatalog || null,
    lastAudit: store.lastAudit || null,
    job: journalJobSnapshot(),
    students: { all: live + archive, live, archive },
    schools: journalPullSchools(),
    rosterPolicy: loadRosterPolicy(),
  };
}

function stampJournalPeriod(branchId: number, gid: number, keys: string[], patch: {
  ok: boolean;
  err?: string;
  weak?: boolean;
  recheck?: boolean;
  recheckDays?: number;
  censusN?: number;
  diskUniq?: number;
  checksum?: string;
}) {
  const prev = fillOf(branchId, gid);
  const pulled = { ...(prev.pulled || {}) };
  const fail = { ...(prev.fail || {}) };
  const weak = new Set(prev.weak || []);
  const rechecked = new Set(prev.rechecked || []);
  const at = new Date().toISOString();
  for (const key of keys) {
    if (patch.ok) {
      pulled[key] = at;
      delete fail[key];
      if (patch.weak) weak.add(key);
      else {
        weak.delete(key);
        if (patch.recheck && !/^w\d+$/.test(key)) rechecked.add(key);
      }
    } else if (patch.err) {
      fail[key] = patch.err;
      weak.add(key);
    }
  }
  patchFill(branchId, gid, { pulled, fail, weak: [...weak], rechecked: [...rechecked] });
  const card = loadGroupCard(branchId, gid);
  if (!card) return null;
  const done = pulledPeriodKeys({ done: card.journalFill?.done, pulled });
  const next = {
    ...card,
    journalFill: {
      ...card.journalFill,
      done: [...new Set([...done, ...Object.keys(pulled)])],
      fail,
      pulled,
      weak: [...weak],
      rechecked: [...rechecked],
      ...(patch.recheck
        ? {
            recheckAt: at,
            recheckDays: patch.recheckDays,
            journalCensusN: patch.censusN,
            journalDiskUniq: patch.diskUniq,
            journalIdsChecksum: patch.checksum,
          }
        : {}),
    },
    journalAt: at,
  };
  saveGroupCard(next);
  return next;
}

async function pullOneGroup(
  g: JournalPullGroup,
  period: { key: string; from: string; to: string; label: string; keys?: string[] },
  recheck = false,
  recheckDays?: number,
) {
  const beforeCard = loadGroupCard(g.branchId, g.groupId);
  const days = clampRecheckDays(recheckDays);
  const win = recheck ? recheckWindowYmd(days) : { from: period.from, to: period.to };
  const beforeAll = (beforeCard?.calendar || []).length;
  const beforeWin = (beforeCard?.calendar || []).filter((l) => inPeriod(l.date, win.from, win.to)).length;
  const { inboundJournalGroup } = await import("./crm-journal-inbound");
  const res = await inboundJournalGroup(g.branchId, g.groupId, {
    deep: false,
    lite: true,
    recheck,
    recheckDays: days,
    ...(recheck ? {} : { dateFrom: period.from, dateTo: period.to }),
    groupName: g.name,
  });
  const ok = res.ok !== false;
  const n = Number(res.count) || 0;
  const holeN = (res.hole || []).length;
  const goneN = (res.gone || []).length;
  const pagesComplete = res.pagesComplete !== false && !res.capped;
  const censusN = res.censusN != null ? Number(res.censusN) : 0;
  const diskUniq = res.diskUniq != null ? Number(res.diskUniq) : uniquePositiveIds((res.calendar || []).map((l: { lessonId?: number }) => Number(l.lessonId) || 0)).length;
  const diskRows = res.diskRows != null ? Number(res.diskRows) : countAlfaLessonRows(res.calendar);
  const ready = res.ready === true || journalIdsReady({
    pagesComplete,
    holeN,
    extraN: goneN,
    diskUniq,
    censusN,
    diskRows,
    allowExtra: !recheck,
  });
  const weak = !ok || !ready;
  const keys = period.keys?.length ? period.keys : [period.key];
  stampJournalPeriod(g.branchId, g.groupId, keys, {
    ok,
    err: ok ? "" : String(res.extra || "Alfa не ответила"),
    weak,
    recheck,
    recheckDays: days,
    censusN,
    diskUniq,
    checksum: String(res.checksum || ""),
  });
  const added = Math.max(0, n - beforeWin);
  const afterAll = Array.isArray(res.calendar) ? res.calendar.length : beforeAll;
  const extra = ok
    ? !pagesComplete
      ? `«${g.name}»: ${period.label} · ${n} зан.${holeN ? ` · дырок ${holeN}` : ""}${added ? `, +${added}` : ""} · пакет оборвался, нажмите ещё раз`
      : recheck
        ? `перепроверка «${g.name}»: ${period.label} · в окне было ${beforeWin}, стало ${n} · на диске ${afterAll}${added ? `, дозаписали ${added}` : ""}${holeN ? `, дырок ${holeN}` : ""}${goneN ? `, ушло из окна ${goneN}` : holeN || goneN ? "" : ", дырок нет"}`
        : `«${g.name}»: ${period.label} · ${n} зан. за порцию${holeN ? ` · дырок ${holeN}` : ""}`
    : String(res.extra || `«${g.name}»: ${period.label} — Alfa не ответила`);
  return { extra, count: n, ok, capped: weak };
}

export { keepAlfaProbe };

async function pullOneStudent(cid: number, branchId: number, balance: boolean, recheck = false, dateFrom = "", slow = false, recheckDays = 32) {
  const { inboundCustomerLessons, probeCustomerLessons, censusCustomerLessonIds, applyCustomerLessonCensus, inboundMissingUntilSeated, recheckCensusWindow, studentProtectLessonIds } = await import("./crm-journal-inbound");
  const atOf = () => new Date().toISOString();
  const from = String(dateFrom || "").trim() || "2015-01-01";
  const reset0 = String(customerSyncOf(cid).lessonsResetAt || "");
  const abortedByReset = () => String(customerSyncOf(cid).lessonsResetAt || "") !== reset0;
  const resetStop = () => {
    const s = customerSyncOf(cid);
    return {
      cid,
      lessons: Number(s.lessonsDisk) || 0,
      done: false,
      pays: 0,
      tariffs: 0,
      alfa: 0,
      short: true,
      dups: false,
      blocked: false,
      paysOk: false,
      paysMore: false,
      rechecked: false,
      paysRechecked: false,
    };
  };
  const mark = (disk: number, alfa: number, probedOk: boolean, census = false) => {
    if (abortedByReset()) return { short: true, extra: false, closed: false };
    const keep = Number(customerSyncOf(cid).lessonsAlfa) || 0;
    const held = keepAlfaProbe(keep, alfa, probedOk, census);
    const have = uniquePositiveIds((loadCustomerCalendar(cid) || []).map((l) => Number(l.lessonId) || 0));
    const gap = stampLessonSetGap({ ...customerSyncOf(cid), ...(held.write ? { lessonsAlfa: held.alfa } : {}) }, have, studentProtectLessonIds(cid));
    const preview = { ...customerSyncOf(cid), lessonsDisk: disk, ...(held.write ? { lessonsAlfa: held.alfa, lessonsAlfaAt: customerSyncOf(cid).lessonsAlfaAt || "x" } : {}), ...gap };
    const short = lessonsStampShort({ ...preview, lessonsAlfaAt: probedOk ? preview.lessonsAlfaAt || atOf() : preview.lessonsAlfaAt });
    const extra = lessonsStampExtra({ ...preview, lessonsAlfaAt: probedOk ? preview.lessonsAlfaAt || atOf() : preview.lessonsAlfaAt });
    const holeApproved = Boolean(customerSyncOf(cid).journalHoleApprovedAt);
    const rows = countAlfaLessonRows(loadCustomerCalendar(cid));
    const uniq = countAlfaLessonUniq(loadCustomerCalendar(cid));
    const closed = Boolean(probedOk && held.write && !short && !extra && !holeApproved && rows === uniq);
    const at = atOf();
    stampCustomerSync(cid, {
      lessonsDisk: disk,
      lessonsAt: at,
      ...gap,
      ...(held.write ? { lessonsAlfa: held.alfa, lessonsAlfaAt: at } : {}),
      ...(closed ? { lessonsFull: true, lessonsAttend: true } : { lessonsFull: false }),
      ...(balance
        ? { paysAt: at, ...(recheck && closed ? { paysRecheckAt: at, lessonsRecheckAt: at } : {}) }
        : recheck && closed
          ? { lessonsRecheckAt: at }
          : {}),
    });
    return { short, extra, closed };
  };
  let lessons = 0;
  let seated = 0;
  let droppedN = 0;
  let disk = countAlfaLessonUniq(loadCustomerCalendar(cid));
  if (!balance) {
  if (!recheck) {
    const range = studentCensusRange(customerSyncOf(cid));
    const first = await probeCustomerLessons(branchId, cid, { dateFrom: range.from, dateTo: range.to }).catch(() => ({ total: 0, ok: false as const, ids: [] as number[] }));
    if (abortedByReset()) return resetStop();
    if (first.ok) {
      const prevSeen = uniquePositiveIds(customerSyncOf(cid).lessonsSeenIds || []);
      const seen = range.full
        ? uniquePositiveIds(first.ids || [])
        : uniquePositiveIds([...prevSeen, ...(first.ids || [])]);
      if (seen.length) stampCustomerSync(cid, { lessonsSeenIds: seen, ...(range.full ? {} : { lessonsWindowDays: range.days }) });
    }
    const alfaKeep = Number(customerSyncOf(cid).lessonsAlfa) || 0;
    const alfa0 = first.ok ? first.total : 0;
    const censusOk = Boolean(first.ok && range.full);
    const alfaGate = censusOk ? alfa0 : Math.max(alfa0, alfaKeep);
    const weak = Boolean(first.ok && !censusOk && alfaKeep > 0 && alfa0 < alfaKeep);
    const extra0 = lessonsCountExtra(disk, alfaGate, first.ok || alfaKeep > 0);
    const shortByIds = (diskN: number, alfaN: number, probedOk: boolean) => {
      const cur = customerSyncOf(cid);
      const have = uniquePositiveIds((loadCustomerCalendar(cid) || []).map((l) => Number(l.lessonId) || 0));
      const gap = stampLessonSetGap({ ...cur, lessonsAlfa: alfaN, ...(probedOk ? { lessonsAlfaAt: cur.lessonsAlfaAt || "x" } : {}) }, have, studentProtectLessonIds(cid));
      return lessonsStampShort({ ...cur, lessonsDisk: diskN, lessonsAlfa: alfaN, lessonsAlfaAt: probedOk ? cur.lessonsAlfaAt || "x" : cur.lessonsAlfaAt, ...gap });
    };
    const haveNow = uniquePositiveIds((loadCustomerCalendar(cid) || []).map((l) => Number(l.lessonId) || 0));
    const gap0 = stampLessonSetGap(
      { ...customerSyncOf(cid), ...(first.ok ? { lessonsAlfa: alfaGate, lessonsAlfaAt: customerSyncOf(cid).lessonsAlfaAt || "x" } : {}) },
      haveNow,
      studentProtectLessonIds(cid),
    );
    const seenReady = (customerSyncOf(cid).lessonsSeenIds || []).length > 0;
    const setsClosed = seenReady && !(Number(gap0.lessonsHoleN) || 0) && !(Number(gap0.lessonsExtraN) || 0);
    if (first.ok && !weak && (setsClosed || (!seenReady && disk >= alfaGate && !extra0))) {
      const hit = mark(disk, alfa0, true, censusOk);
      if (hit.closed) stampCustomerSync(cid, { lessonsWindowDays: 0 });
      if (!balance)
        return {
          cid,
          lessons: disk,
          done: hit.closed,
          pays: 0,
          tariffs: 0,
          alfa: abortedByReset() ? 0 : Number(customerSyncOf(cid).lessonsAlfa) || alfa0,
          short: hit.short,
          dups: hit.extra,
          blocked: false,
          paysOk: false,
          paysMore: false,
          rechecked: Boolean(customerSyncOf(cid).lessonsRecheckAt) && hit.closed,
          paysRechecked: false,
        };
    } else {
      const have0 = new Set((loadCustomerCalendar(cid) || []).map((l) => Number(l.lessonId) || 0).filter((n) => n > 0));
      let missing = (customerSyncOf(cid).lessonsSeenIds || []).filter((n) => !have0.has(n));
      if (shortByIds(disk, alfaGate, Boolean(first.ok) || alfaKeep > 0) && !missing.length && !first.ok) {
        const census = await censusCustomerLessonIds(branchId, cid, { dateFrom: range.from, dateTo: range.to }).catch(() => ({ ids: [] as number[], ok: false as const }));
        if (census.ok) {
          const prev = uniquePositiveIds(customerSyncOf(cid).lessonsSeenIds || []);
          stampCustomerSync(cid, { lessonsSeenIds: uniquePositiveIds([...prev, ...census.ids]) });
          missing = uniquePositiveIds(customerSyncOf(cid).lessonsSeenIds || []).filter((n) => !have0.has(n));
        }
      }
      if (missing.length) {
        const gap = await inboundMissingUntilSeated(branchId, cid, missing, { take: 50, rounds: 20, resetAt: reset0 }).catch(() => ({ count: 0, dropped: [] as number[] }));
        if (abortedByReset() || (gap as { skipped?: string }).skipped === "reset") return resetStop();
        lessons += Number(gap.count) || 0;
        seated += Number(gap.count) || 0;
        droppedN += Array.isArray(gap.dropped) ? gap.dropped.length : 0;
        disk = countAlfaLessonUniq(loadCustomerCalendar(cid));
      }
      if (slow && shortByIds(disk, alfaGate, Boolean(first.ok) || alfaKeep > 0)) {
      const deadline = Date.now() + 10 * 60 * 1000;
      for (let i = 0; Date.now() < deadline; i += 1) {
        const res = await inboundCustomerLessons(branchId, cid, {
          take: 7,
          deep: 0,
          continueLater: Boolean(slow),
          full: true,
          force: true,
          homeOnly: false,
          prune: false,
          resetSeen: false,
          monthly: Boolean(slow),
          dateFrom: range.from,
          dateTo: range.to,
          resetAt: reset0,
        }).catch(() => ({ count: 0, done: false as const, skipped: undefined as string | undefined }));
        if (abortedByReset() || res.skipped === "reset") return resetStop();
        lessons += Number(res.count) || 0;
        if ("skipped" in res && res.skipped === "busy") {
          return { cid, lessons, done: false, pays: 0, tariffs: 0, alfa: alfa0, short: true, dups: false, blocked: true, paysOk: false, paysMore: false, rechecked: false, paysRechecked: false };
        }
        disk = countAlfaLessonUniq(loadCustomerCalendar(cid));
        if (!shortByIds(disk, alfaGate, Boolean(first.ok) || alfaKeep > 0)) break;
        if (slow && i > 0 && !(Number(res.count) || 0) && Boolean((res as { done?: boolean }).done)) break;
      }
      }
      if (shortByIds(disk, alfaGate, Boolean(first.ok) || alfaKeep > 0)) {
        const have = new Set((loadCustomerCalendar(cid) || []).map((l) => Number(l.lessonId) || 0).filter((n) => n > 0));
        if (first.ok) {
          missing = (customerSyncOf(cid).lessonsSeenIds || first.ids || []).filter((n) => !have.has(n));
        } else {
          const census = await censusCustomerLessonIds(branchId, cid, { dateFrom: range.from, dateTo: range.to }).catch(() => ({ ids: [] as number[], ok: false as const }));
          if (census.ok) {
            const prev = uniquePositiveIds(customerSyncOf(cid).lessonsSeenIds || []);
            stampCustomerSync(cid, { lessonsSeenIds: uniquePositiveIds([...prev, ...census.ids]) });
            missing = uniquePositiveIds(customerSyncOf(cid).lessonsSeenIds || []).filter((n) => !have.has(n));
          } else {
            missing = missing.filter((n) => !have.has(n));
          }
        }
        if (missing.length) {
          const gap = await inboundMissingUntilSeated(branchId, cid, missing, { take: 50, rounds: 20, resetAt: reset0 }).catch(() => ({ count: 0, dropped: [] as number[] }));
        if (abortedByReset() || (gap as { skipped?: string }).skipped === "reset") return resetStop();
          lessons += Number(gap.count) || 0;
          seated += Number(gap.count) || 0;
          droppedN += Array.isArray(gap.dropped) ? gap.dropped.length : 0;
          disk = countAlfaLessonUniq(loadCustomerCalendar(cid));
        }
      }
      const hit = mark(disk, alfa0, first.ok, censusOk);
      if (hit.closed) stampCustomerSync(cid, { lessonsWindowDays: 0 });
      else if (!range.full && (hit.short || hit.extra) && !customerSyncOf(cid).journalHoleApprovedAt) {
        stampCustomerSync(cid, { lessonsWindowDays: nextLessonWindowDays(range.days) });
      }
    }
  } else {
    if (!(await waitLockStudentAlfa(cid, 20000))) {
      return { cid, lessons, done: false, pays: 0, tariffs: 0, alfa: 0, short: true, dups: false, blocked: true, paysOk: false, paysMore: false, rechecked: false, paysRechecked: false };
    }
    try {
    const sync0 = customerSyncOf(cid);
    const win = recheckCensusWindow(sync0, recheckDays);
    const windowFrom = win.from;
    const windowTo = win.to;
    const censusFrom = windowFrom || from;
    const census = await censusCustomerLessonIds(branchId, cid, censusFrom ? { dateFrom: censusFrom, ...(windowTo ? { dateTo: windowTo } : {}) } : {}).catch(() => ({ ids: [] as number[], ok: false as const }));
    disk = countAlfaLessonUniq(loadCustomerCalendar(cid));
    const holeApproved = Boolean(customerSyncOf(cid).journalHoleApprovedAt);
    if (!census.ok) {
      mark(disk, 0, false);
    } else {
      const haveBefore = uniquePositiveIds((loadCustomerCalendar(cid) || []).map((l) => Number(l.lessonId) || 0));
      const новые = windowFrom ? windowNewLessonIds(census.ids, haveBefore) : [];
      const applied = applyCustomerLessonCensus(cid, census.ids, true, windowFrom, windowTo);
      if (!applied.ok) {
        mark(disk, 0, false);
      } else {
      disk = applied.disk;
      const haveAfter = uniquePositiveIds((loadCustomerCalendar(cid) || []).map((l) => Number(l.lessonId) || 0));
      const gone = windowFrom ? windowGoneLessonIds(haveBefore, haveAfter) : [];
      const keep0 = Number(customerSyncOf(cid).lessonsAlfa) || 0;
      let liveAlfa = windowFrom ? (holeApproved ? keep0 : windowAlfaKeep(keep0, новые.length, gone.length)) : applied.alfa;
      if (windowFrom && !holeApproved) {
        stampCustomerSync(cid, { lessonsAlfa: liveAlfa, lessonsAlfaAt: atOf() });
      }
      if (новые.length && !holeApproved) {
        const gap = await inboundMissingUntilSeated(branchId, cid, новые, { take: 50, rounds: 20, resetAt: reset0 }).catch(() => ({ count: 0, dropped: [] as number[] }));
        if (abortedByReset() || (gap as { skipped?: string }).skipped === "reset") return resetStop();
        lessons += Number(gap.count) || 0;
        seated += Number(gap.count) || 0;
        droppedN += Array.isArray(gap.dropped) ? gap.dropped.length : 0;
        disk = countAlfaLessonUniq(loadCustomerCalendar(cid));
        const phantom = windowNewLessonIds(gap.dropped || [], []);
        const dropNew = новые.filter((id) => phantom.includes(id)).length;
        if (dropNew) {
          liveAlfa = windowAlfaKeep(keep0, новые.length - dropNew, gone.length);
          stampCustomerSync(cid, { lessonsAlfa: liveAlfa, lessonsAlfaAt: atOf() });
        }
        const seatedHave = uniquePositiveIds((loadCustomerCalendar(cid) || []).map((l) => Number(l.lessonId) || 0));
        const seen0 = uniquePositiveIds(customerSyncOf(cid).lessonsSeenIds || []);
        const seenNext = uniquePositiveIds([...seen0.filter((id) => !gone.includes(id)), ...новые.filter((id) => seatedHave.includes(id) || !phantom.includes(id))]);
        stampCustomerSync(cid, { lessonsSeenIds: seenNext });
      } else if (windowFrom && !holeApproved) {
        const seen0 = uniquePositiveIds(customerSyncOf(cid).lessonsSeenIds || []);
        stampCustomerSync(cid, { lessonsSeenIds: uniquePositiveIds([...seen0.filter((id) => !gone.includes(id)), ...новые]) });
      } else if (!windowFrom) {
      const alfaN = applied.alfa;
      const have = new Set((loadCustomerCalendar(cid) || []).map((l) => Number(l.lessonId) || 0).filter((n) => n > 0));
      const gapN = stampLessonSetGap(customerSyncOf(cid), uniquePositiveIds([...have]), studentProtectLessonIds(cid));
      const short = lessonsStampShort({ ...customerSyncOf(cid), lessonsDisk: disk, lessonsAlfa: alfaN, lessonsAlfaAt: "x", ...gapN });
      if (short && !holeApproved) {
        const missing = census.ids.filter((n) => !have.has(n));
        if (missing.length) {
          const gap = await inboundMissingUntilSeated(branchId, cid, missing, { take: 50, rounds: 20, resetAt: reset0 }).catch(() => ({ count: 0 }));
          if (abortedByReset() || (gap as { skipped?: string }).skipped === "reset") return resetStop();
          lessons += Number(gap.count) || 0;
          seated += Number(gap.count) || 0;
          disk = countAlfaLessonUniq(loadCustomerCalendar(cid));
        }
      }
      liveAlfa = Number(customerSyncOf(cid).lessonsAlfa) || alfaN;
      }
      mark(disk, Number(customerSyncOf(cid).lessonsAlfa) || liveAlfa, true);
      }
    }
    } finally {
      unlockStudentAlfa(cid);
    }
  }
  }
  let pays = 0;
  let tariffs = 0;
  let paysOk = false;
  let payFail = "";
  if (balance) {
    const { inboundCustomerPays, paysOf, payCustomerFilled, payFillPending } = await import("./crm-pay");
    const pendingPay = payFillPending(cid);
    const held = recheck && !pendingPay ? await waitLockStudentAlfa(cid, 20000) : true;
    if (!held) {
      return { cid, lessons, done: false, pays: 0, tariffs: 0, alfa: 0, short: true, dups: false, blocked: true, paysOk: false, paysMore: false, rechecked: false, paysRechecked: false };
    }
    try {
    const { token, request } = await import("./alfacrm");
    const t = await token();
    const forcePay = Boolean(recheck) && !pendingPay;
    const payFrom = recheck ? recheckWindowYmd(recheckDays).from : from;
    if (recheck) stampCustomerSync(cid, { paysRecheckAt: "" });
    try {
      await inboundCustomerPays(request, t, branchId, cid, { force: forcePay, dateFrom: payFrom });
    } catch (e) {
      payFail = e instanceof Error && e.message ? e.message : "Alfa не ответила, нажмите снова";
    }
    pays = paysOf(cid).filter((x) => !x.deleted).length;
    paysOk = !payFail && payCustomerFilled(cid);
    if (!payFillPending(cid)) {
      const { pullCustomerTariffs } = await import("./pupil-tariffs");
      const rows = await pullCustomerTariffs(branchId, cid, { quick: true }).catch(() => []);
      tariffs = rows.length;
    }
    const payAt = new Date().toISOString();
    const scanDone = !payFail && !payFillPending(cid);
    if (scanDone) {
      stampCustomerSync(cid, {
        paysAt: payAt,
        ...(recheck ? { paysRecheckAt: payAt } : {}),
      });
    }
    } finally {
      if (recheck) unlockStudentAlfa(cid);
    }
  }
  const sync = customerSyncOf(cid);
  const diskN = Number(sync.lessonsDisk) || lessons;
  const alfaN = Number(sync.lessonsAlfa) || 0;
  const probed = Boolean(sync.lessonsAlfaAt);
  const short = lessonsStampShort(sync);
  const dups = lessonsStampExtra(sync);
  return {
    cid,
    lessons: diskN,
    done: lessonsJournalReady(sync),
    pays,
    tariffs,
    alfa: alfaN,
    short,
    dups,
    blocked: false,
    paysOk,
    paysMore: Boolean(balance && (Boolean(payFail) || payFillPending(cid))),
    paysScanned: Boolean(balance && payFillScanned(cid)),
    paysEmpty: Boolean(balance && payFillEmpty(cid)),
    cashRows: pays,
    payFail,
    rechecked: Boolean(sync.lessonsRecheckAt) && !short && !dups,
    paysRechecked: Boolean(sync.paysRecheckAt),
    seated,
    dropped: droppedN,
    holeApproved: Boolean(sync.journalHoleApprovedAt),
  };
}

export async function journalPull(opts: {
  kind: JournalPullKind;
  groupId?: number;
  branchId?: number;
  school?: string;
  study?: JournalPullStudy;
  periodKey?: string;
  grain?: Grain;
  recheck?: boolean;
  customerId?: number;
  probe?: boolean;
  dateFrom?: string;
  recheckDays?: number;
  jobMode?: string;
  take?: number;
  name?: string;
  peopleKind?: "students" | "balance";
  periodLabel?: string;
  lite?: boolean;
  jobItems?: { cid?: number; branchId?: number; name?: string; groupId?: number; periodKey?: string; periodLabel?: string }[];
  archived?: boolean;
  slowFill?: boolean;
}) {
  const kind = opts.kind;
  if (kind === "jobStart" || kind === "jobStop" || kind === "jobStatus") {
    const { startJournalJob, stopJournalJob, resumeJournalJob } = await import("./crm-journal-job");
    if (kind === "jobStatus") {
      resumeJournalJob();
      return journalJobView();
    }
    if (kind === "jobStop") {
      stopJournalJob();
      return journalJobView();
    }
    startJournalJob({
      mode: (opts.jobMode || "people") as import("./crm-journal-job-core").JournalJobMode,
      kind:
        opts.jobMode === "audit"
          ? "audit"
          : opts.jobMode === "catalog"
            ? "archiveCatalog"
            : opts.jobMode === "life"
              ? "life"
              : opts.jobMode === "archives"
                ? "archives"
                : opts.jobMode === "archivesPupils"
                  ? "archivesPupils"
                  : opts.jobMode === "details"
                    ? "details"
                  : opts.jobMode === "count"
                    ? "archiveCount"
                  : opts.jobMode === "groups" || opts.jobMode === "groups-recheck" || opts.jobMode === "group-one"
                    ? "group"
                    : opts.jobMode === "roster" || opts.jobMode === "roster-recheck"
                      ? "roster"
                    : opts.peopleKind || "students",
      study: opts.study === "1" || opts.study === "2" ? opts.study : "1",
      recheck: Boolean(opts.recheck),
      dateFrom: opts.dateFrom || "",
      recheckDays: opts.recheckDays,
      grain: opts.grain,
      school: opts.school || "",
      groupId: opts.groupId,
      branchId: opts.branchId,
      customerId: opts.customerId,
      take: opts.take,
      filter: opts.school || "",
      probe: Boolean(opts.probe),
      name: opts.name,
      periodKey: opts.periodKey,
      periodLabel: String(opts.periodLabel || ""),
      items: parseJobItems(opts.jobItems),
      archived: Boolean(opts.archived),
    });
    return journalJobView();
  }
  if (kind === "holeApprove" || kind === "holeApproveClear") {
    const cid = Number(opts.customerId) || 0;
    if (!cid) return { ok: false as const, error: "нет customerId", more: false, ...litePullState() };
    const on = kind === "holeApprove";
    stampCustomerSync(cid, { journalHoleApprovedAt: on ? new Date().toISOString() : "" });
    const sync = customerSyncOf(cid);
    const holeApproved = Boolean(sync.journalHoleApprovedAt);
    const probed = Boolean(sync.lessonsAlfaAt);
    const short = lessonsStampShort(sync);
    return {
      ok: true as const,
      extra: holeApproved ? `№${cid}: дырка принята` : `№${cid}: штамп снят`,
      more: false,
      student: { cid, holeApproved, short, alfa: probed ? Number(sync.lessonsAlfa) || 0 : undefined },
      ...litePullState(),
    };
  }
  if (kind === "lessonsReset") {
    const cid = Number(opts.customerId) || 0;
    if (!cid) return { ok: false as const, error: "нет customerId", more: false, ...litePullState() };
    const { resetStudentLessonDisk } = await import("./crm-journal-inbound");
    const hit = resetStudentLessonDisk(cid);
    const sync = customerSyncOf(cid);
    const alfa = Number(sync.lessonsAlfa) || 0;
    const probed = Boolean(sync.lessonsAlfaAt);
    const short = lessonsCountShort(hit.disk, alfa, probed);
    return {
      ok: hit.ok,
      extra: `№${cid}: диск ${hit.disk} · Alfa 0 · дальше «Добрать»`,
      more: false,
      student: {
        cid,
        lessons: hit.disk,
        alfa: 0,
        short,
        dups: false,
        done: false,
        holeApproved: Boolean(sync.journalHoleApprovedAt),
      },
      ...litePullState(),
    };
  }
  if (kind === "paysReset") {
    const cid = Number(opts.customerId) || 0;
    if (!cid) return { ok: false as const, error: "нет customerId", more: false, ...litePullState() };
    const { resetStudentPayDisk, paysOf } = await import("./crm-pay");
    const hit = resetStudentPayDisk(cid);
    const left = paysOf(cid).filter((x) => !x.deleted).length;
    return {
      ok: hit.ok,
      extra: `№${cid}: касса с диска снята · ${left} своих · дальше «Загрузить кассу»`,
      more: false,
      student: {
        cid,
        pays: 0,
        paysOk: false,
        paysScanned: false,
        paysEmpty: false,
        paysMore: false,
        cashRows: left,
        done: false,
      },
      ...litePullState(),
    };
  }
  const wantedEarly = Number(opts.customerId) || 0;
  const peopleKinds: JournalPullKind[] = ["students", "balance", "archiveCatalog", "archiveCount", "archiveAdd", "audit"];
  const needPeople = peopleKinds.includes(kind);
  const lite =
    Boolean(opts.lite) ||
    kind === "archiveCatalog" ||
    kind === "life" ||
    kind === "archives" ||
    kind === "archivesPupils" ||
    kind === "roster" ||
    (wantedEarly > 0 && (kind === "students" || kind === "balance" || kind === "audit")) ||
    (kind === "group" && Number(opts.groupId) > 0) ||
    (kind === "details" && Number(opts.groupId) > 0);
  const snap = () => (lite ? { ok: true as const, ...litePullState() } : journalPullState({ skipPeople: !needPeople || (wantedEarly > 0 && (kind === "students" || kind === "balance" || kind === "audit")) }));
  const store = loadStore();
  const groups = journalPullGroups();
  const school = String(opts.school || "").trim();
  const study = (opts.study === "1" || opts.study === "2" ? opts.study : "all") as JournalPullStudy;
  const selectedGid = Number(opts.groupId) || 0;
  const selectedBid = Number(opts.branchId) || 0;

  if (kind === "rosterPolicy") {
    const { saveRosterPolicy, parseRosterFilter } = await import("./crm-roster");
    const pol = saveRosterPolicy(parseRosterFilter(String(opts.name || "")));
    store.note = `Кто активный: ${pol.leads ? "лиды в группах · " : ""}${pol.archiveInLive ? "архив в живой группе · " : "без архива в живых · "}занятия ${pol.attendDays ? `за ${pol.attendDays} дн.` : "не фильтровать"}.`;
    store.at = new Date().toISOString();
    saveStore(store);
    return { ok: true as const, extra: store.note, more: false, ...litePullState(), rosterPolicy: pol };
  }

  if (kind === "roster") {
    const { pullGroupRoster } = await import("./crm-roster");
    const gid = selectedGid;
    const bid = selectedBid || 1;
    const hit =
      liveAdminGroups().find((g) => g.groupId === gid && g.branchId === bid) ||
      journalPullGroups().find((g) => g.groupId === gid && g.branchId === bid) ||
      liveAdminGroups().find((g) => g.groupId === gid) ||
      journalPullGroups().find((g) => g.groupId === gid);
    const useBid = Number(hit?.branchId) || bid;
    const res = await pullGroupRoster({
      groupId: gid,
      branchId: useBid,
      name: opts.name || hit?.name || `группа ${gid}`,
      force: Boolean(opts.recheck),
    });
    if (res.ok) {
      const prev = fillOf(useBid, gid);
      patchFill(useBid, gid, { roster: new Date().toISOString(), ...(opts.recheck ? { rechecked: [...new Set([...(prev.rechecked || []), "roster"])] } : {}) });
    }
    const next = loadStore();
    next.note = res.extra || res.error || "";
    next.at = new Date().toISOString();
    saveStore(next);
    return {
      ok: res.ok,
      extra: next.note,
      error: res.ok ? "" : res.error,
      count: res.disk,
      scanned: res.cgi,
      more: false,
      ...litePullState(),
    };
  }

  if (kind === "hydrateDisk") {
    const h = applyHydrateFills();
    store.note = h.skip === "ok"
      ? "Скачанное с диска уже в списке групп."
      : h.n
        ? `Вернули ночную загрузку: ${h.n} групп на диск, сверка ${h.fills.length}. Alfa не трогали.`
        : h.skip
          ? `С диска не разложили: ${h.skip}`
          : "Нового общего файла групп нет — справа только те, что уже сверены.";
    store.at = new Date().toISOString();
    saveStore(store);
    return { ok: true as const, extra: store.note, count: h.n, scanned: h.n, more: false, ...snap() };
  }

  if (kind === "archiveCount") {
    const { archivePeopleFromDisk } = await import("./dossiers");
    const items = archivePeopleFromDisk();
    const extra = extraGroupKeys(loadJournalArchiveGroups().map((g) => ({ groupId: g.groupId, branchId: g.branchId })));
    const { policy, report } = recountArchivePolicy(items, extra, loadArchivePolicy());
    saveArchivePolicy(policy);
    store.lastArchivePolicy = report;
    store.note = formatArchiveCountNote(report);
    store.at = report.at;
    saveStore(store);
    return { ok: true as const, extra: store.note, count: report.working, scanned: report.disk, more: false, lastArchivePolicy: report, ...litePullState() };
  }

  if (kind === "archiveCatalog") {
    const { syncArchiveCatalogTick } = await import("./dossiers");
    const res = await syncArchiveCatalogTick({ reset: Boolean(opts.probe), filter: opts.school });
    if (!res.ok) {
      store.note = res.note || res.error || "Справочник не ответил.";
      store.at = new Date().toISOString();
      saveStore(store);
      return { ...snap(), ok: false as const, error: res.error || store.note, more: Boolean(res.more), extra: store.note, lastArchiveCatalog: store.lastArchiveCatalog || null };
    }
    store.lastArchiveCatalog = res.report;
    store.note = String(res.note || "")
      .replace(/\s*·\s*на диске архивных\s+\d+\.?\s*/gi, " ")
      .replace(/\s*Кто записан\s*[—–-]\s*слева\.?/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s*·\s*$/g, "")
      .trim();
    store.at = res.report.at;
    saveStore(store);
    return { ...snap(), ok: true as const, extra: store.note, more: res.more, count: res.report.wrote ? 1 : 0, scanned: 1, lastArchiveCatalog: res.report };
  }

  if (kind === "archiveAdd") {
    const cid = Number(opts.customerId) || 0;
    const d = cid ? findDossier({ crmId: cid }) : null;
    const study = Number(d?.extras?.is_study);
    if (!cid || !d) {
      store.note = "Нет номера ученика.";
      store.at = new Date().toISOString();
      saveStore(store);
      return { ok: false as const, error: store.note, more: false, ...snap() };
    }
    if (study !== 2 || String(d.status || "") === "удалён" || String(d.extras?.removed || "") === "1") {
      store.note = "В рабочий архив можно добавить только архивного клиента.";
      store.at = new Date().toISOString();
      saveStore(store);
      return { ok: false as const, error: store.note, more: false, ...snap() };
    }
    addArchiveWorking(cid, "manual");
    store.note = `${String(d.child?.fio || "").trim() || `клиент ${cid}`} в рабочем архиве.`;
    store.at = new Date().toISOString();
    saveStore(store);
    return { ok: true as const, extra: store.note, count: 1, scanned: 1, more: false, ...snap() };
  }

  if (kind === "audit") {
    const people = rankedStudentIds("1");
    const wanted = Number(opts.customerId) || 0;
    const fromList = wanted ? people.find((p) => p.cid === wanted) : null;
    const fallback = wanted
      ? { cid: wanted, branchId: Number(opts.branchId) || 1, study: 1 as const }
      : null;
    const idx = Number(store.lastAudit?.idx) || 0;
    const one = fromList || fallback || pickSlice(people, idx, 1).slice[0];
    if (!one) {
      store.note = "Нет текущих учеников на диске.";
      store.at = new Date().toISOString();
      saveStore(store);
      return { ok: false as const, error: store.note, more: false, ...snap() };
    }
    if (studentPullCid && studentPullCid !== one.cid) {
      return {
        ok: false as const,
        error: `уже сверяем №${studentPullCid} — подождите, не пачкой`,
        more: true,
        ...litePullState(),
      };
    }
    studentPullCid = one.cid;
    try {
      const { auditOne, mergeAudit, auditShowBugNote, auditOnRight } = await import("./crm-balance-audit");
      const { hit } = await auditOne(one.cid, one.branchId);
      const nextIdx = wanted ? idx : pickSlice(people, idx, 1).next;
      const report = mergeAudit(store.lastAudit, hit, nextIdx);
      store.lastAudit = report;
      const bug = auditShowBugNote(report);
      store.note = `${hit.name} · ${hit.extra}${bug ? ` · ${bug}` : ""}`;
      store.at = hit.at;
      saveStore(store);
      return {
        ok: true as const,
        extra: store.note,
        count: auditOnRight(hit.codes) ? 1 : 0,
        scanned: 1,
        more: !wanted,
        lastAudit: report,
        student: { cid: hit.cid, branchId: hit.branchId, name: hit.name, groups: groupsOfStudent(hit.cid), lessons: 0, pays: 0, done: auditOnRight(hit.codes), ok: auditOnRight(hit.codes) },
        ...snap(),
      };
    } catch (e) {
      const err = e instanceof Error ? e.message : "Alfa не ответила";
      store.note = `${fioOf(one.cid)} · нет ответа · ${err}`;
      store.at = new Date().toISOString();
      saveStore(store);
      return {
        ok: false as const,
        error: /429|502/i.test(err) ? err : `нет ответа · ${err}`,
        more: true,
        lastAudit: store.lastAudit || null,
        ...litePullState(),
      };
    } finally {
      studentPullCid = 0;
    }
  }

  if (kind === "archives") {
    const { token, request } = await import("./alfacrm");
    const { crmUnwrapIndex } = await import("./crm-leads-stages");
    const { ALFA_BRANCH_IDS } = await import("./crm-ledger-core");
    const { CRM_BRANCH } = await import("./ids");
    const t = await token().catch(() => "");
    if (!t) {
      store.note = "Нет входа в AlfaCRM.";
      store.at = new Date().toISOString();
      saveStore(store);
      return { ok: false as const, error: store.note, more: false, ...snap() };
    }
    const bag = loadArchiveBag();
    const liveKeys = new Set(listAdminSlots().map((s) => `${Number(s.branchId) || 0}:${Number(s.groupId) || 0}`));
    const seen = new Set(bag.items.map((g) => `${g.branchId}:${g.groupId}`));
    const idx = bag.branchIdx % ALFA_BRANCH_IDS.length;
    const branch = ALFA_BRANCH_IDS[idx];
    const branchName = CRM_BRANCH[branch]?.short || `филиал ${branch}`;
    const added: JournalPullGroup[] = [];
    for (let page = 0; page < 15; page += 1) {
      const json = await request<unknown>(
        `/v2api/${branch}/group/index`,
        { page, pageSize: 50, status_id: 3 },
        t,
      ).catch(() => null);
      const pack = crmUnwrapIndex(json);
      for (const raw of pack.items) {
        const statusId = Number(raw.status_id || 0);
        if (statusId !== 3 || isCampStatus(statusId)) continue;
        const gid = Number(raw.id) || 0;
        const bid = Number((Array.isArray(raw.branch_ids) ? raw.branch_ids[0] : 0) || branch);
        if (!gid || !bid) continue;
        const k = `${bid}:${gid}`;
        if (liveKeys.has(k) || seen.has(k)) continue;
        seen.add(k);
        added.push({
          groupId: gid,
          branchId: bid,
          name: String(raw.name || `группа ${gid}`),
          school: schoolOfArchive(Number(raw.subject_id) || 0),
          taken: Number(raw.quantity || raw.cnt || raw.customers_count || 0) || 0,
          archived: true,
          bDate: String(raw.b_date || raw.bDate || ""),
          eDate: String(raw.e_date || raw.eDate || ""),
        });
      }
      if (!pack.items.length || pack.items.length < 50) break;
      const total = Number(pack.total) || 0;
      if (total && (page + 1) * 50 >= total) break;
    }
    bag.items = bag.items.concat(added);
    bag.at = new Date().toISOString();
    const nextIdx = idx + 1;
    const more = nextIdx < ALFA_BRANCH_IDS.length;
    bag.branchIdx = more ? nextIdx : 0;
    saveArchiveBag(bag);
    const lastArchives: ArchivesReport = {
      at: bag.at,
      added: added.length,
      total: bag.items.length,
      branch: branchName,
      more,
      names: added.slice(0, 4).map((g) => g.name),
    };
    store.lastArchives = lastArchives;
    store.note = added.length
      ? `Архив «${branchName}»: +${added.length}. На диске ${bag.items.length} архивных групп${more ? ". Дальше следующий филиал, пауза 5 с." : "."}`
      : more
        ? `В «${branchName}» новых архивных нет. На диске ${bag.items.length}. Дальше следующий филиал, пауза 5 с.`
        : `Архивных групп на диске ${bag.items.length}. Все 4 филиала просмотрены.`;
    store.at = bag.at;
    saveStore(store);
    return { ok: true as const, extra: store.note, count: added.length, scanned: added.length, more, lastArchives, ...snap() };
  }

  if (kind === "archivesPupils") {
    const who: "1" | "2" = study === "2" ? "2" : "1";
    const plan = pupilArchivePlan(who);
    const lastArchivesPupils = (partial: Partial<ArchivesPupilsReport>, note: string) => {
      const row: ArchivesPupilsReport = {
        at: new Date().toISOString(),
        study: who,
        clients: plan.clients,
        uniqueIds: plan.uniqueIds,
        live: plan.live,
        need: plan.need,
        already: plan.already,
        added: 0,
        left: plan.pending.length,
        more: plan.pending.length > 0,
        names: [],
        missing: [],
        ...partial,
      };
      store.lastArchivesPupils = row;
      store.note = note;
      store.at = row.at;
      saveStore(store);
      return { ok: true as const, extra: note, count: row.added, scanned: row.added, more: row.more, lastArchivesPupils: row, ...snap() };
    };
    if (!plan.need) {
      return lastArchivesPupils({ more: false, left: 0 }, "Новых архивных групп по карточкам нет.");
    }
    const batch = plan.pending.slice(0, 1);
    if (!batch.length) {
      return lastArchivesPupils({ more: false, left: 0 }, `Уже в архивном списке ${plan.already}. Новых по карточкам нет.`);
    }
    const { token, request } = await import("./alfacrm");
    const { crmUnwrapIndex } = await import("./crm-leads-stages");
    const t = await token().catch(() => "");
    if (!t) {
      store.note = "Нет входа в AlfaCRM.";
      store.at = new Date().toISOString();
      saveStore(store);
      return { ok: false as const, error: store.note, more: false, ...snap() };
    }
    const bag = loadArchiveBag();
    const seen = new Set(bag.items.map((g) => `${g.branchId}:${g.groupId}`));
    const added: JournalPullGroup[] = [];
    const missing: number[] = [];
    for (const hit of batch) {
      const json = await request<unknown>(
        `/v2api/${hit.branchId}/group/index`,
        { page: 0, pageSize: 1, id: hit.groupId },
        t,
      ).catch(() => null);
      const pack = crmUnwrapIndex(json);
      const raw = pack.items.find((x) => Number(x.id) === hit.groupId) || pack.items[0];
      const k = `${hit.branchId}:${hit.groupId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (!raw) missing.push(hit.groupId);
      added.push({
        groupId: hit.groupId,
        branchId: hit.branchId,
        name: String((raw && (raw.name as string)) || hit.name || `группа ${hit.groupId}`),
        school: schoolOfArchive(Number(raw?.subject_id) || 0),
        taken: Number((raw && (raw.quantity || raw.cnt || raw.customers_count)) || hit.n || 0) || hit.n,
        archived: true,
        bDate: String((raw && (raw.b_date || raw.bDate)) || ""),
        eDate: String((raw && (raw.e_date || raw.eDate)) || ""),
      });
    }
    bag.items = bag.items.concat(added);
    bag.at = new Date().toISOString();
    saveArchiveBag(bag);
    const left = Math.max(0, plan.pending.length - batch.length);
    const report: ArchivesPupilsReport = {
      at: bag.at,
      study: who,
      clients: plan.clients,
      uniqueIds: plan.uniqueIds,
      live: plan.live,
      need: plan.need,
      already: plan.already,
      added: added.length,
      left,
      more: left > 0,
      names: added.slice(0, 4).map((g) => g.name),
      missing,
    };
    store.lastArchivesPupils = report;
    store.note = [
      `Клиентов ${plan.clients}`,
      `уникальных групп на карточках ${plan.uniqueIds}`,
      `уже в живых ${plan.live}`,
      `уйдёт в архив ${plan.need}`,
      `уже в списке архивных ${plan.already}`,
      added.length ? `+${added.length} с Alfa` : "с Alfa новых нет",
      missing.length ? `не нашли: ${missing.slice(0, 8).join(", ")}` : "",
      left ? `ещё ${left}, пауза 5 с` : "",
    ]
      .filter(Boolean)
      .join(". ");
    store.at = bag.at;
    saveStore(store);
    return { ok: true as const, extra: store.note, count: added.length, scanned: batch.length, more: left > 0, lastArchivesPupils: report, ...snap() };
  }

  if (kind === "life") {
    const scoped = school ? groups.filter((g) => g.school === school) : groups;
    if (!scoped.length) {
      store.note = "Сначала загрузите группы из Alfa.";
      store.at = new Date().toISOString();
      saveStore(store);
      return { ok: false as const, error: store.note, more: false, ...snap() };
    }
    const now = new Date().toISOString();
    const youngNames: string[] = [];
    const midNames: string[] = [];
    const oldNames: string[] = [];
    const unknownNames: string[] = [];
    let young = 0;
    let mid = 0;
    let old = 0;
    let unknown = 0;
    for (const g of scoped) {
      const prev = fillOf(g.branchId, g.groupId);
      const from = String(g.bDate || prev.life?.from || "");
      const to = String(g.eDate || prev.life?.to || "");
      const age = groupAge(from, to);
      if (age.id === "young") {
        young += 1;
        if (youngNames.length < 4) youngNames.push(g.name);
      } else if (age.id === "old") {
        old += 1;
        if (oldNames.length < 4) oldNames.push(g.name);
      } else if (age.id === "mid") {
        mid += 1;
        if (midNames.length < 4) midNames.push(g.name);
      } else {
        unknown += 1;
        if (unknownNames.length < 4) unknownNames.push(g.name);
      }
      patchFill(g.branchId, g.groupId, { life: { from, to, source: prev.life?.source || (from || to ? "slot" : "") } });
    }
    const { token } = await import("./alfacrm");
    const { probeGroupLife } = await import("./crm-journal-inbound");
    const t = await token().catch(() => "");
    const needProbe = scoped.filter((g) => fillOf(g.branchId, g.groupId).life?.source !== "alfa");
    const batch = needProbe.slice(0, 1);
    let probed = 0;
    if (t) {
      for (const g of batch) {
        const hit = await probeGroupLife(g.branchId, g.groupId, { token: t }).catch(() => ({ from: "", to: "", lessons: 0, ok: false as const }));
        const prev = fillOf(g.branchId, g.groupId);
        const fromA = hit.from || String(prev.life?.from || g.bDate || "");
        const toA = hit.to || String(prev.life?.to || g.eDate || "");
        const source = hit.ok ? "alfa" : prev.life?.source || "slot";
        patchFill(g.branchId, g.groupId, { life: { from: fromA, to: toA, source } });
        const cur = loadGroupCard(g.branchId, g.groupId);
        if (cur) {
          saveGroupCard({
            ...cur,
            journalLife: { from: fromA, to: toA, source, at: now },
          });
        }
        probed += 1;
      }
    }
    const left = scoped.filter((g) => fillOf(g.branchId, g.groupId).life?.source !== "alfa").length;
    young = 0;
    mid = 0;
    old = 0;
    unknown = 0;
    youngNames.length = 0;
    midNames.length = 0;
    oldNames.length = 0;
    unknownNames.length = 0;
    for (const g of scoped) {
      const life = groupLife(g);
      const age = groupAge(life.from, life.to);
      if (age.id === "young") {
        young += 1;
        if (youngNames.length < 4) youngNames.push(g.name);
      } else if (age.id === "old") {
        old += 1;
        if (oldNames.length < 4) oldNames.push(g.name);
      } else if (age.id === "mid") {
        mid += 1;
        if (midNames.length < 4) midNames.push(g.name);
      } else {
        unknown += 1;
        if (unknownNames.length < 4) unknownNames.push(g.name);
      }
    }
    const lastLife: LifeReport = {
      at: now,
      school,
      total: scoped.length,
      young,
      mid,
      old,
      unknown,
      youngNames,
      midNames,
      oldNames,
      unknownNames,
      probed,
      left,
    };
    store.lastLife = lastLife;
    store.note = `Определено ${scoped.length} групп${school ? ` в «${school}»` : ""}: молодых ${young}, средних ${mid}, старых ${old}${unknown ? `, без срока ${unknown}` : ""}. Срок из Alfa уточнили у ${probed}${left ? `, осталось ${left}` : ""}.`;
    store.at = now;
    saveStore(store);
    return { ok: true as const, extra: store.note, count: scoped.length, scanned: scoped.length, more: left > 0, lastLife, ...snap() };
  }

  if (kind === "details") {
    const hit = groups.find((g) => g.groupId === selectedGid && (!selectedBid || g.branchId === selectedBid)) || groups.find((g) => g.groupId === selectedGid);
    if (!hit) {
      store.note = "Этой группы нет в списке.";
      store.at = new Date().toISOString();
      saveStore(store);
      return { ok: false as const, error: store.note, more: false, ...snap() };
    }
    const card = loadGroupCard(hit.branchId, hit.groupId);
    if (!card) {
      store.note = `«${hit.name}»: сначала загрузите явки.`;
      return { ok: false as const, error: store.note, more: false, ...snap() };
    }
    const periodKey = String(opts.periodKey || "");
    const periods = journalPeriods();
    const period = periods.find((p) => p.key === periodKey);
    const slice = period ? (card.calendar || []).filter((l) => inPeriod(l.date, period.from, period.to)) : card.calendar || [];
    const { enrichCalendarDetails } = await import("./crm-journal-inbound");
    const enriched = await enrichCalendarDetails(hit.branchId, slice, { take: 16 });
    if (enriched.changed) {
      const byId = new Map((card.calendar || []).map((l) => [`${l.lessonId || 0}|${l.date}|${l.from}`, l]));
      for (const l of enriched.calendar) byId.set(`${l.lessonId || 0}|${l.date}|${l.from}`, l);
      const calendar = [...byId.values()];
      saveGroupCard({ ...card, calendar, journalAt: new Date().toISOString() });
      fanOutLessonWriteoffs(calendar);
    }
    const after = loadGroupCard(hit.branchId, hit.groupId);
    const leftNow = (period
      ? (after?.calendar || []).filter((l) => inPeriod(l.date, period.from, period.to))
      : after?.calendar || []
    ).filter(lessonNeedsHomework).length;
    store.note = enriched.filled
      ? leftNow
        ? `«${hit.name}»: записали ДЗ ${enriched.filled} ур., осталось ${leftNow} — нажмите ещё`
        : `«${hit.name}»: ДЗ и комментарии на месте (${enriched.filled} ур.)`
      : leftNow
        ? `«${hit.name}»: ${period ? `${period.label} · ` : ""}ещё ${leftNow} без темы — Alfa не ответила, нажмите ещё`
        : `«${hit.name}»: ${period ? `${period.label} · ` : ""}ДЗ грузить нечего — проведённых без темы нет`;
    store.at = new Date().toISOString();
    saveStore(store);
    return { ok: true as const, extra: store.note, count: enriched.filled, scanned: 1, more: leftNow > 0, periodKey, periodLabel: period?.label || "", ...snap() };
  }

  if (kind === "group" || kind === "school") {
    const scoped = school ? groups.filter((g) => g.school === school) : groups;
    if (!scoped.length) {
      store.note = school ? `В школе «${school}» нет групп на сайте.` : "Сначала загрузите группы из Alfa.";
      store.at = new Date().toISOString();
      saveStore(store);
      return { ok: false as const, error: store.note, more: false, ...snap() };
    }
    const grain = (opts.grain === "half" || opts.grain === "year" ? opts.grain : "quarter") as Grain;
    const periodKey = String(opts.periodKey || "");
    const recheck = Boolean(opts.recheck);
    if (kind !== "group" || !selectedGid) {
      store.note = "Выберите группу и порцию (квартал). Фон сам журнал не качает.";
      store.at = new Date().toISOString();
      saveStore(store);
      return { ok: false as const, error: store.note, more: false, ...snap() };
    }
    const hit = scoped.find((g) => g.groupId === selectedGid && (!selectedBid || g.branchId === selectedBid)) || scoped.find((g) => g.groupId === selectedGid);
    if (!hit) {
      store.note = "Этой группы нет в списке.";
      store.at = new Date().toISOString();
      saveStore(store);
      return { ok: false as const, error: store.note, more: false, ...snap() };
    }
    const fill = fillOf(hit.branchId, hit.groupId);
    const doneKeys = pulledPeriodKeys({ done: Object.keys(fill.pulled || {}), pulled: fill.pulled });
    const weakSet = new Set(fill.weak || []);
    const life = groupLife(hit);
    const span = spanOf(loadGroupCard(hit.branchId, hit.groupId)?.calendar);
    const clipFrom = earlierRu(life.from, span.fromRu);
    const clipTo = laterRu(life.to, span.toRu);
    const age = groupAge(clipFrom || life.from, clipTo || life.to);
    const useGrain = clampGrain(age.id, grain);
    const chunksAll = journalChunks(useGrain);
    const known = Boolean(clipFrom || clipTo);
    const chunks = known ? chunksAll.filter((c) => chunkOverlapsLife(c, clipFrom, clipTo)) : chunksAll.slice(0, 4);
    const need = (c: (typeof chunks)[number]) => !chunkDone(c, doneKeys) || c.keys.some((k) => weakSet.has(k));
    const picked =
      (periodKey && (chunksAll.find((c) => c.key === periodKey) || journalChunks("quarter").find((c) => c.key === periodKey))) ||
      (!recheck && chunks.find(need)) ||
      (recheck
        ? { key: `w${clampRecheckDays(opts.recheckDays)}`, from: "", to: "", label: "окно", keys: [`w${clampRecheckDays(opts.recheckDays)}`] }
        : null);
    if (!picked) {
      store.note = `«${hit.name}»: вся информация загружена.`;
      store.at = new Date().toISOString();
      saveStore(store);
      return { ok: true as const, extra: store.note, count: 0, scanned: 0, more: false, ...snap() };
    }
    const res = await pullOneGroup(hit, picked, recheck || Boolean(periodKey && chunkDone(picked, doneKeys)), opts.recheckDays).catch((e) => ({
      extra: `«${hit.name}»: ${e instanceof Error ? e.message : "ошибка"}`,
      count: 0,
      ok: false,
      capped: true,
    }));
    store.note = res.extra;
    store.at = new Date().toISOString();
    saveStore(store);
    const afterFillHit = fillOf(hit.branchId, hit.groupId);
    const afterFill = pulledPeriodKeys({ done: Object.keys(afterFillHit.pulled || {}), pulled: afterFillHit.pulled });
    const afterWeak = new Set(afterFillHit.weak || []);
    return {
      ok: true as const,
      extra: store.note,
      count: res.count,
      scanned: 1,
      more: Boolean(chunks.some((c) => !chunkDone(c, afterFill) || c.keys.some((k) => afterWeak.has(k)))),
      periodKey: picked.key,
      periodLabel: picked.label,
      ...snap(),
    };
  }

  const group = selectedGid ? { groupId: selectedGid, branchId: selectedBid || 1 } : undefined;
  let people = rankedStudentIds(study, group, group ? "" : school);
  if (kind === "balance" || kind === "audit") people = people.filter((p) => p.study !== 0 && p.status !== "лид");
  const wanted = Number(opts.customerId) || 0;
  if (!people.length && !wanted) {
    store.note = group
      ? "В этой группе нет учеников на диске."
      : school
        ? `В школе «${school}» нет учеников на диске.`
        : "Сначала загрузите клиентов и архив.";
    store.at = new Date().toISOString();
    saveStore(store);
    return { ok: false as const, error: store.note, more: false, ...snap() };
  }
  const key = `${study}:${group ? `${group.branchId}:${group.groupId}` : school || "*"}`;
  const idx = Number(store.studentIdx[key]) || 0;
  const fromList = wanted ? people.find((p) => p.cid === wanted) : null;
  const fallback = wanted
    ? (() => {
        const d = findDossier({ crmId: wanted });
        if (!d) return null;
        return { cid: wanted, branchId: Number(d.branchId || 1) || 1, study: Number(d.extras?.is_study) || -1 };
      })()
    : null;
  const one = fromList || fallback || pickSlice(people, idx, 1).slice[0];
  if (!one) {
    store.note = "Нет ученика для загрузки.";
    store.at = new Date().toISOString();
    saveStore(store);
    return { ok: false as const, error: store.note, more: false, ...snap() };
  }
  if (wanted) {
    studentPullCid = wanted;
  } else if (studentPullCid && studentPullCid !== one.cid) {
    return {
      ok: false as const,
      error: `уже грузим ученика №${studentPullCid} — подождите, не пачкой`,
      more: false,
      ...litePullState(),
    };
  }
  const other = studentAlfaOwner();
  if (other && other !== one.cid && !wanted) {
    return {
      ok: false as const,
      error: `уже грузим ученика №${other} — подождите, не пачкой`,
      more: false,
      ...litePullState(),
    };
  }
  studentPullCid = one.cid;
  try {
    if (!wanted) {
      const picked = pickSlice(people, idx, 1);
      store.studentIdx[key] = picked.next;
    }
    if (opts.probe) {
      const { probeCustomerLessons, studentProtectLessonIds } = await import("./crm-journal-inbound");
      const disk = countAlfaLessonUniq(loadCustomerCalendar(one.cid));
      const probed = await probeCustomerLessons(one.branchId, one.cid).catch(() => ({ total: 0, ok: false as const, ids: [] as number[] }));
      const keep = Number(customerSyncOf(one.cid).lessonsAlfa) || 0;
      const alfaRaw = probed.ok ? probed.total : 0;
      const held = keepAlfaProbe(keep, alfaRaw, probed.ok, Boolean(probed.ok));
      const holeApproved = Boolean(customerSyncOf(one.cid).journalHoleApprovedAt);
      const ids = probed.ok ? uniquePositiveIds("ids" in probed ? probed.ids || [] : []) : [];
      const have = uniquePositiveIds(loadCustomerCalendar(one.cid).map((x) => Number(x.lessonId) || 0));
      const gap = probed.ok ? stampLessonSetGap({ lessonsSeenIds: ids }, have, studentProtectLessonIds(one.cid)) : {};
      const short = lessonsStampShort({ lessonsAlfaAt: probed.ok ? "x" : "", lessonsAlfa: held.alfa, lessonsDisk: disk, lessonsSeenIds: ids, ...gap });
      const dups = lessonsStampExtra({ lessonsAlfaAt: probed.ok ? "x" : "", lessonsAlfa: held.alfa, lessonsDisk: disk, lessonsSeenIds: ids, ...gap });
      const closed = Boolean(probed.ok && held.write && !short && !dups && !holeApproved);
      stampCustomerSync(one.cid, {
        lessonsDisk: disk,
        ...(held.write ? { lessonsAlfa: held.alfa, lessonsAlfaAt: new Date().toISOString() } : {}),
        ...(probed.ok ? { lessonsSeenIds: ids, ...gap } : {}),
        ...(closed ? { lessonsFull: true, lessonsAttend: true } : { lessonsFull: false }),
      });
      const name = fioOf(one.cid);
      store.note = probed.ok
        ? `${name}: на диске ${disk} · в Alfa ${held.alfa}${short ? " — не хватает, добрать" : dups ? " — дубли, снять" : disk ? " — счёт сошёлся" : ""}`
        : `${name}: Alfa не ответила на сверку`;
      store.at = new Date().toISOString();
      saveStore(store);
      return {
        ok: probed.ok,
        extra: store.note,
        count: held.alfa,
        scanned: 1,
        more: false,
        student: { cid: one.cid, branchId: one.branchId, name, groups: groupsOfStudent(one.cid), lessons: disk, pays: 0, done: closed, ok: closed, alfa: held.alfa, short, dups, holeApproved: Boolean(customerSyncOf(one.cid).journalHoleApprovedAt) },
        ...snap(),
      };
    }
    const balance = kind === "balance";
    const row = await pullOneStudent(one.cid, one.branchId, balance, Boolean(opts.recheck), String(opts.dateFrom || "").trim(), Boolean(opts.slowFill), clampRecheckDays(opts.recheckDays));
    if (row.blocked) {
      return {
        ok: false as const,
        error: `уже грузим другого ученика — подождите, не пачкой`,
        more: false,
        ...litePullState(),
      };
    }
    const sync = customerSyncOf(one.cid);
    const gnames = groupsOfStudent(one.cid);
    const name = fioOf(one.cid);
    const landed = lessonsJournalReady(sync);
    const who = study === "1" ? "текущие" : study === "2" ? "архив" : "ученики";
    const hit: StudentHit = {
      cid: one.cid,
      branchId: one.branchId,
      name,
      groups: gnames,
      lessons: row.lessons,
      pays: row.pays,
      paysOk: balance ? Boolean(row.paysOk) : undefined,
      paysMore: Boolean(row.paysMore),
      paysScanned: Boolean(row.paysScanned),
      paysEmpty: Boolean(row.paysEmpty),
      cashRows: Number(row.cashRows) || row.pays || 0,
      rechecked: Boolean(row.rechecked),
      paysRechecked: Boolean(row.paysRechecked),
      done: row.done,
      ok: landed,
      alfa: row.alfa,
      short: row.short,
      dups: row.dups,
      seated: Number(row.seated) || 0,
      holeApproved: Boolean(customerSyncOf(one.cid).journalHoleApprovedAt),
    };
    const prev = store.lastStudents && store.lastStudents.study === study ? store.lastStudents.rows : [];
    const merged = [hit, ...prev.filter((r) => r.cid !== hit.cid)].slice(0, 40);
    store.lastStudents = {
      at: new Date().toISOString(),
      study,
      who,
      n: wanted ? prev.filter((r) => r.cid !== hit.cid).length + 1 : (Number(store.lastStudents?.n) || 0) + 1,
      total: people.length,
      rows: merged,
    };
    store.note = row.payFail
      ? `${who}: ${name} · Alfa не ответила, нажмите снова`
      : row.short
      ? `${who}: ${name} · на диске ${countAlfaLessonUniq(loadCustomerCalendar(one.cid))} · в Alfa ${row.alfa} — не хватает, добрать`
      : row.dups
      ? `${who}: ${name} · на диске ${countAlfaLessonUniq(loadCustomerCalendar(one.cid))} · в Alfa ${row.alfa} — дубли, снять`
      : row.paysMore
      ? `${who}: ${name} · касса: ещё страницы, нажмите снова`
      : landed
      ? `${who}: ${name}${gnames.length ? ` · ${gnames.slice(0, 2).join(", ")}` : ""} · ${row.lessons} зан.${row.alfa ? ` · Alfa ${row.alfa}` : ""}${balance && row.paysOk ? " · касса готова" : ""}`
      : `${who}: ${name}${gnames.length ? ` · ${gnames.slice(0, 2).join(", ")}` : ""} · не попал в выдачу${row.done ? " (Alfa пусто)" : " (обрыв)"}`;
    store.at = new Date().toISOString();
    saveStore(store);
    return {
      ok: true as const,
      extra: store.note,
      count: row.lessons,
      scanned: 1,
      more: !wanted,
      student: hit,
      ...snap(),
    };
  } finally {
    if (studentPullCid === one.cid) studentPullCid = 0;
  }
}
