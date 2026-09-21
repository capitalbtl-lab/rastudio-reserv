/** Канон шага 5, редакция 50. Кассу и журнал не качает.
 * Пустая лента при А = нули, не «кассы нет». Лид и клиент с А: 0=0=0, шапку зовём.
 * Нет А — шапку не зовём. А = payFill.full шага 4.
 *
 * Остаток для сверки с Customer.balance (дока API: «текущий остаток, деньги», float):
 *   приходы + корректировки (±) + возвраты (вычитаются) − списания status=3 (commission)
 *   − долг за урок (проведён, был, явный 0, нет абонемента; цена с последней > 0 / тарифа).
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

/** Остаток к шапке: платежи+корректировки − списания − товар. Товар в ленте есть, в Customer.balance уходит в минус. */
export function step5RemainderFormula(cashLessons: number, writeoff: number, goods = 0) {
  return (Number(cashLessons) || 0) - (Number(writeoff) || 0) - Math.abs(Number(goods) || 0);
}

/**
 * Дока ТМЦ: продажа товара на Customer.balance не влияет.
 * Живая шапка иногда уже минусует часть товара (старые наборы / поездки).
 * Берём товар в формулу только если без него шапка не сходится.
 */
export function step5FitRemainder(
  cashLessons: number,
  writeoff: number,
  goodsAmounts: number[] | number = 0,
  header?: number,
) {
  const lessons = (Number(cashLessons) || 0) - (Number(writeoff) || 0);
  const amounts = Array.isArray(goodsAmounts)
    ? goodsAmounts.map((x) => Math.abs(Number(x) || 0)).filter((x) => x > 0)
    : Math.abs(Number(goodsAmounts) || 0) > 0
      ? [Math.abs(Number(goodsAmounts) || 0)]
      : [];
  const total = amounts.reduce((s, a) => s + a, 0);
  if (!total) return { n: lessons, goods: 0 };
  const h = Number(header);
  if (!Number.isFinite(h)) return { n: lessons - total, goods: total };
  if (step5Close(lessons, h)) return { n: lessons, goods: 0 };
  if (step5Close(lessons - total, h)) return { n: lessons - total, goods: total };
  let sub = 0;
  for (const a of [...amounts].sort((x, y) => y - x)) {
    const cur = lessons - sub;
    const next = cur - a;
    if (Math.abs(next - h) + 1e-9 < Math.abs(cur - h)) {
      sub += a;
      if (step5Close(lessons - sub, h)) break;
    }
  }
  return { n: lessons - sub, goods: sub };
}

/** Долг в списание только если формула выше шапки. Глеба (формула ниже) не добивать. */
export function step5ApplyDebts(
  base: { n: number; k: number },
  debts: number[],
  cashLessons: number,
  goodsAmounts: number[] | number,
  header: number,
) {
  let n = Number(base.n) || 0;
  let k = Number(base.k) || 0;
  const cash = Number(cashLessons);
  const h = Number(header);
  if (!Number.isFinite(cash) || !Number.isFinite(h)) return { n, k };
  for (const price of debts) {
    const add = Number(price) || 0;
    if (!(add > 0)) continue;
    const cur = step5FitRemainder(cash, n, goodsAmounts, h);
    if (!(cur.n - h > 1)) break;
    const next = step5FitRemainder(cash, n + add, goodsAmounts, h);
    if (Math.abs(next.n - h) + 1e-9 <= Math.abs(cur.n - h)) {
      n += add;
      k += 1;
    }
  }
  return { n, k };
}

/** Живой journal ближе к шапке — берём его сумму списаний, не диск. */
export function step5PickWriteoff(
  disk: { n: number; k: number },
  peek: { ok?: boolean; n?: number; k?: number } | null | undefined,
  cashLessons: number,
  goodsAmounts: number[] | number,
  header: number,
) {
  const base = { n: Number(disk.n) || 0, k: Number(disk.k) || 0 };
  if (!peek?.ok || !Number.isFinite(Number(peek.n))) return base;
  const h = Number(header);
  const cash = Number(cashLessons);
  if (!Number.isFinite(h) || !Number.isFinite(cash)) return base;
  const peekN = Number(peek.n) || 0;
  const diskFit = step5FitRemainder(cash, base.n, goodsAmounts, h);
  const peekFit = step5FitRemainder(cash, peekN, goodsAmounts, h);
  if (Math.abs(peekFit.n - h) + 1e-9 < Math.abs(diskFit.n - h)) {
    return { n: peekN, k: Number(peek.k) || base.k };
  }
  return base;
}

/** ±1 ₽ или диск в копейках к рублям шапки (×100). 10000 против 100 — не то. */
export function step5Close(a: number, b: number) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (Math.abs(a - b) <= 1) return true;
  const hi = Math.max(Math.abs(a), Math.abs(b));
  const lo = Math.min(Math.abs(a), Math.abs(b));
  if (lo < 0.005) return false;
  if (Math.abs(hi / lo - 100) > 0.02) return false;
  const frac = Math.abs(lo - Math.round(lo));
  return frac > 0.001 || lo < 100;
}

export function step5UnitScale(disk: number, header: number) {
  if (!step5Close(disk, header) || Math.abs(disk - header) <= 1) return 1;
  return Math.abs(disk) > Math.abs(header) ? 100 : 1;
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
  if (role === "клиент" || role === "лид") return true;
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
  if (p.payFilled === false) return "кассы нет / нет А";
  return "";
}

/** Старый затвор «кассы нет, не сверяем» при нулях — уже загружена пустая лента. */
export function step5ReviveEmptySkip(p: { codes?: string[]; extra?: string; clients?: number; cash?: number }) {
  if (!(p.codes || []).includes("нет сверки")) return false;
  if (!/кассы нет, не сверяем/.test(String(p.extra || ""))) return false;
  const z = (n: unknown) => !Number.isFinite(Number(n)) || Math.abs(Number(n)) <= 1;
  return z(p.clients) && z(p.cash);
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
  hasCorrect?: boolean;
  hasRefund?: boolean;
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
    { k: "correct-only", on: Boolean(p.hasCorrect) && gap && Number.isFinite(p.dSiteWithout6) && Math.abs(Number(p.dSiteWithout6)) <= 1 },
    { k: "refund", on: Boolean(p.hasRefund) && gap && Number.isFinite(p.dSiteWithoutRefund) && Math.abs(Number(p.dSiteWithoutRefund)) <= 1 },
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
