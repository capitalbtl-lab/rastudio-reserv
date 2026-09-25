/** Шаг 5: сверка остатка с шапкой. А = payFill.full шага 4. Кассу не качает.
 * Не stampDossierAlfaBalance (extras.balance) и не stampCustomerSync — только extras.header.
 * diskAlfaRole не зовём. Лид в Альфе: шапки клиента нет — снято. Пустая лента при А — нули, шапку зовём.
 */

import { uniqueBranches, lessonWriteoffAmount, chargeFromPupils, lessonDebtLike, step5DebtPrice, type LessonDebtRow } from "./crm-ledger-core";
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
  step5UnitScale,
  step5FlagFalse,
  step5Money,
  step5MoscowDay,
  step5Reasons,
  step5SkipNote,
  step5StudyNum,
  step5RemovedNum,
  step5Ymd,
  step5FitRemainder,
  step5ApplyDebts,
  step5PickWriteoff,
  step5ReviveEmptySkip,
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
  woSum?: number;
  woN?: number;
  alfaWoSum?: number;
  alfaWoN?: number;
  alfaWoOk?: boolean;
  headerStamped?: number;
  unitScale?: number;
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

function writeoffCanon(
  cal: LessonDebtRow[],
  lessonsDisk: number,
  jready: boolean,
  customerId?: number,
  tariffOf?: (l: LessonDebtRow) => number,
  fit?: { cash: number; goods: number[] | number; header: number },
) {
  if (lessonsDisk < 1) return { ok: true, n: 0, k: 0 };
  if (!jready) return { ok: false, n: 0, k: 0 };
  let n = 0;
  let k = 0;
  const cid = Number(customerId) || 0;
  const debts: number[] = [];
  for (const l of cal) {
    if ((Number(l.lessonId) || 0) <= 0) continue;
    if (Number(l.status) !== 3) continue;
    const raw = cid ? chargeFromPupils(l, cid).amount : l.amount;
    const a = step5Money(raw);
    if (a.ok && a.n > 0) {
      n += a.n;
      k += 1;
      continue;
    }
    if (!a.ok || !(a.n > 0)) {
      if (!cid || !lessonDebtLike(l, cid)) continue;
      const price = step5DebtPrice(l, cid, cal, tariffOf ? tariffOf(l) : 0);
      if (price > 0) debts.push(price);
    }
  }
  const applied = step5ApplyDebts({ n, k }, debts, Number(fit?.cash), fit?.goods ?? 0, Number(fit?.header));
  return { ok: true, n: applied.n, k: applied.k, baseN: n, baseK: k, debts };
}

