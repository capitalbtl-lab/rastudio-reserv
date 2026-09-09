/** Ручная догрузка журнала: группа / школа / 10 учеников. Не весь API сразу. */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SCHOOL_ORDER } from "./crm-slots-core";
import { isCampStatus } from "./group-status";
import { alfaLinkedNow } from "./crm-alfa-link";
import { loadCachePolicy } from "./crm-cache-policy";
import { listAdminSlots } from "./alfacrm-schedule";
import { allDossierCrmIds, findDossier, dossiersInGroup } from "./dossiers";
import { loadGroupCard, loadCustomerCalendar, saveGroupCard } from "./group-cards";
import { customerSyncOf } from "./crm-customer-sync";
import { isPayJournalComplete } from "./crm-pay";
import { journalPeriods, journalChunks, inferredPeriodKeys, spanOf, inPeriod, groupAge, chunkOverlapsLife, lifeLabel, parseLessonDate, chunkDone, type Grain } from "./crm-journal-periods";

export type JournalPullKind = "group" | "school" | "students" | "balance" | "life";
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
};

type PullStore = {
  at: string;
  note: string;
  groupIdx: number;
  schoolIdx: Record<string, number>;
  studentIdx: Record<string, number>;
  lastLife?: LifeReport | null;
};

function fileOf() {
  return join(process.cwd(), "storage", "crm-journal-pull.json");
}

function emptyStore(): PullStore {
  return { at: "", note: "", groupIdx: 0, schoolIdx: {}, studentIdx: {}, lastLife: null };
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
      bDate: String(s.bDate || ""),
      eDate: String(s.eDate || ""),
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
  const done = inferredPeriodKeys(card?.calendar, card?.journalFill?.done);
  const span = spanOf(card?.calendar);
  const fail = card?.journalFill?.fail || {};
  const life = groupLife(g);
  const age = groupAge(life.from, life.to);
  const known = Boolean(life.from || life.to);
  const byQ = new Map<string, number>();
  for (const l of card?.calendar || []) {
    const d = l.date;
    for (const p of periods) {
      if (inPeriod(d, p.from, p.to)) {
        byQ.set(p.key, (byQ.get(p.key) || 0) + 1);
        break;
      }
    }
  }
  const allParts = periods.map((p) => ({
    key: p.key,
    label: p.label,
    from: p.from,
    to: p.to,
    done: done.includes(p.key),
    lessons: byQ.get(p.key) || 0,
    err: fail[p.key] || "",
  }));
  const parts = known ? allParts.filter((p) => chunkOverlapsLife(p, life.from, life.to)) : allParts.slice(0, 4);
  const next = parts.find((p) => !p.done);
  const weight = span.lessons >= 120 ? "тяжёлая" : span.lessons >= 40 ? "средняя" : done.length ? "лёгкая" : "";
  const lifeTxt = lifeLabel(life.from, life.to);
  const fromLabel = !known
    ? "срок неизвестен — сначала определите сроки"
    : span.from
      ? span.to && span.to !== span.from
        ? `на сайте ${span.from}–${span.to}`
        : `на сайте с ${span.from}`
      : lifeTxt
        ? `по расписанию ${lifeTxt}`
        : "ещё не загружали";
  const complete = parts.length > 0 && parts.every((p) => p.done);
  return {
    groupId: g.groupId,
    branchId: g.branchId,
    name: g.name,
    school: g.school,
    archived: g.archived,
    lessons: span.lessons,
    done: parts.filter((p) => p.done).length,
    total: parts.length,
    next: next?.label || "",
    nextKey: next?.key || "",
    from: fromLabel,
    weight,
    complete,
    age: age.id,
    ageLabel: age.label,
    life: lifeTxt,
    extra: complete ? "вся информация загружена" : [age.label, lifeTxt, span.lessons ? `${span.lessons} зан.` : "", weight].filter(Boolean).join(" · "),
    err: next && fail[next.key] ? fail[next.key] : "",
    parts,
  };
}

