/** Пульт автомата Истории. Без fs, без Alfa. */

export const HISTORY_PLAN_MODES = [
  { id: "auto", label: "Автомат · перепроверить 1–5", recheck: true, step: "roster" },
  { id: "roster", label: "Шаг 1 · загрузить состав", recheck: false, step: "roster" },
  { id: "roster-recheck", label: "Шаг 1 · перепроверить состав", recheck: true, step: "roster" },
  { id: "people", label: "Шаг 2 · загрузить календарь", recheck: false, step: "students" },
  { id: "people-slow", label: "Шаг 2 · медленный добор", recheck: false, step: "students" },
  { id: "people-recheck", label: "Шаг 2 · перепроверить календарь", recheck: true, step: "students" },
  { id: "groups", label: "Шаг 3 · загрузить занятия групп", recheck: false, step: "groups" },
  { id: "groups-recheck", label: "Шаг 3 · перепроверить группы", recheck: true, step: "groups" },
  { id: "balance", label: "Шаг 4 · загрузить кассу", recheck: false, step: "money" },
  { id: "audit", label: "Шаг 5 · сверка остатка", recheck: false, step: "audit" },
  { id: "step6-recount", label: "Шаг 6 · пересчет лидов", recheck: false, step: "step6" },
  { id: "step6-columns", label: "Шаг 6 · прочитать колонки", recheck: false, step: "step6" },
  { id: "step6-cash", label: "Шаг 6 · перепроверить кассу", recheck: false, step: "step6" },
  { id: "catalog", label: "Архив · каталог клиентов", recheck: false, step: "roster" },
] as const;

export type HistoryPlanMode = (typeof HISTORY_PLAN_MODES)[number]["id"];

/** После состава: календарь → группы → касса → сверка. */
/** Шаг 5 в трубе: пустая лента = нули, товар минус, лидов не отсекаем. */
export const STEP6_PIPE = ["step6-recount", "step6-columns", "step6-cash"] as const;

/** Выбор шагов. Полный 1–5 без хвоста шага 6 остаётся прежней трубой. */
export function pipeFromSelection(
  steps: number[],
  also: string[],
  opts: { study: "1" | "2"; archGroups: boolean },
): { mode: string; pipe: string[] } {
  const want = [1, 2, 3, 4, 5].filter((n) => steps.includes(n));
  const tail = STEP6_PIPE.filter((id) => also.includes(id));
  const full = want.length === 5 && !tail.length;
  if (full) {
    const pipe = opts.study === "2" || opts.archGroups === false ? [...AUTO_PIPE] : [...AUTO_PIPE_FULL];
    return { mode: "roster-recheck", pipe };
  }
  const modes: string[] = [];
  for (const n of want) {
    if (n === 1) modes.push("roster-recheck");
    if (n === 2) modes.push("people");
    if (n === 3) {
      modes.push("groups");
      if (opts.study === "1" && opts.archGroups) modes.push("archivesPupils", "groups-archived");
    }
    if (n === 4) modes.push("balance");
    if (n === 5) modes.push("audit");
  }
  const all = [...modes, ...tail];
  if (!all.length) return { mode: "", pipe: [] };
  return { mode: all[0], pipe: all.slice(1) };
}
/** После состава: календарь → группы → касса → сверка. */
export const AUTO_PIPE: HistoryPlanMode[] = ["people", "groups", "balance", "audit"];
/** Живые: плюс архив групп действующих, потом касса. */
export const AUTO_PIPE_FULL: string[] = ["people", "groups", "archivesPupils", "groups-archived", "balance", "audit"];

export const PLAN_RECHECK_OPTS = [
  { days: 7 as const, label: "± неделя" },
  { days: 14 as const, label: "± 2 недели" },
  { days: 32 as const, label: "± месяц" },
  { days: 62 as const, label: "± 2 месяца" },
  { days: 92 as const, label: "± три" },
  { days: 122 as const, label: "± 4 месяца" },
  { days: 182 as const, label: "± шесть" },
  { days: 1095 as const, label: "за 3 года" },
  { days: 2555 as const, label: "за 7 лет" },
  { days: 4000 as const, label: "с начала · 2015" },
] as const;

export const PLAN_FROM_OPTS = [
  { id: "2015", label: "с начала · 2015" },
  { id: "7", label: "7 лет" },
  { id: "3", label: "3 года" },
  { id: "2", label: "2 года" },
  { id: "1", label: "1 год" },
  { id: "m6", label: "6 месяцев" },
  { id: "m4", label: "4 месяца" },
  { id: "m2", label: "2 месяца" },
  { id: "m1", label: "1 месяц" },
] as const;