export async function diskAudit(cid: number, branchId: number) {
  const { findDossier } = await import("./dossiers");
  const { collectCustomerJournal, loadCustomerCalendar } = await import("./group-cards");
  const { paysOf, payCustomerFilled, payFillPending, customerBalance } = await import("./crm-pay");
  const { accountSnapOf, goodsNetOf, refundGoodsSumOf, corrLooksGoods } = await import("./crm-pay-core");
  const { parseDossierCtt, pickLessonCtt, lessonWriteoffOf } = await import("./pupil-tariffs");
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
  const cashAllOk = true;
  const cashAll = cashLessons + cashProduct;
  const cashDays = fair.map((x) => x.day).filter(Boolean).sort();
  const cashDate = cashDays[cashDays.length - 1] || "";
  const ids = cal.map((l) => Number((l as { lessonId?: number }).lessonId) || 0).filter((n) => n > 0);
  const lessonsDisk = new Set(ids).size;
  const sync = customerSyncOf(id);
  const jready = lessonsJournalReady(sync);
  const ctts = parseDossierCtt(d?.extras);
  const goodsNet = goodsNetOf(payRows as { kind?: string; income?: number; expenditure?: number }[]);
  const goodsAmounts = productRows.map((x) => Math.abs(x.sum.n)).filter((n) => n > 0);
  const headerGuess = (() => {
    const raw = d?.extras?.header;
    if (raw == null || (typeof raw === "string" && !String(raw).trim())) return Number.NaN;
    const m = step5Money(raw);
    return m.ok ? m.n : Number.NaN;
  })();
  const wo = writeoffCanon(cal as LessonDebtRow[], lessonsDisk, jready, id, (l) =>
    lessonWriteoffOf(pickLessonCtt(ctts, { subjectId: Number(l.subjectId) || 0, subject: String(l.subject || l.type || "") })),
    { cash: cashLessons, goods: goodsAmounts.length ? goodsAmounts : goodsNet, header: headerGuess },
  );
  const fitted = cashAllOk && wo.ok ? step5FitRemainder(cashLessons, wo.n, goodsAmounts.length ? goodsAmounts : goodsNet, headerGuess) : { n: Number.NaN, goods: 0 };
  const formulaSite = fitted.n;
  const refundN = lessonRows.filter((x) => x.t === 5 || x.t === 3).length;
  const corrN = lessonRows.filter((x) => x.t === 6).length;
  const without6 = lessonRows.filter((x) => x.t !== 6);
  const withoutRefund = lessonRows.filter((x) => x.t !== 5 && x.t !== 3);
  const dSiteWithout6 = cashAllOk && wo.ok && without6.length ? without6.reduce((s, x) => s + x.sum.n, 0) - wo.n : Number.NaN;
  const dSiteWithoutRefund = cashAllOk && wo.ok && withoutRefund.length ? withoutRefund.reduce((s, x) => s + x.sum.n, 0) - wo.n : Number.NaN;
  const snap = d ? accountSnapOf(d.extras?.balance, ctts) : Number.NaN;
  const clients = d ? customerBalance(id, snap, wo.n) : 0;
  return {
    name: String(d?.child?.fio || "").trim() || `клиент ${id}`,
    clients: Number.isFinite(formulaSite) ? formulaSite : Number.NaN,
    cash: Number.isFinite(formulaSite) ? formulaSite : Number.NaN,
    cashLessons,
    cashAll,
    cashAllOk,
    cashDate,
    formulaSite,
    woCal: wo.n,
    woCard: wo.n,
    woN: wo.k || 0,
    woOk: wo.ok,
    woBaseN: wo.baseN,
    woBaseK: wo.baseK,
    woDebts: wo.debts,
    paysComplete: payCustomerFilled(id),
    payPending: payFillPending(id),
    livePays: live.length,
    liveFair: fair.length,
    lessonsDisk,
    liveCtt: liveCttOf(ctts).length > 0,
    dupLessons: ids.length !== lessonsDisk,
    badStatus: cal.some((l) => Number((l as { status?: number }).status) !== 3 && (Number((l as { amount?: number }).amount) || 0) > 0),
    goodsNet: goodsNet,
    goodsAmounts,
    goodsFitted: fitted.goods,
    refundN,
    corrN,
    refundGoodsSum: refundGoodsSumOf(payRows as { kind?: string; income?: number; expenditure?: number }[]),
    corrLooksGoods: payRows.some((r) => corrLooksGoods(r as { kind?: string; note?: string })),
    study: step5StudyNum(d?.extras?.is_study),
    removed: step5RemovedNum(d?.extras?.removed),
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
    headerStamped: headerGuess,
  };
}

async function peekAlfaPaySplit(
  request: (path: string, body: Record<string, unknown>, token: string) => Promise<unknown>,
  token: string,
  branch: number,
  cid: number,
) {
  const { crmUnwrapIndex } = await import("./crm-leads-stages");
  const { kindFromAlfaPay, payNum, alfaPayIndexDate } = await import("./crm-pay-core");
  const from = alfaPayIndexDate("2015-01-01");
  const to = alfaPayIndexDate(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10));
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
        if (kind === "product") n = n <= 0 ? n : -n;
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

