/** Закон шага 5. Только сверка шапки. Кассу и журнал не качает. */

export type Step5Role = "лид" | "клиент" | "архив" | "не разобрали";

export function sameCustomerId(a: unknown, b: unknown) {
  const x = Number(a);
  const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) && x > 0 && x === y;
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
  if (st === 0) return "лид";
  if (st === 1) return "клиент";
  return "не разобрали";
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
  if (st === 2) return false;
  if (st === 1 && rem === 0) return true;
  if (st === 1 && rem === 2 && p.inArchiveSet) return true;
  if (st === 0 && (Number(p.livePays) || 0) > 0) return true;
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