export type PlanFromId = (typeof PLAN_FROM_OPTS)[number]["id"];
export type PlanWhenKind = "weekly" | "daily" | "interval" | "nthWeekday" | "ymd";
export type PlanUnit = "day" | "week" | "month";

export type HistoryWhen =
  | { kind: "weekly"; days: number[] }
  | { kind: "daily" }
  | { kind: "interval"; every: number; unit: PlanUnit }
  | { kind: "nthWeekday"; n: number; day: number }
  | { kind: "ymd"; date: string };

export type HistorySchedule = {
  id: string;
  on: boolean;
  mode: HistoryPlanMode;
  when: HistoryWhen;
  at: string;
  recheckDays: number;
  dateFromId: PlanFromId;
  study: "1" | "2";
  label: string;
  leads: boolean;
  archGroups: boolean;
  steps?: number[];
  also?: string[];
  dueAt: string;
  lastFiredAt: string;
  lastJobId: string;
  lastSkip: string;
};

export type CrmSyncPolicy = {
  planEnabled: boolean;
  plan: HistorySchedule[];
};

export const POLICY_FACTORY: CrmSyncPolicy = { planEnabled: false, plan: [] };

export const PLAN_DUE_MS = 36 * 60 * 60 * 1000;
export const PLAN_SLOT_MIN = 15;
export const PLAN_TZ = "Europe/Moscow";
const MSK_OFFSET_H = 3;

const MODE_IDS = new Set<string>(HISTORY_PLAN_MODES.map((m) => m.id));
const DOW: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export type MskWall = { y: number; mo: number; d: number; h: number; min: number; dow: number };

export function mskWall(now = new Date()): MskWall {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: PLAN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    y: Number(parts.year),
    mo: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour),
    min: Number(parts.minute),
    dow: DOW[parts.weekday] || ((): number => {
      const d = new Date(now.getTime() + MSK_OFFSET_H * 3600_000).getUTCDay();
      return d === 0 ? 7 : d;
    })(),
  };
}

/** Стена МСК → UTC. С 2014 МСК = UTC+3, без летнего. */
export function fromMsk(y: number, mo: number, d: number, h: number, min: number): Date {
  return new Date(Date.UTC(y, mo - 1, d, h - MSK_OFFSET_H, min, 0, 0));
}

