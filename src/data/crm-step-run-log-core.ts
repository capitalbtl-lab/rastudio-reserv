/** Чистое ядро лога шагов 1–6. Без fs, без Alfa. Только считает и подписывает. */

export type StepN = 1 | 2 | 3 | 4 | 5 | 6;
export type StepLogAction = "load" | "recheck" | "probe" | "fail" | "skip";
export type StepLogResult = "ok" | "hole" | "extra" | "mismatch" | "fail" | "skip" | "more" | "empty" | "right" | "left";

export type StepLogSnap = {
  lessonsDisk?: number;
  lessonsAlfa?: number;
  holeN?: number;
  extraN?: number;
  full?: boolean;
  woN?: number;
  pays?: number;
  header?: number;
  formula?: number;
  cash?: number;
  codes?: string[];
};

export type StepLogSettings = {
  kind?: string;
  mode?: string;
  recheck?: boolean;
  dateFrom?: string;
  dateTo?: string;
  recheckDays?: number;
  study?: string;
  src?: string;
};

export type StepLogRow = {
  id: string;
  at: string;
  step: StepN;
  runId: string;
  cid?: number;
  groupId?: number;
  branchId?: number;
  name: string;
  action: StepLogAction;
  result: StepLogResult;
  ok: boolean;
  matched?: boolean;
  note: string;
  settings: StepLogSettings;
  before?: StepLogSnap;
  after?: StepLogSnap;
  extra?: string;
  error?: string;
  ms?: number;
};

export type StepLogSummary = {
  n: number;
  unique: number;
  ok: number;
  fail: number;
  hole: number;
  extra: number;
  mismatch: number;
  skip: number;
  right: number;
  left: number;
  more: number;
  empty: number;
};

export type StepLogRun = {
  id: string;
  jobId?: string;
  step: StepN;
  at: string;
  endedAt?: string;
  note?: string;
  settings: StepLogSettings;
  summary: StepLogSummary;
  rows: StepLogRow[];
};

export type StepLogFlip = {
  key: string;
  name: string;
  cid?: number;
  groupId?: number;
  a: StepLogResult;
  b: StepLogResult;
  aMatched?: boolean;
  bMatched?: boolean;
};

export type StepLogNamedBucket = {
  result: StepLogResult;
  label: string;
  names: { who: string; cid?: number; groupId?: number; detail: string; matched?: boolean }[];
};

export const STEP_LOG_RUNS_MAX = 40;
export const STEP_LOG_ROWS_MAX = 2500;
export const STEP_LOG_ALL_ROWS_MAX = 800;

export const RESULT_RU: Record<StepLogResult, string> = {
  ok: "совпало",
  right: "совпало",
  left: "не совпало",
  hole: "дырка",
  extra: "лишние на диске",
  mismatch: "не сошлось",
  fail: "сбой",
  skip: "пропуск",
  more: "не дочитали",
  empty: "пусто",
};

export const ACTION_RU: Record<StepLogAction, string> = {
  load: "загрузка",
  recheck: "перепроверка",
  probe: "сверка счёта",
  fail: "сбой",
  skip: "пропуск",
};

export const STEP_RU: Record<StepN, string> = {
  1: "Шаг 1 · состав",
  2: "Шаг 2 · календарь",
  3: "Шаг 3 · группы",
  4: "Шаг 4 · касса",
  5: "Шаг 5 · сверка",
  6: "Шаг 6 · лиды",
};

export function emptySummary(): StepLogSummary {
  return { n: 0, unique: 0, ok: 0, fail: 0, hole: 0, extra: 0, mismatch: 0, skip: 0, right: 0, left: 0, more: 0, empty: 0 };
}

export function rowKey(r: Pick<StepLogRow, "cid" | "groupId" | "branchId" | "name">) {
  if (r.cid) return `c:${r.cid}`;
  if (r.groupId) return `g:${r.branchId || 0}:${r.groupId}`;
  return `n:${r.name || ""}`;
}

export function lastPerKey(rows: StepLogRow[]): StepLogRow[] {
  const m = new Map<string, StepLogRow>();
  for (const r of rows) m.set(rowKey(r), r);
  return [...m.values()].sort((a, b) => (a.name || "").localeCompare(b.name || "", "ru"));
}

