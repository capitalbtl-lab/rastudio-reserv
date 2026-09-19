/** Канон шага 5, редакция 48. Кассу и журнал не качает.
 * Пустая лента лида без строк = не сверка. Клиент с А и пустой лентой: 0=0=0.
 * А = payFill.full шага 4. Нет А — шапку не зовём.
 *
 * Остаток для сверки с Customer.balance (дока API: «текущий остаток, деньги», float):
 *   приходы + корректировки (±) + возвраты (вычитаются) − списания status=3 (commission).
 * Товар в ленте pay есть, в остаток клиента не входит
 * (дока ТМЦ: «Платёж „Продажа товара“ не влияет на остаток клиента»).
 * Эталон шапки — customer/index.balance, не сумма pay/index.
 */

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
  const rem = typeof removed === "string" && !removed.trim() ? Number.NaN : Number(removed);
  const st = typeof isStudy === "string" && !isStudy.trim() ? Number.NaN : Number(isStudy);
  if (isStudy == null && removed == null) return "не разобрали";
  if (rem === 1) return "не разобрали";
  if (rem === 2 || st === 2) return "архив";
  if (st === 0) return "лид";
  if (st === 1) return "клиент";
  return "не разобрали";
}

export function step5RoleDefined(isStudy: unknown, removed: unknown) {
  return step5Role(isStudy, removed) !== "не разобрали";
}

/** Пустая строка — не 0 (лид). Number("") === 0 ломает роль. */
export function step5StudyNum(raw: unknown): number {
  if (raw == null) return Number.NaN;
  if (typeof raw === "string" && !raw.trim()) return Number.NaN;
  const n = Number(raw);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Нет поля / пусто = не в архиве (0). В Alfa архив — removed=2. */
export function step5RemovedNum(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === "string" && !raw.trim()) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Остаток сайта для сверки с шапкой: лента без товара − списания. Товар не вычитаем. */
export function step5RemainderFormula(cashLessons: number, writeoff: number) {
  return (Number(cashLessons) || 0) - (Number(writeoff) || 0);
}

/** ±1 ₽ или одно число в копейках (ровно ×100) к рублям шапки. */
export function step5Close(a: number, b: number) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (Math.abs(a - b) <= 1) return true;
  const hi = Math.max(Math.abs(a), Math.abs(b));
  const lo = Math.min(Math.abs(a), Math.abs(b));
  if (lo < 0.005) return false;
  return Math.abs(hi / lo - 100) <= 0.02;
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
  const role = step5Role(p.isStudy, p.removed);
  if (role === "не разобрали") return false;
  if (!p.payFilled) return false;
  if (role === "клиент") return true;
  if (role === "лид") return (Number(p.livePays) || 0) > 0;
  if (role === "архив") return Boolean(p.inArchiveSet);
  return false;
}

export function step5SkipNote(p: {
  livePays: number;
  isStudy: unknown;
  removed: unknown;
  inArchiveSet: boolean;
  payFilled?: boolean;
}) {
  const role = step5Role(p.isStudy, p.removed);
  if (role === "не разобрали") return "нет роли на досье, шапку не зовём";
  if (role === "архив" && !p.inArchiveSet) return "не в наборе шага 2, не сверяем";
  if (role === "лид" && (Number(p.livePays) || 0) < 1) return "кассы нет, не сверяем";
  if (p.payFilled === false) return "кассы нет / нет А";
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
  const cashNewer = step5Newer(p.cashDate, p.headerAt);
  const goodsOn = Number.isFinite(cashA) && Number.isFinite(cashL) && Math.abs(cashA - cashL) > 1;
  const close = step5Close(site, header);
  const c = !p.orphan && !p.alien && close;
  if (c && !cashNewer) return { main: "", tail: goodsOn ? (["product"] as Step5Reason[]) : [], c: true };
  const extraN = Number(p.extraN) || 0;
  const holeN = Number(p.holeN) || 0;
  const gap = !close;
  const flags: { k: Step5Reason; on: boolean }[] = [
    { k: "header-stale", on: cashNewer },
    { k: "product", on: goodsOn },
    { k: "orphan-type", on: Boolean(p.orphan) },
    { k: "alien-branch", on: Boolean(p.alien) },
    { k: "correct-only", on: gap && Number.isFinite(p.dSiteWithout6) && Math.abs(Number(p.dSiteWithout6)) <= 1 },
    { k: "refund", on: gap && Number.isFinite(p.dSiteWithoutRefund) && Math.abs(Number(p.dSiteWithoutRefund)) <= 1 },
    { k: "extra-lessons", on: gap && extraN > 0 && dSite < -1 },
    { k: "missing-income", on: gap && extraN === 0 && dCash < -1 && dSite < -1 },
    { k: "thin-writeoff", on: gap && extraN === 0 && holeN === 0 && dCash > 1 && dSite > 1 },
    { k: "writeoff-gap", on: gap && extraN === 0 && holeN === 0 && Math.abs(dCash) <= 1 },
    { k: "mismatch", on: gap },
  ];
  const on = flags.filter((x) => x.on).map((x) => x.k);
  if (on.includes("mismatch") && on.some((k) => k !== "mismatch")) {
    const i = on.indexOf("mismatch");
    if (i >= 0) on.splice(i, 1);
  }
  const goods = on.includes("product");
  const rest = on.filter((k) => k !== "product");
  return { main: rest[0] || "", tail: [...(goods ? (["product"] as Step5Reason[]) : []), ...rest.slice(1)], c };
}

export function step5ChipMoreLess(main: Step5Reason, dSite: number) {
  if (!main || main === "product" || main === "orphan-type" || main === "alien-branch") {
    return { more: false, less: false };
  }
  return { more: dSite > 1, less: dSite < -1 };
}