function monthLen(y: number, mo: number) {
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

function shiftDays(y: number, mo: number, d: number, days: number): MskWall {
  return mskWall(new Date(Date.UTC(y, mo - 1, d + days, 12, 0, 0)));
}

export function ymdOf(d: Date) {
  const w = mskWall(d);
  return `${w.y}-${pad2(w.mo)}-${pad2(w.d)}`;
}

export function clampPlanAt(raw: unknown): string {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "04:00";
  const h = Math.max(0, Math.min(23, Number(m[1])));
  const min = Math.round(Number(m[2]) / 15) * 15;
  const mm = min >= 60 ? 45 : min;
  return `${pad2(h)}:${pad2(mm)}`;
}

export function parsePlanAt(at: string): { h: number; m: number } {
  const s = clampPlanAt(at);
  return { h: Number(s.slice(0, 2)), m: Number(s.slice(3, 5)) };
}

export function weekdayMon1(d: Date) {
  return mskWall(d).dow;
}

export function planModeOf(raw: unknown): HistoryPlanMode {
  const id = String(raw || "");
  return MODE_IDS.has(id) ? (id as HistoryPlanMode) : "people-recheck";
}

export function planModeMeta(mode: string) {
  return HISTORY_PLAN_MODES.find((m) => m.id === mode) || HISTORY_PLAN_MODES.find((m) => m.id === "people-recheck") || HISTORY_PLAN_MODES[0];
}

function uniqDays(raw: unknown): number[] {
  const list = Array.isArray(raw) ? raw : [];
  const days = [...new Set(list.map((x) => Number(x) || 0).filter((n) => n >= 1 && n <= 7))].sort((a, b) => a - b);
  return days;
}

function whenOf(raw: unknown): HistoryWhen {
  const w = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const kind = String(w.kind || "");
  if (kind === "daily") return { kind: "daily" };
  if (kind === "interval") {
    const unit: PlanUnit = w.unit === "day" || w.unit === "week" ? w.unit : "month";
    const every = Math.max(1, Math.min(36, Number(w.every) || 1));
    return { kind: "interval", every, unit };
  }
  if (kind === "nthWeekday") {
    const nRaw = Number(w.n);
    const n = nRaw === -1 ? -1 : Math.max(1, Math.min(5, nRaw || 1));
    const day = Math.max(1, Math.min(7, Number(w.day) || 1));
    return { kind: "nthWeekday", n, day };
  }
  if (kind === "ymd") {
    const date = String(w.date || "").trim();
    return { kind: "ymd", date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "" };
  }
  return { kind: "weekly", days: uniqDays(w.days) };
}

export function scheduleOf(raw: unknown, fallbackId = ""): HistorySchedule {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const id = String(r.id || fallbackId || "").trim();
  const days = PLAN_RECHECK_OPTS.some((o) => o.days === Number(r.recheckDays)) ? Number(r.recheckDays) : 32;
  const from = PLAN_FROM_OPTS.some((o) => o.id === r.dateFromId) ? (r.dateFromId as PlanFromId) : "2015";
  return {
    id,
    on: r.on !== false,
    mode: planModeOf(r.mode),
    when: whenOf(r.when),
    at: clampPlanAt(r.at),
    recheckDays: days,
    dateFromId: from,
    study: r.study === "2" ? "2" : "1",
    label: String(r.label || "").trim().slice(0, 80),
    leads: r.leads !== false,
    archGroups: r.archGroups !== false,
    steps: Array.isArray(r.steps) ? [...new Set(r.steps.map((n) => Number(n)).filter((n) => n >= 1 && n <= 5))].sort((a, b) => a - b) : undefined,
    also: Array.isArray(r.also) ? STEP6_PIPE.filter((id) => (r.also as unknown[]).includes(id)) : undefined,
    dueAt: String(r.dueAt || ""),
    lastFiredAt: String(r.lastFiredAt || ""),
    lastJobId: String(r.lastJobId || ""),
    lastSkip: String(r.lastSkip || ""),
  };
}

export function policyOf(raw: unknown): CrmSyncPolicy {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(r.plan) ? r.plan : [];
  const seen = new Set<string>();
  const plan: HistorySchedule[] = [];
  for (const row of list) {
    const s = scheduleOf(row, `rule-${plan.length + 1}`);
    if (!s.id) continue;
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    plan.push(s);
  }
  return {
    planEnabled: Boolean(r.planEnabled),
    plan,
  };
}

export function canSavePolicy(p: CrmSyncPolicy): { ok: true } | { ok: false; error: string } {
  for (const s of p.plan) {
    if (!s.at) return { ok: false, error: "У расписания нет времени запуска." };
    if (s.when.kind === "weekly" && !s.when.days.length) {
      return { ok: false, error: "Выберите хотя бы один день недели." };
    }
    if (s.when.kind === "ymd" && !s.when.date) {
      return { ok: false, error: "Укажите дату запуска." };
    }
    if (s.when.kind === "interval" && s.when.every < 1) {
      return { ok: false, error: "Интервал — целое число от 1." };
    }
  }
  return { ok: true };
}

export function planDateFrom(id: string, now = new Date()): string {
  if (id === "2015") return "2015-01-01";
  const w = mskWall(now);
  const months = id === "m1" ? 1 : id === "m2" ? 2 : id === "m4" ? 4 : id === "m6" ? 6 : 0;
  if (months) {
    let mo = w.mo - months;
    let y = w.y;
    while (mo < 1) {
      mo += 12;
      y -= 1;
    }
    const d = Math.min(w.d, monthLen(y, mo));
    return `${y}-${pad2(mo)}-${pad2(d)}`;
  }
  const years = id === "1" ? 1 : id === "2" ? 2 : id === "3" ? 3 : 7;
  const y = w.y - years;
  const d = Math.min(w.d, monthLen(y, w.mo));
  return `${y}-${pad2(w.mo)}-${pad2(d)}`;
}

export function planFromIdOf(_study: "1" | "2", id: string): PlanFromId {
  return PLAN_FROM_OPTS.some((o) => o.id === id) ? (id as PlanFromId) : _study === "2" ? "1" : "2015";
}

/** Синяя таблица пауз: годы с пульта → окно перепроверки. */
export function planFromIdToRecheckDays(id: string): number {
  if (id === "7") return 2555;
  if (id === "3") return 1095;
  if (id === "2") return 730;
  if (id === "1") return 365;
  if (id === "m6") return 182;
  if (id === "m4") return 122;
  if (id === "m2") return 62;
  if (id === "m1") return 32;
  return 4000;
}

export function planRuleToJob(rule: HistorySchedule, now = new Date()) {
  const fromId = planFromIdOf(rule.study, rule.dateFromId);
  if (rule.mode === "auto") {
    const custom = Array.isArray(rule.steps);
    const also = (rule.also || []).filter((id) => (STEP6_PIPE as readonly string[]).includes(id));
    if (!custom && !also.length) {
      return {
        mode: "roster-recheck" as const,
        kind: "roster",
        study: rule.study,
        recheck: true,
        recheckDays: planFromIdToRecheckDays(fromId),
        dateFrom: planDateFrom(fromId, now),
        archived: rule.study === "2",
        pipe: rule.study === "2" || rule.archGroups === false ? [...AUTO_PIPE] : [...AUTO_PIPE_FULL],
        skipLeads: Boolean(rule.study === "1" && rule.leads === false),
      };
    }
    const built = pipeFromSelection(custom ? rule.steps || [] : [1, 2, 3, 4, 5], also, {
      study: rule.study,
      archGroups: rule.archGroups !== false,
    });
    return {
      mode: built.mode as HistoryPlanMode,
      kind: built.mode.startsWith("step6") ? "students" : built.mode.includes("roster") ? "roster" : "students",
      study: rule.study,
      recheck: true,
      recheckDays: planFromIdToRecheckDays(fromId),
      dateFrom: planDateFrom(fromId, now),
      archived: rule.study === "2",
      pipe: built.pipe as HistoryPlanMode[],
      skipLeads: Boolean(rule.study === "1" && rule.leads === false),
    };
  }
  if (rule.mode === "step6-recount" || rule.mode === "step6-columns" || rule.mode === "step6-cash") {
    const also = (rule.also || []).filter((id) => id !== rule.mode && (STEP6_PIPE as readonly string[]).includes(id));
    return {
      mode: rule.mode,
      kind: "students",
      study: rule.study,
      recheck: false,
      recheckDays: 32,
      dateFrom: "",
      archived: false,
      pipe: also as unknown as HistoryPlanMode[],
    };
  }
  const meta = planModeMeta(rule.mode);
  const balance = rule.mode === "balance";
  const needFrom = rule.mode === "people" || rule.mode === "people-slow" || rule.mode === "balance";
  return {
    mode: (balance ? "people" : rule.mode) as HistoryPlanMode | "people",
    kind: balance ? "balance" : "students",
    study: rule.study,
    recheck: meta.recheck,
    recheckDays: meta.recheck ? rule.recheckDays : 32,
    dateFrom: needFrom ? planDateFrom(fromId, now) : "",
    archived: rule.study === "2",
    pipe: extraPipe(rule),
  };
}

function ownStep(mode: string) {
  if (mode.startsWith("roster")) return 1;
  if (mode.startsWith("people")) return 2;
  if (mode.startsWith("groups")) return 3;
  if (mode === "balance") return 4;
  if (mode === "audit") return 5;
  return 0;
}

function extraPipe(rule: HistorySchedule): HistoryPlanMode[] {
  const rest = (rule.steps || []).filter((n) => n !== ownStep(rule.mode));
  const also = rule.also || [];
  if (!rest.length && !also.length) return [];
  const built = pipeFromSelection(rest, also, { study: rule.study, archGroups: rule.archGroups !== false });
  return [built.mode, ...built.pipe].filter((id) => id && id !== rule.mode) as HistoryPlanMode[];
}

export function slotOpen(now: Date, at: string) {
  const { h, m } = parsePlanAt(at);
  const w = mskWall(now);
  if (w.h !== h) return false;
  return w.min >= m && w.min < m + PLAN_SLOT_MIN;
}

/** После времени слота по МСК в этот календарный день. */
export function slotReached(now: Date, at: string) {
  const { h, m } = parsePlanAt(at);
  const w = mskWall(now);
  return w.h * 60 + w.min >= h * 60 + m;
}

function addInterval(from: Date, every: number, unit: PlanUnit, at: string): Date {
  const { h, m } = parsePlanAt(at);
  const w = mskWall(from);
  if (unit === "day") {
    const day = shiftDays(w.y, w.mo, w.d, every);
    return fromMsk(day.y, day.mo, day.d, h, m);
  }
  if (unit === "week") {
    const day = shiftDays(w.y, w.mo, w.d, every * 7);
    return fromMsk(day.y, day.mo, day.d, h, m);
  }
  let mo = w.mo + every;
  let y = w.y;
  while (mo > 12) {
    mo -= 12;
    y += 1;
  }
  const d = Math.min(w.d, monthLen(y, mo));
  return fromMsk(y, mo, d, h, m);
}

function nthWeekdayDate(now: Date, n: number, day: number): string {
  const w = mskWall(now);
  const y = w.y;
  const mo = w.mo;
  if (n === -1) {
    const lastN = monthLen(y, mo);
    const last = fromMsk(y, mo, lastN, 12, 0);
    const back = (mskWall(last).dow - day + 7) % 7;
    return `${y}-${pad2(mo)}-${pad2(lastN - back)}`;
  }
  const first = fromMsk(y, mo, 1, 12, 0);
  const add = (day - mskWall(first).dow + 7) % 7;
  const d = 1 + add + (n - 1) * 7;
  if (d > monthLen(y, mo)) return "";
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

export function whenHits(when: HistoryWhen, now: Date): boolean {
  if (when.kind === "daily") return true;
  if (when.kind === "weekly") return when.days.includes(weekdayMon1(now));
  if (when.kind === "ymd") return when.date === ymdOf(now);
  if (when.kind === "nthWeekday") return nthWeekdayDate(now, when.n, when.day) === ymdOf(now);
  if (when.kind === "interval") return true;
  return false;
}

function intervalAfterFire(rule: HistorySchedule, now: Date): Date | null {
  if (rule.when.kind !== "interval" || !rule.lastFiredAt) return null;
  const t = Date.parse(rule.lastFiredAt);
  if (!Number.isFinite(t)) return null;
  let nxt = addInterval(new Date(t), rule.when.every, rule.when.unit, rule.at);
  let guard = 0;
  while (now.getTime() - nxt.getTime() > PLAN_DUE_MS && guard < 48) {
    nxt = addInterval(nxt, rule.when.every, rule.when.unit, rule.at);
    guard += 1;
  }
  return nxt;
}

function lastOccurrence(rule: HistorySchedule, now: Date): Date | null {
  const { h, m } = parsePlanAt(rule.at);
  const w = mskWall(now);
  if (rule.when.kind === "daily") {
    const today = fromMsk(w.y, w.mo, w.d, h, m);
    if (now.getTime() >= today.getTime()) return today;
    const yest = shiftDays(w.y, w.mo, w.d, -1);
    return fromMsk(yest.y, yest.mo, yest.d, h, m);
  }
  if (rule.when.kind === "weekly") {
    if (!rule.when.days.length) return null;
    for (let i = 0; i <= 8; i += 1) {
      const day = shiftDays(w.y, w.mo, w.d, -i);
      const slot = fromMsk(day.y, day.mo, day.d, h, m);
      if (slot.getTime() > now.getTime()) continue;
      if (rule.when.days.includes(day.dow)) return slot;
    }
    return null;
  }
  if (rule.when.kind === "ymd") {
    if (!rule.when.date) return null;
    const [y, mo, da] = rule.when.date.split("-").map(Number);
    const slot = fromMsk(y, mo, da, h, m);
    return slot.getTime() <= now.getTime() ? slot : null;
  }
  if (rule.when.kind === "nthWeekday") {
    const ymd = nthWeekdayDate(now, rule.when.n, rule.when.day);
    if (ymd) {
      const [y, mo, da] = ymd.split("-").map(Number);
      const slot = fromMsk(y, mo, da, h, m);
      if (slot.getTime() <= now.getTime()) return slot;
    }
    const prev = shiftDays(w.y, w.mo, 1, -15);
    const nymd = nthWeekdayDate(fromMsk(prev.y, prev.mo, 15, 12, 0), rule.when.n, rule.when.day);
    if (!nymd) return null;
    const [y, mo, da] = nymd.split("-").map(Number);
    const slot = fromMsk(y, mo, da, h, m);
    return slot.getTime() <= now.getTime() ? slot : null;
  }
  if (rule.when.kind === "interval") {
    const nxt = intervalAfterFire(rule, now);
    if (nxt) return nxt.getTime() <= now.getTime() ? nxt : null;
    const today = fromMsk(w.y, w.mo, w.d, h, m);
    if (now.getTime() >= today.getTime()) return today;
    const yest = shiftDays(w.y, w.mo, w.d, -1);
    return fromMsk(yest.y, yest.mo, yest.d, h, m);
  }
  return null;
}

export function markPlanDue(policy: CrmSyncPolicy, now = new Date()): CrmSyncPolicy {
  if (!policy.planEnabled) {
    return {
      ...policy,
      plan: policy.plan.map((r) => (r.dueAt ? { ...r, dueAt: "", lastSkip: "" } : r)),
    };
  }
  return {
    ...policy,
    plan: policy.plan.map((r) => {
      if (!r.on) return r.dueAt ? { ...r, dueAt: "" } : r;
      if (r.dueAt) {
        const due = Date.parse(r.dueAt);
        if (Number.isFinite(due) && now.getTime() - due > PLAN_DUE_MS) {
          if (r.lastSkip === "run") return r;
          if (r.lastSkip === "hands") {
            return { ...r, dueAt: "", lastSkip: "hands" };
          }
          return { ...r, dueAt: "", lastSkip: "expired" };
        }
        return r;
      }
      if (!r.lastFiredAt) {
        if (r.when.kind === "interval") return { ...r, lastFiredAt: now.toISOString() };
        if (!whenHits(r.when, now) || !slotReached(now, r.at)) return r;
        return { ...r, dueAt: now.toISOString(), lastSkip: "" };
      }
      if (r.when.kind === "daily") {
        if (!slotReached(now, r.at)) return r;
        if (ymdOf(new Date(r.lastFiredAt)) === ymdOf(now)) return r;
        return { ...r, dueAt: now.toISOString(), lastSkip: "" };
      }
      const occ = lastOccurrence(r, now);
      if (!occ) return r;
      if (now.getTime() - occ.getTime() > PLAN_DUE_MS) return r;
      const fired = Date.parse(r.lastFiredAt);
      if (Number.isFinite(fired) && fired >= occ.getTime() - 1000) return r;
      return { ...r, dueAt: now.toISOString(), lastSkip: "" };
    }),
  };
}

export function pickDueRule(policy: CrmSyncPolicy, now = new Date()): HistorySchedule | null {
  if (!policy.planEnabled) return null;
  return (
    policy.plan.find((r) => {
      if (!r.on || !r.dueAt) return false;
      if (r.lastSkip === "pipe") {
        const t = Date.parse(r.lastFiredAt || r.dueAt);
        if (Number.isFinite(t) && now.getTime() - t < 20 * 60 * 1000) return false;
      }
      return true;
    }) || null
  );
}

export function stampPlanFired(policy: CrmSyncPolicy, id: string, jobId: string, now = new Date()): CrmSyncPolicy {
  return {
    ...policy,
    plan: policy.plan.map((r) =>
      r.id === id ? { ...r, dueAt: "", lastFiredAt: now.toISOString(), lastJobId: jobId, lastSkip: "" } : r,
    ),
  };
}

export function stampPlanSkip(policy: CrmSyncPolicy, reason: string, now = new Date()): CrmSyncPolicy {
  return {
    ...policy,
    plan: policy.plan.map((r) => {
      if (!r.dueAt || r.lastSkip) return r;
      if (reason === "hands") {
        if (r.when.kind === "ymd") return { ...r, lastSkip: "hands" };
        return { ...r, dueAt: "", lastSkip: "hands", lastFiredAt: now.toISOString() };
      }
      return { ...r, lastSkip: reason };
    }),
  };
}

/** Слот поехал, due ещё не закрыт — труба не доехала. */
export function stampPlanRun(policy: CrmSyncPolicy, id: string, jobId: string): CrmSyncPolicy {
  return {
    ...policy,
    plan: policy.plan.map((r) => (r.id === id ? { ...r, lastJobId: jobId, lastSkip: "run" } : r)),
  };
}

export function stampPlanHandsExcept(policy: CrmSyncPolicy, exceptJobId: string, now = new Date()): CrmSyncPolicy {
  return {
    ...policy,
    plan: policy.plan.map((r) => {
      if (r.lastJobId === exceptJobId && r.lastSkip === "run") return r;
      if (!r.dueAt || r.lastSkip) return r;
      if (r.when.kind === "ymd") return { ...r, lastSkip: "hands" };
      return { ...r, dueAt: "", lastSkip: "hands", lastFiredAt: now.toISOString() };
    }),
  };
}

/** Воркер ставит due/lastFired, карточки и тумблер — с диска (экран). */
export function mergePolicyRunStamps(disk: CrmSyncPolicy, run: HistorySchedule[]): CrmSyncPolicy {
  const byId = new Map(run.map((r) => [r.id, r]));
  return {
    planEnabled: disk.planEnabled,
    plan: disk.plan.map((s) => {
      const p = byId.get(s.id);
      if (!p) return s;
      return {
        ...s,
        dueAt: p.dueAt,
        lastFiredAt: p.lastFiredAt,
        lastJobId: p.lastJobId,
        lastSkip: p.lastSkip,
      };
    }),
  };
}

/** Экран не затирает due/lastFiredAt, которые поставил воркер. Смена часа, дня или шага — due снимаем, иначе ночью поедет старое время. */
export function mergePolicyKeepRun(disk: CrmSyncPolicy, incoming: CrmSyncPolicy): CrmSyncPolicy {
  const byId = new Map(disk.plan.map((r) => [r.id, r]));
  return {
    planEnabled: incoming.planEnabled,
    plan: incoming.plan.map((s) => {
      const prev = byId.get(s.id);
      if (!prev) return s;
      const same =
        prev.mode === s.mode &&
        prev.at === s.at &&
        prev.study === s.study &&
        prev.dateFromId === s.dateFromId &&
        prev.recheckDays === s.recheckDays &&
        prev.leads === s.leads &&
        prev.archGroups === s.archGroups &&
        JSON.stringify(prev.when) === JSON.stringify(s.when);
      if (!same) {
        return {
          ...s,
          dueAt: "",
          lastFiredAt: prev.lastFiredAt,
          lastJobId: prev.lastJobId,
          lastSkip: prev.lastSkip === "run" ? "run" : "",
        };
      }
      return {
        ...s,
        dueAt: prev.dueAt,
        lastFiredAt: prev.lastFiredAt,
        lastJobId: prev.lastJobId,
        lastSkip: prev.lastSkip,
      };
    }),
  };
}

/** Старт автомата: новая работа — fired; чужой джоб — hands; пустой прогон — empty (тоже штамп, не крутить каждую секунду). */
export function planFireDecision(
  before: { id?: string; running?: boolean; stop?: boolean },
  started: { id?: string; running?: boolean },
): "fired" | "hands" | "empty" {
  const beforeId = String(before.id || "");
  const startedId = String(started.id || "");
  if (started.running && startedId && startedId !== beforeId) return "fired";
  if (started.running) return "hands";
  if (startedId && startedId !== beforeId) return "empty";
  return "hands";
}

export function nextSlotAt(rule: HistorySchedule, now = new Date()): Date | null {
  const { h, m } = parsePlanAt(rule.at);
  const w = mskWall(now);
  const atToday = fromMsk(w.y, w.mo, w.d, h, m);
  const laterToday = atToday.getTime() > now.getTime();
  if (rule.when.kind === "daily") {
    if (laterToday) return atToday;
    const nxt = shiftDays(w.y, w.mo, w.d, 1);
    return fromMsk(nxt.y, nxt.mo, nxt.d, h, m);
  }
  if (rule.when.kind === "weekly") {
    if (!rule.when.days.length) return null;
    for (let i = laterToday ? 0 : 1; i <= 7; i += 1) {
      const day = shiftDays(w.y, w.mo, w.d, i);
      if (rule.when.days.includes(day.dow)) return fromMsk(day.y, day.mo, day.d, h, m);
    }
  }
  if (rule.when.kind === "ymd") {
    if (!rule.when.date) return null;
    const [y, mo, da] = rule.when.date.split("-").map(Number);
    const d = fromMsk(y, mo, da, h, m);
    return d.getTime() >= now.getTime() ? d : null;
  }
  if (rule.when.kind === "nthWeekday") {
    const ymd = nthWeekdayDate(now, rule.when.n, rule.when.day);
    if (ymd) {
      const [y, mo, da] = ymd.split("-").map(Number);
      const d = fromMsk(y, mo, da, h, m);
      if (d.getTime() >= now.getTime()) return d;
    }
    const nextMo = w.mo === 12 ? { y: w.y + 1, mo: 1 } : { y: w.y, mo: w.mo + 1 };
    const nymd = nthWeekdayDate(fromMsk(nextMo.y, nextMo.mo, 15, 12, 0), rule.when.n, rule.when.day);
    if (!nymd) return null;
    const [y, mo, da] = nymd.split("-").map(Number);
    return fromMsk(y, mo, da, h, m);
  }
  if (rule.when.kind === "interval") {
    const nxt = intervalAfterFire(rule, now);
    if (nxt) return nxt;
    if (laterToday) return atToday;
    const day = shiftDays(w.y, w.mo, w.d, 1);
    return fromMsk(day.y, day.mo, day.d, h, m);
  }
  return null;
}

export function whenLabel(when: HistoryWhen): string {
  if (when.kind === "daily") return "каждый день";
  if (when.kind === "weekly") {
    const names = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];
    return when.days.map((d) => names[d] || "").filter(Boolean).join(", ") || "дни недели";
  }
  if (when.kind === "interval") {
    const u = when.unit === "day" ? "дн" : when.unit === "week" ? "нед" : "мес";
    return `каждые ${when.every} ${u}`;
  }
  if (when.kind === "nthWeekday") {
    const names = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];
    return when.n === -1 ? `последний ${names[when.day]} месяца` : `${when.n}-й ${names[when.day]} месяца`;
  }
  return when.date || "дата";
}

