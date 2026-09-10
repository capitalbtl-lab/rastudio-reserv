/** Ручная догрузка журнала: группа / школа / 10 учеников. Не весь API сразу. */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SCHOOL_ORDER, lessonNeedsHomework } from "./crm-slots-core";
import { isCampStatus } from "./group-status";
import { alfaLinkedNow } from "./crm-alfa-link";
import { loadCachePolicy } from "./crm-cache-policy";
import { listAdminSlots } from "./alfacrm-schedule";
import { loadScheduleMap } from "./schedule-map";
import { allDossierCrmIds, findDossier, dossiersInGroup } from "./dossiers";
import { loadGroupCard, saveGroupCard, loadCustomerCalendar, fanOutLessonWriteoffs } from "./group-cards";
import { customerSyncOf, stampCustomerSync } from "./crm-customer-sync";
import { isPayJournalComplete } from "./crm-pay";
import { journalPeriods, journalChunks, spanOf, inPeriod, groupAge, chunkOverlapsLife, lifeLabel, parseLessonDate, chunkDone, pulledPeriodKeys, clampGrain, earlierRu, laterRu, type Grain } from "./crm-journal-periods";

export type JournalPullKind = "group" | "school" | "students" | "balance" | "life" | "details" | "archives" | "archivesPupils";
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
  done: boolean;
  ok: boolean;
};

type StudentsReport = {
  at: string;
  study: string;
  who: string;
  n: number;
  total: number;
  rows: StudentHit[];
};

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
};

function emptyStore(): PullStore {
  return { at: "", note: "", groupIdx: 0, schoolIdx: {}, studentIdx: {}, lastLife: null, lastArchives: null, lastArchivesPupils: null, lastStudents: null };
}

