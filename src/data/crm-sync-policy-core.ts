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

/** Шаг 6 в трубе: колонки, затем касса. Пересчёт лидов — те же колонки, второй раз не идёт. */
export const STEP6_PIPE = ["step6-recount", "step6-columns", "step6-cash"] as const;
/** Шаг 7: список архива без живых групп, затем та же касса. */
export const STEP7_PIPE = ["step7-list", "step7-cash"] as const;

/** Выбор шагов. Полный 1–5 без 6, 7 и хвоста шага 6 остаётся прежней трубой. */
export function pipeFromSelection(
  steps: number[],
  also: string[],
  opts: { study: "1" | "2"; archGroups: boolean },
): { mode: string; pipe: string[] } {
  const want = [1, 2, 3, 4, 5].filter((n) => steps.includes(n));
  const six = steps.includes(6);
  const seven = steps.includes(7);
  const alsoTail = STEP6_PIPE.filter((id) => also.includes(id) && !(id === "step6-recount" && (also.includes("step6-columns") || six)));
  const sixTail = six ? (["step6-columns", "step6-cash"] as const) : [];
  const tail = [...sixTail, ...alsoTail.filter((id) => !(sixTail as readonly string[]).includes(id))];
  const sevenAlso = (["step7-list", "step7-cash"] as const).filter((id) => also.includes(id));
  const sevenTail = seven ? [...STEP7_PIPE] : [...sevenAlso];
  const full = want.length === 5 && !tail.length && !sevenTail.length;
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
  const all = [...modes, ...tail, ...sevenTail];
  if (!all.length) return { mode: "", pipe: [] };
  return { mode: all[0], pipe: all.slice(1) };
}

/** Токен трубы → режим очереди. Касса — это people с kind balance, не отдельный mode. */
export function journalStartOf(token: string): { mode: string; kind: string; recheck: boolean } {
  if (token === "balance") return { mode: "people", kind: "balance", recheck: true };
  if (token === "groups" || token === "groups-recheck" || token === "groups-archived") return { mode: "groups-recheck", kind: "group", recheck: true };
  if (token === "people" || token === "people-recheck") return { mode: "people-recheck", kind: "students", recheck: true };
  if (token === "people-slow") return { mode: "people-slow", kind: "students", recheck: false };
  if (token === "audit") return { mode: "audit", kind: "audit", recheck: false };
  if (token === "roster" || token === "roster-recheck") return { mode: "roster-recheck", kind: "roster", recheck: true };
  if (token === "archivesPupils" || token === "archives") return { mode: token, kind: token, recheck: false };
  if (token === "catalog") return { mode: "catalog", kind: "archiveCatalog", recheck: false };
  if (token === "step6-recount" || token === "step6-columns" || token === "step6-cash") return { mode: token, kind: "students", recheck: false };
  if (token === "step7-list" || token === "step7-cash") return { mode: token, kind: "students", recheck: false };
  return { mode: token || "roster-recheck", kind: "students", recheck: false };
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
  templateId?: string;
  depth?: CheckDepth;
  dueAt: string;
  lastFiredAt: string;
  lastJobId: string;
  lastSkip: string;
};

export type CheckAudience = "one" | "live" | "leads-in" | "leads-out" | "arch-in" | "arch-out";
export type CheckDepth = "recheck" | "full";

