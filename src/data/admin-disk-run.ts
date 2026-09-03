import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isAdminRequest } from "./admin-auth";
import { logAdmin } from "./admin-settings";
import type { DiskReq, PullKind, PullLine } from "./admin-disk";

type Job = {
  running: boolean;
  kind: PullKind | "";
  step: string;
  done: boolean;
  error: string;
  lines: PullLine[];
  added: number;
  updated: number;
  total: number;
  at: number;
};

const g = globalThis as { __raDiskPull?: Job };

const BRANCHES = [
  { id: 2, name: "ЦМИТ, Октябрьской революции, 340", short: "ЦМИТ" },
  { id: 1, name: "Гражданская, 2", short: "Гражданская" },
  { id: 3, name: "Луховицы, Пушкина, 202А", short: "Луховицы" },
  { id: 4, name: "Летние программы", short: "Лето" },
];

function emptyJob(): Job {
  return { running: false, kind: "", step: "", done: false, error: "", lines: [], added: 0, updated: 0, total: 0, at: 0 };
}

function job(): Job {
  return { ...(g.__raDiskPull || emptyJob()) };
}

function setJob(patch: Partial<Job>) {
  g.__raDiskPull = { ...job(), ...patch, at: Date.now() };
  return g.__raDiskPull;
}

function storePath(name: string) {
  const here = join(process.cwd(), "storage", name);
  if (existsSync(here)) return here;
  const abs = join("/var/www/rastudio/storage", name);
  return existsSync(abs) ? abs : here;
}

function readJson(name: string): Record<string, unknown> | null {
  const p = storePath(name);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function itemsOf(name: string): unknown[] {
  const raw = readJson(name);
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.items)) return raw.items;
  if (Array.isArray(raw.slots)) return raw.slots;
  return [];
}

function decorateSubjects(list: { id?: number; name?: string; local?: boolean }[]) {
  const tariffs = itemsOf("crm-tariffs.json") as { subjectIds?: number[]; branchIds?: number[]; archive?: boolean }[];
  const bySubject = new Map<number, { total: number; byBranch: Record<number, number> }>();
  for (const t of tariffs) {
    if (t.archive) continue;
    for (const sid of t.subjectIds || []) {
      const st = bySubject.get(sid) || { total: 0, byBranch: {} as Record<number, number> };
      st.total += 1;
      for (const b of t.branchIds || []) st.byBranch[b] = (st.byBranch[b] || 0) + 1;
      bySubject.set(sid, st);
    }
  }
  return list.map((s) => {
    const id = Number(s.id || 0);
    const st = bySubject.get(id) || { total: 0, byBranch: {} as Record<number, number> };
    return { ...s, tariffTotal: st.total, tariffByBranch: st.byBranch, tariffNames: [] as string[] };
  });
}

