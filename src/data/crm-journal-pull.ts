/** Ручная догрузка журнала: группа / школа / 10 учеников. Не весь API сразу. */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SCHOOL_ORDER, lessonNeedsHomework } from "./crm-slots-core";
import { isCampStatus } from "./group-status";
import { alfaLinkedNow } from "./crm-alfa-link";
import { loadCachePolicy } from "./crm-cache-policy";
import { listAdminSlots } from "./alfacrm-schedule";
import { loadScheduleMap } from "./schedule-map";
import { listDossierCrm, findDossier, dossiersInGroup } from "./dossiers";
import { loadGroupCard, saveGroupCard, loadCustomerCalendar, fanOutLessonWriteoffs, hydrateGroupCardsFromMonolith } from "./group-cards";
import { customerSyncOf, stampCustomerSync, studentAlfaOwner, lessonsJournalReady, lessonsCountShort } from "./crm-customer-sync";
import { payCustomerFilled } from "./crm-pay";
import { journalPeriods, journalChunks, spanOf, inPeriod, groupAge, chunkOverlapsLife, lifeLabel, parseLessonDate, chunkDone, pulledPeriodKeys, clampGrain, earlierRu, laterRu, type Grain } from "./crm-journal-periods";
import { archiveFioOk, archiveWorkingSet, extraGroupKeys, formatArchiveCountNote, loadArchivePolicy, recountArchivePolicy, saveArchivePolicy, addArchiveWorking, type ArchiveCountReport } from "./crm-archive-policy";

export type JournalPullKind = "group" | "school" | "students" | "balance" | "life" | "details" | "archives" | "archivesPupils" | "hydrateDisk" | "archiveCount" | "archiveCatalog" | "archiveAdd" | "audit";
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
  rechecked?: boolean;
  paysRechecked?: boolean;
  done: boolean;
  ok: boolean;
  alfa?: number;
  short?: boolean;
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

