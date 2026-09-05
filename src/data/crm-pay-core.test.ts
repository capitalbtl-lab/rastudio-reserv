import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { payEffect, balanceOf, displayedBalance, mergePayInbound, OPENING_NOTE, type PayRow } from "./crm-pay-core.ts";

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
});
