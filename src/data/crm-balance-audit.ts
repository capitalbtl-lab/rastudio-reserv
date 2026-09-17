/** Шаг 5: сверка остатка с шапкой. Кассу и журнал не качает. Канон 44. */

import { writeoffSumOf, uniqueBranches } from "./crm-ledger-core";
import { balanceOf, liveCttOf } from "./crm-pay-core";
import {
  classifyAudit,
  moneyClose,
  auditOnRight,
  alfaHeaderOf,
  alfaBalancePresent,
  shouldStampAlfaHeader,
  sameCustomerId,
  alfaLessonCountOf,
  parseAlfaHeader,
  type AuditCode,
} from "./crm-balance-audit-core";
import {
  step5CanSverka,
  step5MoscowDay,
  step5Reasons,
  step5SkipNote,
  type Step5Reason,
} from "./crm-step5-canon";

export type { AuditCode } from "./crm-balance-audit-core";
export {
  classifyAudit,
  moneyClose,
  auditOnRight,
  alfaHeaderOf,
  alfaBalancePresent,
  shouldStampAlfaHeader,
  sameCustomerId,
  alfaLessonCountOf,
} from "./crm-balance-audit-core";

export type AuditHit = {
  cid: number;
  branchId: number;
  name: string;
  clients: number;
  alfa: number;
  cash: number;
  cttRest?: number;
  codes: AuditCode[];
  repaired: boolean;
  at: string;
  extra: string;
};

export type AuditReport = {
  at: string;
  idx: number;
  scanned: number;
  ok: number;
  hole: number;
  show: number;
  fail: number;
  rows: AuditHit[];
};

const SHOW_CODES: AuditCode[] = ["ctt", "formula", "src"];
const HOLE_CODES: AuditCode[] = ["lessons", "pays", "snap"];

export function emptyAudit(): AuditReport {
  return { at: "", idx: 0, scanned: 0, ok: 0, hole: 0, show: 0, fail: 0, rows: [] };
}

function rub(n: number) {
  return `${Math.round(Number(n) || 0)} \u20BD`;
}

function livePayRows(
  rows: {
    id?: number;
    deleted?: boolean;
    hold?: boolean;
    documentDate?: string;
    at?: string;
    date?: string;
  }[],
) {
  return rows.filter((x) => {
    if ((Number(x.id) || 0) <= 0) return false;
    if (x.deleted) return false;
    if (x.hold) return false;
    const dt = String(x.documentDate || x.at || "").trim();
    return Boolean(dt);
  });
}

export async function diskAudit(cid: number, branchId: number) {
  const { findDossier } = await import("./dossiers");
  const { collectCustomerJournal, loadCustomerCalendar } = await import("./group-cards");
  const { paysOf, payCustomerFilled, customerBalance } = await import("./crm-pay");
  const { accountSnapOf, goodsNetOf, refundGoodsSumOf, corrLooksGoods } = await import("./crm-pay-core");
  const { parseDossierCtt } = await import("./pupil-tariffs");
  const id = Number(cid) || 0;
  const branch = Number(branchId) || 1;
  const d = findDossier({ crmId: id });
  const groups = (d?.groupLinks || []).map((g) => ({
    id: Number(g.id) || 0,
    branchId: Number(g.branchId || branch) || branch,
    name: String(g.name || ""),
  }));
  const cal = loadCustomerCalendar(id);
  const journal = collectCustomerJournal(id, groups);
  const payRows = paysOf(id).filter((x) => !x.deleted);
  const live = livePayRows(
    payRows as { id?: number; deleted?: boolean; hold?: boolean; documentDate?: string; at?: string }[],
  );
  const paySum = balanceOf(payRows);
  const woCal = writeoffSumOf(cal, id);
  const woCard = writeoffSumOf(journal, id);
  const snap = d ? accountSnapOf(d.extras?.balance, parseDossierCtt(d.extras)) : Number.NaN;
  const clients = d ? customerBalance(id, snap, woCal) : 0;
  const ids = cal.map((l) => Number(l.lessonId) || 0).filter((n) => n > 0);
  const study = Number(d?.extras?.is_study);
  const removed = Number(d?.extras?.removed);
  const goodsNet = goodsNetOf(payRows);
  const cashLessons = paySum - goodsNet;
  const formulaSite = cashLessons - woCal;
  return {
    name: String(d?.child?.fio || "").trim() || `\u043a\u043b\u0438\u0435\u043d\u0442 ${id}`,
    clients,
    cash: paySum - woCal,
    cashLessons,
    cashAll: paySum,
    formulaSite,
    woCal,
    woCard,
    paysComplete: payCustomerFilled(id),
    livePays: live.length,
    lessonsDisk: new Set(ids).size,
    liveCtt: liveCttOf(parseDossierCtt(d?.extras)).length > 0,
    dupLessons: ids.length !== new Set(ids).size,
    badStatus: cal.some((l) => Number(l.status) !== 3 && (Number(l.amount) || 0) > 0),
    goodsNet,
    refundGoodsSum: refundGoodsSumOf(payRows),
    corrLooksGoods: payRows.some((r) => corrLooksGoods(r)),
    study,
    removed,
    hasDossier: Boolean(d),
    headerAt: String(d?.extras?.headerAt || ""),
    extraN: Number(d?.extras?.extraN) || 0,
    holeN: Number(d?.extras?.holeN) || 0,
  };
}

