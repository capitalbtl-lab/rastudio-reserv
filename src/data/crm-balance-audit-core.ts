/** Классификация шага 5. Без диска и Alfa. */

export type AuditCode =
  | "ok"
  | "lessons"
  | "pays"
  | "snap"
  | "src"
  | "ctt"
  | "formula"
  | "status"
  | "dup"
  | "branch"
  | "goods"
  | "refund-goods"
  | "corr"
  | "corr-goods"
  | "wo"
  | "wo0"
  | "unknown"
  | "нет ответа"
  | "лид"
  | "архив"
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

export function moneyClose(a: number, b: number) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= 1;
}

export function auditOnRight(codes: AuditCode[]) {
  return codes.includes("ok");
}

export function sameCustomerId(a: unknown, b: unknown) {
  const x = Number(a);
  const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) && x > 0 && x === y;
}

/** Живая шапка customer.balance. Строку не парсим. Объект — только если числовое поле одно. */
export function alfaBalancePresent(customer: Record<string, unknown> | null | undefined) {
  return parseAlfaHeader(customer).ok;
}

export function parseAlfaHeader(customer: Record<string, unknown> | null | undefined): { ok: boolean; header: number } {
  if (!customer) return { ok: false, header: 0 };
  const raw = customer.balance;
  if (raw == null || raw === "") return { ok: false, header: 0 };
  if (typeof raw === "number" && Number.isFinite(raw)) return { ok: true, header: raw };
  if (typeof raw === "string") return { ok: false, header: 0 };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const nums = Object.values(raw as Record<string, unknown>).filter((v) => typeof v === "number" && Number.isFinite(v)) as number[];
    if (nums.length === 1) return { ok: true, header: nums[0] };
  }
  return { ok: false, header: 0 };
}

/** Шаг 5 пишет extras.balance только с шапки Alfa. Не касса, не rest, не pending pay. */
export function shouldStampAlfaHeader(p: { alfaOk: boolean; headerOk: boolean; pendingPay: boolean }) {
  return Boolean(p.alfaOk && p.headerOk && !p.pendingPay);
}

export function alfaHeaderOf(customer: Record<string, unknown> | null | undefined, _cttRest = 0, _liveCount = 0) {
  return parseAlfaHeader(customer).header;
}

export function alfaLessonCountOf(customer: Record<string, unknown> | null | undefined) {
  if (!customer) return null;
  const n = Number(customer.lesson_count);
  return Number.isFinite(n) ? n : null;
}

export function classifyAudit(p: {
  alfaOk: boolean;
  clients: number;
  alfa: number;
  cash: number;
  paysComplete: boolean;
  lessonsDisk: number;
  lessonsAlfa: number;
  woCard: number;
  woCal: number;
  liveCtt: boolean;
  repaired: boolean;
  switchedBranch?: boolean;
  badStatus?: boolean;
  dupLessons?: boolean;
  goodsNet?: number;
  refundGoodsSum?: number;
  corrLooksGoods?: boolean;
  corrMissing?: boolean;
  woZeroOk?: boolean;
}): AuditCode[] {
  if (!p.alfaOk) return ["нет ответа"];
  const codes: AuditCode[] = [];
  if (p.switchedBranch) codes.push("branch");
  if (p.dupLessons) codes.push("dup");
  if (p.badStatus) codes.push("status");
  if (p.corrLooksGoods) codes.push("corr-goods");
  if (p.woZeroOk) codes.push("wo0");
  if (p.corrMissing) codes.push("corr");
  if (Math.abs(p.woCard - p.woCal) > 1) codes.push("src");
  if (Number(p.lessonsAlfa) > 0 && Number(p.lessonsDisk) !== Number(p.lessonsAlfa)) codes.push("lessons");
  const goodsNet = Number(p.goodsNet) || 0;
  const refundGoods = Number(p.refundGoodsSum) || 0;
  if (moneyClose(p.clients, p.alfa)) {
    const empty = (Number(p.clients) || 0) === 0 && !p.paysComplete && p.lessonsDisk === 0 && !p.liveCtt;
    if (empty) {
      codes.push("snap");
      return [...new Set(codes.filter((c) => c !== "ok"))];
    }
    if (!p.paysComplete) codes.push("snap");
    if (!moneyClose(p.cash, p.alfa)) {
      if (goodsNet && moneyClose(p.cash - goodsNet, p.alfa)) codes.push("goods");
      else if (refundGoods && moneyClose(p.cash + refundGoods, p.alfa)) codes.push("refund-goods");
      else if (p.cash > p.alfa + 1) codes.push("wo");
      if (p.cash < p.alfa - 1) codes.push("pays");
      return [...new Set(codes.filter((c) => c !== "ok"))];
    }
    return [...new Set(["ok", ...codes.filter((c) => c !== "pays" && c !== "wo")])];
  }
  if (!p.paysComplete) codes.push("snap");
  if (goodsNet && moneyClose(p.cash - goodsNet, p.alfa)) codes.push("goods");
  else if (refundGoods && moneyClose(p.cash + refundGoods, p.alfa)) codes.push("refund-goods");
  else {
    if (p.cash > p.alfa + 1) {
      codes.push("lessons");
      codes.push("wo");
    }
    if (p.cash < p.alfa - 1) codes.push("pays");
  }
  if (p.liveCtt && moneyClose(p.clients, p.cash) && !moneyClose(p.alfa, p.cash)) codes.push("ctt");
  if (
    p.paysComplete &&
    !codes.includes("ctt") &&
    !codes.includes("lessons") &&
    !codes.includes("pays") &&
    !codes.includes("snap") &&
    !codes.includes("src") &&
    !codes.includes("goods") &&
    !codes.includes("refund-goods") &&
    !codes.includes("corr")
  ) {
    codes.push("formula");
  }
  if (!codes.length) codes.push("unknown");
  return [...new Set(codes)];
}
