import { logAdmin } from "./admin-settings";
import { refreshCrmSchedule, listAdminSlots } from "./alfacrm-schedule";
import { loadSubjects, pullSubjectsFromCrm } from "./crm-subjects";
import { loadTariffs, pullTariffsFromCrm } from "./crm-tariffs";
import { syncAllFromCrm } from "./dossiers";
import { listPriceRows, savePriceRows, ensureLivePrices } from "./prices";
import { loadFormulas, applyCorpToRow } from "./price-formulas";
import { loadScheduleMap } from "./schedule-map";
import { subjectIdsOfCourse } from "./ids";

export type SyncKind = "subjects" | "groups" | "tariffs" | "clients" | "prices" | "all";

export type SyncState = {
  running: boolean;
  kind: SyncKind | "";
  step: string;
  done: number;
  total: number;
  added: number;
  updated: number;
  error: string;
  at: number;
  counts: Record<string, number>;
};

const g = globalThis as { __raCrmSync?: SyncState };

function empty(): SyncState {
  return {
    running: false,
    kind: "",
    step: "",
    done: 0,
    total: 0,
    added: 0,
    updated: 0,
    error: "",
    at: 0,
    counts: {},
  };
}

export function syncState(): SyncState {
  return { ...(g.__raCrmSync || empty()) };
}

function setState(patch: Partial<SyncState>) {
  g.__raCrmSync = { ...syncState(), ...patch, at: Date.now() };
  return g.__raCrmSync;
}

export function startCrmSync(kind: SyncKind) {
  const cur = syncState();
  if (cur.running && Date.now() - cur.at < 120000) return { ...cur, accepted: false as const };
  setState({
    running: true,
    kind,
    step: "Подключаюсь к AlfaCRM…",
    done: 0,
    total: 0,
    added: 0,
    updated: 0,
    error: "",
    counts: {},
  });
  void runSync(kind);
  return { ...syncState(), accepted: true as const };
}

async function runSync(kind: SyncKind) {
  const jobs: SyncKind[] = kind === "all" ? ["subjects", "groups", "tariffs", "clients", "prices"] : [kind];
  try {
    for (const job of jobs) {
      setState({ kind: job, step: stepLabel(job), error: "" });
      await one(job);
    }
    setState({ running: false, step: "", kind });
    logAdmin(`Синхронизация ${kind}: ок`);
  } catch (e) {
    setState({
      running: false,
      error: e instanceof Error ? e.message : "AlfaCRM не ответила.",
      kind,
    });
  }
}

function stepLabel(kind: SyncKind) {
  return (
    {
      subjects: "Предметы…",
      groups: "Группы и уроки…",
      tariffs: "Абонементы…",
      clients: "Клиенты…",
      prices: "Цены курсов…",
      all: "Синхронизация…",
    }[kind] || "Загрузка…"
  );
}

async function one(kind: SyncKind) {
  if (kind === "subjects") {
    const items = await pullSubjectsFromCrm();
    setState({ counts: { ...syncState().counts, subjects: items.length }, done: items.length, total: items.length });
    return;
  }
  if (kind === "groups") {
    if (loadSubjects().length < 10) await pullSubjectsFromCrm().catch(() => null);
    setState({ step: "Группы и регулярные уроки…" });
    const res = await refreshCrmSchedule();
    try {
      const { pushVersion } = await import("./crm-slots");
      pushVersion("Загрузка из AlfaCRM", res.slots);
    } catch {
      /* */
    }
    setState({
      added: res.added,
      updated: res.updated,
      done: res.count,
      total: res.count,
      counts: { ...syncState().counts, groups: res.count },
    });
    return;
  }
  if (kind === "tariffs") {
    if (loadSubjects().length < 10) await pullSubjectsFromCrm().catch(() => null);
    setState({ step: "Индекс абонементов по филиалам…" });
    const res = await pullTariffsFromCrm({ reuseCards: true, skipSubjects: true });
    setState({
      done: res.items.length,
      total: res.items.length,
      counts: { ...syncState().counts, tariffs: res.items.length },
    });
    return;
  }
  if (kind === "clients") {
    const res = await syncAllFromCrm((p) => {
      setState({ step: p.step, done: p.n, total: Math.max(p.n, p.total || 0), added: p.n });
    });
    setState({
      done: res.count,
      total: res.count,
      added: res.count,
      counts: { ...syncState().counts, clients: res.count },
    });
    return;
  }
  if (kind === "prices") {
    const res = applyPricesFromTariffs();
    setState({
      updated: res.updated,
      done: res.updated,
      total: res.total,
      counts: { ...syncState().counts, prices: res.updated },
    });
  }
}

export function applyPricesFromTariffs() {
  ensureLivePrices();
  const map = loadScheduleMap();
  const tariffs = loadTariffs().items.filter((t) => !t.archive && t.price > 0);
  const formulas = loadFormulas();
  let updated = 0;
  const rows = listPriceRows().map((row) => {
    const sids = new Set<number>();
    if (Number(row.subjectId)) sids.add(Number(row.subjectId));
    for (const id of subjectIdsOfCourse(String(row.courseId || row.path || ""), map.courses)) sids.add(id);
    if (!sids.size) return row;
    const pool = tariffs.filter((t) => t.subjectIds.some((id) => sids.has(id)));
    if (!pool.length) return row;
    const best = [...pool].sort((a, b) => {
      const pa = Math.abs((a.lessonsCount || 4) - 4);
      const pb = Math.abs((b.lessonsCount || 4) - 4);
      return pa - pb || a.price - b.price;
    })[0];
    if (!best) return row;
    const all = Math.round(best.price);
    if (all === row.all) return row;
    updated += 1;
    return applyCorpToRow({ ...row, all }, formulas);
  });
  if (updated) savePriceRows(rows);
  return { updated, total: rows.length };
}

export function localCounts() {
  return {
    groups: listAdminSlots().length,
    subjects: loadSubjects().length,
    tariffs: loadTariffs().items.length,
  };
}
