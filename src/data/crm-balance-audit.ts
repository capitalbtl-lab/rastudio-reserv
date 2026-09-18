/** Шаг 5: сверка остатка с шапкой. А = payFill.full шага 4. Кассу не качает. */

import { uniqueBranches } from "./crm-ledger-core";
import { liveCttOf } from "./crm-pay-core";
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
  step5FlagFalse,
  step5Money,
  step5MoscowDay,
  step5Reasons,
  step5SkipNote,
  step5Ymd,
} from "./crm-step5-canon";
import { step5CompleteAdd, step5SessionStopped, step5WaitOrStop } from "./crm-step5-session";

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
  alfaPaysN?: number;
  alfaCorrN?: number;
  alfaGoodsN?: number;
  alfaPaysSum?: number;
  alfaCorrSum?: number;
  alfaGoodsSum?: number;
  alfaSplitOk?: boolean;
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
const KNOWN_PAY = new Set([1, 2, 3, 5, 6, 9]);

export function emptyAudit(): AuditReport {
  return { at: "", idx: 0, scanned: 0, ok: 0, hole: 0, show: 0, fail: 0, rows: [] };
}

function rub(n: number) {
  return `${Math.round(Number(n) || 0)} \u20BD`;
}

function payTypeOf(row: { payTypeId?: unknown; kind?: unknown }) {
  const n = Number(row.payTypeId);
  if (Number.isFinite(n) && n > 0 && KNOWN_PAY.has(n)) return n;
  const k = String(row.kind || "").trim().toLowerCase();
  if (k === "income") return 1;
  if (k === "product") return 9;
  if (k === "refund") return 5;
  if (k === "correct") return 6;
  return Number.isFinite(n) && KNOWN_PAY.has(n) ? n : 0;
}

function rowSum(row: { income?: unknown; expenditure?: unknown; kind?: unknown; payTypeId?: unknown }) {
  const a = step5Money(row.income);
  const b = step5Money(row.expenditure);
  if (!a.ok || !b.ok) return { ok: false, n: 0 };
  let n = a.n - b.n;
  const refund = String(row.kind || "") === "refund" || Number(row.payTypeId) === 5 || Number(row.payTypeId) === 3;
  if (refund) n = n <= 0 ? n : -n;
  return { ok: true, n };
}

function isLessonType(t: number) {
  return t === 1 || t === 5 || t === 6 || t === 3;
}

function isProductType(t: number) {
  return t === 9 || t === 2;
}

type PayLike = {
  id?: number;
  deleted?: boolean | string | number;
  hold?: boolean | string | number;
  documentDate?: string;
  at?: string;
  income?: unknown;
  expenditure?: unknown;
  payTypeId?: unknown;
  kind?: unknown;
  branchId?: unknown;
};

function livePayRows(rows: PayLike[]) {
  return rows.filter((x) => {
    if ((Number(x.id) || 0) <= 0) return false;
    if (!step5FlagFalse(x.deleted)) return false;
    if (!step5FlagFalse(x.hold)) return false;
    return Boolean(String(x.documentDate || x.at || "").trim());
  });
}

function writeoffCanon(cal: { lessonId?: unknown; status?: unknown; amount?: unknown }[], lessonsDisk: number, jready: boolean) {
  if (lessonsDisk < 1) return { ok: true, n: 0 };
  if (!jready) return { ok: false, n: 0 };
  let n = 0;
  for (const l of cal) {
    if ((Number(l.lessonId) || 0) <= 0) continue;
    if (Number(l.status) !== 3) continue;
    const a = step5Money(l.amount);
    if (!a.ok) continue;
    n += a.n;
  }
  return { ok: true, n };
}

