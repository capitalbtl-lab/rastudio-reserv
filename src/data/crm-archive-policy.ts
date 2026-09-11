/** Рабочий архив клиентов. Файл политики, не dossier.extras — синхронизация extras перетирает. */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isPhoneLike } from "./client-display.ts";
import { pupilNameOk } from "./crm-slots-core.ts";

export type ArchivePolicyFilters = { fio: boolean; notAdult: boolean; intersectLive: boolean };
export type ArchiveReason = "intersect" | "manual" | "left";

export type ArchivePolicy = {
  at: string;
  ready: boolean;
  filters: ArchivePolicyFilters;
  working: number[];
  manual: number[];
  reasons: Record<string, ArchiveReason>;
};

export type ArchivePerson = {
  cid: number;
  study: number;
  status?: string;
  removed?: string;
  fio: string;
  dob?: string;
  age?: number;
  groupLinks?: { id: number; branchId?: number }[];
};

export type ArchiveCountReport = {
  at: string;
  disk: number;
  fioOk: number;
  noDob: number;
  adult: number;
  intersect: number;
  working: number;
  hidden: number;
  kept: number;
  noPolicy?: boolean;
};

export const DEFAULT_ARCHIVE_FILTERS: ArchivePolicyFilters = { fio: true, notAdult: true, intersectLive: true };

function emptyPolicy(): ArchivePolicy {
  return { at: "", ready: false, filters: { ...DEFAULT_ARCHIVE_FILTERS }, working: [], manual: [], reasons: {} };
}

export function archivePolicyFile() {
  return join(process.cwd(), "storage", "crm-archive-policy.json");
}

export function loadArchivePolicy(): ArchivePolicy {
  try {
    if (!existsSync(archivePolicyFile())) return emptyPolicy();
    const raw = JSON.parse(readFileSync(archivePolicyFile(), "utf8")) as Partial<ArchivePolicy>;
    const working = Array.isArray(raw.working) ? raw.working.map(Number).filter((n) => n > 0) : [];
    const manual = Array.isArray(raw.manual) ? raw.manual.map(Number).filter((n) => n > 0) : [];
    const reasons: Record<string, ArchiveReason> = {};
    if (raw.reasons && typeof raw.reasons === "object") {
      for (const [k, v] of Object.entries(raw.reasons)) {
        if (v === "intersect" || v === "manual" || v === "left") reasons[k] = v;
      }
    }
    const f = raw.filters && typeof raw.filters === "object" ? raw.filters : {};
    return {
      at: String(raw.at || ""),
      ready: Boolean(raw.ready),
      filters: {
        fio: f.fio !== false,
        notAdult: f.notAdult !== false,
        intersectLive: f.intersectLive !== false,
      },
      working: [...new Set(working)],
      manual: [...new Set(manual)],
      reasons,
    };
  } catch {
    return emptyPolicy();
  }
}

export function saveArchivePolicy(next: ArchivePolicy): ArchivePolicy {
  const clean: ArchivePolicy = {
    at: next.at || new Date().toISOString(),
    ready: Boolean(next.ready),
    filters: {
      fio: next.filters?.fio !== false,
      notAdult: next.filters?.notAdult !== false,
      intersectLive: next.filters?.intersectLive !== false,
    },
    working: [...new Set((next.working || []).map(Number).filter((n) => n > 0))].sort((a, b) => a - b),
    manual: [...new Set((next.manual || []).map(Number).filter((n) => n > 0))].sort((a, b) => a - b),
    reasons: next.reasons || {},
  };
  mkdirSync(dirname(archivePolicyFile()), { recursive: true });
  writeFileSync(archivePolicyFile(), JSON.stringify(clean, null, 0), "utf8");
  return clean;
}

export function archiveFioOk(fio?: string) {
  const s = pupilNameOk(fio);
  if (!s) return "";
  if (isPhoneLike(s)) return "";
  return s;
}

export function archiveAgeYears(dob?: string, age?: number) {
  if (Number.isFinite(age) && (age as number) >= 0 && (age as number) < 120) return Math.floor(age as number);
  const t = String(dob || "").trim();
  if (!t) return undefined;
  let y = 0;
  let mo = 1;
  let da = 1;
  const ru = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ru) {
    da = Number(ru[1]);
    mo = Number(ru[2]);
    y = Number(ru[3]);
  } else if (iso) {
    y = Number(iso[1]);
    mo = Number(iso[2]);
    da = Number(iso[3]);
  }
  if (!y || y < 1920 || y > 2026) return undefined;
  const born = new Date(y, mo - 1, da || 1);
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) years -= 1;
  if (years < 0 || years > 120) return undefined;
  return years;
}