function rankedStudentIds(study: JournalPullStudy, group?: { groupId: number; branchId: number }, school?: string) {
  const scoped = Boolean(group && group.groupId);
  let pool: { cid: number; study: number; branchId: number; status: string; removed: string }[] = [];
  if (group && group.groupId) {
    pool = dossiersInGroup(group.branchId, group.groupId).map((d) => {
      const st = Number(d?.extras?.is_study);
      return {
        cid: Number(d.crmId) || 0,
        study: Number.isFinite(st) ? st : -1,
        branchId: Number(d?.branchId || group.branchId || 1) || 1,
        status: String(d?.status || ""),
        removed: String(d?.extras?.removed || ""),
      };
    }).filter((x) => x.cid);
  } else if (school) {
    const seen = new Set<number>();
    for (const g of journalPullGroups().filter((x) => x.school === school)) {
      for (const d of dossiersInGroup(g.branchId, g.groupId)) {
        const cid = Number(d.crmId) || 0;
        if (!cid || seen.has(cid)) continue;
        seen.add(cid);
        const st = Number(d.extras?.is_study);
        pool.push({
          cid,
          study: Number.isFinite(st) ? st : -1,
          branchId: Number(d.branchId || g.branchId || 1) || 1,
          status: String(d.status || ""),
          removed: String(d.extras?.removed || ""),
        });
      }
    }
  } else {
    pool = listDossierCrm();
  }
  const allow = !scoped ? archiveWorkingSet() : null;
  const filtered = pool.filter((x) => {
    if (!x.cid) return false;
    if (x.status === "удалён" || x.removed === "1") return false;
    if (x.study === 0) return false;
    if (study === "1") return x.study === 1;
    if (study === "2") return x.study === 2 && (scoped || Boolean(allow && allow.has(x.cid)));
    if (x.study === 1) return true;
    if (x.study === 2) return scoped || Boolean(allow && allow.has(x.cid));
    return false;
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
  return String(d?.child?.fio || "").trim() || `клиент ${cid}`;
}

function groupsOfStudent(cid: number) {
  const d = findDossier({ crmId: cid });
  return (d?.groupLinks || []).map((g) => String(g.name || "").trim()).filter(Boolean);
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
      done: stamped || n > 0 || emptyPrefix,
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
      const short = lessonsCountShort(diskN, alfaN, probed);
      const journal = lessonsJournalReady(sync);
      const pays = payCustomerFilled(p.cid);
      const name = fioOf(p.cid);
      const glist = groupsOfStudent(p.cid).slice(0, 3);
      const gnames = glist.join(", ") || own.map((g) => g.name).filter(Boolean).slice(0, 3).join(", ");
      if (journal) journalDone += 1;
      else missJ.push({ id: p.cid, name, extra: short ? `на диске ${diskN}, в Alfa ${alfaN}` : gnames ? gnames : own.length ? "группы ещё не сверены" : "нет полного журнала" });
      if (journal && pays) cardDone += 1;
      else missC.push({ id: p.cid, name, extra: journal ? "нет кассы" : gnames || (own.length ? "группы ещё не сверены" : "нет явки") });
      peopleRows.push({
        cid: p.cid,
        branchId: p.branchId,
        name,
        groups: glist.length ? glist : own.map((g) => g.name).filter(Boolean).slice(0, 3),
        lessons: diskN,
        alfa: probed ? alfaN : undefined,
        short,
        journal,
        pays,
        rechecked: Boolean(sync.lessonsRecheckAt) && !short,
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
      people: study === "2" ? peopleRows : peopleRows.slice(0, 800),
    };
  }

  if (opts?.skipPeople) {
    return {
      groups: {
        total: groups.length,
        done: complete,
        periods: journalPeriods().length,
        miss: packList(groupsMiss, 200),
        doneList: packList(groupsDone, 200),
        rows: rows.slice(0, 800),
      },
      live: blankPeople(0),
      archive: blankPeople(0),
    };
  }

  const live = studentSide("1");
  const arch = studentSide("2");
  return {
    groups: {
      total: groups.length,
      done: complete,
      periods: journalPeriods().length,
      miss: packList(groupsMiss, 200),
      doneList: packList(groupsDone, 200),
      rows: rows.slice(0, 800),
    },
    live,
    archive: arch,
  };
}

export function journalPullState(opts?: { skipPeople?: boolean }) {
  const store = loadStore();
  const pol = loadCachePolicy();
  const groups = journalPullGroups();
  const schools = journalPullSchools();
  const emptySide = (study: JournalPullStudy) => {
    const list = rankedStudentIds(study);
    const cap = study === "2" ? list.length : 800;
    const people = list.slice(0, cap).map((p) => {
      const sync = customerSyncOf(p.cid);
      const probed = Boolean(sync.lessonsAlfaAt);
      const alfaN = probed ? Number(sync.lessonsAlfa) || 0 : 0;
      const diskN = Number(sync.lessonsDisk) || 0;
      const short = lessonsCountShort(diskN, alfaN, probed);
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
        journal,
        pays,
        rechecked: Boolean(sync.lessonsRecheckAt) && !short,
        paysRechecked: Boolean(sync.paysRecheckAt),
        extra: probed ? `на диске ${diskN} · в Alfa ${alfaN}` : groupsOfStudent(p.cid).slice(0, 2).join(", "),
        at: sync.lessonsAt || "",
      };
    });
    return {
      total: list.length,
      journalDone: people.filter((r) => r.journal).length,
      cardDone: people.filter((r) => r.journal && r.pays).length,
      missJournal: packList([] as { id: number; name: string; extra: string }[]),
      missCard: packList([] as { id: number; name: string; extra: string }[]),
      people,
    };
  };
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
    lastStudents: store.lastStudents || null,
    lastArchivePolicy: store.lastArchivePolicy || null,
    lastArchiveCatalog: store.lastArchiveCatalog || null,
    lastAudit: store.lastAudit || null,
  };
}