export async function diskAudit(cid: number, branchId: number) {
  const { findDossier } = await import("./dossiers");
  const { collectCustomerJournal, loadCustomerCalendar } = await import("./group-cards");
  const { paysOf, payCustomerFilled, payFillPending, customerBalance } = await import("./crm-pay");
  const { accountSnapOf, goodsNetOf, refundGoodsSumOf, corrLooksGoods } = await import("./crm-pay-core");
  const { parseDossierCtt } = await import("./pupil-tariffs");
  const { customerSyncOf, lessonsJournalReady } = await import("./crm-customer-sync");
  const { isArchiveWorking } = await import("./crm-archive-policy");
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
  const payRows = paysOf(id) as PayLike[];
  const live = livePayRows(payRows);
  const typed = live.map((x) => {
    const t = payTypeOf(x);
    const sum = rowSum(x);
    const day = step5Ymd(x.documentDate || x.at);
    const bid = Number(x.branchId) || 0;
    const orphan = t === 0 || !sum.ok;
    const alien = !orphan && bid > 0 && bid !== 1 && bid !== 2 && bid !== 3 && bid !== 4;
    return { t, sum, day, orphan, alien };
  });
  const fair = typed.filter((x) => !x.orphan);
  const lessonRows = fair.filter((x) => isLessonType(x.t));
  const productRows = fair.filter((x) => isProductType(x.t));
  const cashLessons = lessonRows.reduce((s, x) => s + x.sum.n, 0);
  const cashProduct = productRows.reduce((s, x) => s + x.sum.n, 0);
  const cashAllOk = fair.length > 0;
  const cashAll = cashAllOk ? cashLessons + cashProduct : Number.NaN;
  const cashDays = fair.map((x) => x.day).filter(Boolean).sort();
  const cashDate = cashDays[cashDays.length - 1] || "";
  const ids = cal.map((l) => Number((l as { lessonId?: number }).lessonId) || 0).filter((n) => n > 0);
  const lessonsDisk = new Set(ids).size;
  const sync = customerSyncOf(id);
  const jready = lessonsJournalReady(sync);
  const wo = writeoffCanon(cal as { lessonId?: unknown; status?: unknown; amount?: unknown }[], lessonsDisk, jready);
  const formulaSite = cashAllOk && wo.ok ? cashLessons - wo.n : Number.NaN;
  const without6 = lessonRows.filter((x) => x.t !== 6);
  const withoutRefund = lessonRows.filter((x) => x.t !== 5 && x.t !== 3);
  const dSiteWithout6 = cashAllOk && wo.ok && without6.length ? without6.reduce((s, x) => s + x.sum.n, 0) - wo.n : Number.NaN;
  const dSiteWithoutRefund = cashAllOk && wo.ok && withoutRefund.length ? withoutRefund.reduce((s, x) => s + x.sum.n, 0) - wo.n : Number.NaN;
  const snap = d ? accountSnapOf(d.extras?.balance, parseDossierCtt(d.extras)) : Number.NaN;
  const clients = d ? customerBalance(id, snap, wo.n) : 0;
  return {
    name: String(d?.child?.fio || "").trim() || `клиент ${id}`,
    clients,
    cash: Number.isFinite(formulaSite) ? formulaSite : 0,
    cashLessons,
    cashAll,
    cashAllOk,
    cashDate,
    formulaSite,
    woCal: wo.n,
    woCard: wo.n,
    woOk: wo.ok,
    paysComplete: payCustomerFilled(id),
    payPending: payFillPending(id),
    livePays: live.length,
    liveFair: fair.length,
    lessonsDisk,
    liveCtt: liveCttOf(parseDossierCtt(d?.extras)).length > 0,
    dupLessons: ids.length !== lessonsDisk,
    badStatus: cal.some((l) => Number((l as { status?: number }).status) !== 3 && (Number((l as { amount?: number }).amount) || 0) > 0),
    goodsNet: goodsNetOf(payRows as { kind?: string; income?: number; expenditure?: number }[]),
    refundGoodsSum: refundGoodsSumOf(payRows as { kind?: string; income?: number; expenditure?: number }[]),
    corrLooksGoods: payRows.some((r) => corrLooksGoods(r as { kind?: string; note?: string })),
    study: Number(d?.extras?.is_study),
    removed: Number(d?.extras?.removed),
    hasDossier: Boolean(d),
    headerAt: String(d?.extras?.headerAt || ""),
    extraN: Number(sync.lessonsExtraN) || 0,
    holeN: Number(sync.lessonsHoleN) || 0,
    jready,
    inArchiveSet: isArchiveWorking(id),
    orphan: typed.some((x) => x.orphan),
    alien: typed.some((x) => x.alien),
    dSiteWithout6,
    dSiteWithoutRefund,
    journal: journal.length,
  };
}

