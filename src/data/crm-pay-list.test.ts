import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { payKindOf, ruDateIso, type PayRow } from "./crm-pay-core.ts";

function row(p: Partial<PayRow> & Pick<PayRow, "id">): PayRow {
  return {
    customerId: 10,
    branchId: 1,
    kind: "income",
    income: 100,
    expenditure: 0,
    note: "",
    documentDate: "05.09.2026",
    at: "2026-09-05T10:00:00.000Z",
    ...p,
  };
}

/** Копия правила экрана: те же условия, что filterCashPays на диске. */
function filterCashPays(
  items: PayRow[],
  opts: { branchId?: number; kind?: string; customerId?: number; includeDeleted?: boolean } = {},
) {
  const branchId = Number(opts.branchId) || 0;
  const kind = String(opts.kind || "").trim();
  const customerId = Number(opts.customerId) || 0;
  const includeDeleted = Boolean(opts.includeDeleted);
  const out = items.filter((x) => {
    if (!includeDeleted && x.deleted) return false;
    if (branchId && Number(x.branchId) !== branchId) return false;
    if (kind && payKindOf(x.kind) !== payKindOf(kind)) return false;
    if (customerId && Number(x.customerId) !== customerId) return false;
    return true;
  });
  out.sort(
    (a, b) =>
      ruDateIso(b.documentDate).localeCompare(ruDateIso(a.documentDate)) ||
      String(b.at).localeCompare(String(a.at)) ||
      Number(b.id) - Number(a.id),
  );
  return out;
}

describe("касса список", () => {
  it("фильтр филиал/тип, без удалённых, новые сверху", () => {
    const items = [
      row({ id: 1, branchId: 1, documentDate: "01.09.2026", at: "2026-09-01T10:00:00.000Z" }),
      row({ id: 2, branchId: 2, documentDate: "07.09.2026", at: "2026-09-07T10:00:00.000Z" }),
      row({ id: 3, branchId: 1, kind: "refund", income: 0, expenditure: 50, documentDate: "06.09.2026", at: "2026-09-06T10:00:00.000Z" }),
      row({ id: 4, branchId: 1, deleted: true, documentDate: "08.09.2026", at: "2026-09-08T10:00:00.000Z" }),
    ];
    const all = filterCashPays(items);
    assert.equal(all.some((x) => x.id === 4), false);
    assert.equal(all[0].id, 2);
    assert.deepEqual(
      filterCashPays(items, { branchId: 1 }).map((x) => x.id),
      [3, 1],
    );
    assert.deepEqual(
      filterCashPays(items, { kind: "refund" }).map((x) => x.id),
      [3],
    );
    assert.equal(filterCashPays(items, { includeDeleted: true }).some((x) => x.id === 4), true);
    assert.deepEqual(
      filterCashPays(items, { customerId: 10, kind: "income" }).map((x) => x.id),
      [2, 1],
    );
    const pay = readFileSync(new URL("./crm-pay.ts", import.meta.url), "utf8");
    const body = pay.slice(pay.indexOf("export function filterCashPays"), pay.indexOf("export function listCashPays"));
    assert.match(body, /!includeDeleted && x.deleted/);
    assert.match(body, /Number\(x.branchId\) !== branchId/);
    assert.match(body, /payKindOf\(x.kind\) !== payKindOf\(kind\)/);
    assert.match(body, /ruDateIso\(b.documentDate\)\.localeCompare\(ruDateIso\(a.documentDate\)\)/);
  });

  it("экраны: pollPaysFromAlfa кнопкой, не kind:pays; журнал и вкладка", () => {
    const pay = readFileSync(new URL("./crm-pay.ts", import.meta.url), "utf8");
    assert.match(pay, /export function listCashPays/);
    assert.match(pay, /crmUnwrapIndex/);
    assert.match(pay, /payPollStampOrEmpty/);
    assert.match(pay, /payPollFirstFill/);
    assert.match(pay, /alfaPayIndexDate/);
    assert.match(pay, /date_from: alfaPayIndexDate/);
    assert.doesNotMatch(pay, /01\.01\.2020/);
    assert.doesNotMatch(pay, /pageSize: 50, \.\.\.dates/);
    assert.match(pay, /markPayJournalComplete/);
    assert.match(pay, /payPollLookbackDates/);
    assert.match(pay, /pay_type_id: 2/);
    assert.match(pay, /pay_type_id: 3/);
    assert.match(pay, /pay_type_id: 6/);
    assert.match(pay, /stampPayBalances/);
    const eco = readFileSync(new URL("../../ecosystem.config.cjs", import.meta.url), "utf8");
    assert.match(eco, /rastudio-pay-poll/);
    assert.match(eco, /\*\/15 \* \* \* \*/);
    assert.match(pay, /opts\?\.via !== "button"/);
    assert.match(pay, /dropAlfaAuth/);
    assert.match(pay, /export function filterCashPays/);
    assert.match(pay, /branchId: Number\(x.branchId\) \|\| 0/);
    const save = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    assert.match(save, /cashPoll/);
    assert.match(save, /cashList/);
    assert.match(save, /pollPaysFromAlfa\(\{ via: "button" \}\)/);
    assert.match(save, /customerPayDelete/);
    assert.match(save, /deletePay/);
    assert.match(save, /skip/);
    assert.equal(/kind:\s*["']pays["']/.test(save), false);
    const card = readFileSync(new URL("../components/crm-client-card.tsx", import.meta.url), "utf8");
    assert.match(card, /data-op="cash-journal"/);
    assert.match(card, /customerPayDelete/);
    assert.match(card, /paysComplete/);
    assert.match(card, /payKindName\(payKind\)/);
    assert.match(card, /CASH_PAGE_SIZES/);
    assert.match(card, /payAccountLabel/);
    assert.match(card, /cashPageSlice/);
    assert.match(card, /по \{n\}/);
    const tab = readFileSync(new URL("../components/admin-cash.tsx", import.meta.url), "utf8");
    assert.match(tab, /onOpenClient/);
    assert.match(tab, /cashPoll/);
    assert.match(tab, /Обновить кассу/);
    assert.match(tab, /CASH_PAGE_SIZES/);
    assert.match(tab, /payAccountLabel/);
    assert.match(tab, /skip: pg \* size/);
    assert.match(tab, /по \{n\}/);
    assert.match(tab, /fillNote/);
    assert.equal(/kind:\s*["']pays["']/.test(tab), false);
    assert.match(pay, /PAY_INBOUND_RUN/);
    assert.match(pay, /payFill/);
    assert.match(pay, /isPayJournalComplete/);
    assert.match(pay, /payFillAdvance/);
    assert.match(pay, /page: fill.page, pageSize: PAY_INBOUND_PAGE/);
    assert.match(pay, /cashTakeOf/);
    assert.match(pay, /PAY_STORE_CAP/);
    assert.match(pay, /payCttIdOf/);
    assert.match(pay, /ctt_id: ctt/);
    assert.match(pay, /parseDossierCtt/);
    const sched = readFileSync(new URL("../components/admin-schedule.tsx", import.meta.url), "utf8");
    assert.match(sched, /\["cash", "Касса"\]/);
    assert.match(sched, /AdminCash/);
    assert.match(sched, /ra-open-client/);
    const clients = readFileSync(new URL("../components/admin-clients.tsx", import.meta.url), "utf8");
    assert.match(clients, /CardAction/);
  });
});
