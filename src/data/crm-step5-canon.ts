/** Канон шага 5, редакция 44. Кассу и журнал не качает. */

export type Step5Role = "лид" | "клиент" | "архив" | "не разобрали";

export function sameCustomerId(a: unknown, b: unknown) {
  const x = Number(a);
  const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) && x > 0 && x === y;
}

export function step5Money(raw: unknown): { ok: boolean; n: number } {
  if (typeof raw === "number" && Number.isFinite(raw)) return { ok: true, n: raw };
  if (typeof raw !== "string") return { ok: false, n: 0 };
  const s = raw.trim();
  if (!s) return { ok: true, n: 0 };
  if (/[\u20BD,eE]/.test(s) || /\s/.test(s)) return { ok: false, n: 0 };
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, n: 0 };
  return { ok: true, n };
}

export function step5FlagFalse(raw: unknown) {
  if (raw == null) return true;
  if (raw === false || raw === 0) return true;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (!s || s === "0" || s === "false") return true;
  }
  return false;
}

export function step5FlagTrue(raw: unknown) {
  if (raw === true || raw === 1) return true;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (s === "1" || s === "true") return true;
    if (s && !step5FlagFalse(raw)) return true;
  }
  if (raw != null && typeof raw !== "string" && !step5FlagFalse(raw) && raw !== false && raw !== 0) return true;
  return false;
}

export function step5MoscowDay(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

export function step5Ymd(raw: unknown): string {
  const s = String(raw ?? "").trim();
  const head = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head;
  return "";
}

export function step5Role(isStudy: unknown, removed: unknown): Step5Role {
  const rem = Number(removed);
  const st = Number(isStudy);
  if (rem === 1) return "не разобрали";
  if (rem === 2 || st === 2) return "архив";
  if (st === 0) return "лид";
  if (st === 1) return "клиент";
  return "не разобрали";
}

export function step5RoleDefined(isStudy: unknown, removed: unknown) {
  return step5Role(isStudy, removed) !== "не разобрали";
}

export function step5CanSverka(p: {
  hasDossier: boolean;
  payFilled: boolean;
  livePays: number;
  isStudy: unknown;
  removed: unknown;
  inArchiveSet: boolean;
}) {
  if (!p.hasDossier) return false;
  if (!p.payFilled) return false;
  if ((Number(p.livePays) || 0) < 1) return false;
  const rem = Number(p.removed);
  const st = Number(p.isStudy);
  if (rem === 1) return false;
  if (st === 1 && rem === 0) return true;
  if (st === 0 && rem === 0) return true;
  if (st === 0 && rem === 2) return true;
  if (st === 1 && rem === 2 && p.inArchiveSet) return true;
  if (st === 2 && p.inArchiveSet) return true;
  return false;
}

export function step5SkipNote(p: {
  livePays: number;
  isStudy: unknown;
  removed: unknown;
  inArchiveSet: boolean;
}) {
  if ((Number(p.livePays) || 0) < 1) return "кассы нет, не сверяем";
  if (Number(p.removed) === 1) return "не разобрали";
  const st = Number(p.isStudy);
  const rem = Number(p.removed);
  if ((st === 1 && rem === 2 && !p.inArchiveSet) || (st === 2 && !p.inArchiveSet)) {
    return "не в наборе шага 2, не сверяем";
  }
  return "";
}

export function step5AuditGapMs(opts: { recheck?: boolean; staleHeader?: boolean; periodDays?: number }) {
  if (opts.recheck && opts.staleHeader) {
    const n = Number(opts.periodDays) || 0;
    if (n > 0 && n <= 14) return 2000;
    if (n === 32 || (n > 14 && n < 60)) return 2500;
    if (n === 92 || (n >= 60 && n < 140)) return 3000;
    if (n === 182 || (n >= 140 && n < 300)) return 4000;
    return 5000;
  }
  return 5000;
}

function moneyAsHeader(raw: unknown): { ok: boolean; header: number } {
  const m = step5Money(raw);
  return { ok: m.ok, header: m.n };
}

export function parseAlfaHeaderCanon(customer: Record<string, unknown> | null | undefined): { ok: boolean; header: number } {
  if (!customer) return { ok: false, header: 0 };
  if (!Object.prototype.hasOwnProperty.call(customer, "balance")) return { ok: false, header: 0 };
  const raw = customer.balance;
  if (raw == null) return { ok: false, header: 0 };
  if (typeof raw === "number" || typeof raw === "string") return moneyAsHeader(raw);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const vals = Object.values(raw as Record<string, unknown>);
    if (vals.length !== 1) return { ok: false, header: 0 };
    return moneyAsHeader(vals[0]);
  }
  return { ok: false, header: 0 };
}

