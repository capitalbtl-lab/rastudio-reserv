import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ledgerMoney, lessonWriteoffAmount, uniqueBranches } from "./crm-ledger-core.ts";

describe("журнал оплат и списаний", () => {
  it("полный журнал: оплаты минус списания", () => {
    assert.equal(ledgerMoney({ paySum: 50000, writeoffSum: 4050, snap: 1000, complete: true }), 45950);
  });

  it("пока журнал не полный — снимок Alfa, не 0", () => {
    assert.equal(ledgerMoney({ paySum: 1075, writeoffSum: 0, snap: 1000, complete: false }), 1000);
  });

  it("снимок 0 — остаток 0, даже если оплаты есть, а списаний ещё нет", () => {
    assert.equal(ledgerMoney({ paySum: 152475, writeoffSum: 0, snap: 0 }), 0);
    assert.equal(ledgerMoney({ paySum: 152475, writeoffSum: 0 }), 152475);
  });

  it("сумма списания из полей урока", () => {
    assert.equal(lessonWriteoffAmount({ commission: 537.5 }), 537.5);
    assert.equal(lessonWriteoffAmount({ details: [{ cost: 537.5 }] }), 537.5);
    assert.equal(lessonWriteoffAmount({}), 0);
  });

  it("филиалы 1–4, основной первый", () => {
    assert.deepEqual(uniqueBranches(2), [2, 1, 3, 4]);
  });
});
