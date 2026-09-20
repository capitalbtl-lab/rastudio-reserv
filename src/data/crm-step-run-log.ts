/** Лог прогонов шагов 1–5. Только снимает. В Alfa не ходит, шаги не качает. */

import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { customerSyncOf } from "./crm-customer-sync.ts";
import { loadCustomerCalendar } from "./group-cards.ts";
import {
  STEP_LOG_ALL_ROWS_MAX,
  STEP_LOG_ROWS_MAX,
  STEP_LOG_RUNS_MAX,
  emptySummary,
  matchedOf,
  resultOfPull,
  runIdFor,
  runIndexMeta,
  stepOfKind,
  summarizeRows,
  type StepLogRow,
  type StepLogRun,
  type StepLogSettings,
  type StepLogSnap,
  type StepN,
} from "./crm-step-run-log-core.ts";

export * from "./crm-step-run-log-core.ts";

function dirOf() {
  return join(process.cwd(), "storage", "crm-step-logs");
}

function runFile(id: string) {
  const safe = String(id || "").replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 120);
  return join(dirOf(), `${safe || "run"}.json`);
}

function indexFile() {
  return join(dirOf(), "index.json");
}

function readJson<T>(p: string, fallback: T): T {
  try {
    if (!existsSync(p)) return fallback;
    return JSON.parse(readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(p: string, v: unknown) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v) + "\n", "utf8");
}

export function listRunIndex(): ReturnType<typeof runIndexMeta>[] {
  const idx = readJson<ReturnType<typeof runIndexMeta>[]>(indexFile(), []);
  if (idx.length) return idx.slice(0, STEP_LOG_RUNS_MAX);
  try {
    if (!existsSync(dirOf())) return [];
    const files = readdirSync(dirOf()).filter((f) => f.endsWith(".json") && f !== "index.json");
    const out: ReturnType<typeof runIndexMeta>[] = [];
    for (const f of files) {
      const run = loadRun(f.replace(/\.json$/, ""));
      if (run) out.push(runIndexMeta(run));
    }
    return out.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, STEP_LOG_RUNS_MAX);
  } catch {
    return [];
  }
}

function saveIndex(list: ReturnType<typeof runIndexMeta>[]) {
  writeJson(indexFile(), list.slice(0, STEP_LOG_RUNS_MAX));
}

export function loadRun(id: string): StepLogRun | null {
  const raw = readJson<Partial<StepLogRun> | null>(runFile(id), null);
  if (!raw || !raw.id) return null;
  const step = Number(raw.step) as StepN;
  if (step < 1 || step > 5) return null;
  const rows = Array.isArray(raw.rows) ? raw.rows.filter((r) => r && r.id) : [];
  return {
    id: String(raw.id),
    jobId: raw.jobId ? String(raw.jobId) : undefined,
    step,
    at: String(raw.at || ""),
    endedAt: raw.endedAt ? String(raw.endedAt) : undefined,
    note: raw.note ? String(raw.note) : undefined,
    settings: raw.settings && typeof raw.settings === "object" ? raw.settings : {},
    rows,
    summary: raw.summary && typeof raw.summary === "object" ? { ...emptySummary(), ...raw.summary } : summarizeRows(rows),
  };
}

export function saveRun(run: StepLogRun) {
  const next = { ...run, summary: summarizeRows(run.rows), rows: run.rows.slice(-STEP_LOG_ROWS_MAX) };
  writeJson(runFile(next.id), next);
  const idx = listRunIndex().filter((x) => x.id !== next.id);
  saveIndex([runIndexMeta(next), ...idx].slice(0, STEP_LOG_RUNS_MAX));
  return next;
}

function closeOpenHands(step: StepN, exceptId: string) {
  for (const meta of listRunIndex()) {
    if (meta.step !== step) continue;
    if (meta.id === exceptId) continue;
    if (!String(meta.id).startsWith("hands-")) continue;
    if (meta.endedAt) continue;
    const run = loadRun(meta.id);
    if (!run || run.endedAt) continue;
    run.endedAt = new Date().toISOString();
    saveRun(run);
  }
}

export function beginStepRun(p: { id?: string; jobId?: string; step: StepN; settings?: StepLogSettings }): StepLogRun {
  const settings = p.settings || {};
  const wanted = p.id || runIdFor({ jobId: p.jobId, step: p.step, settings });
  const cur = loadRun(wanted);
  if (cur && cur.step === p.step && !cur.endedAt) {
    return saveRun({ ...cur, settings: { ...cur.settings, ...settings }, jobId: p.jobId || cur.jobId });
  }
  if (cur && cur.step === p.step && cur.endedAt && p.jobId) {
    // Хвост допишется в тот же файл. Не открывать закрытый прогон — иначе Стоп оживает в логе.
    return cur;
  }
  if (!p.jobId && cur?.endedAt) {
    const freshId = runIdFor({ step: p.step, settings, stamp: `${Date.now().toString(36)}` });
    closeOpenHands(p.step, freshId);
    const run: StepLogRun = {
      id: freshId,
      jobId: p.jobId,
      step: p.step,
      at: new Date().toISOString(),
      settings,
      summary: emptySummary(),
      rows: [],
    };
    return saveRun(run);
  }
  if (!p.jobId) closeOpenHands(p.step, wanted);
  const run: StepLogRun = {
    id: wanted,
    jobId: p.jobId,
    step: p.step,
    at: new Date().toISOString(),
    settings,
    summary: emptySummary(),
    rows: [],
  };
  return saveRun(run);
}