function stampJournalPeriod(branchId: number, gid: number, keys: string[], patch: { ok: boolean; err?: string; weak?: boolean; recheck?: boolean }) {
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
        if (patch.recheck) rechecked.add(key);
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
  const next = { ...card, journalFill: { done: [...new Set([...done, ...Object.keys(pulled)])], fail, pulled, weak: [...weak], rechecked: [...rechecked] }, journalAt: at };
  saveGroupCard(next);
  return next;
}

async function pullOneGroup(
  g: JournalPullGroup,
  period: { key: string; from: string; to: string; label: string; keys?: string[] },
  recheck = false,
) {
  const beforeCard = loadGroupCard(g.branchId, g.groupId);
  const before = (beforeCard?.calendar || []).filter((l) => inPeriod(l.date, period.from, period.to)).length;
  const { inboundJournalGroup } = await import("./crm-journal-inbound");
  const res = await inboundJournalGroup(g.branchId, g.groupId, {
    deep: false,
    lite: true,
    recheck,
    dateFrom: period.from,
    dateTo: period.to,
    groupName: g.name,
  });
  const ok = res.ok !== false;
  const n = (res.calendar || []).filter((l) => inPeriod(l.date, period.from, period.to)).length;
  const alfaTotal = Number((res as { alfaTotal?: number }).alfaTotal) || 0;
  const capped = Boolean((res as { capped?: boolean }).capped) || (alfaTotal > 0 && n < alfaTotal);
  const keys = period.keys?.length ? period.keys : [period.key];
  stampJournalPeriod(g.branchId, g.groupId, keys, { ok, err: ok ? "" : String(res.extra || "Alfa не ответила"), weak: !ok || capped, recheck });
  const added = Math.max(0, n - before);
  const extra = ok
    ? capped
      ? `«${g.name}»: ${period.label} · ${n} зан.${alfaTotal ? ` из ${alfaTotal}` : ""}${added ? `, +${added}` : ""} · пакет оборвался, нажмите ещё раз`
      : recheck
        ? `перепроверка «${g.name}»: ${period.label} · было ${before}, стало ${n}${added ? `, дозаписали ${added}` : ", дырок нет"}`
        : `«${g.name}»: ${period.label} · ${n} зан. за порцию`
    : String(res.extra || `«${g.name}»: ${period.label} — Alfa не ответила`);
  return { extra, count: n, ok, capped };
}

