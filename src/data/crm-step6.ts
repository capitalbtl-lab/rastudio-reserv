/** Шаг 6. Колонки и касса лидов. В досье роль не пишет. В сверку шага 5 не пишет. */

import { request, token as alfaToken, dropAlfaIndex } from "./alfacrm";
import { crmUnwrapIndex, crmIndexAccumTotal, crmIndexShouldStop } from "./crm-leads-stages";
import { kindFromAlfaPay } from "./crm-pay-core";
import { lessonWriteoffAmount } from "./crm-ledger-core";
import { step5Close, step5FitRemainder, step5Money, parseAlfaHeaderCanon } from "./crm-step5-canon";
import { replaceStep6Branch, stampStep6Cash, peekLeadBoard } from "./crm-leads";
import { isApiLeadStudy, step6ColumnId } from "./crm-step6-core";
import type { LeadCard, LeadStage } from "./crm-leads-stages";

export { isApiClientStudy, isApiLeadStudy, step6ColumnId } from "./crm-step6-core";

const PAGE = 100;
const BRANCHES = [1, 2, 3, 4];

async function readPages(path: string, body: Record<string, unknown>, tok: string) {
  const items: Record<string, unknown>[] = [];
  let loaded = 0;
  let total = Number.POSITIVE_INFINITY;
  for (let page = 0; page < 200; page += 1) {
    const json = await request<unknown>(path, { ...body, page, pageSize: PAGE }, tok);
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
      replaceStep6Branch(branch, cards, stages);
      const placed = cards.filter((c) => c.statusId >= 0).length;
      notes.push(`${branch}: ${placed}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "обрыв";
      notes.push(`${branch}: оставлено · ${msg}`);
    }
  }
  return { ok: true as const, note: `Шаг 6 · колонки · ${notes.join(" · ")}` };
}

function payParts(item: Record<string, unknown>) {
  const kind = kindFromAlfaPay(item);
  const income = step5Money(item.income);
  const expenditure = step5Money(item.expenditure);
  const inn = income.ok ? income.n : 0;
  const out = expenditure.ok ? expenditure.n : 0;
  if (kind === "product") return { product: true, n: 0, goods: Math.abs(out || inn) };
  let n = inn - out;
  if (kind === "refund" && n > 0) n = -n;
  return { product: false, n, goods: 0 };
}

export async function recheckStep6Cash() {
  const board = peekLeadBoard();
  const items = board?.items || [];
  const waiting = items.filter((x) => x.cashState === "wait");
  const id = waiting[0]?.id || 0;
  if (!id) return { ok: true as const, more: false, note: "Кассу шага 6 снимать некого. Сначала колонки." };
  const branches = [...new Set(items.filter((x) => x.id === id).map((x) => x.branchId).filter((n) => n > 0))];
  dropAlfaIndex();
  const tok = await alfaToken();
  let header = Number.NaN;
  let saw = false;
  let failed = 0;
  for (const branch of branches) {
    try {
      const json = await request<unknown>(
        `/v2api/${branch}/customer/index`,
        { id, is_study: 0, removed: 0, page: 0, pageSize: 1 },
        tok,
      );
      const hit = crmUnwrapIndex(json).items.find((x) => Number(x.id) === id);
      if (!hit) continue;
      saw = true;
      if (Object.prototype.hasOwnProperty.call(hit, "balance")) {
        const parsed = parseAlfaHeaderCanon(hit);
        if (parsed.ok) header = parsed.header;
      }
      break;
    } catch {
      failed += 1;
    }
  }
  if (!saw && failed > 0) throw new Error(`№${id} · Alfa не ответила`);
  if (!saw || !Number.isFinite(header)) {
    stampStep6Cash(id, { cashState: "no-balance", cashSort: "", cashAt: new Date().toISOString() });
    const left = (peekLeadBoard()?.items || []).some((x) => x.cashState === "wait");
    return { ok: true as const, more: left, note: `№${id} · нет balance` };
  }
  let cash = 0;
  const goods: number[] = [];
  let payRows = 0;
  let lessons = 0;
  let writeoff = 0;
  for (const branch of branches) {
    const pays = await readPages(`/v2api/${branch}/pay/index`, { customer_id: id }, tok);
    for (const row of pays) {
      if (row.deleted === true || row.deleted === 1 || row.deleted === "1") continue;
      const part = payParts(row);
      if (part.product) {
        if (part.goods > 0) goods.push(part.goods);
        continue;
      }
      payRows += 1;
      cash += part.n;
    }
    const lrows = await readPages(`/v2api/${branch}/lesson/index`, { customer_id: id }, tok);
    for (const row of lrows) {
      const status = row.status;
      if (status != null && status !== "" && Number(status) !== 3) continue;
      lessons += 1;
      writeoff += lessonWriteoffAmount(row, id);
    }
  }
  const fitted = step5FitRemainder(cash, writeoff, goods, header);
  const matched = step5Close(fitted.n, header);
  const empty = payRows === 0 && lessons === 0;
  const sort = lessons > 0 || (empty && !step5Close(header, 0)) ? "back" : payRows > 0 ? "paid" : "new";
  stampStep6Cash(id, {
    cashState: matched ? "ok" : "gap",
    cashSort: sort,
    cashBalance: header,
    cashFormula: fitted.n,
    cashAt: new Date().toISOString(),
  });
  const name = items.find((x) => x.id === id)?.name || `№${id}`;
  const left = (peekLeadBoard()?.items || []).some((x) => x.cashState === "wait");
  const sortRu = sort === "new" ? "новый" : sort === "paid" ? "новый с деньгами" : "вернувшийся";
  return {
    ok: true as const,
    more: left,
    note: `${name} · ${sortRu} · ${matched ? "совпало" : "не сошлось"}${left ? " · дальше" : ""}`,
  };
}