async function peekAlfaPaySplit(
  request: (path: string, body: Record<string, unknown>, token: string) => Promise<unknown>,
  token: string,
  branch: number,
  cid: number,
) {
  const { crmUnwrapIndex } = await import("./crm-leads-stages");
  const { kindFromAlfaPay, payNum } = await import("./crm-pay-core");
  const { uniqueBranches } = await import("./crm-ledger-core");
  const from = "2015-01-01";
  const to = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  let paysN = 0, corrN = 0, goodsN = 0;
  let paysSum = 0, corrSum = 0, goodsSum = 0;
  let pages = 0;
  const seen = new Set<number>();
  for (const bid of uniqueBranches(branch)) {
    for (let page = 0; page < 20; page += 1) {
      if (step5SessionStopped()) return { ok: false as const };
      const json = await request(`/v2api/${bid}/pay/index`, {
        page,
        pageSize: 500,
        customer_id: cid,
        date_from: from,
        date_to: to,
      }, token);
      pages += 1;
      const pack = crmUnwrapIndex(json);
      const items = pack.items || [];
      if (!items.length) break;
      for (const item of items) {
        const id = Number((item as { id?: number }).id) || 0;
        if (id > 0) {
          if (seen.has(id)) continue;
          seen.add(id);
        }
        const rawDate = String((item as { document_date?: string }).document_date || "").trim();
        if (!rawDate) continue;
        const kind = kindFromAlfaPay(item as Record<string, unknown>);
        let n = payNum((item as { income?: unknown }).income) - payNum((item as { expenditure?: unknown }).expenditure);
        if (kind === "refund") n = n <= 0 ? n : -n;
        if (kind === "product") { goodsN += 1; goodsSum += n; }
        else if (kind === "correct") { corrN += 1; corrSum += n; }
        else { paysN += 1; paysSum += n; }
      }
      if (items.length < 500) break;
    }
  }
  return {
    ok: true as const,
    alfaPaysN: paysN,
    alfaCorrN: corrN,
    alfaGoodsN: goodsN,
    alfaPaysSum: paysSum,
    alfaCorrSum: corrSum,
    alfaGoodsSum: goodsSum,
  };
}

async function alfaShow(branch: number, cid: number, study = Number.NaN) {
  const { token, request } = await import("./alfacrm");
  const { crmUnwrapIndex } = await import("./crm-leads-stages");
  const t = await token();
  if (!t) {
    return {
      ok: false as const,
      alfa: 0,
      headerOk: false,
      miss: "" as const,
      lessonCount: null as number | null,
      branch: Number(branch) || 1,
      switched: false,
      token: t,
      request,
      study: Number.NaN,
      removed: Number.NaN,
      authStop: true,
      rejectCid: false,
      stopped: false,
    };
  }
  const branches = uniqueBranches(branch);
  let found: Record<string, unknown> | null = null;
  let used = Number(branch) || 1;
  let switched = false;
  let authStop = false;
  let rejectCid = false;
  let stopped = false;
  for (const bid of branches) {
    if (step5SessionStopped()) {
      stopped = true;
      break;
    }
    let retried = false;
    for (;;) {
      try {
        const bodies: Array<Record<string, unknown>> = [{ id: cid, page: 0, is_study: 2 }];
        if (Number(study) === 0) bodies.push({ id: cid, page: 0, is_study: 0 });
        let hit: Record<string, unknown> | undefined;
        for (const body of bodies) {
          const json = await request(`/v2api/${bid}/customer/index`, body, t);
          const items = crmUnwrapIndex(json).items;
          hit = items.find((x) => sameCustomerId((x as { id?: unknown }).id, cid)) as Record<string, unknown> | undefined;
          if (hit) break;
        }
        if (hit) {
          found = hit;
          used = bid;
          switched = bid !== (Number(branch) || 1);
        }
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
        if (/\b429\b/.test(msg) && !retried) {
          retried = true;
          const go = await step5WaitOrStop(120000);
          if (!go) {
            stopped = true;
            break;
          }
          continue;
        }
        break;
      }
    }
    if (found || authStop || rejectCid || stopped) break;
  }
  if (!found) {
    return {
      ok: false as const,
      alfa: 0,
      headerOk: false,
      miss: "id" as const,
      lessonCount: null as number | null,
      branch: used,
      switched,
      token: t,
      request,
      study: Number.NaN,
      removed: Number.NaN,
      authStop,
      rejectCid,
      stopped,
    };
  }
  const parsed = parseAlfaHeader(found);
  return {
    ok: true as const,
    alfa: parsed.header,
    headerOk: parsed.ok,
    miss: parsed.ok ? ("" as const) : ("balance" as const),
    lessonCount: alfaLessonCountOf(found),
    branch: used,
    switched,
    token: t,
    request,
    study: Number(found.is_study),
    removed: Number(found.removed),
    authStop: false,
    rejectCid: false,
    stopped: false,
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
  cashDate: string;
  headerAt: string;
  extraN: number;
  holeN: number;
  orphan: boolean;
  alien: boolean;
  dSiteWithout6: number;
  dSiteWithoutRefund: number;
}): { codes: AuditCode[]; c: boolean; main: string; dCash: number } {
  if (!p.headerOk) return { codes: ["нет ответа"], c: false, main: "", dCash: 0 };
  const r = step5Reasons({
    sverka: p.sverka,
    hasH: p.headerOk,
    pending: p.pending,
    formulaSite: p.formulaSite,
    header: p.header,
    cashLessons: p.cashLessons,
    cashAll: p.cashAll,
    cashDate: p.cashDate,
    headerAt: p.headerAt,
    extraN: p.extraN,
    holeN: p.holeN,
    orphan: p.orphan,
    alien: p.alien,
    dSiteWithout6: p.dSiteWithout6,
    dSiteWithoutRefund: p.dSiteWithoutRefund,
  });
  const codes: AuditCode[] = [];
  if (r.c) codes.push("ok");
  if (r.main) codes.push(r.main as AuditCode);
  for (const t of r.tail) {
    if (t && t !== r.main) codes.push(t as AuditCode);
  }
  return { codes, c: r.c, main: r.main, dCash: Number(p.cashLessons) - Number(p.header) };
}