export function journalPullProgress() {
  const groups = journalPullGroups();
  const periods = journalPeriods();
  const rows = groups.map(groupFillRow);
  rows.sort((a, b) => a.done - b.done || a.name.localeCompare(b.name, "ru"));
  const complete = rows.filter((r) => r.done >= r.total).length;
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
      done: complete,
      periods: periods.length,
      miss: packList(groupsMiss, 200),
      doneList: packList(groupsDone, 200),
      rows: rows.slice(0, 200),
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
    lastLife: store.lastLife || null,
  };
}

function stampJournalPeriod(branchId: number, gid: number, keys: string[], patch: { ok: boolean; err?: string }) {
  const card = loadGroupCard(branchId, gid);
  if (!card) return null;
  const done = inferredPeriodKeys(card.calendar, card.journalFill?.done);
  const fail = { ...(card.journalFill?.fail || {}) };
  for (const key of keys) {
    if (patch.ok) {
      if (!done.includes(key)) done.push(key);
      delete fail[key];
    } else if (patch.err) {
      fail[key] = patch.err;
    }
  }
  const next = { ...card, journalFill: { done, fail }, journalAt: new Date().toISOString() };
  saveGroupCard(next);
  return next;
}

async function pullOneGroup(g: JournalPullGroup, period: { key: string; from: string; to: string; label: string; keys?: string[] }) {
  const { inboundJournalGroup } = await import("./crm-journal-inbound");
  const res = await inboundJournalGroup(g.branchId, g.groupId, {
    deep: false,
    lite: true,
    dateFrom: period.from,
    dateTo: period.to,
  });
  const ok = res.ok !== false;
  const keys = period.keys?.length ? period.keys : [period.key];
  stampJournalPeriod(g.branchId, g.groupId, keys, { ok, err: ok ? "" : String(res.extra || "Alfa не ответила") });
  const n = (res.calendar || []).filter((l) => inPeriod(l.date, period.from, period.to)).length;
  const total = (res.calendar || []).length;
  const extra = ok
    ? `«${g.name}»: ${period.label} · ${n} зан. за порцию · всего ${total}`
    : String(res.extra || `«${g.name}»: ${period.label} — Alfa не ответила`);
  return { extra, count: n, ok };
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
  periodKey?: string;
  grain?: Grain;
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
      saveGroupCard({ ...card, journalLife: { from, to, source: "slot", at: now } });
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
    };
    store.lastLife = lastLife;
    store.note = `Определено ${scoped.length} групп${school ? ` в «${school}»` : ""}: молодых ${young}, средних ${mid}, старых ${old}${unknown ? `, без срока ${unknown}` : ""}.`;
    store.at = now;
    saveStore(store);
    return { ok: true as const, extra: store.note, count: scoped.length, scanned: scoped.length, more: false, lastLife, ...journalPullState() };
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
    const doneKeys = inferredPeriodKeys(card?.calendar, card?.journalFill?.done);
    const chunksAll = journalChunks(grain);
    const life = groupLife(hit);
    const known = Boolean(life.from || life.to);
    const chunks = known ? chunksAll.filter((c) => chunkOverlapsLife(c, life.from, life.to)) : chunksAll.slice(0, 4);
    const picked = (periodKey && chunksAll.find((c) => c.key === periodKey)) || chunks.find((c) => !chunkDone(c, doneKeys)) || null;
    if (!picked) {
      store.note = `«${hit.name}»: вся информация загружена.`;
      store.at = new Date().toISOString();
      saveStore(store);
      return { ok: true as const, extra: store.note, count: 0, scanned: 0, more: false, ...journalPullState() };
    }
    const res = await pullOneGroup(hit, picked).catch((e) => ({
      extra: `«${hit.name}»: ${e instanceof Error ? e.message : "ошибка"}`,
      count: 0,
      ok: false,
    }));
    store.note = res.extra;
    store.at = new Date().toISOString();
    saveStore(store);
    return { ok: true as const, extra: store.note, count: res.count, scanned: 1, more: Boolean(chunks.some((c) => c.key !== picked.key && !chunkDone(c, inferredPeriodKeys(loadGroupCard(hit.branchId, hit.groupId)?.calendar, loadGroupCard(hit.branchId, hit.groupId)?.journalFill?.done)))), ...journalPullState() };
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
