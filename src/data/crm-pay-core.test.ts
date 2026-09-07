import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { payEffect, balanceOf, displayedBalance, mergePayInbound, payAfterStamp, nextPayStamp, payPollAllowed, payPollHitsInWindow, payPollStampOrEmpty, payPollFirstFill, payCustomerIdOf, alfaPayDate, alfaPayIndexDate, kindFromAlfaPay, ruDateIso, OPENING_NOTE, type PayRow } from "./crm-pay-core.ts";

function row(p: Partial<PayRow> & Pick<PayRow, "id" | "kind" | "income" | "expenditure">): PayRow {
  return {
    customerId: 10,
    branchId: 1,
    note: "",
    documentDate: "05.09.2026",
    at: "2026-09-05T10:00:00.000Z",
    ...p,
  };
}

describe("журнал денег", () => {
  it("доход, возврат, товар и корректировка", () => {
    assert.deepEqual(payEffect("income", 1000, 200), { income: 1000, expenditure: 0, next: 1200 });
    assert.deepEqual(payEffect("refund", 300, 1000), { income: 0, expenditure: 300, next: 700 });
    assert.deepEqual(payEffect("product", 500, 1000), { income: 500, expenditure: 0, next: 1000 });
    assert.deepEqual(payEffect("correct", 2500, 1000), { income: 1500, expenditure: 0, next: 2500 });
    assert.deepEqual(payEffect("correct", 400, 1000), { income: 0, expenditure: 600, next: 400 });
  });

  it("остаток с диска, без строк — снимок карточки", () => {
    const rows = [
      row({ id: -1, kind: "correct", income: 500, expenditure: 0, note: OPENING_NOTE }),
      row({ id: -2, kind: "income", income: 1000, expenditure: 0 }),
      row({ id: -3, kind: "product", income: 200, expenditure: 0 }),
    ];
    assert.equal(balanceOf(rows), 1500);
    assert.equal(displayedBalance([], "800"), 800);
    assert.equal(displayedBalance(rows, "800"), 1500);
  });

  it("вход из Alfa не затирает очередь и свои id", () => {
    const prev = [
      row({ id: -4, kind: "income", income: 700, expenditure: 0 }),
      row({ id: 88, kind: "income", income: 100, expenditure: 0 }),
    ];
    const pulled = [
      row({ id: 88, kind: "income", income: 100, expenditure: 0 }),
      row({ id: 99, kind: "income", income: 50, expenditure: 0 }),
    ];
    const merged = mergePayInbound(pulled, prev, [-4]);
    assert.equal(merged.some((x) => x.id === -4), true);
    assert.equal(merged.some((x) => x.id === 99), true);
    assert.equal(merged.find((x) => x.id === -4)?.income, 700);
  });

  it("inbound сохраняет cttId; pending create/delete и deleted не затирает", () => {
    const prev = [
      row({ id: -7, kind: "income", income: 400, expenditure: 0, cttId: 55 }),
      row({ id: 201, kind: "income", income: 100, expenditure: 0, cttId: 12, deleted: true }),
    ];
    const pulled = [
      row({ id: 201, kind: "income", income: 100, expenditure: 0, cttId: 12 }),
      row({ id: 202, kind: "income", income: 800, expenditure: 0, cttId: 77, tariffId: 9, groupId: 465 }),
    ];
    const merged = mergePayInbound(pulled, prev, [-7, 201]);
    assert.equal(merged.some((x) => x.id === -7), true);
    assert.equal(merged.find((x) => x.id === 201)?.deleted, true);
    assert.equal(merged.find((x) => x.id === 202)?.cttId, 77);
    assert.equal(merged.find((x) => x.id === 202)?.tariffId, 9);
    assert.equal(merged.find((x) => x.id === 202)?.groupId, 465);
  });

  it("deleted не двигает остаток", () => {
    const rows = [
      row({ id: 1, kind: "income", income: 1000, expenditure: 0 }),
      row({ id: 2, kind: "income", income: 500, expenditure: 0, deleted: true }),
    ];
    assert.equal(balanceOf(rows), 1000);
    assert.equal(displayedBalance(rows, "0"), 1000);
  });

  it("штамп: дата/id ≥, автоопрос 10/час", () => {
    const stamp = { lastId: 50, lastDate: "2026-09-07" };
    assert.equal(payAfterStamp({ id: 51, documentDate: "07.09.2026" }, stamp), true);
    assert.equal(payAfterStamp({ id: 50, documentDate: "07.09.2026" }, stamp), false);
    assert.equal(payAfterStamp({ id: 1, documentDate: "08.09.2026" }, stamp), true);
    assert.equal(payAfterStamp({ id: 99, documentDate: "06.09.2026" }, stamp), false);
    const next = nextPayStamp([{ id: 80, documentDate: "07.09.2026" }, { id: 3, documentDate: "08.09.2026" }], stamp);
    assert.equal(next.lastDate, "2026-09-08");
    assert.equal(next.lastId, 3);
    const now = Date.parse("2026-09-07T12:00:00Z");
    const hits = Array.from({ length: 10 }, (_, i) => new Date(now - i * 60_000).toISOString());
    assert.equal(payPollAllowed(hits, now), false);
    assert.equal(payPollAllowed(hits.slice(1), now), true);
    assert.equal(payPollHitsInWindow(["2026-09-07T10:00:00Z", "2026-09-07T11:50:00Z"], now).length, 1);
    assert.deepEqual(payPollStampOrEmpty({ lastId: 0, lastDate: "2026-09-07" }), { lastId: 0, lastDate: "" });
    assert.equal(payAfterStamp({ id: 9, documentDate: "01.01.2025" }, payPollStampOrEmpty({ lastId: 0, lastDate: "2026-09-07" })), true);
    assert.equal(payPollStampOrEmpty({ lastId: 80, lastDate: "07.09.2026" }).lastId, 80);
    assert.equal(payPollFirstFill({}), true);
    assert.equal(payPollFirstFill({ "1": { lastId: 0, lastDate: "2026-09-07" } }), true);
    assert.equal(payPollFirstFill({ "1": { lastId: 9, lastDate: "2026-09-07" }, "2": { lastId: 0, lastDate: "" }, "3": { lastId: 0, lastDate: "" }, "4": { lastId: 0, lastDate: "" } }), false);
    assert.equal(kindFromAlfaPay({ pay_type_id: 1, income: 100 }), "income");
    assert.equal(kindFromAlfaPay({ pay_type_id: 2, expenditure: 50 }), "refund");
    assert.equal(kindFromAlfaPay({ pay_type_id: 3, income: 10 }), "correct");
    assert.equal(kindFromAlfaPay({ commodity_id: 9, income: 200 }), "product");
    assert.equal(kindFromAlfaPay({ note: "Корректировка остатка", income: 1 }), "correct");
    assert.equal(kindFromAlfaPay({ expenditure: 80 }), "refund");
    assert.equal(payCustomerIdOf({ customer: { id: 44 } }), 44);
    assert.equal(alfaPayDate("2026-09-07"), "07.09.2026");
    assert.equal(alfaPayDate("07.09.2026"), "07.09.2026");
    assert.equal(alfaPayIndexDate("07.09.2026"), "2026.09.07");
    assert.equal(alfaPayIndexDate("2026-09-07"), "2026.09.07");
    assert.equal(ruDateIso("07.09.2026"), "2026-09-07");
  });
});