export function whoOf(r: Pick<StepLogRow, "name" | "cid" | "groupId">) {
  if (r.cid) return `${r.name || "без имени"} №${r.cid}`;
  if (r.groupId) return `${r.name || "группа"} №${r.groupId}`;
  return r.name || "запись";
}

export function snapLine(s?: StepLogSnap) {
  if (!s) return "";
  const bits: string[] = [];
  if (s.lessonsDisk != null || s.lessonsAlfa != null) bits.push(`диск ${s.lessonsDisk ?? "—"} / Alfa ${s.lessonsAlfa ?? "—"}`);
  if (s.holeN) bits.push(`дырка ${s.holeN}`);
  if (s.extraN) bits.push(`лишние ${s.extraN}`);
  if (s.pays != null) bits.push(`касса ${s.pays}`);
  if (s.header != null || s.formula != null) bits.push(`шапка ${s.header ?? "—"} / формула ${s.formula ?? "—"}`);
  if (s.cash != null) bits.push(`оплаты ${s.cash}`);
  if (s.woN) bits.push(`списаний ${s.woN}`);
  if (s.codes?.length) bits.push(s.codes.join(", "));
  return bits.join(" · ");
}

function pair(label: string, a: number | undefined, b: number | undefined, bits: string[]) {
  if (a == null && b == null) return;
  if (a === b) {
    if (b != null) bits.push(`${label} ${b}`);
    return;
  }
  bits.push(`${label} ${a ?? "—"}→${b ?? "—"}`);
}

export function changeLine(r: StepLogRow) {
  const b = r.before || {};
  const a = r.after || {};
  const bits: string[] = [];
  pair("диск", b.lessonsDisk, a.lessonsDisk, bits);
  pair("Alfa", b.lessonsAlfa, a.lessonsAlfa, bits);
  pair("дырка", b.holeN, a.holeN, bits);
  pair("лишние", b.extraN, a.extraN, bits);
  pair("касса", b.pays, a.pays, bits);
  pair("шапка", b.header, a.header, bits);
  pair("формула", b.formula, a.formula, bits);
  pair("оплаты", b.cash, a.cash, bits);
  pair("списаний", b.woN, a.woN, bits);
  if (a.codes?.length) bits.push(a.codes.join(", "));
  return bits.join(" · ");
}

export function matchedOf(result: StepLogResult, step?: StepN): boolean | undefined {
  if (result === "ok" || result === "right") return true;
  if (result === "hole" || result === "extra" || result === "mismatch" || result === "left" || result === "fail") return false;
  if (step === 5 && result === "skip") return undefined;
  return undefined;
}

export function summarizeRows(rows: StepLogRow[]): StepLogSummary {
  const last = lastPerKey(rows);
  const s = emptySummary();
  s.n = rows.length;
  s.unique = last.length;
  for (const r of last) {
    if (r.result === "ok" || r.result === "right") s.ok += 1;
    if (r.result === "fail") s.fail += 1;
    if (r.result === "hole") s.hole += 1;
    if (r.result === "extra") s.extra += 1;
    if (r.result === "mismatch" || r.result === "left") s.mismatch += 1;
    if (r.result === "skip") s.skip += 1;
    if (r.result === "more") s.more += 1;
    if (r.result === "empty") s.empty += 1;
    const m = r.matched ?? matchedOf(r.result, r.step);
    if (m === true) s.right += 1;
    if (m === false && r.result !== "fail") s.left += 1;
  }
  return s;
}

export function namedBuckets(rows: StepLogRow[]): StepLogNamedBucket[] {
  const last = lastPerKey(rows);
  const order: StepLogResult[] = ["right", "ok", "left", "mismatch", "hole", "extra", "fail", "more", "skip", "empty"];
  const map = new Map<StepLogResult, StepLogNamedBucket>();
  for (const result of order) {
    map.set(result, { result, label: RESULT_RU[result], names: [] });
  }
  for (const r of last) {
    const key: StepLogResult = r.result === "ok" && r.step === 5 ? "right" : r.result;
    const bucket = map.get(key) || map.get(r.result);
    if (!bucket) continue;
    bucket.names.push({
      who: whoOf(r),
      cid: r.cid,
      groupId: r.groupId,
      detail: changeLine(r) || snapLine(r.after) || r.extra || r.error || "",
      matched: r.matched ?? matchedOf(r.result, r.step),
    });
  }
  return order.map((k) => map.get(k)!).filter((b) => b.names.length);
}

