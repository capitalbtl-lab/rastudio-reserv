/** Шаг 5: сверка остатка с шапкой. Кассу и журнал не качает. */

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
  type AuditCode,
} from "./crm-balance-audit-core";

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
  return `${Math.round(Number(n) || 0)} ₽`;
}

function livePayRows(rows: { id?: number; deleted?: boolean; hold?: boolean; date?: string }[]) {
  return rows.filter((x) => (Number(x.id) || 0) > 0 && !x.deleted && !x.hold && Boolean(x.date));
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
  const live = livePayRows(payRows as { id?: number; deleted?: boolean; hold?: boolean; date?: string }[]);
  const paySum = balanceOf(payRows);
  const woCal = writeoffSumOf(cal, id);
  const woCard = writeoffSumOf(journal, id);
  const snap = d ? accountSnapOf(d.extras?.balance, parseDossierCtt(d.extras)) : Number.NaN;
  const clients = d ? customerBalance(id, snap, woCal) : 0;
  const ids = cal.map((l) => Number(l.lessonId) || 0).filter((n) => n > 0);
  const study = Number(d?.extras?.is_study);
  const removed = Number(d?.extras?.removed);
  return {
    name: String(d?.child?.fio || "").trim() || `клиент ${id}`,
    clients,
    cash: paySum - woCal,
    woCal,
    woCard,
    paysComplete: payCustomerFilled(id),
    livePays: live.length,
    lessonsDisk: new Set(ids).size,
    liveCtt: liveCttOf(parseDossierCtt(d?.extras)).length > 0,
    dupLessons: ids.length !== new Set(ids).size,
    badStatus: cal.some((l) => Number(l.status) !== 3 && (Number(l.amount) || 0) > 0),
    goodsNet: goodsNetOf(payRows),
    refundGoodsSum: refundGoodsSumOf(payRows),
    corrLooksGoods: payRows.some((r) => corrLooksGoods(r)),
    study,
    removed,
    hasDossier: Boolean(d),
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
  for (const bid of branches) {
    try {
      const json = await request(`/v2api/${bid}/customer/index`, { id: cid, page: 0 }, t);
      const items = crmUnwrapIndex(json).items;
      const hit = items.find((x) => sameCustomerId(x.id, cid));
      if (hit) {
        found = hit;
        used = bid;
        switched = bid !== (Number(branch) || 1);
        break;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/\b401\b|\b403\b/.test(msg)) {
        authStop = true;
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
    };
  }
  const parsed = (await import("./crm-balance-audit-core")).parseAlfaHeader(found);
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
  };
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
        codes: ["нет ответа"] as AuditCode[],
        repaired: false,
        at,
        extra: "Нет номера ученика.",
      } satisfies AuditHit,
    };
  }
  let first: Awaited<ReturnType<typeof diskAudit>>;
  try {
    first = await diskAudit(id, branch);
  } catch (e) {
    const err = e instanceof Error ? e.message : "диск";
    return {
      hit: {
        cid: id,
        branchId: branch,
        name: `клиент ${id}`,
        clients: 0,
        alfa: 0,
        cash: 0,
        codes: ["нет ответа"] as AuditCode[],
        repaired: false,
        at,
        extra: `диск: ${err}`,
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
        codes: ["нет ответа"],
        repaired: false,
        at,
        extra: "Досье нет, шаг 5 не создаёт.",
      } satisfies AuditHit,
    };
  }

  if (!first.livePays) {
    const lead = first.study === 0;
    return {
      hit: {
        cid: id,
        branchId: branch,
        name: first.name,
        clients: first.clients,
        alfa: 0,
        cash: first.cash,
        codes: lead ? (["лид"] as AuditCode[]) : (["snap"] as AuditCode[]),
        repaired: false,
        at,
        extra: "кассы нет, не сверяем",
      } satisfies AuditHit,
    };
  }

  const { pendingExportIds } = await import("./crm-export-queue");
  const pendingPay = pendingExportIds(["pay.create", "pay.update", "pay.delete"]).has(id);
  if (pendingPay) {
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
        extra: "касса ещё пишется",
      } satisfies AuditHit,
    };
  }

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
        codes: ["нет ответа"],
        repaired: false,
        at,
        extra: "401/403: сессию шага 5 стопать",
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

  const codes = classifyAudit({
    alfaOk: shown.ok && shown.headerOk,
    clients: first.clients,
    alfa: shown.ok && shown.headerOk ? shown.alfa : 0,
    cash: first.cash,
    paysComplete: first.paysComplete,
    lessonsDisk: first.lessonsDisk,
    lessonsAlfa: first.lessonsDisk,
    woCard: first.woCard,
    woCal: first.woCal,
    liveCtt: first.liveCtt,
    repaired: false,
    switchedBranch: shown.switched,
    badStatus: first.badStatus,
    dupLessons: first.dupLessons,
    goodsNet: first.goodsNet,
    refundGoodsSum: first.refundGoodsSum,
    corrLooksGoods: first.corrLooksGoods,
  });
  const extra = shown.ok && shown.headerOk
    ? `Клиенты ${rub(first.clients)} · Alfa ${rub(shown.alfa)} · касса ${rub(first.cash)} · ${codes.join(", ")}`
    : shown.ok
      ? "в карточке нет шапки"
      : "нет ответа Alfa";
  return {
    hit: {
      cid: id,
      branchId: shown.branch || branch,
      name: first.name,
      clients: first.clients,
      alfa: shown.ok && shown.headerOk ? shown.alfa : 0,
      cash: first.cash,
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
  const fail = rows.filter((r) => r.codes.includes("нет ответа")).length;
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
  return `ошибка показа в Клиентах: ${mass.map((x) => `${x.c} ${x.n}`).join(" · ")}`;
}
