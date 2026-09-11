/** Классификация шага 4. Без диска и Alfa. */

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
  | "нет ответа";

export function moneyClose(a: number, b: number) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= 1;
}

export function auditOnRight(codes: AuditCode[]) {
  if (!codes.includes("ok")) return false;
  return !codes.some((c) => c !== "ok" && c !== "dup" && c !== "branch" && c !== "status" && c !== "corr-goods" && c !== "wo0");
}

/** Шапка карточки Alfa = customer.balance. Rest абонемента — не эталон. */
export function alfaHeaderOf(customer: Record<string, unknown> | null | undefined, cttRest = 0, liveCount = 0) {
  if (!customer) return 0;
  const raw = customer.balance;
  if (raw != null && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return liveCount > 0 ? Number(cttRest) || 0 : 0;
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
  const goodsNet = Number(p.goodsNet) || 0;
  const refundGoods = Number(p.refundGoodsSum) || 0;
  if (moneyClose(p.clients, p.alfa)) {
    const empty = (Number(p.clients) || 0) === 0 && !p.paysComplete && p.lessonsDisk === 0 && !p.liveCtt;
    if (empty) {
      codes.push("snap");
      return [...new Set(codes)];
    }
    if (!p.paysComplete && !moneyClose(p.cash, p.alfa)) {
      codes.push("snap");
      if (goodsNet && moneyClose(p.cash - goodsNet, p.alfa)) codes.push("goods");
      else if (refundGoods && moneyClose(p.cash + refundGoods, p.alfa)) codes.push("refund-goods");
      else if (p.cash > p.alfa + 1) {
        codes.push("lessons");
        codes.push("wo");
      }
      if (p.cash < p.alfa - 1) codes.push("pays");
      return [...new Set(codes)];
    }
    if (!codes.includes("src") && !codes.includes("status") && !codes.includes("corr")) return codes.length ? ["ok", ...codes] : ["ok"];
    return ["ok", ...codes];
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