export function liveGroupKeys(people: ArchivePerson[]) {
  const keys = new Set<string>();
  for (const p of people) {
    if (p.study !== 1) continue;
    for (const g of p.groupLinks || []) {
      const gid = Number(g.id) || 0;
      if (!gid) continue;
      const bid = Number(g.branchId) || 0;
      keys.add(`${bid}:${gid}`);
      keys.add(`*:${gid}`);
    }
  }
  return keys;
}

export function extraGroupKeys(rows: { groupId: number; branchId: number }[]) {
  const keys = new Set<string>();
  for (const g of rows || []) {
    const gid = Number(g.groupId) || 0;
    if (!gid) continue;
    const bid = Number(g.branchId) || 0;
    keys.add(`${bid}:${gid}`);
    keys.add(`*:${gid}`);
  }
  return keys;
}

export function archiveIntersects(p: ArchivePerson, keys: Set<string>) {
  if (!keys.size) return false;
  for (const g of p.groupLinks || []) {
    const gid = Number(g.id) || 0;
    if (!gid) continue;
    const bid = Number(g.branchId) || 0;
    if (keys.has(`${bid}:${gid}`) || keys.has(`*:${gid}`)) return true;
    if (!bid && keys.has(`*:${gid}`)) return true;
  }
  return false;
}

export function archiveRemoved(p: ArchivePerson) {
  const st = String(p.status || "");
  if (st === "удалён") return true;
  const r = String(p.removed || "");
  return r === "1";
}

export function archiveEligible(p: ArchivePerson, keys: Set<string>, filters: ArchivePolicyFilters = DEFAULT_ARCHIVE_FILTERS) {
  if (p.study !== 2) return false;
  if (archiveRemoved(p)) return false;
  if (filters.fio && !archiveFioOk(p.fio)) return false;
  const years = archiveAgeYears(p.dob, p.age);
  if (filters.notAdult && years != null && years >= 18) return false;
  if (filters.intersectLive && !archiveIntersects(p, keys)) return false;
  return true;
}

export function recountArchivePolicy(
  people: ArchivePerson[],
  extraKeys: Set<string>,
  prev: ArchivePolicy,
  filters: ArchivePolicyFilters = prev.filters || DEFAULT_ARCHIVE_FILTERS,
): { policy: ArchivePolicy; report: ArchiveCountReport } {
  const keys = new Set(extraKeys);
  for (const k of liveGroupKeys(people)) keys.add(k);
  const keep = new Set<number>([...prev.working, ...prev.manual]);
  const manual = new Set<number>(prev.manual);
  const reasons: Record<string, ArchiveReason> = { ...prev.reasons };
  let disk = 0;
  let fioOk = 0;
  let noDob = 0;
  let adult = 0;
  let intersect = 0;
  const next = new Set<number>();
  for (const cid of keep) {
    const row = people.find((p) => p.cid === cid);
    if (!row) {
      next.add(cid);
      continue;
    }
    if (row.study === 1 || row.study === 0 || archiveRemoved(row) || row.status === "лид" || row.status === "учится") {
      manual.delete(cid);
      delete reasons[String(cid)];
      continue;
    }
    next.add(cid);
  }
  const kept = next.size;
  for (const p of people) {
    if (p.study !== 2 || archiveRemoved(p)) continue;
    disk += 1;
    if (archiveFioOk(p.fio)) fioOk += 1;
    const years = archiveAgeYears(p.dob, p.age);
    if (years == null) noDob += 1;
    if (years != null && years >= 18) adult += 1;
    if (archiveIntersects(p, keys)) intersect += 1;
    if (archiveEligible(p, keys, filters)) {
      next.add(p.cid);
      if (!reasons[String(p.cid)]) reasons[String(p.cid)] = "intersect";
    }
  }
  const working = [...next].sort((a, b) => a - b);
  const policy: ArchivePolicy = {
    at: new Date().toISOString(),
    ready: true,
    filters,
    working,
    manual: [...manual].sort((a, b) => a - b),
    reasons,
  };
  return {
    policy,
    report: {
      at: policy.at,
      disk,
      fioOk,
      noDob,
      adult,
      intersect,
      working: working.length,
      hidden: Math.max(0, disk - working.length),
      kept,
    },
  };
}

