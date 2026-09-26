/** Шаг 6. Колонки и касса лидов. В досье роль не пишет. В сверку шага 5 не пишет. */

import { request, token as alfaToken, dropAlfaIndex } from "./alfacrm";
import { crmUnwrapIndex, crmIndexAccumTotal, crmIndexShouldStop } from "./crm-leads-stages";
import { kindFromAlfaPay, alfaPayIndexDate, extraPayTypeIds, payCustomerIdOf } from "./crm-pay-core";
import { writeoffSumOf, uniqueBranches } from "./crm-ledger-core";
import { step5Close, step5FitRemainder, step5Money, parseAlfaHeaderCanon, step6DiskAgrees } from "./crm-step5-canon";
import { replaceStep6Branch, stampStep6Cash, peekLeadBoard, peekStep7Board, stampStep7Cash, readCrmLeadColumns, deferStepCash, reopenStepCash } from "./crm-leads";
import { beginStepRun, closeStepRun, saveRun } from "./crm-step-run-log";
import { loadCustomerCalendar } from "./group-cards";
import { paysOf } from "./crm-pay";
import { isApiLeadStudy, step6ColumnId, step6LessonDisk, cashRetryPlan } from "./crm-step6-core";
import { step7HeaderQuery, step7Shows, type Step7Pick } from "./crm-step7-core";
import { toAlfaLessonDate } from "./crm-journal-periods";
import type { LeadCard, LeadStage } from "./crm-leads-stages";
import type { StepLogRow, StepLogSettings } from "./crm-step-run-log-core";

export { isApiClientStudy, isApiLeadStudy, step6ColumnId } from "./crm-step6-core";

const PAGE = 100;
const BRANCHES = [1, 2, 3, 4];
const COL_LOG: StepLogSettings = { kind: "step6", recheck: false, src: "hands" };
const CASH_LOG: StepLogSettings = { kind: "step6", recheck: true, src: "hands" };