async function pullOneStudent(cid: number, branchId: number, balance: boolean, recheck = false, dateFrom = "") {
  const { inboundCustomerLessons, probeCustomerLessons } = await import("./crm-journal-inbound");
  const atOf = () => new Date().toISOString();
  const from = String(dateFrom || "").trim();
  const mark = (disk: number, alfa: number, probedOk: boolean) => {
    const short = lessonsCountShort(disk, alfa, probedOk);
    const closed = probedOk && !short && disk >= alfa;
    const at = atOf();
    stampCustomerSync(cid, {
      lessonsDisk: disk,
      lessonsAt: at,
      ...(probedOk ? { lessonsAlfa: alfa, lessonsAlfaAt: at } : {}),
      ...(short ? { lessonsFull: false } : closed ? { lessonsFull: true, lessonsAttend: true } : {}),
      ...(balance
        ? { paysAt: at, ...(recheck && closed ? { paysRecheckAt: at, lessonsRecheckAt: at } : {}) }
        : recheck && closed
          ? { lessonsRecheckAt: at }
          : {}),
    });
    return { short, closed };
  };
  let lessons = 0;
  let disk = loadCustomerCalendar(cid).length;
  const first = await probeCustomerLessons(branchId, cid).catch(() => ({ total: 0, ok: false as const }));
  const alfa0 = first.ok ? first.total : 0;
  if (!recheck && first.ok && disk >= alfa0) {
    mark(disk, alfa0, true);
    if (!balance) return { cid, lessons: disk, done: true, pays: 0, tariffs: 0, alfa: alfa0, short: false, blocked: false, paysOk: false, paysMore: false, rechecked: Boolean(customerSyncOf(cid).lessonsRecheckAt), paysRechecked: false };
  } else {
    const res = await inboundCustomerLessons(branchId, cid, {
      take: 8,
      deep: 0,
      continueLater: false,
      full: true,
      force: true,
      homeOnly: false,
      ...(from ? { dateFrom: from } : {}),
    }).catch(() => ({ count: 0, done: true as const, skipped: undefined as string | undefined }));
    lessons += Number(res.count) || 0;
    if ("skipped" in res && res.skipped === "busy") {
      return { cid, lessons, done: false, pays: 0, tariffs: 0, alfa: alfa0, short: true, blocked: true, paysOk: false, paysMore: false, rechecked: false, paysRechecked: false };
    }
    disk = loadCustomerCalendar(cid).length;
    const probed = await probeCustomerLessons(branchId, cid).catch(() => ({ total: 0, ok: false as const }));
    mark(disk, probed.ok ? probed.total : 0, probed.ok);
  }
  let pays = 0;
  let tariffs = 0;
  let paysOk = false;
  let payFail = "";
  if (balance) {
    const { token, request } = await import("./alfacrm");
    const t = await token();
    const { inboundCustomerPays, paysOf, payCustomerFilled, markPayJournalIncomplete } = await import("./crm-pay");
    try {
      if (recheck) markPayJournalIncomplete(cid);
      await inboundCustomerPays(request, t, branchId, cid, { force: recheck });
    } catch (e) {
      payFail = e instanceof Error && e.message ? e.message : "Alfa не ответила, нажмите снова";
    }
    pays = paysOf(cid).length;
    paysOk = !payFail && payCustomerFilled(cid);
    const { pullCustomerTariffs } = await import("./pupil-tariffs");
    const rows = await pullCustomerTariffs(branchId, cid).catch(() => []);
    tariffs = rows.length;
    const syncNow = customerSyncOf(cid);
    const diskNow = loadCustomerCalendar(cid).length;
    const alfaNow = Number(syncNow.lessonsAlfa) || 0;
    mark(diskNow, alfaNow, Boolean(syncNow.lessonsAlfaAt));
  }
  const sync = customerSyncOf(cid);
  const short = lessonsCountShort(Number(sync.lessonsDisk) || 0, Number(sync.lessonsAlfa) || 0, Boolean(sync.lessonsAlfaAt));
  return {
    cid,
    lessons: Number(sync.lessonsDisk) || lessons,
    done: lessonsJournalReady(sync),
    pays,
    tariffs,
    alfa: Number(sync.lessonsAlfa) || 0,
    short,
    blocked: false,
    paysOk,
    paysMore: Boolean(balance && !paysOk),
    payFail,
    rechecked: Boolean(sync.lessonsRecheckAt) && !short,
    paysRechecked: Boolean(sync.paysRecheckAt),
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
}) {
  const kind = opts.kind;
  const wantedEarly = Number(opts.customerId) || 0;
  const peopleKinds: JournalPullKind[] = ["students", "balance", "archiveCatalog", "archiveCount", "archiveAdd", "audit"];
  const needPeople = peopleKinds.includes(kind);
  const snap = () => journalPullState({ skipPeople: !needPeople || (wantedEarly > 0 && (kind === "students" || kind === "balance" || kind === "audit")) });
  const store = loadStore();
  const groups = journalPullGroups();
  const school = String(opts.school || "").trim();
  const study = (opts.study === "1" || opts.study === "2" ? opts.study : "all") as JournalPullStudy;
  const selectedGid = Number(opts.groupId) || 0;
  const selectedBid = Number(opts.branchId) || 0;

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
    return { ok: true as const, extra: store.note, count: report.working, scanned: report.disk, more: false, lastArchivePolicy: report, ...journalPullState() };
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
        ...journalPullState({ skipPeople: true }),
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
        ...journalPullState({ skipPeople: true }),
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
      ? `Архив «${branchName}»: +${added.length}. На диске ${bag.items.length} архивных групп${more ? ". Нажмите ещё — следующий пакет." : "."}`
      : more
        ? `В «${branchName}» новых архивных нет. На диске ${bag.items.length}. Нажмите ещё — следующий филиал.`
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
    const batch = plan.pending.slice(0, 10);
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
      left ? `ещё ${left}, нажмите снова` : "",
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
    const batch = needProbe.slice(0, 4);
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
    store.note = `Определено ${scoped.length} групп${school ? ` в «${school}»` : ""}: молодых ${young}, средних ${mid}, старых ${old}${unknown ? `, без срока ${unknown}` : ""}. Срок из Alfa уточнили у ${probed}${left ? `, осталось ${left} — нажмите ещё` : ""}.`;
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
      chunks.find(need) ||
      (recheck ? chunks[0] : null);
    if (!picked) {
      store.note = `«${hit.name}»: вся информация загружена.`;
      store.at = new Date().toISOString();
      saveStore(store);
      return { ok: true as const, extra: store.note, count: 0, scanned: 0, more: false, ...snap() };
    }
    const res = await pullOneGroup(hit, picked, recheck || Boolean(periodKey && chunkDone(picked, doneKeys))).catch((e) => ({
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
  const people = rankedStudentIds(study, group, group ? "" : school);
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
  if (studentPullCid && studentPullCid !== one.cid) {
    return {
      ok: false as const,
      error: `уже грузим ученика №${studentPullCid} — подождите, не пачкой`,
      more: false,
      ...journalPullState({ skipPeople: true }),
    };
  }
  const other = studentAlfaOwner();
  if (other && other !== one.cid) {
    return {
      ok: false as const,
      error: `уже грузим ученика №${other} — подождите, не пачкой`,
      more: false,
      ...journalPullState({ skipPeople: true }),
    };
  }
  studentPullCid = one.cid;
  try {
    if (!wanted) {
      const picked = pickSlice(people, idx, 1);
      store.studentIdx[key] = picked.next;
    }
    if (opts.probe) {
      const { probeCustomerLessons } = await import("./crm-journal-inbound");
      const disk = loadCustomerCalendar(one.cid).length;
      const probed = await probeCustomerLessons(one.branchId, one.cid).catch(() => ({ total: 0, ok: false as const }));
      const alfaN = probed.ok ? probed.total : 0;
      const short = lessonsCountShort(disk, alfaN, probed.ok);
      stampCustomerSync(one.cid, {
        lessonsDisk: disk,
        ...(probed.ok ? { lessonsAlfa: alfaN, lessonsAlfaAt: new Date().toISOString() } : {}),
        ...(short ? { lessonsFull: false } : probed.ok ? { lessonsFull: true, lessonsAttend: true } : {}),
      });
      const name = fioOf(one.cid);
      store.note = probed.ok
        ? `${name}: на диске ${disk} · в Alfa ${alfaN}${short ? " — не хватает, добрать" : disk ? " — счёт сошёлся" : ""}`
        : `${name}: Alfa не ответила на сверку`;
      store.at = new Date().toISOString();
      saveStore(store);
      return {
        ok: probed.ok,
        extra: store.note,
        count: alfaN,
        scanned: 1,
        more: false,
        student: { cid: one.cid, branchId: one.branchId, name, groups: groupsOfStudent(one.cid), lessons: disk, pays: 0, done: !short, ok: probed.ok && !short, alfa: alfaN, short },
        ...snap(),
      };
    }
    const balance = kind === "balance";
    const row = await pullOneStudent(one.cid, one.branchId, balance, Boolean(opts.recheck), String(opts.dateFrom || "").trim());
    if (row.blocked) {
      return {
        ok: false as const,
        error: `уже грузим другого ученика — подождите, не пачкой`,
        more: false,
        ...journalPullState({ skipPeople: true }),
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
      rechecked: Boolean(row.rechecked),
      paysRechecked: Boolean(row.paysRechecked),
      done: row.done,
      ok: landed,
      alfa: row.alfa,
      short: row.short,
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
      ? `${who}: ${name} · на диске ${loadCustomerCalendar(one.cid).length} · в Alfa ${row.alfa} — не хватает, добрать`
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