/** Живые списания шага 5: lesson/index, status по умолчанию 3. Журнал на диск не пишет. */
async function peekAlfaLessonCommission(
  request: (path: string, body: Record<string, unknown>, token: string) => Promise<unknown>,
  token: string,
  branch: number,
  cid: number,
) {
  const { crmUnwrapIndex } = await import("./crm-leads-stages");
  let n = 0;
  let k = 0;
  const seen = new Set<number>();
  for (const bid of uniqueBranches(branch)) {
    for (let page = 0; page < 20; page += 1) {
      if (step5SessionStopped()) return { ok: false as const };
      const json = await request(`/v2api/${bid}/lesson/index`, {
        customer_id: cid,
        page,
        pageSize: 500,
      }, token);
      const pack = crmUnwrapIndex(json);
      const items = pack.items || [];
      if (!items.length) break;
      for (const item of items) {
        const id = Number((item as { id?: number }).id) || 0;
        if (id > 0) {
          if (seen.has(id)) continue;
          seen.add(id);
        }
        const st = Number((item as { status?: unknown }).status);
        if (Number.isFinite(st) && st !== 3) continue;
        const wo = lessonWriteoffAmount(item as Record<string, unknown>, cid);
        if (wo > 0) {
          n += wo;
          k += 1;
        }
      }
      if (items.length < 500) break;
    }
  }
  return { ok: true as const, alfaWoSum: n, alfaWoN: k };
}

function archiveEdateClosed(raw: unknown, today: string) {
  let ymd = step5Ymd(raw);
  if (!ymd) {
    const m = String(raw ?? "").trim().match(/^(\d{2})\.(\d{2})\.(\d{4})/);
    if (m) ymd = `${m[3]}-${m[2]}-${m[1]}`;
  }
  if (!ymd || ymd === "2030-12-31" || ymd === "0000-00-00") return false;
  return ymd <= today;
}