function writeStep6(settings: StepLogSettings, rows: Omit<StepLogRow, "id" | "at" | "runId" | "settings">[], close: boolean, step: 6 | 7 = 6) {
  try {
    const run = beginStepRun({ step, settings });
    const at = new Date().toISOString();
    const next: StepLogRow[] = rows.map((row, i) => ({
      ...row,
      id: `r6-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      at,
      runId: run.id,
      settings,
    }));
    const saved = saveRun({ ...run, rows: [...run.rows, ...next] });
    if (close) closeStepRun(saved.id);
  } catch {
    /* лог не роняет шаг */
  }
}

class CashCut extends Error {
  constructor() {
    super("30 секунд");
    this.name = "CashCut";
  }
}

function isCashCut(e: unknown) {
  return e instanceof CashCut || (e instanceof Error && e.name === "CashCut");
}

function cashCut(until: number) {
  if (until && Date.now() >= until) throw new CashCut();
}

async function readPages(path: string, body: Record<string, unknown>, tok: string, until = 0) {
  const items: Record<string, unknown>[] = [];
  let loaded = 0;
  let total = Number.POSITIVE_INFINITY;
  for (let page = 0; page < 200; page += 1) {
    cashCut(until);
    const json = await request<unknown>(path, { ...body, page, pageSize: PAGE }, tok, until);
    const pack = crmUnwrapIndex(json);
    const batch = pack.items;
    const count = Number.isFinite(Number(pack.count)) ? Number(pack.count) : batch.length;
    total = crmIndexAccumTotal(page, PAGE, batch.length, pack.total, total);
    if (count === 0 || batch.length === 0) return items;
    items.push(...batch);
    loaded += count || batch.length;
    if (crmIndexShouldStop(PAGE, batch.length, pack.count, loaded, total)) return items;
  }
  throw new Error("список не кончился");
}

function stageOfRow(row: Record<string, unknown>): LeadStage | null {
  const id = Number(row.id);
  if (!Number.isFinite(id)) return null;
  const name = String(row.name || "").trim();
  return {
    id,
    name: name || `этап ${id}`,
    color: String(row.color || "").trim() || "#6a6a6a",
    weight: Number(row.weight ?? row.sort ?? 0) || 0,
    pipelineId: Number(row.pipeline_id) || 0,
  };
}

function cardOf(row: Record<string, unknown>, branchId: number, stages: LeadStage[]): LeadCard | null {
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  if (!isApiLeadStudy(row.is_study)) return null;
  const statusId = step6ColumnId(row.lead_status_ids, stages, row.lead_status_id);
  const name = String(row.name || "").trim() || `лид ${id}`;
  return {
    id,
    customerId: id,
    branchId,
    branches: [branchId],
    name,
    age: "",
    phone: String(row.phone || ""),
    email: String(row.email || ""),
    note: "",
    assigned: "",
    statusId: statusId == null ? -1 : statusId,
    at: new Date().toISOString(),
    chats: 0,
    cashState: "wait",
  };
}

export async function syncStep6Columns() {
  dropAlfaIndex();
  const tok = await alfaToken();
  const notes: string[] = [];
  const logRows: Omit<StepLogRow, "id" | "at" | "runId" | "settings">[] = [];
  for (const branch of BRANCHES) {
    try {
      const stageRows = await readPages(`/v2api/${branch}/lead-status/index`, {}, tok);
      const stages = stageRows.map(stageOfRow).filter((s): s is LeadStage => Boolean(s));
      if (!stages.some((s) => String(s.name || "").trim() === "Не разобрано")) {
        stages.unshift({ id: 0, name: "Не разобрано", color: "#6a6a6a", weight: 0, pipelineId: 0 });
      }
      const rows = await readPages(`/v2api/${branch}/customer/index`, { is_study: 0, removed: 0 }, tok);
      const byId = new Map<number, LeadCard>();
      for (const row of rows) {
        const card = cardOf(row, branch, stages);
        if (card) byId.set(card.id, card);
      }
      const cards = [...byId.values()];
      const board = await readCrmLeadColumns(branch, stages.map((s) => s.id), tok).catch(() => []);
      const byLead = new Map<number, number>();
      const many = new Set<number>();
      for (const row of board) {
        const prev = byLead.get(row.id);
        if (prev == null) byLead.set(row.id, row.statusId);
        else if (prev !== row.statusId) many.add(row.id);
      }
      if (board.length) {
        for (const card of cards) {
          if (many.has(card.id)) card.statusId = -1;
          else if (byLead.has(card.id)) card.statusId = byLead.get(card.id) ?? 0;
          else if (card.statusId < 0) card.statusId = 0;
        }
      }
      replaceStep6Branch(branch, cards, stages);
      const placed = cards.filter((c) => c.statusId >= 0).length;
      notes.push(`${branch}: ${placed}`);
      for (const card of cards) {
        const col = card.statusId < 0 ? "не в колонке" : stages.find((s) => s.id === card.statusId)?.name || `этап ${card.statusId}`;
        logRows.push({
          step: 6,
          cid: card.id,
          branchId: branch,
          name: card.name,
          action: "load",
          result: card.statusId < 0 ? "left" : "right",
          ok: true,
          matched: card.statusId >= 0,
          note: col,
          extra: col,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "обрыв";
      notes.push(`${branch}: оставлено · ${msg}`);
      logRows.push({
        step: 6,
        branchId: branch,
        name: `филиал ${branch}`,
        action: "fail",
        result: "fail",
        ok: false,
        note: msg,
        error: msg,
      });
    }
  }
  writeStep6(COL_LOG, logRows, true);
  return { ok: true as const, note: `Шаг 6 · колонки · ${notes.join(" · ")}` };
}

function payParts(item: Record<string, unknown>) {
  const kind = kindFromAlfaPay(item);
  const income = step5Money(item.income);
  const expenditure = step5Money(item.expenditure);
  const inn = income.ok ? income.n : 0;
  const out = expenditure.ok ? expenditure.n : 0;
  if (kind === "product") return { kind, product: true, n: 0, goods: Math.abs(out || inn) };
  let n = inn - out;
  if (kind === "refund" && n > 0) n = -n;
  return { kind, product: false, n, goods: 0 };
}

function posId(raw: unknown) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function branchTitle(id: number) {
  return ({ 1: "Гражданская", 2: "ЦМИТ", 3: "Луховицы", 4: "Лето" } as Record<number, string>)[id] || `филиал ${id}`;
}

function rubPlain(n: number) {
  const sign = n < 0 ? "−" : n > 0 ? "+" : "";
  const abs = Math.abs(Math.round(n * 100) / 100);
  const body = Number.isInteger(abs) ? String(abs) : String(abs).replace(".", ",");
  return `${sign}${body} ₽`;
}
function idGap(disk: Set<number>, alfa: Set<number>) {
  let hole = 0;
  let extra = 0;
  for (const id of disk) if (!alfa.has(id)) hole += 1;
  for (const id of alfa) if (!disk.has(id)) extra += 1;
  return { hole, extra };
}

/** Списание этого клиента: details.commission, иначе cost. Чужой detail и price не берём. */
function alfaCustomerCommission(row: Record<string, unknown>, customerId: number): number | null {
  const details = Array.isArray(row.details) ? (row.details as Record<string, unknown>[]) : [];
  const own = details.filter((d) => Number(d.customer_id || d.customerId) === customerId);
  const lessonOwner = Number(row.customer_id || row.customerId) === customerId;
  const listed = Array.isArray(row.customer_ids) && row.customer_ids.some((x) => Number(x) === customerId);
  const hit = own[0] || ((lessonOwner || listed) && details.length === 1 ? details[0] : undefined);
  if (!hit) return null;
  const raw = Object.prototype.hasOwnProperty.call(hit, "commission")
    ? hit.commission
    : Object.prototype.hasOwnProperty.call(hit, "commision")
      ? hit.commision
      : Object.prototype.hasOwnProperty.call(hit, "cost")
        ? hit.cost
        : undefined;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

type CashPass = {
  step: 6 | 7;
  onlyId: number;
  items: () => LeadCard[];
  stamp: (id: number, patch: Partial<LeadCard>) => void;
  customer: (id: number) => Record<string, unknown>;
  emptyNote: string;
  missingNote: string;
  keep?: (card: LeadCard) => boolean;
};

export async function recheckStep6Cash(onlyId = 0, restart = false) {
  if (restart) reopenStepCash(6);
  return recheckCashPass({
    step: 6,
    onlyId,
    items: () => peekLeadBoard()?.items || [],
    stamp: stampStep6Cash,
    customer: (id) => ({ id, is_study: 0, removed: 0, page: 0, pageSize: 1 }),
    emptyNote: "Кассу шага 6 снимать некого. Сначала колонки.",
    missingNote: "Этого лида нет на шаге 6.",
  });
}

export async function recheckStep7Cash(onlyId = 0, pick?: Step7Pick, restart = false) {
  if (restart) reopenStepCash(7);
  return recheckCashPass({
    step: 7,
    onlyId,
    items: () => peekStep7Board()?.items || [],
    stamp: stampStep7Cash,
    customer: (id) => step7HeaderQuery(id, (peekStep7Board()?.items || []).find((x) => x.id === id)?.study),
    emptyNote: "Кассу шага 7 снимать некого. Сначала прочитайте архив.",
    missingNote: "Этого клиента нет на шаге 7.",
    keep: pick ? (card) => step7Shows(card, pick) : undefined,
  });
}

export async function recheckCashPass(opts: CashPass) {
  const items = opts.items();
  const wanted = Number(opts.onlyId) || 0;
  const pass = (x: LeadCard) => wanted > 0 || !opts.keep || opts.keep(x);
  const queued = (x: LeadCard) => pass(x) && !x.cashGiveUp && (x.cashState === "wait" || !x.cashState || ((x.cashState === "ok" || x.cashState === "gap") && (x.cashPayN == null || x.cashDiskKnown == null || x.cashNoCommission == null || x.cashBranches == null || !step6DiskAgrees(x))));
  const waiting = items.filter(queued);
  const fresh = waiting.filter((x) => !x.cashState || x.cashState === "wait");
  const id = wanted || fresh[0]?.id || waiting[0]?.id || 0;
  if (!id) {
    if (opts.keep && items.length && !items.some((x) => opts.keep?.(x))) return { ok: true as const, more: false, pauseMs: 0, note: "По фильтру «кого писать на диск» кассу снимать некого." };
    if (opts.keep && items.some((x) => opts.keep?.(x))) return { ok: true as const, more: false, pauseMs: 0, note: "По этому отбору новых для кассы нет." };
    return { ok: true as const, more: false, pauseMs: 0, note: opts.emptyNote };
  }
  if (wanted && !items.some((x) => x.id === wanted)) return { ok: false as const, more: false, pauseMs: 0, error: opts.missingNote };
  const card0 = items.find((x) => x.id === id);
  const card = wanted && card0?.cashGiveUp
    ? (opts.stamp(id, { cashGiveUp: false, cashRetry: false, cashTries: 0, cashFail: "" }), { ...card0, cashGiveUp: false, cashRetry: false, cashTries: 0, cashFail: "" })
    : card0;
  const timed = Boolean(card?.cashRetry);
  const triesDone = Number(card?.cashTries) || 0;
  const until = timed ? Date.now() + 30_000 : 0;
  const who = () => opts.items().find((x) => x.id === id)?.name || card?.name || `№${id}`;
  const still = () => wanted ? false : opts.items().some((x) => queued(x) && (!x.cashState || x.cashState === "wait"));
  const park = (msg: string) => {
    const plan = cashRetryPlan(triesDone, timed, true);
    const name = who();
    const attempt = timed ? `попытка ${plan.tries}/3 · ` : "";
    const tail = plan.giveUp ? "больше не ставим в конец" : "в конец";
    const note = `${name} · ${attempt}${msg} · ${tail}`;
    writeStep6(CASH_LOG, [{
      step: opts.step,
      cid: id,
      branchId: branchesOf(),
      name,
      action: "fail",
      result: "fail",
      ok: false,
      note,
      error: msg,
    }], false, opts.step);
    const patch = { cashTries: plan.tries, cashRetry: plan.again, cashGiveUp: plan.giveUp, cashFail: msg };
    if (plan.again) deferStepCash(opts.step, id, patch);
    else opts.stamp(id, patch);
    return { ok: true as const, more: still(), pauseMs: plan.pauseMs, note };
  };
  const branchesOf = () => {
    const rows = opts.items().filter((x) => x.id === id);
    const list = [...new Set(rows.map((x) => x.branchId).filter((n) => n > 0))];
    return list[0];
  };
  const branches = [...new Set(items.filter((x) => x.id === id).map((x) => x.branchId).filter((n) => n > 0))];
  const scan = uniqueBranches(branches[0] || 1);
  dropAlfaIndex();
  let tok = "";
  try {
    cashCut(until);
    tok = await alfaToken(until);
  } catch (e) {
    return park(e instanceof Error && isCashCut(e) ? "30 секунд, карточка не дочитана" : e instanceof Error ? e.message : "нет входа в Alfa");
  }
  let header = Number.NaN;
  let saw = false;
  let failed = 0;
  for (const branch of scan) {
    try {
      cashCut(until);
      const json = await request<unknown>(`/v2api/${branch}/customer/index`, opts.customer(id), tok, until);
      const hit = crmUnwrapIndex(json).items.find((x) => Number(x.id) === id);
      if (!hit) continue;
      saw = true;
      if (Object.prototype.hasOwnProperty.call(hit, "balance")) {
        const parsed = parseAlfaHeaderCanon(hit);
        if (parsed.ok) header = parsed.header;
      }
      break;
    } catch (e) {
      if (isCashCut(e)) return park("30 секунд, карточка не дочитана");
      failed += 1;
    }
  }
  if (!saw && failed > 0) return park("Alfa не ответила");
  if (!saw || !Number.isFinite(header)) {
    opts.stamp(id, { cashState: "no-balance", cashSort: "", cashAt: new Date().toISOString(), cashRetry: false, cashGiveUp: false });
    const left = still();
    const name = who();
    writeStep6(CASH_LOG, [{
      step: opts.step,
      cid: id,
      branchId: branches[0],
      name,
      action: "recheck",
      result: "skip",
      ok: true,
      note: "нет balance",
    }], !left, opts.step);
    return { ok: true as const, more: left, pauseMs: timed ? 5000 : 0, note: `№${id} · нет balance` };
  }
  let cash = 0;
  const goods: number[] = [];
  const payIds = new Set<number>();
  const alfaPayRows: Record<string, unknown>[] = [];
  const lesIds = new Set<number>();
  let payNoId = 0;
  let lesNoId = 0;
  let payN = 0;
  let paySum = 0;
  let corrN = 0;
  let corrSum = 0;
  let refundN = 0;
  let refundSum = 0;
  let lessons = 0;
  let writeoff = 0;
  let noCommission = 0;
  const payAt = new Map<number, { n: number; sum: number; ids: number[] }>();
  const lesAt = new Map<number, { n: number; sum: number; ids: number[] }>();
  const alfaLessons: { row: Record<string, unknown>; commission: number; branch: number }[] = [];
  const payFrom = alfaPayIndexDate("2015-01-01");
  const payTo = alfaPayIndexDate(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10));
  const lessonTo = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  let cut = "";
  for (const branch of scan) {
    try {
    cashCut(until);
    const payBodies = [
      { customer_id: id, date_from: payFrom, date_to: payTo },
      ...extraPayTypeIds().map((pay_type_id) => ({ customer_id: id, pay_type_id, date_from: payFrom, date_to: payTo })),
    ];
    const pays: Record<string, unknown>[] = [];
    for (const body of payBodies) {
      cashCut(until);
      pays.push(...await readPages(`/v2api/${branch}/pay/index`, body, tok, until));
    }
    for (const row of pays) {
      if (row.deleted === true || row.deleted === 1 || row.deleted === "1") continue;
      const pid = posId(row.id);
      const owner = payCustomerIdOf(row, 0);
      if (!pid || (owner && owner !== id)) {
        payNoId += 1;
        continue;
      }
      if (payIds.has(pid)) continue;
      payIds.add(pid);
      alfaPayRows.push({ ...row, branch_id: posId(row.branch_id) || branch });
      const part = payParts(row);
      const bid = posId(row.branch_id) || branch;
      if (part.product) {
        if (part.goods > 0) goods.push(part.goods);
        continue;
      }
      cash += part.n;
      if (part.kind === "correct") {
        corrN += 1;
        corrSum += part.n;
      } else if (part.kind === "refund") {
        refundN += 1;
        refundSum += part.n;
      } else {
        payN += 1;
        paySum += part.n;
        const slot = payAt.get(bid) || { n: 0, sum: 0, ids: [] };
        slot.n += 1;
        slot.sum += part.n;
        slot.ids.push(pid);
        payAt.set(bid, slot);
      }
    }
    cashCut(until);
    const lrows = await readPages(`/v2api/${branch}/lesson/index`, { customer_id: id, status: 3, date_from: "2015-01-01", date_to: lessonTo }, tok, until);
    for (const row of lrows) {
      const st = Number(row.status);
      if (Number.isFinite(st) && st !== 3) continue;
      const lid = posId(row.id);
      if (!lid) {
        lesNoId += 1;
        continue;
      }
      if (lesIds.has(lid)) continue;
      lesIds.add(lid);
      const commission = alfaCustomerCommission(row, id);
      if (commission == null) {
        noCommission += 1;
        continue;
      }
      lessons += 1;
      writeoff += commission;
      const lbid = posId(row.branch_id) || branch;
      const lslot = lesAt.get(lbid) || { n: 0, sum: 0, ids: [] };
      lslot.n += 1;
      lslot.sum += commission;
      lslot.ids.push(lid);
      lesAt.set(lbid, lslot);
      alfaLessons.push({ row, commission, branch });
    }
    } catch (e) {
      if (isCashCut(e)) cut = "30 секунд, карточка не дочитана";
      else if (e instanceof Error && e.message === "список не кончился") cut = "список не кончился";
      else cut = e instanceof Error ? e.message.slice(0, 180) : "ошибка чтения";
      break;
    }
  }
  let wrotePays = 0;
  try {
    const { absorbAlfaPays } = await import("./crm-pay");
    wrotePays = absorbAlfaPays(id, branches[0] || scan[0] || 1, alfaPayRows);
  } catch {
    wrotePays = -1;
  }
  let wroteLessons = 0;
  let lessonNote = "";
  if (alfaLessons.length) {
    try {
      const packed = [];
      let noDate = 0;
      for (const item of alfaLessons) {
        const lesson = step6LessonDisk(item.row, id, item.commission, item.branch);
        if (!lesson) {
          if (!toAlfaLessonDate(String(item.row.date || ""))) noDate += 1;
          continue;
        }
        packed.push(lesson);
      }
      const { appendMissingCustomerLessons } = await import("./group-cards");
      const saved = appendMissingCustomerLessons(id, packed);
      wroteLessons = saved.wrote + saved.opened;
      if (saved.opened) lessonNote = `статус 3: ${saved.opened}`;
      if (noDate) lessonNote = lessonNote ? `${lessonNote} · без даты ${noDate}` : `без даты ${noDate}`;
    } catch {
      wroteLessons = -1;
      lessonNote = "занятия не легли";
    }
  }
  if (cut) return park(cut);
  const cal = loadCustomerCalendar(id);
  const diskLesIds = new Set<number>();
  for (const lesson of cal) {
    if (Number(lesson.status) !== 3) continue;
    const lid = posId(lesson.lessonId);
    if (lid) diskLesIds.add(lid);
  }
  const diskWo = writeoffSumOf(cal, id);
  const diskPayIds = new Set<number>();
  let diskPayN = 0;
  let diskPaySum = 0;
  let diskCorrN = 0;
  let diskCorrSum = 0;
  let diskRefundN = 0;
  let diskRefundSum = 0;
  let diskGoodsN = 0;
  let diskGoodsSum = 0;
  for (const row of paysOf(id)) {
    if (row.deleted) continue;
    const pid = posId(row.id);
    if (!pid || diskPayIds.has(pid)) continue;
    diskPayIds.add(pid);
    const inn = Number(row.income) || 0;
    const out = Number(row.expenditure) || 0;
    if (row.kind === "product") {
      const g = Math.abs(out || inn);
      if (g > 0) {
        diskGoodsN += 1;
        diskGoodsSum += g;
      }
      continue;
    }
    let n = inn - out;
    if (row.kind === "refund" && n > 0) n = -n;
    if (row.kind === "correct") {
      diskCorrN += 1;
      diskCorrSum += n;
    } else if (row.kind === "refund") {
      diskRefundN += 1;
      diskRefundSum += n;
    } else {
      diskPayN += 1;
      diskPaySum += n;
    }
  }
  const payIdsGap = idGap(diskPayIds, payIds);
  const lesIdsGap = idGap(diskLesIds, lesIds);
  const diskKnown = diskPayIds.size > 0 || diskLesIds.size > 0;
  const branchBits = (map: Map<number, { n: number; sum: number; ids: number[] }>, disk: Set<number>) =>
    [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([bid, v]) => {
        const miss = diskKnown ? v.ids.filter((x) => !disk.has(x)).length : 0;
        return `${branchTitle(bid)} ${v.n} (${rubPlain(v.sum)})${miss ? `, нет на диске ${miss}` : ""}`;
      })
      .join(" · ");
  const cashBranches = `платежи: ${branchBits(payAt, diskPayIds) || "нет"} · занятия: ${branchBits(lesAt, diskLesIds) || "нет"}`;
  const idMiss = payNoId + lesNoId + noCommission + (diskKnown ? payIdsGap.hole + payIdsGap.extra + lesIdsGap.hole + lesIdsGap.extra : 0);
  const fitted = step5FitRemainder(cash, writeoff, goods, header);
  const idsOk = step6DiskAgrees({
    cashDiskKnown: diskKnown,
    cashPayHole: diskKnown ? payIdsGap.hole : 0,
    cashPayExtra: diskKnown ? payIdsGap.extra : 0,
    cashLesHole: diskKnown ? lesIdsGap.hole : 0,
    cashLesExtra: diskKnown ? lesIdsGap.extra : 0,
    cashNoId: payNoId + lesNoId,
    cashNoCommission: noCommission,
    cashPayN: payN,
    cashLesN: lessons,
  });
  const matched = step5Close(fitted.n, header) && idsOk;
  const payRows = payN + corrN + refundN;
  const empty = payRows === 0 && lessons === 0;
  const sort = lessons > 0 || (empty && !step5Close(header, 0)) ? "back" : payRows > 0 ? "paid" : "new";
  opts.stamp(id, {
    cashState: matched ? "ok" : "gap",
    cashSort: sort,
    cashBalance: header,
    cashFormula: fitted.n,
    cashAt: new Date().toISOString(),
    cashPayN: payN,
    cashPaySum: paySum,
    cashCorrN: corrN,
    cashCorrSum: corrSum,
    cashRefundN: refundN,
    cashRefundSum: refundSum,
    cashGoodsN: goods.length,
    cashGoodsSum: goods.reduce((s, a) => s + a, 0),
    cashGoodsFit: fitted.goods,
    cashLesN: lessons,
    cashLesSum: writeoff,
    cashDiskPayN: diskPayN,
    cashDiskPaySum: diskPaySum,
    cashDiskCorrN: diskCorrN,
    cashDiskCorrSum: diskCorrSum,
    cashDiskRefundN: diskRefundN,
    cashDiskRefundSum: diskRefundSum,
    cashDiskGoodsN: diskGoodsN,
    cashDiskGoodsSum: diskGoodsSum,
    cashDiskLesN: diskLesIds.size,
    cashDiskLesSum: diskWo,
    cashPayHole: diskKnown ? payIdsGap.hole : 0,
    cashPayExtra: diskKnown ? payIdsGap.extra : 0,
    cashLesHole: diskKnown ? lesIdsGap.hole : 0,
    cashLesExtra: diskKnown ? lesIdsGap.extra : 0,
    cashNoId: payNoId + lesNoId,
    cashNoCommission: noCommission,
    cashDiskKnown: diskKnown,
    cashBranches,
    cashRetry: false,
    cashGiveUp: false,
    cashFail: "",
  });
  const name = who();
  const left = still();
  const sortRu = sort === "new" ? "новый" : sort === "paid" ? "новый с деньгами" : "вернувшийся";
  writeStep6(CASH_LOG, [{
    step: opts.step,
    cid: id,
    branchId: branches[0],
    name,
    action: "recheck",
    result: matched ? "right" : "left",
    ok: true,
    matched,
    note: `${sortRu} · шапка ${header} · формула ${fitted.n}${wrotePays > 0 ? ` · платежи дописаны ${wrotePays}` : ""}${wroteLessons > 0 ? ` · занятия дописаны ${wroteLessons}` : ""}${lessonNote ? ` · ${lessonNote}` : ""}${idMiss ? ` · id не сошлись ${idMiss}` : ""}`,
    after: { header, formula: fitted.n },
  }], !left, opts.step);
  return {
    ok: true as const,
    more: left,
    pauseMs: timed ? 5000 : 0,
    note: `${name} · ${sortRu} · ${matched ? "совпало" : "не сошлось"}${left ? " · дальше" : ""}`,
  };
}