export type CheckTemplate = {
  id: string;
  num: number;
  seed: string;
  name: string;
  meaning: string;
  audience: CheckAudience[];
  steps: number[];
  also: string[];
  dateFromId: PlanFromId;
  depth: CheckDepth;
  cid: number;
  on: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CrmSyncPolicy = {
  planEnabled: boolean;
  plan: HistorySchedule[];
  templates: CheckTemplate[];
};

export const POLICY_FACTORY: CrmSyncPolicy = { planEnabled: false, plan: [], templates: [] };

const CHECK_AUDIENCE = new Set<CheckAudience>(["one", "live", "leads-in", "leads-out", "arch-in", "arch-out"]);
const CHECK_ALSO = new Set<string>([...STEP6_PIPE, "step7-list", "step7-cash"]);

export const CHECK_SEEDS: CheckTemplate[] = [
  {
    id: "chk_seed_night",
    num: 1,
    seed: "night",
    name: "Ночная сверка ходящих",
    meaning: "Ночью дописать состав, календарь и кассу тех, кто сейчас в группах, и сверить шапку. Не архив и не лиды без группы.",
    audience: ["live"],
    steps: [1, 2, 3, 4, 5],
    also: [],
    dateFromId: "1",
    depth: "recheck",
    cid: 0,
    on: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "chk_seed_one_year",
    num: 2,
    seed: "one-year",
    name: "Один ученик, календарь за год",
    meaning: "Занятие не видно в карточке. Дописать недостающие уроки этого номера за год. Кассу, лидов и архив не трогает.",
    audience: ["one"],
    steps: [2],
    also: [],
    dateFromId: "1",
    depth: "recheck",
    cid: 0,
    on: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "chk_seed_lead_out",
    num: 3,
    seed: "lead-out",
    name: "Лид без группы",
    meaning: "Лид и ни в одной живой группе. Прочитать колонку и сверить кассу на шаге 6. Шаги 1–5 ему не положены.",
    audience: ["leads-out"],
    steps: [],
    also: ["step6-columns", "step6-cash"],
    dateFromId: "1",
    depth: "recheck",
    cid: 0,
    on: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "chk_seed_arch_out",
    num: 4,
    seed: "arch-out",
    name: "Архив, уже не ходит",
    meaning: "Карточка в архиве и в живой группе её нет. Прочитать архив и сверить кассу шага 7. Тех, кто архивный, но ещё ходит, сюда не брать.",
    audience: ["arch-out"],
    steps: [],
    also: ["step7-list", "step7-cash"],
    dateFromId: "1",
    depth: "recheck",
    cid: 0,
    on: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "chk_seed_arch_in",
    num: 5,
    seed: "arch-in",
    name: "Архивный, но ещё ходит",
    meaning: "В Alfa архив, а состав живой группы его ещё держит. Состав и календарь как у ходящих. Шаг 7 не открывать.",
    audience: ["arch-in"],
    steps: [1, 2, 3, 4, 5],
    also: [],
    dateFromId: "1",
    depth: "recheck",
    cid: 0,
    on: true,
    createdAt: "",
    updatedAt: "",
  },
];

export function checkBand(audience: CheckAudience[]): "walk" | "lead" | "arch" | "mix" | "empty" {
  const a = new Set(audience);
  if (!a.size) return "empty";
  const walk = a.has("one") || a.has("live") || a.has("leads-in") || a.has("arch-in");
  const lead = a.has("leads-out");
  const arch = a.has("arch-out");
  const n = Number(walk) + Number(lead) + Number(arch);
  if (n > 1) return "mix";
  if (lead) return "lead";
  if (arch) return "arch";
  return "walk";
}

/** Серое «почему». Пустая строка — шаг можно включить. */
export function checkStepWhy(audience: CheckAudience[], step: number): string {
  const band = checkBand(audience);
  if (band === "empty") return "Сначала отметьте, кого проверять.";
  if (band === "mix") return "Это разные проверки. Снимите лишнюю галку или сделайте два шаблона.";
  const onlyOne = audience.length === 1 && audience[0] === "one";
  if (step === 1 || step === 3) {
    if (band !== "walk") return step === 1 ? "Состав — для тех, кто в группе." : "Занятия групп — для тех, кто в группе.";
    if (onlyOne) return "Состав и занятия групп не запускаются по одному человеку. Отметьте «Сейчас ходят».";
    return "";
  }
  if (step === 2 || step === 4 || step === 5) {
    if (band !== "walk") return "Это шаг ходящих, не лидов без группы и не архива вне групп.";
    return "";
  }
  if (step === 6) {
    if (band === "arch") return "Это не лиды. Для архива вне групп — шаг 7.";
    if (band === "walk" && !audience.includes("leads-in") && !audience.includes("leads-out") && !onlyOne) return "Это не лиды.";
    if (onlyOne) return "";
    if (band === "lead" || audience.includes("leads-in") || audience.includes("one")) return "";
    return "Это не лиды.";
  }
  if (band !== "arch") return "Шаг 7 — только архив не в группах.";
  return "";
}

export const CHECK_STEP_LABEL: Record<number, string> = {
  1: "Состав групп",
  2: "Календарь человека",
  3: "Занятия групп",
  4: "Касса на диск",
  5: "Сверка остатка",
};

export const CHECK_ALSO_LABEL: Record<string, string> = {
  "step6-recount": "Пересчёт лидов",
  "step6-columns": "Колонки лидов",
  "step6-cash": "Касса лида",
  "step7-list": "Прочитать архив",
  "step7-cash": "Касса архива",
};

export const CHECK_WHO_LABEL: Record<CheckAudience, string> = {
  one: "Один человек",
  live: "Сейчас ходят",
  "leads-in": "Лиды в действующих группах",
  "leads-out": "Лиды без группы",
  "arch-in": "Архив, но ещё в группе",
  "arch-out": "Архив не в группах",
};

/** Красная загрузка: режим без «-recheck». Синяя труба ночи этот список не получает. */
export function redModeOf(mode: string): string {
  if (mode === "roster-recheck") return "roster";
  if (mode === "people-recheck") return "people";
  if (mode === "groups-recheck") return "groups";
  return mode;
}

export const DEPTH_PIPE = "depth=full";

const JOB_ALSO = ["step6-recount", "step6-columns", "step6-cash", "step7-list", "step7-cash"] as const;

function jobAlso(ids: string[] | undefined, drop = "") {
  return (ids || []).filter((id) => id !== drop && (JOB_ALSO as readonly string[]).includes(id));
}

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
    steps: Array.isArray(r.steps) ? [...new Set(r.steps.map((n) => Number(n)).filter((n) => n >= 1 && n <= 7))].sort((a, b) => a - b) : undefined,
    also: Array.isArray(r.also) ? [...STEP6_PIPE, "step7-list", "step7-cash"].filter((id) => (r.also as unknown[]).includes(id)) : undefined,
    templateId: String(r.templateId || "").trim(),
    depth: r.depth === "full" ? "full" : undefined,
    dueAt: String(r.dueAt || ""),
    lastFiredAt: String(r.lastFiredAt || ""),
    lastJobId: String(r.lastJobId || ""),
    lastSkip: String(r.lastSkip || ""),
  };
}