async function alfaShow(branch: number, cid: number) {
  const { token, request } = await import("./alfacrm");
  const { crmUnwrapIndex } = await import("./crm-leads-stages");
  const t = await token();
  const branches = uniqueBranches(branch);
  let found: Record<string, unknown> | null = null;
  let used = Number(branch) || 1;
  let switched = false;
  let authStop = false;
  let rejectCid = false;
  for (const bid of branches) {
    try {
      const json = await request(`/v2api/${bid}/customer/index`, { id: cid, page: 0 }, t);
      const items = crmUnwrapIndex(json).items;
      const hit = items.find((x) => sameCustomerId((x as { id?: unknown }).id, cid)) as Record<string, unknown> | undefined;
      if (!hit) continue;
      const parsed = parseAlfaHeader(hit);
      if (!parsed.ok) continue;
      found = hit;
      used = bid;
      switched = bid !== (Number(branch) || 1);
      break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/\b401\b|\b403\b/.test(msg)) {
        authStop = true;
        break;
      }
      if (/\b400\b|\b422\b/.test(msg)) {
        rejectCid = true;
        break;
      }
      continue;
    }
  }
  if (!found) {
    return {
      ok: false as const,
      alfa: 0,
      headerOk: false,
      lessonCount: null as number | null,
      branch: used,
      switched,
      token: t,
      request,
      study: Number.NaN,
      removed: Number.NaN,
      authStop,
      rejectCid,
    };
  }
  const parsed = parseAlfaHeader(found);
  return {
    ok: true as const,
    alfa: parsed.header,
    headerOk: parsed.ok,
    lessonCount: alfaLessonCountOf(found),
    branch: used,
    switched,
    token: t,
    request,
    study: Number(found.is_study),
    removed: Number(found.removed),
    authStop: false,
    rejectCid: false,
  };
}

function codesFromCanon(p: {
  headerOk: boolean;
  sverka: boolean;
  pending: boolean;
  formulaSite: number;
  header: number;
  cashLessons: number;
  cashAll: number;
  headerAt: string;
  extraN: number;
  holeN: number;
  goodsNet: number;
}): AuditCode[] {
  if (!p.headerOk) return ["\u043d\u0435\u0442 \u043e\u0442\u0432\u0435\u0442\u0430"];
  const r = step5Reasons({
    sverka: p.sverka,
    hasH: p.headerOk,
    pending: p.pending,
    formulaSite: p.formulaSite,
    header: p.header,
    cashLessons: p.cashLessons,
    cashAll: p.cashAll,
    headerAt: p.headerAt || step5MoscowDay(),
    extraN: p.extraN,
    holeN: p.holeN,
  });
  const codes: AuditCode[] = [];
  if (r.c) codes.push("ok");
  if (r.main) codes.push(r.main as AuditCode);
  for (const t of r.tail) {
    if (t && t !== r.main) codes.push(t as AuditCode);
  }
  if (p.goodsNet && !codes.includes("product")) {
    /* \u0442\u043e\u0432\u0430\u0440 \u043d\u0435 \u0433\u043b\u0430\u0432\u043d\u0430\u044f \u2014 \u043d\u0435 \u043f\u043e\u0434\u043c\u0435\u0448\u0438\u0432\u0430\u0442\u044c \u0441\u0442\u0430\u0440\u044b\u0439 goods */
  }
  if (!codes.length) codes.push("mismatch");
  return [...new Set(codes)];
}