export function paidLessonCountOf(customer: Record<string, unknown> | null | undefined): number | null {
  if (!customer || !Object.prototype.hasOwnProperty.call(customer, "paid_lesson_count")) return null;
  const n = Number(customer.paid_lesson_count);
  if (!Number.isFinite(n) || n % 1 !== 0) return null;
  return n;
}

export function step5HasH(header: unknown, headerAt: unknown) {
  return step5Money(header).ok && Boolean(step5Ymd(headerAt));
}

export function step5Newer(left: unknown, right: unknown) {
  const a = step5Ymd(left);
  const b = step5Ymd(right);
  return Boolean(a && b && a > b);
}

export type Step5Reason =
  | ""
  | "header-stale"
  | "product"
  | "orphan-type"
  | "alien-branch"
  | "correct-only"
  | "refund"
  | "extra-lessons"
  | "missing-income"
  | "thin-writeoff"
  | "writeoff-gap"
  | "mismatch";

export function step5Reasons(p: {
  sverka: boolean;
  hasH: boolean;
  pending: boolean;
  formulaSite?: number;
  header?: number;
  cashLessons?: number;
  cashAll?: number;
  cashDate?: string;
  headerAt?: string;
  orphan?: boolean;
  alien?: boolean;
  extraN?: number;
  holeN?: number;
  dSiteWithout6?: number;
  dSiteWithoutRefund?: number;
}): { main: Step5Reason; tail: Step5Reason[]; c: boolean } {
  const formulaOk = Number.isFinite(p.formulaSite);
  if (!p.sverka || !p.hasH || p.pending || !formulaOk) return { main: "", tail: [], c: false };
  const header = Number(p.header);
  const site = Number(p.formulaSite);
  const dSite = site - header;
  const cashL = Number(p.cashLessons);
  const cashA = Number(p.cashAll);
  const dCash = cashL - header;
  const dAll = cashA - header;
  const cashNewer = step5Newer(p.cashDate, p.headerAt);
  const c = !p.orphan && !p.alien && Math.abs(dSite) <= 1;
  if (c && !cashNewer) return { main: "", tail: [], c: true };
  const extraN = Number(p.extraN) || 0;
  const holeN = Number(p.holeN) || 0;
  const flags: { k: Step5Reason; on: boolean }[] = [
    { k: "header-stale", on: cashNewer },
    { k: "product", on: Math.abs(dAll) <= 1 && Math.abs(dSite) > 1 },
    { k: "orphan-type", on: Boolean(p.orphan) },
    { k: "alien-branch", on: Boolean(p.alien) },
    { k: "correct-only", on: Math.abs(dSite) > 1 && Number.isFinite(p.dSiteWithout6) && Math.abs(Number(p.dSiteWithout6)) <= 1 },
    { k: "refund", on: Math.abs(dSite) > 1 && Number.isFinite(p.dSiteWithoutRefund) && Math.abs(Number(p.dSiteWithoutRefund)) <= 1 },
    { k: "extra-lessons", on: extraN > 0 && dSite < -1 },
    { k: "missing-income", on: extraN === 0 && dCash < -1 && dSite < -1 },
    { k: "thin-writeoff", on: extraN === 0 && holeN === 0 && dCash > 1 && dSite > 1 },
    { k: "writeoff-gap", on: extraN === 0 && holeN === 0 && Math.abs(dCash) <= 1 && Math.abs(dSite) > 1 },
    { k: "mismatch", on: Math.abs(dSite) > 1 },
  ];
  const on = flags.filter((x) => x.on).map((x) => x.k);
  if (on.includes("mismatch") && on.some((k) => k !== "mismatch")) {
    const i = on.indexOf("mismatch");
    if (i >= 0) on.splice(i, 1);
  }
  return { main: on[0] || "", tail: on.slice(1), c };
}

export function step5ChipMoreLess(main: Step5Reason, dSite: number) {
  if (!main || main === "product" || main === "orphan-type" || main === "alien-branch") {
    return { more: false, less: false };
  }
  return { more: dSite > 1, less: dSite < -1 };
}