export function templateOf(raw: unknown, fallbackNum = 0): CheckTemplate | null {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const id = String(r.id || "").trim();
  if (!id) return null;
  const meaning = String(r.meaning || "").trim().slice(0, 500);
  const audience = Array.isArray(r.audience)
    ? [...new Set(r.audience.map((x) => String(x)).filter((x): x is CheckAudience => CHECK_AUDIENCE.has(x as CheckAudience)))]
    : [];
  const steps = Array.isArray(r.steps) ? [...new Set(r.steps.map((n) => Number(n)).filter((n) => n >= 1 && n <= 5))].sort((a, b) => a - b) : [];
  const also = Array.isArray(r.also) ? [...CHECK_ALSO].filter((x) => (r.also as unknown[]).includes(x)) : [];
  const from = PLAN_FROM_OPTS.some((o) => o.id === r.dateFromId) ? (r.dateFromId as PlanFromId) : "1";
  return {
    id,
    num: Math.max(0, Number(r.num) || fallbackNum),
    seed: String(r.seed || "").trim(),
    name: String(r.name || "").trim().slice(0, 80) || "Проверка",
    meaning,
    audience,
    steps,
    also,
    dateFromId: from,
    depth: r.depth === "full" ? "full" : "recheck",
    cid: Math.max(0, Number(r.cid) || 0),
    on: r.on !== false,
    createdAt: String(r.createdAt || ""),
    updatedAt: String(r.updatedAt || ""),
  };
}