async function alfaShow(branch: number, cid: number, _study = Number.NaN) {
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
  const bodies: Record<string, unknown>[] = [
    { id: cid, is_study: 1, removed: 1, page: 0 },
    { id: cid, is_study: 0, page: 0 },
    { id: cid, is_study: 2, removed: 1, page: 0 },
  ];
  outer: for (const bid of branches) {
    if (step5SessionStopped()) {
      stopped = true;
      break;
    }
    for (const body of bodies) {
      let retried = false;
      for (;;) {
        try {
          const json = await request(`/v2api/${bid}/customer/index`, body, t);
          const items = crmUnwrapIndex(json).items;
          const hit = items.find((x) => sameCustomerId((x as { id?: unknown }).id, cid)) as Record<string, unknown> | undefined;
          if (hit) {
            found = hit;
            used = bid;
            switched = bid !== (Number(branch) || 1);
            break outer;
          }
          break;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/\b401\b|\b403\b/.test(msg)) {
            authStop = true;
            break outer;
          }
          if (/\b400\b|\b422\b/.test(msg)) {
            break;
          }
          if (/\b429\b/.test(msg) && !retried) {
            retried = true;
            const go = await step5WaitOrStop(120000);
            if (!go) {
              stopped = true;
              break outer;
            }
            continue;
          }
          break;
        }
      }
    }
  }
  if (!found && !authStop && !stopped) {
    const archiveBodies: Record<string, unknown>[] = [
      { id: cid, page: 0, pageSize: 1, removed: 2, is_study: 0 },
      { id: cid, page: 0, pageSize: 1, removed: 2, is_study: 1 },
      { id: cid, page: 0, pageSize: 1, removed: 1, is_study: 2 },
    ];
    archiveScan: for (const bid of branches) {
      if (step5SessionStopped()) {
        stopped = true;
        break;
      }
      for (const body of archiveBodies) {
        let retried = false;
        for (;;) {
          try {
            const json = await request(`/v2api/${bid}/customer/index`, body, t);
            const items = crmUnwrapIndex(json).items;
            const hit = items.find((x) => sameCustomerId((x as { id?: unknown }).id, cid)) as Record<string, unknown> | undefined;
            if (hit) {
              const rem = step5RemovedNum(hit.removed);
              const closed = archiveEdateClosed(hit.e_date, step5MoscowDay());
              const onlyArchive = Number(body.removed) === 2;
              if (rem !== 1 && (rem === 2 || closed || onlyArchive)) {
                return {
                  ok: false as const,
                  alfa: 0,
                  headerOk: false,
                  miss: "id" as const,
                  archived: true as const,
                  archiveStudy: step5StudyNum(hit.is_study),
                  lessonCount: null as number | null,
                  branch: bid,
                  switched: bid !== (Number(branch) || 1),
                  token: t,
                  request,
                  study: Number.NaN,
                  removed: rem,
                  authStop: false,
                  rejectCid: false,
                  stopped: false,
                };
              }
              found = hit;
              used = bid;
              switched = bid !== (Number(branch) || 1);
              break archiveScan;
            }
            break;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (/\b401\b|\b403\b/.test(msg)) {
              authStop = true;
              break archiveScan;
            }
            if (/\b400\b|\b422\b/.test(msg)) {
              break;
            }
            if (/\b429\b/.test(msg) && !retried) {
              retried = true;
              const go = await step5WaitOrStop(120000);
              if (!go) {
                stopped = true;
                break archiveScan;
              }
              continue;
            }
            break;
          }
        }
      }
    }
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
  hasCorrect?: boolean;
  hasRefund?: boolean;
  miss?: "" | "id" | "balance";
}): { codes: AuditCode[]; c: boolean; main: string; dCash: number } {
  if (!p.headerOk) {
    const miss = p.miss === "id" ? "нет id" : p.miss === "balance" ? "нет balance" : "нет ответа";
    return { codes: [miss], c: false, main: "", dCash: 0 };
  }
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
    hasCorrect: p.hasCorrect,
    hasRefund: p.hasRefund,
  });
  const codes: AuditCode[] = [];
  if (r.c) codes.push("ok");
  const asCode = (x: string): AuditCode => (x === "product" ? "goods" : (x as AuditCode));
  if (r.main) codes.push(asCode(r.main));
  for (const t of r.tail) {
    if (t && t !== r.main) codes.push(asCode(t));
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
        clients: Number.NaN,
        alfa: Number.NaN,
        cash: Number.NaN,
        codes: ["нет ответа"] as AuditCode[],
        repaired: false,
        at,
        extra: "стоп",
        headerStamped: Number.NaN,
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
        clients: Number.NaN,
        alfa: Number.NaN,
        cash: Number.NaN,
        codes: ["нет ответа"] as AuditCode[],
        repaired: false,
        at,
        extra: "Нет номера ученика.",
        headerStamped: Number.NaN,
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
        clients: Number.NaN,
        alfa: Number.NaN,
        cash: Number.NaN,
        codes: ["нет ответа"] as AuditCode[],
        repaired: false,
        at,
        extra: `диск: ${err}`,
        headerStamped: Number.NaN,
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
        alfa: Number.NaN,
        cash: 0,
        codes: ["нет ответа"],
        repaired: false,
        at,
        extra: "Досье нет, шаг 5 не создаёт.",
        headerStamped: Number.NaN,
      } satisfies AuditHit,
    };
  }

  const { pendingExportIds } = await import("./crm-export-queue");
  const outgoing = pendingExportIds(["pay.create", "pay.update", "pay.delete"]).has(id);
  const pendingPay = outgoing || first.payPending;
  if (pendingPay) {
    return {
      hit: {
        cid: id,
        branchId: branch,
        name: first.name,
        clients: first.clients,
        alfa: Number.NaN,
        cash: first.cash,
        woSum: first.woCal,
        woN: first.woN,
        codes: ["snap"],
        repaired: false,
        at,
        extra: "касса ещё пишется",
        headerStamped: first.headerStamped,
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
        alfa: Number.NaN,
        cash: first.cash,
        woSum: first.woCal,
        woN: first.woN,
        codes: ["lessons"],
        repaired: false,
        at,
        extra: "журнал не закрыт, шапку не зовём",
        headerStamped: first.headerStamped,
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
    payFilled: first.paysComplete,
  });
  if (!sverka) {
    const noRole = /нет роли|не разобрали/.test(skip);
    return {
      hit: {
        cid: id,
        branchId: branch,
        name: first.name,
        clients: first.clients,
        alfa: Number.NaN,
        cash: first.cash,
        woSum: first.woCal,
        woN: first.woN,
        codes: (noRole ? ["нет роли"] : ["нет сверки"]) as AuditCode[],
        repaired: false,
        at,
        extra: skip || "кассы нет / нет А",
        headerStamped: first.headerStamped,
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
        alfa: Number.NaN,
        cash: first.cash,
        woSum: first.woCal,
        woN: first.woN,
        codes: ["нет ответа"],
        repaired: false,
        at,
        extra: "стоп на 429",
        headerStamped: first.headerStamped,
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
        alfa: Number.NaN,
        cash: first.cash,
        woSum: first.woCal,
        woN: first.woN,
        codes: ["нет ответа"],
        repaired: false,
        at,
        extra: "401/403: сессию шага 5 стопать",
        headerStamped: first.headerStamped,
      } satisfies AuditHit,
      authStop: true,
    };
  }
  if ("archived" in shown && shown.archived) {
    const archiveStudy = "archiveStudy" in shown ? shown.archiveStudy : Number.NaN;
    const was = archiveStudy === 0 || (archiveStudy !== 1 && first.study === 0) ? "лид" : "клиент";
    const { upsertDossier } = await import("./dossiers");
    upsertDossier({
      crmId: id,
      source: "step5-archive",
      status: "архив",
      extras: { removed: "2", recheckArchive: "1", was },
      persist: true,
      byCrmOnly: true,
      quiet: true,
    });
    return {
      hit: {
        cid: id,
        branchId: branch,
        name: first.name,
        clients: first.clients,
        alfa: Number.NaN,
        cash: first.cash,
        woSum: first.woCal,
        woN: first.woN,
        codes: ["нет сверки", "архив"] as AuditCode[],
        repaired: false,
        at,
        extra: "в архиве Alfa, из текущих ушёл",
        headerStamped: first.headerStamped,
      } satisfies AuditHit,
    };
  }

  const liveHeader = shown.ok && shown.headerOk ? shown.alfa : Number.NaN;
  const woLive = Number.isFinite(liveHeader)
    ? step5ApplyDebts(
        { n: Number(first.woBaseN ?? first.woCal) || 0, k: Number(first.woBaseK ?? first.woN) || 0 },
        first.woDebts || [],
        first.cashLessons,
        first.goodsAmounts || first.goodsNet,
        liveHeader,
      )
    : { n: first.woCal, k: first.woN };

  let alfaSplit: Awaited<ReturnType<typeof peekAlfaPaySplit>> | null = null;
  let alfaWo: Awaited<ReturnType<typeof peekAlfaLessonCommission>> | null = null;
  if (shown.ok && shown.token && !shown.stopped && !shown.authStop) {
    try {
      alfaSplit = await peekAlfaPaySplit(shown.request, shown.token, shown.branch || branch, id);
    } catch {
      alfaSplit = { ok: false as const };
    }
    try {
      alfaWo = await peekAlfaLessonCommission(shown.request, shown.token, shown.branch || branch, id);
    } catch {
      alfaWo = { ok: false as const };
    }
  }

  const woPick = Number.isFinite(liveHeader)
    ? step5PickWriteoff(
        woLive,
        alfaWo && alfaWo.ok ? { ok: true, n: alfaWo.alfaWoSum, k: alfaWo.alfaWoN } : null,
        first.cashLessons,
        first.goodsAmounts || first.goodsNet,
        liveHeader,
      )
    : woLive;
  const liveFit = Number.isFinite(liveHeader)
    ? step5FitRemainder(first.cashLessons, woPick.n, first.goodsAmounts || first.goodsNet, liveHeader)
    : { n: first.formulaSite, goods: first.goodsFitted || 0 };
  const formulaSite = Number.isFinite(liveFit.n) ? liveFit.n : first.formulaSite;

  const judged = codesFromCanon({
    headerOk: Boolean(shown.ok && shown.headerOk),
    miss: shown.miss || (shown.authStop ? "" : shown.ok ? "balance" : "id"),
    sverka,
    pending: false,
    formulaSite,
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
    hasCorrect: (first.corrN || 0) > 0,
    hasRefund: (first.refundN || 0) > 0,
  });

  if (shown.ok && shown.headerOk) {
    // extras.header, не stampDossierAlfaBalance
    const { upsertDossier } = await import("./dossiers");
    const extras: Record<string, string> = {
      header: String(shown.alfa),
      headerAt: day,
      auditRecheckAt: day,
      auditReason: judged.main,
      C: judged.c ? "1" : "0",
    };
    if (shown.lessonCount != null) extras.headerC = String(shown.lessonCount);
    upsertDossier({ crmId: id, source: "step5-header", extras, persist: true, byCrmOnly: true });
    step5CompleteAdd(id);
  }

  let extra = shown.ok && shown.headerOk
    ? `Клиенты ${Number.isFinite(formulaSite) ? rub(formulaSite) : "не собрали"} · Alfa ${rub(shown.alfa)} · касса ${Number.isFinite(formulaSite) ? rub(formulaSite) : "не собрали"} · ${judged.codes.join(", ")}`
    : shown.rejectCid
      ? "400/422, шапки нет"
      : shown.authStop
        ? "нет ответа Alfa"
        : shown.miss === "balance"
          ? "нет balance"
          : shown.miss === "id"
            ? "id не найден"
            : skip || "нет ответа Alfa";
  if (judged.c && judged.dCash > 1 && step5UnitScale(Number(formulaSite) || 0, shown.ok ? shown.alfa : 0) === 1) extra += "; приход больше шапки на списания, так бывает";
  let showSite = formulaSite;
  const unitScale = shown.ok && shown.headerOk ? step5UnitScale(Number(formulaSite) || 0, shown.alfa) : 1;
  if (unitScale === 100) {
    extra += "; формула и шапка отличаются в 100 раз — сошлись как рубли и копейки";
    showSite = Number(formulaSite) / 100;
  }
  return {
    hit: {
      cid: id,
      branchId: shown.branch || branch,
      name: first.name,
      clients: Number.isFinite(showSite) ? showSite : Number.NaN,
      alfa: shown.ok && shown.headerOk ? shown.alfa : Number.NaN,
      cash: Number.isFinite(showSite) ? showSite : Number.NaN,
      woSum: woPick.n,
      woN: woPick.k,
      cttRest: 0,
      codes: judged.codes,
      repaired: false,
      at,
      extra,
      headerStamped: shown.ok && shown.headerOk ? shown.alfa : first.headerStamped,
      unitScale,
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
      ...(alfaWo && alfaWo.ok
        ? {
            alfaWoSum: alfaWo.alfaWoSum,
            alfaWoN: alfaWo.alfaWoN,
            alfaWoOk: true,
          }
        : { alfaWoOk: false }),
    } satisfies AuditHit,
  };
}

export function reviveAuditHit(hit: AuditHit): AuditHit {
  if (!step5ReviveEmptySkip(hit)) return hit;
  const zero = (n: number) => (Number.isFinite(n) ? n : 0);
  return {
    ...hit,
    clients: zero(hit.clients),
    cash: zero(hit.cash),
    alfa: zero(hit.alfa),
    headerStamped: zero(Number(hit.headerStamped)),
    codes: ["ok"],
    extra: "пустая лента, 0=0=0",
  };
}

export function reviveAuditReport(rep: AuditReport | null | undefined): AuditReport | null {
  if (!rep) return null;
  const rows = (rep.rows || []).map(reviveAuditHit);
  const ok = rows.filter((r) => auditOnRight(r.codes)).length;
  return { ...rep, rows, ok };
}

export function mergeAudit(prev: AuditReport | null | undefined, hit: AuditHit, idx: number): AuditReport {
  const rows = [reviveAuditHit(hit), ...(prev?.rows || []).filter((r) => r.cid !== hit.cid).map(reviveAuditHit)].slice(0, 400);
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