export function stepOfKind(kind: string, mode = "", peopleKind = ""): StepN | 0 {
  const k = String(kind || "");
  const m = String(mode || "");
  if (k === "roster" || m === "roster" || m === "roster-recheck") return 1;
  if (k === "balance" || peopleKind === "balance" || m === "balance") return 4;
  if (k === "audit" || m === "audit") return 5;
  if (k === "group" || k === "details" || m === "groups" || m === "groups-recheck" || m === "group-one" || m === "details") return 3;
  if (k === "students" || m === "people" || m === "people-recheck" || m === "people-slow" || m === "probe") return 2;
  return 0;
}

export function resultOfPull(p: {
  ok?: boolean;
  error?: string;
  holeN?: number;
  extraN?: number;
  seated?: number;
  pagesComplete?: boolean;
  more?: boolean;
  probe?: boolean;
  student?: { done?: boolean; ok?: boolean; short?: boolean; dups?: boolean; holeN?: number; extraN?: number };
  lastAudit?: { rows?: { cid?: number; codes?: string[] }[] } | null;
  codes?: string[];
  step?: StepN;
}): StepLogResult {
  if (p.error && !p.ok) return "fail";
  const hole = Number(p.holeN ?? p.student?.holeN) || 0;
  const extra = Number(p.extraN ?? p.student?.extraN) || 0;
  if (p.student?.short || hole > 0) return "hole";
  if (p.student?.dups || extra > 0) return "extra";
  if (p.pagesComplete === false) return "more";
  if (p.step === 5) {
    const hit = p.lastAudit?.rows?.[0];
    const codes = p.codes || hit?.codes || [];
    if (codes.includes("ok") || (p.student?.done && !codes.length)) return "right";
    if (codes.includes("нет сверки") || codes.includes("нет ответа") || codes.includes("нет роли")) return "skip";
    if (codes.length) return "left";
    if (p.student?.done) return "right";
    if (p.ok === false) return "fail";
    return "left";
  }
  if (p.student?.done || p.student?.ok) return "ok";
  if (p.ok === false) return "fail";
  if (p.ok) return "ok";
  return "empty";
}

export function compareRuns(a: StepLogRow[], b: StepLogRow[]): StepLogFlip[] {
  const last = (rows: StepLogRow[]) => {
    const m = new Map<string, StepLogRow>();
    for (const r of rows) m.set(rowKey(r), r);
    return m;
  };
  const A = last(a);
  const B = last(b);
  const out: StepLogFlip[] = [];
  const keys = new Set([...A.keys(), ...B.keys()]);
  for (const k of keys) {
    const x = A.get(k);
    const y = B.get(k);
    if (!x || !y) continue;
    const am = x.matched ?? matchedOf(x.result, x.step);
    const bm = y.matched ?? matchedOf(y.result, y.step);
    if (x.result === y.result && am === bm) continue;
    out.push({
      key: k,
      name: y.name || x.name,
      cid: y.cid || x.cid,
      groupId: y.groupId || x.groupId,
      a: x.result,
      b: y.result,
      aMatched: am,
      bMatched: bm,
    });
  }
  return out.sort((p, q) => p.name.localeCompare(q.name, "ru"));
}

export function runIndexMeta(run: StepLogRun) {
  return {
    id: run.id,
    jobId: run.jobId,
    step: run.step,
    at: run.at,
    endedAt: run.endedAt,
    note: run.note || "",
    settings: run.settings,
    summary: run.summary,
    n: run.rows.length,
  };
}

export function settingsLine(s?: StepLogSettings) {
  if (!s) return "";
  const bits: string[] = [];
  if (s.recheck) bits.push("перепроверка");
  else if (s.kind || s.mode) bits.push("загрузка");
  if (s.recheckDays) bits.push(`окно ${s.recheckDays} дн.`);
  if (s.dateFrom) bits.push(`с ${s.dateFrom}`);
  if (s.dateTo) bits.push(`по ${s.dateTo}`);
  if (s.study === "2") bits.push("архив");
  else if (s.study === "1") bits.push("ходят");
  if (s.src === "job") bits.push("очередь");
  else if (s.src === "hands") bits.push("руками");
  return bits.join(" · ");
}

