/** Шаг 5: сверка остатка. extras.balance — шапка Alfa (этот загрузчик), не формула кассы. */

import { writeoffSumOf, uniqueBranches } from "./crm-ledger-core";
import { balanceOf, liveCttOf } from "./crm-pay-core";
import { tariffRowLive } from "./crm-tariff-row";
import { classifyAudit, moneyClose, auditOnRight, alfaHeaderOf, alfaBalancePresent, shouldStampAlfaHeader, type AuditCode } from "./crm-balance-audit-core";

export type { AuditCode } from "./crm-balance-audit-core";
export { classifyAudit, moneyClose, auditOnRight, alfaHeaderOf, alfaBalancePresent, shouldStampAlfaHeader } from "./crm-balance-audit-core";

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

export async function diskAudit(cid: number, branchId: number) {
  const { findDossier } = await import("./dossiers");
  const { collectCustomerJournal, loadCustomerCalendar } = await import("./group-cards");
  const { paysOf, payCustomerFilled, customerBalance } = await import("./crm-pay");
  const { accountSnapOf, goodsNetOf, refundGoodsSumOf, corrLooksGoods } = await import("./crm-pay-core");
  const { parseDossierCtt } = await import("./pupil-tariffs");
  const id = Number(cid) || 0;
  const branch = Number(branchId) || 1;
  const d = findDossier({ crmId: id });
  const groups = (d?.groupLinks || []).map((g) => ({ id: Number(g.id) || 0, branchId: Number(g.branchId || branch) || branch, name: String(g.name || "") }));
  const cal = loadCustomerCalendar(id);
  const journal = collectCustomerJournal(id, groups);
  const payRows = paysOf(id).filter((x) => !x.deleted);
  const paySum = balanceOf(payRows);
  const woCal = writeoffSumOf(cal, id);
  const woCard = writeoffSumOf(journal, id);
  const snap = d ? accountSnapOf(d.extras?.balance, parseDossierCtt(d.extras)) : Number.NaN;
  const clients = d ? customerBalance(id, snap, woCal) : 0;
  const ids = cal.map((l) => Number(l.lessonId) || 0).filter((n) => n > 0);
  return {
    name: String(d?.child?.fio || "").trim() || `клиент ${id}`,
    clients,
    cash: paySum - woCal,
    woCal,
    woCard,
    paysComplete: payCustomerFilled(id),
    lessonsDisk: new Set(ids).size,
    liveCtt: liveCttOf(parseDossierCtt(d?.extras)).length > 0,
    dupLessons: ids.length !== new Set(ids).size,
    badStatus: cal.some((l) => Number(l.status) !== 3 && (Number(l.amount) || 0) > 0),
    goodsNet: goodsNetOf(payRows),
    refundGoodsSum: refundGoodsSumOf(payRows),
    corrLooksGoods: payRows.some((r) => corrLooksGoods(r)),
  };
}

async function alfaShow(branch: number, cid: number) {
  const { token, request } = await import("./alfacrm");
  const { crmUnwrapIndex } = await import("./crm-leads-stages");
  const { customerTariffIndexPath } = await import("./pupil-tariffs");
  const t = await token();
  const branches = uniqueBranches(branch);
  let found: Record<string, unknown> | null = null;
  let used = Number(branch) || 1;
  let switched = false;
  for (const bid of branches) {
    try {
      const json = await request(`/v2api/${bid}/customer/index`, { page: 0, pageSize: 10, id: cid }, t);
      const items = crmUnwrapIndex(json).items;
      const hit = items.find((x) => Number(x.id) === cid);
      if (hit) {
        found = hit;
        used = bid;
        switched = bid !== (Number(branch) || 1);
        break;
      }
    } catch {
      continue;
    }
  }
  if (!found) {
    for (const bid of branches) {
      for (const study of [0, 2, 1] as const) {
        try {
          const json = await request(`/v2api/${bid}/customer/index`, { page: 0, pageSize: 10, id: cid, is_study: study }, t);
          const hit = crmUnwrapIndex(json).items.find((x) => Number(x.id) === cid);
          if (hit) {
            found = hit;
            used = bid;
            switched = bid !== (Number(branch) || 1);
            break;
          }
        } catch {
          continue;
        }
      }
      if (found) break;
    }
  }
  if (!found) return { ok: false as const, alfa: 0, cttRest: 0, liveCtt: false, headerOk: false, branch: used, switched, token: t, request, study: 0 };
  let rest = 0;
  let live = 0;
  try {
    const json = await request(customerTariffIndexPath(used, cid), { page: 0, pageSize: 50, customer_id: cid }, t);
    for (const it of crmUnwrapIndex(json).items) {
      if (!tariffRowLive(it)) continue;
      live += 1;
      rest += Number.isFinite(Number(it.balance ?? it.rest ?? 0)) ? Number(it.balance ?? it.rest ?? 0) : 0;
    }
  } catch {
    /* rest 0 */
  }
  return {
    ok: true as const,
    alfa: alfaHeaderOf(found, rest, live),
    headerOk: alfaBalancePresent(found),
    cttRest: rest,
    liveCtt: live > 0,
    branch: used,
    switched,
    token: t,
    request,
    study: Number(found.is_study),
  };
}