export type PlanDayHit = {
  id: string;
  at: Date;
  on: boolean;
  label: string;
  modeLabel: string;
};

/** Ближайшие дни МСК: какие слоты встанут, включая выключенные. */
export function planHorizon(plan: HistorySchedule[], days = 14, now = new Date()): { ymd: string; dow: number; hits: PlanDayHit[] }[] {
  const start = mskWall(now);
  const span: { ymd: string; dow: number }[] = [];
  const bucket = new Map<string, PlanDayHit[]>();
  for (let i = 0; i < days; i += 1) {
    const day = shiftDays(start.y, start.mo, start.d, i);
    const ymd = `${day.y}-${pad2(day.mo)}-${pad2(day.d)}`;
    span.push({ ymd, dow: day.dow });
    bucket.set(ymd, []);
  }
  const end = span.length ? fromMsk(...(() => {
    const last = span[span.length - 1];
    const [y, mo, d] = last.ymd.split("-").map(Number);
    return [y, mo, d, 23, 59] as [number, number, number, number, number];
  })()).getTime() : now.getTime();
  for (const rule of plan || []) {
    const label = rule.label || planModeMeta(rule.mode).label;
    const modeLabel = planModeMeta(rule.mode).label;
    const push = (at: Date) => {
      if (at.getTime() <= now.getTime() || at.getTime() > end) return;
      const ymd = ymdOf(at);
      const list = bucket.get(ymd);
      if (!list) return;
      if (list.some((h) => h.id === rule.id && h.at.getTime() === at.getTime())) return;
      list.push({ id: rule.id, at, on: rule.on, label, modeLabel });
    };
    if (rule.when.kind === "interval") {
      if (!rule.lastFiredAt) continue;
      let cursor = nextSlotAt(rule, now);
      const every = rule.when.every;
      const unit = rule.when.unit;
      for (let n = 0; n < 24 && cursor && cursor.getTime() <= end; n += 1) {
        push(cursor);
        cursor = addInterval(cursor, every, unit, rule.at);
      }
      continue;
    }
    const { h, m } = parsePlanAt(rule.at);
    for (const day of span) {
      const [y, mo, d] = day.ymd.split("-").map(Number);
      const at = fromMsk(y, mo, d, h, m);
      const wall = mskWall(at);
      const w = rule.when;
      let hit = false;
      if (w.kind === "daily") hit = true;
      else if (w.kind === "weekly") hit = w.days.includes(wall.dow);
      else if (w.kind === "ymd") hit = w.date === day.ymd;
      else if (w.kind === "nthWeekday") hit = nthWeekdayDate(fromMsk(y, mo, 15, 12, 0), w.n, w.day) === day.ymd;
      if (hit) push(at);
    }
  }
  return span.map((d) => ({
    ...d,
    hits: (bucket.get(d.ymd) || []).sort((a, b) => a.at.getTime() - b.at.getTime()),
  }));
}