export async function auditOne(cid: number, branchId: number) {
  const id = Number(cid) || 0;
  const branch = Number(branchId) || 1;
  const at = new Date().toISOString();
  if (!id) {
    return {
      hit: {
        cid: 0,
        branchId: branch,
        name: "",
        clients: 0,
        alfa: 0,
        cash: 0,
        codes: ["\u043d\u0435\u0442 \u043e\u0442\u0432\u0435\u0442\u0430"] as AuditCode[],
        repaired: false,
        at,
        extra: "\u041d\u0435\u0442 \u043d\u043e\u043c\u0435\u0440\u0430 \u0443\u0447\u0435\u043d\u0438\u043a\u0430.",
      } satisfies AuditHit,
    };
  }
  let first: Awaited<ReturnType<typeof diskAudit>>;
  try {
    first = await diskAudit(id, branch);
  } catch (e) {
    const err = e instanceof Error ? e.message : "\u0434\u0438\u0441\u043a";
    return {
      hit: {
        cid: id,
        branchId: branch,
        name: `\u043a\u043b\u0438\u0435\u043d\u0442 ${id}`,
        clients: 0,
        alfa: 0,
        cash: 0,
        codes: ["\u043d\u0435\u0442 \u043e\u0442\u0432\u0435\u0442\u0430"] as AuditCode[],
        repaired: false,
        at,
        extra: `\u0434\u0438\u0441\u043a: ${err}`,
      } satisfies AuditHit,
    };
  }

  if (!first.hasDossier) {
    return {
      hit: {
        cid: id,
        branchId: branch,
        name: first.name,
        clients: 0,
        alfa: 0,
        cash: 0,
        codes: ["\u043d\u0435\u0442 \u043e\u0442\u0432\u0435\u0442\u0430"],
        repaired: false,
        at,
        extra: "\u0414\u043e\u0441\u044c\u0435 \u043d\u0435\u0442, \u0448\u0430\u0433 5 \u043d\u0435 \u0441\u043e\u0437\u0434\u0430\u0451\u0442.",
      } satisfies AuditHit,
    };
  }

  if (!first.livePays) {
    return {
      hit: {
        cid: id,
        branchId: branch,
        name: first.name,
        clients: first.clients,
        alfa: 0,
        cash: first.cash,
        codes: first.study === 0 ? (["\u043b\u0438\u0434"] as AuditCode[]) : (["snap"] as AuditCode[]),
        repaired: false,
        at,
        extra: "\u043a\u0430\u0441\u0441\u044b \u043d\u0435\u0442, \u043d\u0435 \u0441\u0432\u0435\u0440\u044f\u0435\u043c",
      } satisfies AuditHit,
    };
  }

  const { pendingExportIds } = await import("./crm-export-queue");
  const pendingPay = pendingExportIds(["pay.create", "pay.update", "pay.delete"]).has(id);
  if (pendingPay || !first.paysComplete) {
    return {
      hit: {
        cid: id,
        branchId: branch,
        name: first.name,
        clients: first.clients,
        alfa: 0,
        cash: first.cash,
        codes: ["snap"],
        repaired: false,
        at,
        extra: "\u043a\u0430\u0441\u0441\u0430 \u0435\u0449\u0451 \u043f\u0438\u0448\u0435\u0442\u0441\u044f",
      } satisfies AuditHit,
    };
  }

  const sverka = step5CanSverka({
    hasDossier: first.hasDossier,
    payFilled: first.paysComplete,
    livePays: first.livePays,
    isStudy: first.study,
    removed: first.removed,
    inArchiveSet: true,
  });
  const skip = step5SkipNote({
    livePays: first.livePays,
    isStudy: first.study,
    removed: first.removed,
    inArchiveSet: true,
  });

  const shown = await alfaShow(branch, id);
  if (shown.authStop) {
    return {
      hit: {
        cid: id,
        branchId: branch,
        name: first.name,
        clients: first.clients,
        alfa: 0,
        cash: first.cash,
        codes: ["\u043d\u0435\u0442 \u043e\u0442\u0432\u0435\u0442\u0430"],
        repaired: false,
        at,
        extra: "401/403: \u0441\u0435\u0441\u0441\u0438\u044e \u0448\u0430\u0433\u0430 5 \u0441\u0442\u043e\u043f\u0430\u0442\u044c",
      } satisfies AuditHit,
      authStop: true,
    };
  }

  if (shouldStampAlfaHeader({
    alfaOk: shown.ok,
    headerOk: Boolean(shown.ok && shown.headerOk),
    pendingPay: false,
  })) {
    const { stampDossierAlfaBalance } = await import("./dossiers");
    stampDossierAlfaBalance(id, shown.alfa, shown.branch);
    const { stampCustomerSync } = await import("./crm-customer-sync");
    stampCustomerSync(id, { paysRecheckAt: at });
  }

  const codes = codesFromCanon({
    headerOk: Boolean(shown.ok && shown.headerOk),
    sverka,
    pending: false,
    formulaSite: first.formulaSite,
    header: shown.ok && shown.headerOk ? shown.alfa : 0,
    cashLessons: first.cashLessons,
    cashAll: first.cashAll,
    headerAt: first.headerAt,
    extraN: first.extraN,
    holeN: first.holeN,
    goodsNet: first.goodsNet,
  });
  const extra = shown.ok && shown.headerOk
    ? `\u041a\u043b\u0438\u0435\u043d\u0442\u044b ${rub(first.formulaSite)} \u00b7 Alfa ${rub(shown.alfa)} \u00b7 \u043a\u0430\u0441\u0441\u0430 ${rub(first.cashLessons)} \u00b7 ${codes.join(", ")}`
    : shown.ok
      ? "\u0432 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0435 \u043d\u0435\u0442 \u0448\u0430\u043f\u043a\u0438"
      : skip || "\u043d\u0435\u0442 \u043e\u0442\u0432\u0435\u0442\u0430 Alfa";
  return {
    hit: {
      cid: id,
      branchId: shown.branch || branch,
      name: first.name,
      clients: first.formulaSite,
      alfa: shown.ok && shown.headerOk ? shown.alfa : 0,
      cash: first.cashLessons,
      cttRest: 0,
      codes,
      repaired: false,
      at,
      extra,
    } satisfies AuditHit,
  };
}

