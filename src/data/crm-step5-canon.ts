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
  if (st === 2) return "не разобрали";
  if (st === 0 && rem === 2) return "архив";
  if (st === 1 && rem === 2) return "архив";
  if (st === 0 && rem === 0) return "лид";
  if (st === 1 && rem === 0) return "клиент";
  return "не разобрали";
}

export function step5RoleDefined(isStudy: unknown, removed: unknown) {
  const st = Number(isStudy);
  const rem = Number(removed);
  return (st === 0 || st === 1) && (rem === 0 || rem === 1 || rem === 2);
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
  if (!step5RoleDefined(p.isStudy, p.removed)) return false;
  const rem = Number(p.removed);
  const st = Number(p.isStudy);
  if (rem === 1) return false;
  if (st === 2) return false;
  if (st === 1 && rem === 0) return true;
  if (st === 1 && rem === 2 && p.inArchiveSet) return true;
  if (st === 0 && (rem === 0 || rem === 2)) return true;
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
  if (Number(p.isStudy) === 1 && Number(p.removed) === 2 && !p.inArchiveSet) {
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

export function parseAlfaHeaderCanon(customer: Record<string, unknown> | null | undefined): { ok: boolean; header: number } {
  if (!customer) return { ok: false, header: 0 };
  if (!Object.prototype.hasOwnProperty.call(customer, "balance")) return { ok: false, header: 0 };
  const raw = customer.balance;
  if (raw == null) return { ok: false, header: 0 };
  if (typeof raw === "number" || typeof raw === "string") return step5Money(raw);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const vals = Object.values(raw as Record<string, unknown>);
    if (vals.length !== 1) return { ok: false, header: 0 };
    return step5Money(vals[0]);
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