async function runPull(kind: PullKind) {
  const lines: PullLine[] = [];
  try {
    if (kind === "subjects") {
      setJob({ step: "Читаю предметы в AlfaCRM…" });
      const { pullSubjectsFromCrm } = await import("./crm-subjects");
      const list = await pullSubjectsFromCrm();
      lines.push({ ok: true, text: `Предметы: загружено ${list.length}` });
      setJob({ done: true, running: false, total: list.length, added: list.length, lines, step: "" });
      logAdmin(`Предметы из AlfaCRM: ${list.length}`);
      return;
    }
    if (kind === "tariffs") {
      setJob({ step: "Читаю абонементы по филиалам…" });
      const { pullTariffsFromCrm } = await import("./crm-tariffs");
      const res = await pullTariffsFromCrm({ reuseCards: true, skipSubjects: true });
      const n = res.items.length;
      const withSub = res.stats?.withSubjects ?? res.items.filter((t) => t.subjectIds?.length).length;
      const without = n - withSub;
      lines.push({ ok: true, text: `Абонементы: ${n} активных` });
      lines.push({ ok: true, text: withSub ? `С предметами в CRM: ${withSub}` : "В CRM у этих абонементов предметы не указаны — так и оставляем." });
      if (without && withSub) lines.push({ ok: true, text: `Без предмета: ${without} (в CRM тоже пусто)` });
      if (res.error) lines.push({ ok: false, text: res.error });
      setJob({ done: true, running: false, total: n, added: n, lines, error: res.error || "", step: "" });
      logAdmin(`Абонементы из AlfaCRM: ${n}`);
      return;
    }
    if (kind === "clients" || kind === "clientsArchive" || kind === "clientsLeads") {
      const studies = kind === "clientsArchive" ? [2] : kind === "clientsLeads" ? [0] : [1];
      const label = studies[0] === 2 ? "архив" : studies[0] === 0 ? "лиды" : "текущих клиентов";
      setJob({ step: `Читаю ${label} в AlfaCRM…` });
      const { syncAllFromCrm } = await import("./dossiers");
      const res = await syncAllFromCrm((p) => {
        setJob({ step: p.step || "Клиенты…", added: p.n, total: Math.max(p.n, p.total || 0) });
      }, studies);
      const { searchClientViews } = await import("./dossiers");
      const local = searchClientViews("", 1, studies[0] === 2 ? "архив" : studies[0] === 0 ? "лид" : "учится");
      lines.push({ ok: true, text: `${label}: обработано ${res.count}` });
      if (Number(res.purged || 0) > 0) {
        lines.push({ ok: true, text: `С сайта удалены архивные лиды: ${res.purged}` });
      }
      lines.push({ ok: local.all > 0, text: `В базе на сайте: ${local.all}` });
      if (studies[0] === 1) lines.push({ ok: true, text: `Текущих уникальных: ${local.counts.учится}` });
      lines.push({ ok: true, text: "Архив и лиды подгружаются отдельными кнопками — AlfaCRM не читаем целиком." });
      setJob({ done: true, running: false, total: local.all || res.count, added: res.count, lines, step: "" });
      logAdmin(`Клиенты из AlfaCRM (${label}): ${res.count}`);
      return;
    }
    if (kind === "groups") {
      setJob({ step: "Читаю группы и уроки…" });
      const { refreshCrmSchedule } = await import("./alfacrm-schedule");
      const res = await refreshCrmSchedule();
      try {
        const { pushVersion } = await import("./crm-slots");
        pushVersion("Загрузка из AlfaCRM", res.slots);
      } catch {
        /* */
      }
      lines.push({ ok: true, text: `Новых групп: ${res.added}` });
      lines.push({ ok: true, text: `Обновлено на сайте: ${res.updated}` });
      lines.push({ ok: true, text: `Всего в расписании: ${res.count}` });
      setJob({ done: true, running: false, added: res.added, updated: res.updated, total: res.count, lines, step: "" });
      logAdmin(`Группы из AlfaCRM: ${res.count}`);
      return;
    }
    if (kind === "prices") {
      setJob({ step: "Считаю цены с абонементов…" });
      const { applyPricesFromTariffs } = await import("./crm-sync");
      const res = applyPricesFromTariffs();
      lines.push({ ok: true, text: `Обновлено строк прайса: ${res.updated} из ${res.total}` });
      setJob({ done: true, running: false, updated: res.updated, total: res.total, lines, step: "" });
      return;
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : "AlfaCRM не ответила.";
    lines.push({ ok: false, text: error });
    setJob({ done: true, running: false, error, lines, step: "" });
  }
}

export async function handleAdminDisk(data: DiskReq) {
  if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
  const kind = data.kind || "subjects";
  if (kind === "clients" || kind === "clientsLeads" || kind === "clientsArchive") {
    void import("./dossiers").then((m) => m.startLeadTicker()).catch(() => {});
  }
  if (data.action === "pullStatus") return { ok: true as const, ...job() };
  if (data.action === "pull") {
    const cur = job();
    if (cur.running && Date.now() - cur.at < 120000) {
      return { ok: true as const, accepted: false as const, ...cur };
    }
    setJob({
      running: true,
      done: false,
      kind,
      step: "Подключаюсь к AlfaCRM…",
      error: "",
      lines: [],
      added: 0,
      updated: 0,
      total: 0,
    });
    void runPull(kind);
    return { ok: true as const, accepted: true as const, ...job() };
  }
  try {
    if (kind === "subjects") {
      const list = itemsOf("crm-subjects.json") as { id?: number; name?: string; local?: boolean }[];
      const subjects = decorateSubjects(list);
      return { ok: true as const, subjects, tariffBranches: BRANCHES, total: subjects.length };
    }
    if (kind === "tariffs") {
      const raw = readJson("crm-tariffs.json") || {};
      const items = Array.isArray(raw.items) ? raw.items : [];
      const subjects = itemsOf("crm-subjects.json");
      return {
        ok: true as const,
        at: String(raw.at || ""),
        tariffs: items.map((t) => ({ ...(t as object), groups: [] })),
        lessonTypes: Array.isArray(raw.lessonTypes) ? raw.lessonTypes : [],
        branches: Array.isArray(raw.branches) && raw.branches.length ? raw.branches : BRANCHES,
        subjects,
        total: items.length,
      };
    }
    if (kind === "clients") {
      const { searchClientViews } = await import("./dossiers");
      const res = searchClientViews(String(data.q || ""), 2500, String(data.status || ""), Number(data.branchId) || 0, String(data.ageBand || ""));
      return { ok: true as const, ...res };
    }
    if (kind === "prices") {
      const raw = readJson("prices.json");
      const rows = Array.isArray(raw) ? raw : Array.isArray((raw as { rows?: unknown[] } | null)?.rows) ? (raw as { rows: unknown[] }).rows : [];
      return { ok: true as const, rows, total: rows.length };
    }
    return { ok: false as const, error: "Неизвестный список." };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Не удалось прочитать файл на сайте." };
  }
}