function fileOf() {
  return join(process.cwd(), "storage", "crm-journal-pull.json");
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
      lastLife: raw.lastLife && typeof raw.lastLife === "object" ? (raw.lastLife as LifeReport) : null,
      lastArchives: raw.lastArchives && typeof raw.lastArchives === "object" ? (raw.lastArchives as ArchivesReport) : null,
      lastArchivesPupils: raw.lastArchivesPupils && typeof raw.lastArchivesPupils === "object" ? (raw.lastArchivesPupils as ArchivesPupilsReport) : null,
      lastStudents: raw.lastStudents && typeof raw.lastStudents === "object" ? (raw.lastStudents as StudentsReport) : null,
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
  const unique = new Map<string, { groupId: number; branchId: number; n: number }>();
  for (const p of people) {
    const d = findDossier({ crmId: p.cid });
    for (const g of d?.groupLinks || []) {
      const gid = Number(g.id) || 0;
      const bid = Number(g.branchId || p.branchId) || 1;
      if (!gid) continue;
      const k = `${bid}:${gid}`;
      const cur = unique.get(k) || { groupId: gid, branchId: bid, n: 0 };
      cur.n += 1;
      unique.set(k, cur);
    }
  }
  let live = 0;
  const need: { groupId: number; branchId: number; n: number }[] = [];
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

function groupLife(g: JournalPullGroup) {
  const card = loadGroupCard(g.branchId, g.groupId);
  const from = String(card?.journalLife?.from || card?.bDate || g.bDate || "");
  let to = String(card?.journalLife?.to || card?.eDate || g.eDate || "");
  const end = parseLessonDate(to);
  const cap = new Date();
  cap.setMonth(cap.getMonth() + 3);
  if (end && end > cap) to = ruOfDate(cap);
  const source = card?.journalLife?.source || (from || to ? "slot" : "");
  return { from, to, source };
}

export function groupFillRow(g: JournalPullGroup) {
  const periods = journalPeriods();
  const card = loadGroupCard(g.branchId, g.groupId);
  const done = pulledPeriodKeys(card?.journalFill);
  const fail = card?.journalFill?.fail || {};
  const weak = new Set(card?.journalFill?.weak || []);
  const life = groupLife(g);
  const clipFrom = life.from;
  const clipTo = life.to;
  const age = groupAge(clipFrom, clipTo);
  const known = Boolean(clipFrom || clipTo);
  const pulledAt = card?.journalFill?.pulled || {};
  const recheckedSet = new Set(card?.journalFill?.rechecked || []);
  const allParts = periods.map((p) => ({
    key: p.key,
    label: p.label,
    from: p.from,
    to: p.to,
    done: done.includes(p.key) && !weak.has(p.key),
    weak: weak.has(p.key),
    rechecked: recheckedSet.has(p.key) && !weak.has(p.key),
    lessons: 0,
    err: fail[p.key] || "",
    at: String(pulledAt[p.key] || ""),
    needDetails: 0,
    conducted: 0,
  }));
  const parts = known ? allParts.filter((p) => chunkOverlapsLife(p, clipFrom, clipTo)) : allParts.slice(0, 4);
  const next = parts.find((p) => !p.done);
  const lifeTxt = lifeLabel(life.from, life.to);
  const src = life.source === "alfa" ? "по журналу Alfa" : life.source === "slot" ? "по расписанию" : "";
  const fromLabel = !known ? "срок неизвестен — сначала определите сроки" : lifeTxt ? `${src} ${lifeTxt}`.trim() : "ещё не загружали";
  const complete = parts.length > 0 && parts.every((p) => p.done);
  return {
    groupId: g.groupId,
    branchId: g.branchId,
    name: g.name,
    school: g.school,
    archived: g.archived,
    lessons: 0,
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

export function journalPullProgress() {
  const groups = journalPullGroups();
  const nMap = pupilLinkCountMap("1");
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
      const short = probed && alfaN > 0 && diskN > 0 && diskN < alfaN;
      const journal = Boolean(sync.lessonsFull && sync.lessonsAttend) && !short;
      const pays = isPayJournalComplete(p.cid);
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
    peopleRows.sort((a, b) => a.name.localeCompare(b.name, "ru") || a.cid - b.cid);
    return {
      total: people.length,
      journalDone,
      cardDone,
      missJournal: packList(missJ),
      missCard: packList(missC),
      people: peopleRows.slice(0, 800),
    };
  }

  const live = studentSide("1");
  const arch = studentSide("2");
  return {
    groups: {
      total: groups.length,
      done: complete,
      periods: periods.length,
      miss: packList(groupsMiss, 200),
      doneList: packList(groupsDone, 200),
      rows: rows.slice(0, 800),
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
  const emptySide = (study: JournalPullStudy) => {
    const list = rankedStudentIds(study);
    const people = list.slice(0, 800).map((p) => {
      const sync = customerSyncOf(p.cid);
      const probed = Boolean(sync.lessonsAlfaAt);
      const alfaN = probed ? Number(sync.lessonsAlfa) || 0 : 0;
      const diskN = Number(sync.lessonsDisk) || 0;
      const short = probed && alfaN > 0 && diskN > 0 && diskN < alfaN;
      const journal = Boolean(sync.lessonsFull && sync.lessonsAttend) && !short;
      const pays = isPayJournalComplete(p.cid);
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
    progress = journalPullProgress();
  } catch {
    progress = {
      groups: { total: groups.length, done: 0, periods: 0, miss: packList([]), doneList: packList([]), rows: [] },
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
    lessonsTotal: Number(pol.lessonsTotal) || all.length,
    students: { all: all.length, live: live.length, archive: arch.length },
    linked: alfaLinkedNow(),
    progress,
    lastLife: store.lastLife || null,
    lastArchives: store.lastArchives || null,
    lastArchivesPupils: store.lastArchivesPupils || null,
    lastStudents: store.lastStudents || null,
  };
}

function stampJournalPeriod(branchId: number, gid: number, keys: string[], patch: { ok: boolean; err?: string; weak?: boolean; recheck?: boolean }) {
  const card = loadGroupCard(branchId, gid);
  if (!card) return null;
  const pulled = { ...(card.journalFill?.pulled || {}) };
  const done = pulledPeriodKeys({ done: card.journalFill?.done, pulled });
  const fail = { ...(card.journalFill?.fail || {}) };
  const weak = new Set(card.journalFill?.weak || []);
  const rechecked = new Set(card.journalFill?.rechecked || []);
  const at = new Date().toISOString();
  for (const key of keys) {
    if (patch.ok) {
      pulled[key] = at;
      if (!done.includes(key)) done.push(key);
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

async function pullOneStudent(cid: number, branchId: number, balance: boolean, recheck = false) {
  const { inboundCustomerLessons } = await import("./crm-journal-inbound");
  let lessons = 0;
  let done = false;
  for (let round = 0; round < 2; round += 1) {
    const res = await inboundCustomerLessons(branchId, cid, { take: 4, deep: 0, continueLater: false, full: true, force: true }).catch(() => ({
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
  const at = new Date().toISOString();
  const { probeCustomerLessons } = await import("./crm-journal-inbound");
  const disk = loadCustomerCalendar(cid).length;
  const probed = await probeCustomerLessons(branchId, cid).catch(() => ({ total: 0, ok: false as const }));
  const alfaN = probed.ok ? probed.total : 0;
  const short = alfaN > 0 && disk < alfaN;
  stampCustomerSync(cid, {
    lessonsDisk: disk,
    lessonsAt: at,
    ...(probed.ok ? { lessonsAlfa: alfaN, lessonsAlfaAt: at } : {}),
    ...(short ? { lessonsFull: false } : {}),
    ...(balance
      ? { paysAt: at, ...(recheck && !short ? { paysRecheckAt: at, lessonsRecheckAt: at } : {}) }
      : recheck && !short
        ? { lessonsRecheckAt: at }
        : {}),
  });
  return { cid, lessons, done: done && !short, pays, tariffs, alfa: alfaN, short };
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
      return { ok: false as const, error: store.note, more: false, ...journalPullState() };
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
    return { ok: true as const, extra: store.note, count: added.length, scanned: added.length, more, lastArchives, ...journalPullState() };
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
      return { ok: true as const, extra: note, count: row.added, scanned: row.added, more: row.more, lastArchivesPupils: row, ...journalPullState() };
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
      return { ok: false as const, error: store.note, more: false, ...journalPullState() };
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
      if (!raw || seen.has(k)) {
        if (!raw) missing.push(hit.groupId);
        continue;
      }
      seen.add(k);
      added.push({
        groupId: hit.groupId,
        branchId: hit.branchId,
        name: String(raw.name || `группа ${hit.groupId}`),
        school: schoolOfArchive(Number(raw.subject_id) || 0),
        taken: Number(raw.quantity || raw.cnt || raw.customers_count || hit.n || 0) || hit.n,
        archived: true,
        bDate: String(raw.b_date || raw.bDate || ""),
        eDate: String(raw.e_date || raw.eDate || ""),
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
    return { ok: true as const, extra: store.note, count: added.length, scanned: batch.length, more: left > 0, lastArchivesPupils: report, ...journalPullState() };
  }

  if (kind === "life") {
    const scoped = school ? groups.filter((g) => g.school === school) : groups;
    if (!scoped.length) {
      store.note = "Сначала загрузите группы из Alfa.";
      store.at = new Date().toISOString();
      saveStore(store);
      return { ok: false as const, error: store.note, more: false, ...journalPullState() };
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
      const cur = loadGroupCard(g.branchId, g.groupId);
      const from = String(g.bDate || cur?.bDate || "");
      const to = String(g.eDate || cur?.eDate || "");
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
      const card = cur || {
        id: g.groupId,
        branchId: g.branchId,
        name: g.name,
        note: "",
        description: "",
        remarks: "",
        hashtags: "",
        makeup: "",
        statusId: g.archived ? 3 : 1,
        bDate: from,
        eDate: to,
        levelId: 0,
        signup: "",
        subjectId: 0,
        subject: "",
        calendar: [],
        at: now,
      };
      saveGroupCard({ ...card, journalLife: { from, to, source: from || to ? "slot" : "", at: now } });
    }
    const { token } = await import("./alfacrm");
    const { probeGroupLife } = await import("./crm-journal-inbound");
    const t = await token().catch(() => "");
    const needProbe = scoped.filter((g) => loadGroupCard(g.branchId, g.groupId)?.journalLife?.source !== "alfa");
    const batch = needProbe.slice(0, 4);
    let probed = 0;
    if (t) {
      for (const g of batch) {
        const hit = await probeGroupLife(g.branchId, g.groupId, { token: t }).catch(() => ({ from: "", to: "", lessons: 0, ok: false as const }));
        const cur = loadGroupCard(g.branchId, g.groupId);
        if (!cur) continue;
        const fromA = hit.from || String(cur.journalLife?.from || g.bDate || "");
        const toA = hit.to || String(cur.journalLife?.to || g.eDate || "");
        saveGroupCard({
          ...cur,
          journalLife: {
            from: fromA,
            to: toA,
            source: hit.ok ? "alfa" : cur.journalLife?.source || "slot",
            at: now,
          },
        });
        probed += 1;
      }
    }
    const left = scoped.filter((g) => loadGroupCard(g.branchId, g.groupId)?.journalLife?.source !== "alfa").length;
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
    return { ok: true as const, extra: store.note, count: scoped.length, scanned: scoped.length, more: left > 0, lastLife, ...journalPullState() };
  }

  if (kind === "details") {
    const hit = groups.find((g) => g.groupId === selectedGid && (!selectedBid || g.branchId === selectedBid)) || groups.find((g) => g.groupId === selectedGid);
    if (!hit) {
      store.note = "Этой группы нет в списке.";
      store.at = new Date().toISOString();
      saveStore(store);
      return { ok: false as const, error: store.note, more: false, ...journalPullState() };
    }
    const card = loadGroupCard(hit.branchId, hit.groupId);
    if (!card) {
      store.note = `«${hit.name}»: сначала загрузите явки.`;
      return { ok: false as const, error: store.note, more: false, ...journalPullState() };
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
    return { ok: true as const, extra: store.note, count: enriched.filled, scanned: 1, more: leftNow > 0, periodKey, periodLabel: period?.label || "", ...journalPullState() };
  }

  if (kind === "group" || kind === "school") {
    const scoped = school ? groups.filter((g) => g.school === school) : groups;
    if (!scoped.length) {
      store.note = school ? `В школе «${school}» нет групп на сайте.` : "Сначала загрузите группы из Alfa.";
      store.at = new Date().toISOString();
      saveStore(store);
      return { ok: false as const, error: store.note, more: false, ...journalPullState() };
    }
    const grain = (opts.grain === "half" || opts.grain === "year" ? opts.grain : "quarter") as Grain;
    const periodKey = String(opts.periodKey || "");
    const recheck = Boolean(opts.recheck);
    if (kind !== "group" || !selectedGid) {
      store.note = "Выберите группу и порцию (квартал). Фон сам журнал не качает.";
      store.at = new Date().toISOString();
      saveStore(store);
      return { ok: false as const, error: store.note, more: false, ...journalPullState() };
    }
    const hit = scoped.find((g) => g.groupId === selectedGid && (!selectedBid || g.branchId === selectedBid)) || scoped.find((g) => g.groupId === selectedGid);
    if (!hit) {
      store.note = "Этой группы нет в списке.";
      store.at = new Date().toISOString();
      saveStore(store);
      return { ok: false as const, error: store.note, more: false, ...journalPullState() };
    }
    const card = loadGroupCard(hit.branchId, hit.groupId);
    const doneKeys = pulledPeriodKeys(card?.journalFill);
    const weakSet = new Set(card?.journalFill?.weak || []);
    const life = groupLife(hit);
    const span = spanOf(card?.calendar);
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
      return { ok: true as const, extra: store.note, count: 0, scanned: 0, more: false, ...journalPullState() };
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
    const afterCard = loadGroupCard(hit.branchId, hit.groupId);
    const afterFill = pulledPeriodKeys(afterCard?.journalFill);
    const afterWeak = new Set(afterCard?.journalFill?.weak || []);
    return {
      ok: true as const,
      extra: store.note,
      count: res.count,
      scanned: 1,
      more: Boolean(chunks.some((c) => !chunkDone(c, afterFill) || c.keys.some((k) => afterWeak.has(k)))),
      periodKey: picked.key,
      periodLabel: picked.label,
      ...journalPullState(),
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
    return { ok: false as const, error: store.note, more: false, ...journalPullState() };
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
    return { ok: false as const, error: store.note, more: false, ...journalPullState() };
  }
  if (!wanted) {
    const picked = pickSlice(people, idx, 1);
    store.studentIdx[key] = picked.next;
  }
  if (opts.probe) {
    const { probeCustomerLessons } = await import("./crm-journal-inbound");
    const disk = loadCustomerCalendar(one.cid).length;
    const probed = await probeCustomerLessons(one.branchId, one.cid).catch(() => ({ total: 0, ok: false as const }));
    const alfaN = probed.ok ? probed.total : 0;
    const short = alfaN > 0 && disk < alfaN;
    stampCustomerSync(one.cid, {
      lessonsDisk: disk,
      ...(probed.ok ? { lessonsAlfa: alfaN, lessonsAlfaAt: new Date().toISOString() } : {}),
      ...(short ? { lessonsFull: false } : {}),
    });
    const name = fioOf(one.cid);
    store.note = probed.ok
      ? `${name}: на диске ${disk} · в Alfa ${alfaN}${short ? " — не хватает, добрать" : disk ? " — счёт сошёлся" : ""}`
      : `${name}: Alfa не ответила на сверку`;
    store.at = new Date().toISOString();
    saveStore(store);
    return { ok: probed.ok, extra: store.note, count: alfaN, scanned: 1, more: false, ...journalPullState() };
  }
  const balance = kind === "balance";
  const row = await pullOneStudent(one.cid, one.branchId, balance, Boolean(opts.recheck));
  const sync = customerSyncOf(one.cid);
  const gnames = groupsOfStudent(one.cid);
  const name = fioOf(one.cid);
  const landed = Boolean(sync.lessonsFull && sync.lessonsAttend) && !row.short;
  const who = study === "1" ? "текущие" : study === "2" ? "архив" : "ученики";
  const hit: StudentHit = {
    cid: one.cid,
    branchId: one.branchId,
    name,
    groups: gnames,
    lessons: row.lessons,
    pays: row.pays,
    done: row.done,
    ok: landed,
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
  store.note = row.short
    ? `${who}: ${name} · на диске ${loadCustomerCalendar(one.cid).length} · в Alfa ${row.alfa} — не хватает, добрать`
    : landed
    ? `${who}: ${name}${gnames.length ? ` · ${gnames.slice(0, 2).join(", ")}` : ""} · ${row.lessons} зан.${row.alfa ? ` · Alfa ${row.alfa}` : ""}`
    : `${who}: ${name}${gnames.length ? ` · ${gnames.slice(0, 2).join(", ")}` : ""} · не попал в выдачу${row.done ? " (Alfa пусто)" : " (обрыв)"}`;
  store.at = new Date().toISOString();
  saveStore(store);
  return {
    extra: store.note,
    count: row.lessons,
    scanned: 1,
    more: !wanted,
    student: hit,
    ...journalPullState(),
  };
}