export function mergeAudit(prev: AuditReport | null | undefined, hit: AuditHit, idx: number): AuditReport {
  const rows = [hit, ...(prev?.rows || []).filter((r) => r.cid !== hit.cid)].slice(0, 400);
  const ok = rows.filter((r) => auditOnRight(r.codes)).length;
  const fail = rows.filter((r) => r.codes.includes("\u043d\u0435\u0442 \u043e\u0442\u0432\u0435\u0442\u0430")).length;
  const show = rows.filter((r) => r.codes.some((c) => SHOW_CODES.includes(c)) && !auditOnRight(r.codes)).length;
  const hole = rows.filter((r) => r.codes.some((c) => HOLE_CODES.includes(c)) && !auditOnRight(r.codes)).length;
  return {
    at: hit.at,
    idx,
    scanned: rows.length,
    ok,
    hole,
    show,
    fail,
    rows,
  };
}

export function auditShowBugNote(rep: AuditReport) {
  const mass = SHOW_CODES.map((c) => ({ c, n: rep.rows.filter((r) => r.codes.includes(c)).length })).filter((x) => x.n >= 10);
  if (!mass.length) return "";
  return `\u043e\u0448\u0438\u0431\u043a\u0430 \u043f\u043e\u043a\u0430\u0437\u0430 \u0432 \u041a\u043b\u0438\u0435\u043d\u0442\u0430\u0445: ${mass.map((x) => `${x.c} ${x.n}`).join(" \u00b7 ")}`;
}

void step5MoscowDay;