export async function auditOne(cid: number, branchId: number) {
  const id = Number(cid) || 0;
  const branch = Number(branchId) || 1;
  const at = new Date().toISOString();
  const day = step5MoscowDay();
  if (step5SessionStopped()) {
    return {
      hit: {
        cid: id,
        branchId: branch,
        name: "",
        clients: 0,
        alfa: 0,
        cash: 0,
        codes: ["нет ответа"] as AuditCode[],
        repaired: false,
        at,
        extra: "стоп",
      } satisfies AuditHit,
      stopped: true,
    };
  }
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

  const { pendingExportIds } = await import("./crm-export-queue");
  const outgoing = pendingExportIds(["pay.create", "pay.update", "pay.delete"]).has(id);
  const pendingPay = outgoing || (first.payPending && (Number(first.livePays) || 0) < 1);
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

  const cashOnDisk = (Number(first.livePays) || 0) >= 1 || (Number(first.liveFair) || 0) >= 1;
  if (!first.paysComplete && !cashOnDisk) {
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
        extra: "касса не закрыта шагом 4",
      } satisfies AuditHit,
    };
  }

  if ((Number(first.liveFair) || 0) < 1) {
    return {
      hit: {
        cid: id,
        branchId: branch,
        name: first.name,
        clients: first.clients,
        alfa: 0,
        cash: first.cash,
        codes: first.study === 0 ? (["лид"] as AuditCode[]) : (["snap"] as AuditCode[]),
        repaired: false,
        at,
        extra: "кассы нет, не сверяем",
      } satisfies AuditHit,
    };
  }

  if (first.lessonsDisk > 0 && !first.jready) {
    return {
      hit: {
        cid: id,
        branchId: branch,
        name: first.name,
        clients: first.clients,
        alfa: 0,
        cash: first.cash,
        codes: ["lessons"],
        repaired: false,
        at,
        extra: "журнал не закрыт, шапку не зовём",
      } satisfies AuditHit,
    };
  }

  const sverka = step5CanSverka({
    hasDossier: first.hasDossier,
    payFilled: first.paysComplete,
    livePays: first.liveFair,
    isStudy: first.study,
    removed: first.removed,
    inArchiveSet: first.inArchiveSet,
  });
  const skip = step5SkipNote({
    livePays: first.liveFair,
    isStudy: first.study,
    removed: first.removed,
    inArchiveSet: first.inArchiveSet,
  });
  if (!sverka) {
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
        extra: skip || "сверки нет",
      } satisfies AuditHit,
    };
  }

  const shown = await alfaShow(branch, id, first.study);
  if (shown.stopped) {
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
        extra: "стоп на 429",
      } satisfies AuditHit,
      stopped: true,
    };
  }
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

  const judged = codesFromCanon({
    headerOk: Boolean(shown.ok && shown.headerOk),
    sverka,
    pending: false,
    formulaSite: first.formulaSite,
    header: shown.ok && shown.headerOk ? shown.alfa : 0,
    cashLessons: first.cashLessons,
    cashAll: first.cashAll,
    cashDate: first.cashDate,
    headerAt: first.headerAt,
    extraN: first.extraN,
    holeN: first.holeN,
    orphan: first.orphan,
    alien: first.alien,
    dSiteWithout6: Number.isFinite(first.dSiteWithout6) ? first.dSiteWithout6 - (shown.ok ? shown.alfa : 0) : Number.NaN,
    dSiteWithoutRefund: Number.isFinite(first.dSiteWithoutRefund) ? first.dSiteWithoutRefund - (shown.ok ? shown.alfa : 0) : Number.NaN,
  });

  let alfaSplit: Awaited<ReturnType<typeof peekAlfaPaySplit>> | null = null;
  if (shown.ok && shown.token && !shown.stopped && !shown.authStop) {
    try {
      alfaSplit = await peekAlfaPaySplit(shown.request, shown.token, shown.branch || branch, id);
    } catch {
      alfaSplit = { ok: false as const };
    }
  }

  if (shown.ok && shown.headerOk) {
    const { upsertDossier } = await import("./dossiers");
    const extras: Record<string, string> = {
      header: String(shown.alfa),
      headerAt: day,
      auditRecheckAt: day,
      auditReason: judged.main,
      C: judged.c ? "1" : "0",
    };
    if (shown.lessonCount != null) extras.headerC = String(shown.lessonCount);
    const st = Number(shown.study);
    const rem = Number(shown.removed);
    if (st === 0 || st === 1) extras.is_study = String(st);
    if (rem === 0 || rem === 1 || rem === 2) extras.removed = String(rem);
    upsertDossier({ crmId: id, source: "step5-header", extras, persist: true, byCrmOnly: true });
    step5CompleteAdd(id);
  }

  let extra = shown.ok && shown.headerOk
    ? `Клиенты ${rub(Number.isFinite(first.formulaSite) ? first.formulaSite : 0)} · Alfa ${rub(shown.alfa)} · касса ${rub(Number.isFinite(first.formulaSite) ? first.formulaSite : first.cash)} · ${judged.codes.join(", ")}`
    : shown.rejectCid
      ? "400/422, шапки нет"
      : shown.authStop
        ? "нет ответа Alfa"
        : shown.miss === "balance"
          ? "нет balance"
          : shown.miss === "id"
            ? "id не найден"
            : skip || "нет ответа Alfa";
  if (judged.c && judged.dCash > 1) extra += "; приход больше шапки на списания, так бывает";
  return {
    hit: {
      cid: id,
      branchId: shown.branch || branch,
      name: first.name,
      clients: Number.isFinite(first.formulaSite) ? first.formulaSite : 0,
      alfa: shown.ok && shown.headerOk ? shown.alfa : 0,
      cash: Number.isFinite(first.formulaSite) ? first.formulaSite : first.cash,
      cttRest: 0,
      codes: judged.codes,
      repaired: false,
      at,
      extra,
      ...(alfaSplit && alfaSplit.ok
        ? {
            alfaPaysN: alfaSplit.alfaPaysN,
            alfaCorrN: alfaSplit.alfaCorrN,
            alfaGoodsN: alfaSplit.alfaGoodsN,
            alfaPaysSum: alfaSplit.alfaPaysSum,
            alfaCorrSum: alfaSplit.alfaCorrSum,
            alfaGoodsSum: alfaSplit.alfaGoodsSum,
            alfaSplitOk: true,
          }
        : { alfaSplitOk: false }),
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

void shouldStampAlfaHeader;