export function emptyDraft(): Omit<HistorySchedule, "id" | "dueAt" | "lastFiredAt" | "lastJobId" | "lastSkip"> {
  return {
    on: true,
    mode: "auto",
    when: { kind: "daily" },
    at: "04:00",
    recheckDays: 7,
    dateFromId: "2015",
    study: "1",
    label: "",
    leads: true,
    archGroups: true,
  };
}

export type PlanLogLite = { at?: string; kind?: string; text?: string; jobId?: string; src?: string; who?: string; cid?: number; mode?: string };

/** Одна сессия = старт + итог с одним jobId. */
export function planLogSessions(log: PlanLogLite[], n = 10): PlanLogLite[] {
  const out: PlanLogLite[] = [];
  const seen = new Set<string>();
  for (const e of log || []) {
    if (!e || (e.kind !== "start" && e.kind !== "done" && e.kind !== "fail" && e.kind !== "stop")) continue;
    if (e.jobId && seen.has(e.jobId)) continue;
    if (e.jobId) seen.add(e.jobId);
    const pair = e.jobId
      ? (log || []).find((x) => x.jobId === e.jobId && x !== e && (x.kind === "start" || x.kind === "done" || x.kind === "fail" || x.kind === "stop"))
      : undefined;
    const start = e.kind === "start" ? e : pair && pair.kind === "start" ? pair : undefined;
    const end = e.kind !== "start" ? e : pair && pair.kind !== "start" ? pair : undefined;
    if (start && end) {
      out.push({ ...start, kind: end.kind, text: `${start.text || ""} → ${end.text || ""}`.trim() });
    } else {
      out.push(e);
    }
    if (out.length >= n) break;
  }
  return out;
}