export function templatesOf(raw: unknown): CheckTemplate[] {
  if (!Array.isArray(raw)) return CHECK_SEEDS.map((s) => ({ ...s }));
  const out: CheckTemplate[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const t = templateOf(row, out.length + 1);
    if (!t || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
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
    templates: templatesOf(r.templates),
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
  for (const t of p.templates || []) {
    if (!String(t.meaning || "").trim()) return { ok: false, error: "У шаблона нет пояснения, когда его применять." };
    if (checkBand(t.audience) === "mix") return { ok: false, error: "В шаблоне смешаны разные проверки." };
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

export function checkCode(num: number) {
  return `Ш-${String(Math.max(0, num)).padStart(4, "0")}`;
}

export function nextCheckNum(templates: CheckTemplate[]) {
  return templates.reduce((m, t) => Math.max(m, Number(t.num) || 0), 0) + 1;
}

/** Поля ночного слота и ручного запуска. Шаги 6 и 7 — только в also, не номером. */
export function checkRunFields(t: Pick<CheckTemplate, "audience" | "steps" | "also">) {
  const onlyOne = t.audience.length === 1 && t.audience[0] === "one";
  const steps = (t.steps || []).filter((n) => n >= 1 && n <= 5 && !checkStepWhy(t.audience, n));
  const also = (t.also || []).filter((id) => {
    if (id.startsWith("step7")) return !checkStepWhy(t.audience, 7);
    if (id.startsWith("step6")) return !checkStepWhy(t.audience, 6);
    return false;
  });
  return {
    study: "1" as const,
    leads: t.audience.includes("live") || t.audience.includes("leads-in"),
    archGroups: t.audience.includes("arch-in"),
    steps,
    also,
    one: onlyOne,
  };
}

export function applyTemplateToSlots(plan: HistorySchedule[], t: CheckTemplate): HistorySchedule[] {
  const f = checkRunFields(t);
  return plan.map((s) => {
    if (s.templateId !== t.id) return s;
    return {
      ...s,
      mode: "auto",
      study: f.study,
      leads: f.leads,
      archGroups: f.archGroups,
      steps: f.steps,
      also: f.also,
      dateFromId: t.dateFromId,
      depth: t.depth,
      label: t.name.slice(0, 80),
      recheckDays: planFromIdToRecheckDays(t.dateFromId),
    };
  });
}

export function packCheckName(p: {
  person?: string;
  leads: boolean;
  archGroups: boolean;
  steps: number[];
  also: string[];
  depth: CheckDepth;
  templateId?: string;
  meaning?: string;
  who?: string;
  window?: string;
}) {
  const flags = [
    `leads=${p.leads ? 1 : 0}`,
    `archGroups=${p.archGroups ? 1 : 0}`,
    `steps=${p.steps.join(",")}`,
    `also=${p.also.join(",")}`,
    `depth=${p.depth === "full" ? "full" : "recheck"}`,
    p.templateId ? `tpl=${encodeURIComponent(p.templateId)}` : "",
    p.meaning ? `mean=${encodeURIComponent(p.meaning).slice(0, 700)}` : "",
    p.who ? `who=${encodeURIComponent(p.who)}` : "",
    p.window ? `win=${encodeURIComponent(p.window)}` : "",
  ]
    .filter(Boolean)
    .join("&");
  const person = String(p.person || "").replace(/&/g, " ").trim();
  return person ? `${person}&${flags}` : flags;
}

export function planRunText(name: string) {
  const raw = String(name || "");
  if (!/(?:^|&)tpl=/.test(raw)) return "";
  const pick = (k: string) => {
    const m = raw.match(new RegExp(`(?:^|&)${k}=([^&]*)`));
    if (!m) return "";
    try {
      return decodeURIComponent(m[1].replace(/\+/g, " ")).trim();
    } catch {
      return m[1].trim();
    }
  };
  const depth = /(?:^|&)depth=full(?:&|$)/.test(raw) ? "только пустые" : "перепроверить";
  return [pick("tpl"), pick("mean"), pick("who"), pick("win") ? `окно ${pick("win")}` : "", depth]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 180);
}

export function planRuleToJob(rule: HistorySchedule, now = new Date()) {
  return finishDepth(rule, planRuleBody(now, rule));
}

function finishDepth<T extends { mode: string; recheck: boolean; pipe: readonly string[] }>(rule: HistorySchedule, job: T): T {
  if (rule.depth !== "full") return job;
  const pipe = job.pipe.filter((id) => id !== DEPTH_PIPE);
  return {
    ...job,
    mode: redModeOf(job.mode) as T["mode"],
    recheck: false,
    pipe: [...pipe, DEPTH_PIPE] as unknown as T["pipe"],
  };
}

function planRuleBody(now: Date, rule: HistorySchedule) {
  const fromId = planFromIdOf(rule.study, rule.dateFromId);
  if (rule.mode === "auto") {
    const custom = Array.isArray(rule.steps);
    const also = jobAlso(rule.also);
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
    if (!built.mode) {
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
    const head = journalStartOf(built.mode);
    return {
      mode: head.mode as HistoryPlanMode,
      kind: head.kind,
      study: rule.study,
      recheck: head.recheck,
      recheckDays: planFromIdToRecheckDays(fromId),
      dateFrom: planDateFrom(fromId, now),
      archived: rule.study === "2",
      pipe: built.pipe as HistoryPlanMode[],
      skipLeads: Boolean(rule.study === "1" && rule.leads === false),
    };
  }
  if (rule.mode === "step6-recount" || rule.mode === "step6-columns" || rule.mode === "step6-cash") {
    const nums = rule.steps || [];
    const also = jobAlso(rule.also, rule.mode);
    if (!nums.length) {
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
    const built = pipeFromSelection(nums, [rule.mode, ...also], { study: rule.study, archGroups: rule.archGroups !== false });
    const head = journalStartOf(built.mode);
    return {
      mode: head.mode as HistoryPlanMode,
      kind: head.kind,
      study: rule.study,
      recheck: head.recheck,
      recheckDays: planFromIdToRecheckDays(fromId),
      dateFrom: planDateFrom(fromId, now),
      archived: rule.study === "2",
      pipe: built.pipe as HistoryPlanMode[],
      skipLeads: Boolean(rule.study === "1" && rule.leads === false),
    };
  }
  const meta = planModeMeta(rule.mode);
  const balance = rule.mode === "balance";
  const needFrom = rule.mode === "people" || rule.mode === "people-slow" || rule.mode === "balance";
  const earlier = (rule.steps || []).some((n) => ownStep(rule.mode) > 0 && n < ownStep(rule.mode));
  if (earlier) {
    const built = pipeFromSelection(rule.steps || [], rule.also || [], { study: rule.study, archGroups: rule.archGroups !== false });
    const head = journalStartOf(built.mode);
    return {
      mode: head.mode as HistoryPlanMode,
      kind: head.kind,
      study: rule.study,
      recheck: head.recheck,
      recheckDays: meta.recheck ? rule.recheckDays : 32,
      dateFrom: needFrom || head.kind === "students" || head.kind === "balance" || head.kind === "roster" ? planDateFrom(fromId, now) : "",
      archived: rule.study === "2",
      pipe: built.pipe as HistoryPlanMode[],
    };
  }
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
  const due = policy.plan
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => {
      if (!r.on || !r.dueAt) return false;
      if (r.lastSkip === "pipe") {
        const t = Date.parse(r.lastFiredAt || r.dueAt);
        if (Number.isFinite(t) && now.getTime() - t < 20 * 60 * 1000) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const ta = parsePlanAt(a.r.at);
      const tb = parsePlanAt(b.r.at);
      const da = ta.h * 60 + ta.m;
      const db = tb.h * 60 + tb.m;
      if (da !== db) return da - db;
      return a.i - b.i;
    });
  return due[0]?.r || null;
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
    templates: disk.templates || [],
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
    templates: incoming.templates || disk.templates || [],
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
        prev.depth === s.depth &&
        prev.templateId === s.templateId &&
        JSON.stringify(prev.steps || []) === JSON.stringify(s.steps || []) &&
        JSON.stringify(prev.also || []) === JSON.stringify(s.also || []) &&
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

