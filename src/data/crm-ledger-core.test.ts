import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ledgerMoney,
  lessonWriteoffAmount,
  lessonWriteoffCtt,
  lessonCustomerIds,
  payCttIdOf,
  writeoffSumOf,
  writeoffSumForCtt,
  uniqueBranches,
  packLessonPupils,
  chargeFromPupils,
  lessonPupilsKey,
} from "./crm-ledger-core.ts";

describe("журнал оплат и списаний", () => {
  it("полный журнал: оплаты минус списания", () => {
    assert.equal(ledgerMoney({ paySum: 50000, writeoffSum: 4050, snap: 1000, complete: true }), 45950);
  });

  it("пока журнал не полный — снимок Alfa, не 0", () => {
    assert.equal(ledgerMoney({ paySum: 1075, writeoffSum: 0, snap: 1000, complete: false }), 1000);
  });

  it("неполный журнал со списаниями не перебивает снимок Alfa", () => {
    assert.equal(ledgerMoney({ paySum: 50000, writeoffSum: 777, snap: 47504, complete: false }), 47504);
    assert.equal(ledgerMoney({ paySum: 50000, writeoffSum: 777, snap: 47504, complete: true }), 49223);
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

  it("Алифанов: комиссия и абонемент только своей details, чужая не берётся", () => {
    const lesson = {
      customer_ids: [88, 91],
      details: [
        { customer_id: 88, ctt_id: 4412, commission: 850 },
        { customer_id: 91, ctt_id: 5016, commission: 1200 },
      ],
    };
    assert.deepEqual(lessonCustomerIds(lesson), [88, 91]);
    assert.equal(lessonWriteoffAmount(lesson, 91), 1200);
    assert.equal(lessonWriteoffCtt(lesson, 91), 5016);
    assert.equal(lessonWriteoffAmount(lesson, 88), 850);
    assert.equal(lessonWriteoffCtt(lesson, 88), 4412);
    assert.deepEqual(lessonCustomerIds({ details: [{ customer_id: 91, commission: 400 }] }), [91]);
    assert.equal(payCttIdOf({ ctt_id: 4412 }), 4412);
    assert.equal(payCttIdOf({ customer_tariff_id: 4412 }), 4412);
    assert.equal(payCttIdOf({ ctt: { id: 4412 } }), 4412);
    assert.equal(payCttIdOf({ ctt_id: -1 }), 0);
    const done = [
      { status: 3, amount: 850, cttId: 4412 },
      { status: 3, amount: 850, cttId: 4412 },
      { status: 2, amount: 850, cttId: 4412 },
      { status: 3, amount: 400, cttId: 0 },
    ];
    assert.equal(writeoffSumOf(done), 2100);
    assert.equal(writeoffSumForCtt(done, 4412), 1700);
    assert.equal(writeoffSumForCtt(done, 0), 400);
    assert.equal(ledgerMoney({ paySum: 12000, writeoffSum: 1700, snap: 12000, complete: true }), 10300);
  });

  it("филиалы 1–4, основной первый", () => {
    assert.deepEqual(uniqueBranches(2), [2, 1, 3, 4]);
  });

  it("состав занятия: явка и сумма списания по каждому ученику", () => {
    const lesson = {
      customer_ids: [6218, 7381, 2696],
      details: [
        { customer_id: 6218, is_attend: 1, commission: 743.75, ctt_id: 438, customer_name: "Артамонова Арина Сергеевна" },
        { customer_id: 7381, is_attend: 1, commission: 743.75, ctt_id: 438 },
        { customer_id: 2696, is_attend: 0, commission: 743.75, reason_name: "По любой причине", customer_name: "Рахманина Александра Владиславовна" },
        { customer_id: 3485, is_attend: 1, commission: 587.5, ctt_id: 501 },
      ],
    };
    const pupils = packLessonPupils(lesson);
    assert.equal(pupils.length, 4);
    assert.equal(pupils.find((p) => p.customerId === 2696)?.attend, false);
    assert.equal(pupils.find((p) => p.customerId === 2696)?.amount, 743.75);
    assert.equal(pupils.find((p) => p.customerId === 3485)?.amount, 587.5);
    assert.equal(chargeFromPupils({ pupils }, 3485).amount, 587.5);
    assert.equal(chargeFromPupils({ pupils }, 2696).attend, false);
    assert.match(lessonPupilsKey([{ lessonId: 49042, pupils }]), /2696:0:743\.75/);
  });
});