export function closeStepRun(id: string, extra?: string) {
  const run = loadRun(id);
  if (!run) return null;
  if (extra) run.settings = { ...run.settings, src: run.settings.src || extra };
  run.endedAt = new Date().toISOString();
  return saveRun(run);
}

export function patchStepRun(id: string, patch: { note?: string }) {
  const run = loadRun(id);
  if (!run) return null;
  if (patch.note != null) run.note = String(patch.note).slice(0, 800);
  return saveRun(run);
}

export function appendStepRow(runId: string, row: Omit<StepLogRow, "id" | "at" | "runId"> & { id?: string; at?: string }): StepLogRow | null {
  const run = loadRun(runId);
  if (!run) return null;
  const next: StepLogRow = {
    ...row,
    id: row.id || `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    at: row.at || new Date().toISOString(),
    runId,
    step: row.step || run.step,
    name: String(row.name || "").slice(0, 120),
    note: String(row.note || "").slice(0, 500),
  };
  run.rows = [...run.rows, next].slice(-STEP_LOG_ROWS_MAX);
  saveRun(run);
  return next;
}

export function patchStepRow(runId: string, rowId: string, patch: Partial<Pick<StepLogRow, "note" | "name">>) {
  const run = loadRun(runId);
  if (!run) return null;
  let hit: StepLogRow | undefined;
  run.rows = run.rows.map((r) => {
    if (r.id !== rowId) return r;
    hit = {
      ...r,
      note: patch.note != null ? String(patch.note).slice(0, 500) : r.note,
      name: patch.name != null ? String(patch.name).slice(0, 120) : r.name,
    };
    return hit;
  });
  if (!hit) return null;
  saveRun(run);
  return hit;
}

export function deleteStepRow(runId: string, rowId: string) {
  const run = loadRun(runId);
  if (!run) return false;
  const n = run.rows.length;
  run.rows = run.rows.filter((r) => r.id !== rowId);
  if (run.rows.length === n) return false;
  saveRun(run);
  return true;
}

export function deleteStepRun(id: string) {
  try {
    const p = runFile(id);
    if (existsSync(p)) unlinkSync(p);
  } catch {
    /* нет файла */
  }
  saveIndex(listRunIndex().filter((x) => x.id !== id));
  return true;
}

export function listRunsByStep(step?: StepN | 0) {
  const idx = listRunIndex();
  if (!step) return idx;
  return idx.filter((x) => x.step === step);
}

export function listAllRows(limit = STEP_LOG_ALL_ROWS_MAX) {
  const idx = listRunIndex();
  const rows: StepLogRow[] = [];
  for (const m of idx) {
    const run = loadRun(m.id);
    if (run) rows.push(...run.rows);
  }
  rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return { runs: idx, rows: rows.slice(0, limit) };
}

export function diskPersonSnap(cid: number): StepLogSnap {
  const id = Number(cid) || 0;
  if (!id) return {};
  try {
    const s = customerSyncOf(id);
    let woN = 0;
    try {
      const cal = loadCustomerCalendar(id) || [];
      woN = cal.filter((l) => Number(l.status) === 3 && Number((l as { amount?: number }).amount) > 0).length;
    } catch {
      /* календаря нет */
    }
    return {
      lessonsDisk: Number(s.lessonsDisk) || 0,
      lessonsAlfa: Number(s.lessonsAlfa) || 0,
      holeN: Number(s.lessonsHoleN) || 0,
      extraN: Number(s.lessonsExtraN) || 0,
      full: Boolean(s.lessonsFull),
      woN,
    };
  } catch {
    return {};
  }
}

type PullRes = {
  ok?: boolean;
  extra?: string;
  error?: string;
  more?: boolean;
  pagesComplete?: boolean;
  holeN?: number;
  extraN?: number;
  seated?: number;
  student?: {
    cid?: number;
    branchId?: number;
    name?: string;
    done?: boolean;
    ok?: boolean;
    short?: boolean;
    dups?: boolean;
    holeN?: number;
    extraN?: number;
    lessons?: number;
    pays?: number;
  };
  lastAudit?: { rows?: { cid?: number; branchId?: number; name?: string; codes?: string[]; clients?: number; alfa?: number; cash?: number; extra?: string }[] } | null;
  lastStudents?: { rows?: { cid?: number; name?: string }[] };
};

function nameFromExtra(extra: string) {
  const m = String(extra || "").match(/^«([^»]{1,80})»/);
  return m ? m[1] : "";
}

/** После шага. Не меняет res. Ошибка лога глотается. */
export function observeStepPull(
  spec: {
    kind?: string;
    mode?: string;
    jobMode?: string;
    peopleKind?: string;
    recheck?: boolean;
    probe?: boolean;
    dateFrom?: string;
    dateTo?: string;
    recheckDays?: number;
    study?: string;
    customerId?: number;
    groupId?: number;
    branchId?: number;
    name?: string;
    jobId?: string;
    skipKinds?: boolean;
  },
  before: StepLogSnap,
  res: PullRes,
  startedAt?: number,
) {
  try {
    const kind = String(spec.kind || "");
    if (kind === "jobStart" || kind === "jobStop" || kind === "jobStatus" || kind === "rosterPolicy" || kind === "holeApprove" || kind === "holeApproveClear" || kind === "lessonsReset" || kind === "paysReset") {
      return;
    }
    const step = stepOfKind(kind, spec.jobMode || spec.mode || "", spec.peopleKind || "");
    if (!step) return;
    const settings: StepLogSettings = {
      kind,
      mode: spec.jobMode || spec.mode,
      recheck: Boolean(spec.recheck),
      dateFrom: spec.dateFrom,
      dateTo: spec.dateTo,
      recheckDays: spec.recheckDays,
      study: spec.study,
      src: spec.jobId ? "job" : "hands",
    };
    const run = beginStepRun({
      id: runIdFor({ jobId: spec.jobId, step, settings }),
      jobId: spec.jobId,
      step,
      settings,
    });
    const hit = res.lastAudit?.rows?.[0];
    const st = res.student;
    const cid = Number(st?.cid || spec.customerId || hit?.cid) || 0;
    const after: StepLogSnap = cid ? diskPersonSnap(cid) : {};
    if (hit) {
      after.header = Number(hit.alfa);
      after.formula = Number(hit.clients);
      after.cash = Number(hit.cash);
      after.codes = Array.isArray(hit.codes) ? hit.codes.map(String) : [];
    }
    if (st?.lessons != null) after.lessonsDisk = Number(st.lessons) || after.lessonsDisk;
    if (st?.pays != null) after.pays = Number(st.pays);
    if (!cid) {
      if (res.holeN != null) after.holeN = Number(res.holeN) || 0;
      if (res.extraN != null) after.extraN = Number(res.extraN) || 0;
      if (res.pagesComplete != null) after.full = Boolean(res.pagesComplete);
    }
    const result = resultOfPull({ ...res, step, codes: after.codes });
    const matched = matchedOf(result, step);
    const action = spec.probe ? "probe" : res.error && !res.ok ? "fail" : spec.recheck ? "recheck" : "load";
    const name =
      String(st?.name || hit?.name || spec.name || nameFromExtra(String(res.extra || ""))).trim() ||
      (cid ? `№${cid}` : spec.groupId ? `группа ${spec.groupId}` : "запись");
    appendStepRow(run.id, {
      step,
      cid: cid || undefined,
      groupId: Number(spec.groupId) || undefined,
      branchId: Number(st?.branchId || spec.branchId || hit?.branchId) || undefined,
      name,
      action,
      result,
      ok: res.ok !== false && result !== "fail",
      matched,
      note: "",
      extra: String(res.extra || hit?.extra || "").slice(0, 400),
      error: res.error ? String(res.error).slice(0, 300) : undefined,
      settings,
      before,
      after,
      ms: startedAt ? Math.max(0, Date.now() - startedAt) : undefined,
    });
  } catch {
    /* лог не имеет права ронять шаг */
  }
}

export function observeJobStart(job: {
  id?: string;
  mode?: string;
  kind?: string;
  recheck?: boolean;
  dateFrom?: string;
  dateTo?: string;
  recheckDays?: number;
  study?: string;
}) {
  try {
    const step = stepOfKind(String(job.kind || ""), String(job.mode || ""));
    if (!step || !job.id) return;
    beginStepRun({
      id: runIdFor({ jobId: job.id, step }),
      jobId: job.id,
      step,
      settings: {
        kind: job.kind,
        mode: job.mode,
        recheck: Boolean(job.recheck),
        dateFrom: job.dateFrom,
        dateTo: job.dateTo,
        recheckDays: job.recheckDays,
        study: job.study,
        src: "job",
      },
    });
  } catch {
    /* */
  }
}

export function observeJobClose(job: { id?: string; mode?: string; kind?: string }) {
  try {
    const step = stepOfKind(String(job.kind || ""), String(job.mode || ""));
    if (!step || !job.id) return;
    closeStepRun(runIdFor({ jobId: job.id, step }));
  } catch {
    /* */
  }
}