async function diskAlfaRole(id: number): Promise<"лид" | "архив" | ""> {
  const { findDossier } = await import("./dossiers");
  const { dossierAuditRole } = await import("./crm-person-role");
  const d = findDossier({ crmId: id });
  const role = dossierAuditRole({
    is_study: d?.extras?.is_study,
    removed: d?.extras?.removed,
    lead_status_id: d?.extras?.lead_status_id,
    crm_funnel: d?.extras?.crm_funnel,
    status: d?.status,
  });
  if (role === "лид") return "лид";
  if (role === "архив") return "архив";
  return "";
}

export async function auditOne(cid: number, branchId: number) {
  const id = Number(cid) || 0;
  const branch = Number(branchId) || 1;
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
        at: new Date().toISOString(),
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
        at: new Date().toISOString(),
        extra: `диск: ${err}`,
      } satisfies AuditHit,
    };
  }
  const role = await diskAlfaRole(id);
  if (role) {
    let disk: Awaited<ReturnType<typeof diskAudit>> | null = null;
    try {
      disk = await diskAudit(id, branch);
    } catch {
      disk = null;
    }
    return {
      hit: {
        cid: id,
        branchId: branch,
        name: disk?.name || `клиент ${id}`,
        clients: disk?.clients || 0,
        alfa: 0,
        cash: disk?.cash || 0,
        codes: [role],
        repaired: false,
        at: new Date().toISOString(),
        extra: role === "лид" ? "Лид в Альфе: шапки клиента нет." : "Архив в Альфе: как текущего не сверяем.",
      } satisfies AuditHit,
    };
  }
  const shown = await alfaShow(branch, id);
  const alfaStudy = Number(shown.study);
  if (shown.ok && (alfaStudy === 0 || alfaStudy === 2)) {
    const role = alfaStudy === 0 ? "лид" : "архив";
    return {
      hit: {
        cid: id,
        branchId: shown.branch || branch,
        name: first.name || `клиент ${id}`,
        clients: first.clients || 0,
        alfa: 0,
        cash: first.cash || 0,
        codes: [role],
        repaired: false,
        at: new Date().toISOString(),
        extra: role === "лид" ? "Лид в Альфе: шапки клиента нет." : "Архив в Альфе: как текущего не сверяем.",
      } satisfies AuditHit,
    };
  }
  if (shouldStampAlfaHeader({
    alfaOk: shown.ok,
    headerOk: Boolean(shown.ok && shown.headerOk),
    pendingPay: (await import("./crm-export-queue")).pendingExportIds(["pay.create", "pay.update", "pay.delete"]).has(id),
  })) {
    const { stampDossierAlfaBalance } = await import("./dossiers");
    stampDossierAlfaBalance(id, shown.alfa, shown.branch);
  }
  let repaired = false;
  let lessonsAlfa = Number((await import("./crm-customer-sync")).customerSyncOf(id).lessonsAlfa) || first.lessonsDisk;
  const empty = (Number(first.clients) || 0) === 0 && !first.paysComplete && first.lessonsDisk === 0 && !first.liveCtt && !shown.liveCtt;
  const moneyNeed =
    shown.ok &&
    (!moneyClose(first.clients, shown.alfa) || !moneyClose(first.cash, shown.alfa) || !first.paysComplete || empty);
  if (shown.ok) {
    try {
      const { probeCustomerLessons, inboundCustomerLessons, censusCustomerLessonIds, applyCustomerLessonCensus, skipHoleInbound } = await import("./crm-journal-inbound");
      const probed = await probeCustomerLessons(shown.branch, id).catch(() => ({ total: 0, ok: false as const }));
      if (probed.ok) lessonsAlfa = probed.total;
      const extraLessons = probed.ok && first.lessonsDisk > probed.total;
      const holeLessons = probed.ok && probed.total > first.lessonsDisk;
      const holeSkip = skipHoleInbound(id);
      if ((extraLessons || holeLessons) && !holeSkip) {
        const { loadCustomerCalendar } = await import("./group-cards");
        const { countAlfaLessonUniq } = await import("./crm-inbound-core");
        if (holeLessons) {
        for (let i = 0; i < 4; i += 1) {
          const r = await inboundCustomerLessons(shown.branch, id, {
            force: true,
            full: true,
            take: 8,
            prune: false,
            resetSeen: extraLessons && i === 0,
            dateFrom: "2015-01-01",
          }).catch(() => ({ done: false }));
          repaired = true;
          if (r && "done" in r && r.done) break;
          const diskN = countAlfaLessonUniq(loadCustomerCalendar(id));
          if (probed.ok && diskN >= probed.total) break;
        }
        }
        if (extraLessons) {
          const census = await censusCustomerLessonIds(shown.branch, id, { dateFrom: "2015-01-01" }).catch(() => ({ ids: [] as number[], ok: false as const }));
          if (census.ok) applyCustomerLessonCensus(id, census.ids, true);
          repaired = true;
        }
      }
      if (moneyNeed) {
        const { inboundCustomerPays, payCustomerFilled, markPayJournalIncomplete } = await import("./crm-pay");
        markPayJournalIncomplete(id);
        for (let i = 0; i < 4; i += 1) {
          await inboundCustomerPays(shown.request, shown.token, shown.branch, id).catch(() => null);
          repaired = true;
          if (payCustomerFilled(id)) break;
        }
      }
    } catch {
      /* дыру пометим по диску, очередь не останавливаем */
    }
  }
  let after = first;
  try {
    after = await diskAudit(id, branch);
  } catch {
    after = first;
  }
  const codes = classifyAudit({
    alfaOk: shown.ok,
    clients: after.clients,
    alfa: shown.ok ? shown.alfa : 0,
    cash: after.cash,
    paysComplete: after.paysComplete,
    lessonsDisk: after.lessonsDisk,
    lessonsAlfa,
    woCard: after.woCard,
    woCal: after.woCal,
    liveCtt: shown.ok ? shown.liveCtt : after.liveCtt,
    repaired,
    switchedBranch: shown.switched,
    badStatus: after.badStatus,
    dupLessons: after.dupLessons,
    goodsNet: after.goodsNet,
    refundGoodsSum: after.refundGoodsSum,
    corrLooksGoods: after.corrLooksGoods,
  });
  if (codes.includes("lessons")) {
    const { stampCustomerSync, customerSyncOf } = await import("./crm-customer-sync");
    const { keepAlfaProbe } = await import("./crm-inbound-core");
    const keep = Number(customerSyncOf(id).lessonsAlfa) || 0;
    const held = keepAlfaProbe(keep, lessonsAlfa, shown.ok);
    stampCustomerSync(id, {
      lessonsFull: false,
      lessonsDisk: after.lessonsDisk,
      ...(held.write ? { lessonsAlfa: held.alfa, lessonsAlfaAt: new Date().toISOString() } : {}),
    });
  }
  if (codes.includes("pays") || codes.includes("snap")) {
    const { markPayJournalIncomplete, payFillScanned } = await import("./crm-pay");
    if (!payFillScanned(id)) markPayJournalIncomplete(id);
    const { stampCustomerSync } = await import("./crm-customer-sync");
    stampCustomerSync(id, { paysRecheckAt: "" });
  }
  const extra = shown.ok
    ? `Клиенты ${rub(after.clients)} · Alfa ${rub(shown.alfa)} · касса ${rub(after.cash)} · абонемент ${rub(shown.cttRest || 0)} · ${codes.join(", ")}`
    : "нет ответа Alfa";
  return {
    hit: {
      cid: id,
      branchId: shown.branch || branch,
      name: after.name,
      clients: after.clients,
      alfa: shown.ok ? shown.alfa : 0,
      cash: after.cash,
      cttRest: shown.ok ? shown.cttRest : 0,
      codes,
      repaired,
      at: new Date().toISOString(),
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