export function mskDay(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function mskStamp(d = new Date()) {
  const day = mskDay(d);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value || "00";
  const min = parts.find((p) => p.type === "minute")?.value || "00";
  return `${day}_${h}${min}`;
}

export function runIdFor(p: { jobId?: string; step: StepN; settings?: StepLogSettings; stamp?: string }) {
  if (p.jobId) return `${p.jobId}-s${p.step}`;
  const s = p.settings || {};
  const from = String(s.dateFrom || "all").replace(/[^0-9-]/g, "").slice(0, 10) || "all";
  const days = s.recheckDays != null ? `d${Number(s.recheckDays) || 0}` : "dx";
  const tag = [s.recheck ? "r" : "l", from, days, s.study || "a", p.stamp || mskDay()].join("_");
  return `hands-s${p.step}-${tag}`;
}

export function rowsToCsv(rows: StepLogRow[]) {
  const head = ["at", "step", "name", "cid", "groupId", "branchId", "action", "result", "ok", "matched", "note", "extra", "error", "holeN", "extraN", "lessonsDisk", "lessonsAlfa", "header", "formula", "cash", "codes", "dateFrom", "dateTo", "recheckDays", "recheck", "change", "ms"];
  const line = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = rows.map((r) =>
    [
      r.at,
      r.step,
      r.name,
      r.cid || "",
      r.groupId || "",
      r.branchId || "",
      r.action,
      r.result,
      r.ok,
      r.matched ?? "",
      r.note,
      r.extra || "",
      r.error || "",
      r.after?.holeN ?? r.before?.holeN ?? "",
      r.after?.extraN ?? "",
      r.after?.lessonsDisk ?? "",
      r.after?.lessonsAlfa ?? "",
      r.after?.header ?? "",
      r.after?.formula ?? "",
      r.after?.cash ?? "",
      (r.after?.codes || []).join("|"),
      r.settings.dateFrom || "",
      r.settings.dateTo || "",
      r.settings.recheckDays ?? "",
      r.settings.recheck ?? "",
      changeLine(r),
      r.ms ?? "",
    ]
      .map(line)
      .join(","),
  );
  return [head.join(","), ...body].join("\n");
}

export function rowsToText(rows: StepLogRow[]) {
  return rows
    .map((r) => {
      const who = whoOf(r);
      const m = r.matched ?? matchedOf(r.result, r.step);
      const ch = changeLine(r);
      return `${r.at} · шаг ${r.step} · ${who} · ${ACTION_RU[r.action] || r.action} → ${RESULT_RU[r.result] || r.result}${m === true ? " · совпало" : m === false ? " · не совпало" : ""}${ch ? ` · ${ch}` : ""}${r.note ? ` · ${r.note}` : ""}`;
    })
    .join("\n");
}

export function namedText(rows: StepLogRow[], title = "") {
  const s = summarizeRows(rows);
  const buckets = namedBuckets(rows);
  const lines = [
    title,
    `Обработано ${s.unique} чел./групп (${s.n} записей) · совпало ${s.right || s.ok} · не совпало ${s.left || s.mismatch} · дырка ${s.hole} · лишние ${s.extra} · сбой ${s.fail}`,
  ].filter(Boolean);
  for (const b of buckets) {
    lines.push("");
    lines.push(`${b.label} · ${b.names.length}`);
    for (const n of b.names) lines.push(`  ${n.who}${n.detail ? ` · ${n.detail}` : ""}`);
  }
  return lines.join("\n");
}

export function flipsText(flips: StepLogFlip[]) {
  if (!flips.length) return "Прыжков нет: у одних и тех же людей результат не сменился.";
  return [
    `Прыжки · ${flips.length}`,
    ...flips.map((f) => `  ${f.name}${f.cid ? ` №${f.cid}` : ""}: ${RESULT_RU[f.a]} → ${RESULT_RU[f.b]}`),
  ].join("\n");
}

export function runHeadline(run: Pick<StepLogRun, "at" | "step" | "settings" | "summary" | "endedAt">) {
  const when = run.at ? run.at.slice(0, 16).replace("T", " ") : "";
  const set = settingsLine(run.settings);
  const s = run.summary;
  return [when, STEP_RU[run.step], set, s.unique ? `${s.unique} чел.` : `${s.n} зап.`, s.right || s.ok ? `совпало ${s.right || s.ok}` : "", s.left || s.mismatch ? `не совпало ${s.left || s.mismatch}` : "", run.endedAt ? "закрыт" : "идёт"]
    .filter(Boolean)
    .join(" · ");
}