export function archiveWorkingSet(pol?: ArchivePolicy): Set<number> | null {
  const p = pol || loadArchivePolicy();
  if (!p.ready) return null;
  return new Set(p.working);
}

export function isArchiveWorking(cid: number, pol?: ArchivePolicy) {
  const set = archiveWorkingSet(pol);
  if (!set) return false;
  return set.has(Number(cid) || 0);
}

export function overlayAllowsCustomer(study: number, cid: number, pol?: ArchivePolicy) {
  if (study === 1) return true;
  if (study === 0 || !Number.isFinite(study)) return false;
  if (study !== 2) return false;
  return isArchiveWorking(cid, pol);
}

export function dropArchiveWorking(cid: number, pol?: ArchivePolicy) {
  const id = Number(cid) || 0;
  if (!id) return pol || loadArchivePolicy();
  const prev = pol || loadArchivePolicy();
  if (!prev.working.includes(id) && !prev.manual.includes(id)) return prev;
  const next: ArchivePolicy = {
    ...prev,
    working: prev.working.filter((x) => x !== id),
    manual: prev.manual.filter((x) => x !== id),
    reasons: { ...prev.reasons },
    at: new Date().toISOString(),
  };
  delete next.reasons[String(id)];
  return saveArchivePolicy(next);
}

export function addArchiveWorking(cid: number, reason: ArchiveReason, pol?: ArchivePolicy) {
  const id = Number(cid) || 0;
  if (!id) return pol || loadArchivePolicy();
  const prev = pol || loadArchivePolicy();
  const working = prev.working.includes(id) ? prev.working : [...prev.working, id];
  const manual = reason === "manual" && !prev.manual.includes(id) ? [...prev.manual, id] : prev.manual;
  return saveArchivePolicy({
    ...prev,
    ready: true,
    working,
    manual,
    reasons: { ...prev.reasons, [String(id)]: reason },
    at: new Date().toISOString(),
  });
}

export function reconcileArchiveRoles(
  people: { cid: number; study: number; status?: string; removed?: string }[],
  pol?: ArchivePolicy,
) {
  const prev = pol || loadArchivePolicy();
  if (!prev.ready && !prev.working.length) return prev;
  let changed = false;
  const working = new Set(prev.working);
  const manual = new Set(prev.manual);
  const reasons = { ...prev.reasons };
  for (const p of people) {
    const id = Number(p.cid) || 0;
    if (!id) continue;
    const drop = p.study === 1 || p.study === 0 || p.status === "учится" || p.status === "лид" || p.status === "удалён" || String(p.removed || "") === "1";
    if (!drop) continue;
    if (working.delete(id) || manual.delete(id)) {
      delete reasons[String(id)];
      changed = true;
    }
  }
  if (!changed) return prev;
  return saveArchivePolicy({
    ...prev,
    working: [...working],
    manual: [...manual],
    reasons,
    at: new Date().toISOString(),
  });
}

export function archivePersonFrom(d: {
  crmId?: number;
  status?: string;
  extras?: Record<string, string>;
  child?: { fio?: string; dob?: string };
  age?: number;
  groupLinks?: { id: number; branchId?: number }[];
}): ArchivePerson {
  const ex = d.extras || {};
  return {
    cid: Number(d.crmId) || 0,
    study: Number(ex.is_study),
    status: d.status,
    removed: String(ex.removed || ""),
    fio: String(d.child?.fio || ""),
    dob: String(d.child?.dob || ""),
    age: d.age,
    groupLinks: d.groupLinks,
  };
}

export function formatArchiveCountNote(r: ArchiveCountReport) {
  if (r.noPolicy) return `На диске архивных ${r.disk}. Рабочий набор не считали.`;
  return `На диске архивных ${r.disk} · с ФИО ${r.fioOk} · без даты рождения ${r.noDob} · 18+ ${r.adult} · пересечение с группами текущих ${r.intersect} · в рабочем наборе ${r.working} · скрыто ${r.hidden}. Alfa не трогали.`;
}
