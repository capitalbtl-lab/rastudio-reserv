/** Шаг 4: сверка остатка с Alfa. Только чтение CRM. extras.balance не подгоняем. */

import { writeoffSumOf, uniqueBranches } from "./crm-ledger-core";
import { balanceOf, liveCttOf } from "./crm-pay-core";
import { tariffRowLive } from "./crm-tariff-row";
import { classifyAudit, moneyClose, auditOnRight, type AuditCode } from "./crm-balance-audit-core";

export type { AuditCode } from "./crm-balance-audit-core";
export { classifyAudit, moneyClose, auditOnRight } from "./crm-balance-audit-core";

export type AuditHit = {
  cid: number;
  branchId: number;
  name: string;
  clients: number;
  alfa: number;
  cash: number;
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
const HOLE_CODES: AuditCode[] = ["lessons", "pays", "snap", "status"];

export function emptyAudit(): AuditReport {
  return { at: "", idx: 0, scanned: 0, ok: 0, hole: 0, show: 0, fail: 0, rows: [] };
}

function rub(n: number) {
  return `${Math.round(Number(n) || 0)} ₽`;
}

export async function diskAudit(cid: number, branchId: number) {
  const { findDossier } = await import("./dossiers");
  const { cardFromDossier } = await import("./customer-card-disk");
  const { collectCustomerJournal, loadCustomerCalendar } = await import("./group-cards");
  const { paysOf, isPayJournalComplete } = await import("./crm-pay");
  const { parseDossierCtt } = await import("./pupil-tariffs");
  const id = Number(cid) || 0;
  const branch = Number(branchId) || 1;
  const d = findDossier({ crmId: id });
  const groups = (d?.groupLinks || []).map((g) => ({ id: Number(g.id) || 0, branchId: Number(g.branchId || branch) || branch, name: String(g.name || "") }));
  let clients = 0;
  try {
    clients = d ? Number(cardFromDossier(d, branch).balance) || 0 : 0;
  } catch {
    clients = 0;
  }
  const cal = loadCustomerCalendar(id);
  const journal = collectCustomerJournal(id, groups);
  const paySum = balanceOf(paysOf(id).filter((x) => !x.deleted));
  const woCal = writeoffSumOf(cal, id);
  const woCard = writeoffSumOf(journal, id);
  const ids = cal.map((l) => Number(l.lessonId) || 0).filter((n) => n > 0);
  return {
    name: String(d?.child?.fio || "").trim() || `клиент ${id}`,
    clients,
    cash: paySum - woCal,
    woCal,
    woCard,
    paysComplete: isPayJournalComplete(id),
    lessonsDisk: cal.length,
    liveCtt: liveCttOf(parseDossierCtt(d?.extras)).length > 0,
    dupLessons: ids.length !== new Set(ids).size,
    badStatus: cal.some((l) => Number(l.status) !== 3 && (Number(l.amount) || 0) > 0),
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
  if (!found) return { ok: false as const, alfa: 0, liveCtt: false, branch: used, switched, token: t, request };
  let rest = 0;
  let live = 0;
  try {
    const json = await request(customerTariffIndexPath(used, cid), { page: 0, pageSize: 50, customer_id: cid }, t);
    for (const it of crmUnwrapIndex(json).items) {
      if (!tariffRowLive(it)) continue;
      live += 1;
      rest += Number(it.balance ?? it.rest ?? 0) || 0;
    }
  } catch {
    /* rest 0 */
  }
  return {
    ok: true as const,
    alfa: live ? rest : Number(found.balance ?? 0) || 0,
    liveCtt: live > 0,
    branch: used,
    switched,
    token: t,
    request,
  };
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
  const first = await diskAudit(id, branch);
  const shown = await alfaShow(branch, id);
  let repaired = false;
  let lessonsAlfa = first.lessonsDisk;
  const empty = (Number(first.clients) || 0) === 0 && !first.paysComplete && first.lessonsDisk === 0 && !first.liveCtt && !shown.liveCtt;
  const needRepair = shown.ok && (!moneyClose(first.clients, shown.alfa) || !first.paysComplete || empty);
  if (needRepair) {
    const { probeCustomerLessons, inboundCustomerLessons } = await import("./crm-journal-inbound");
    const probed = await probeCustomerLessons(shown.branch, id).catch(() => ({ total: 0, ok: false as const }));
    lessonsAlfa = probed.ok ? probed.total : first.lessonsDisk;
    if (probed.ok && probed.total > first.lessonsDisk) {
      const { loadCustomerCalendar } = await import("./group-cards");
      for (let i = 0; i < 4; i += 1) {
        const r = await inboundCustomerLessons(shown.branch, id, { force: true, dateFrom: "2015-01-01" }).catch(() => ({ done: false }));
        repaired = true;
        if (r && "done" in r && r.done) break;
        if (loadCustomerCalendar(id).length >= probed.total) break;
      }
    }
    if (!first.paysComplete || first.cash < shown.alfa - 1) {
      const { inboundCustomerPays, isPayJournalComplete } = await import("./crm-pay");
      for (let i = 0; i < 4; i += 1) {
        await inboundCustomerPays(shown.request, shown.token, shown.branch, id).catch(() => null);
        repaired = true;
        if (isPayJournalComplete(id)) break;
      }
    }
  }
  const after = await diskAudit(id, branch);
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
  });
  if (codes.includes("lessons")) {
    const { stampCustomerSync } = await import("./crm-customer-sync");
    stampCustomerSync(id, {
      lessonsFull: false,
      lessonsDisk: after.lessonsDisk,
      ...(shown.ok ? { lessonsAlfa, lessonsAlfaAt: new Date().toISOString() } : {}),
    });
  }
  if (codes.includes("pays") || codes.includes("snap")) {
    const { markPayJournalIncomplete } = await import("./crm-pay");
    markPayJournalIncomplete(id);
  }
  const extra = shown.ok
    ? `Клиенты ${rub(after.clients)} · Alfa ${rub(shown.alfa)} · касса ${rub(after.cash)} · ${codes.join(", ")}`
    : "нет ответа Alfa";
  return {
    hit: {
      cid: id,
      branchId: shown.branch || branch,
      name: after.name,
      clients: after.clients,
      alfa: shown.ok ? shown.alfa : 0,
      cash: after.cash,
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
