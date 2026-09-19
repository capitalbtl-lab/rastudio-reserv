import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  amountGiven,
  storedWriteoff,
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
    assert.deepEqual(lessonCustomerIds({ customer_ids: [88], details: [{ customer_id: 5115 }] }).sort((a, b) => a - b), [88, 5115]);
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
    assert.equal(ledgerMoney({ paySum: 8000, writeoffSum: 0, snap: 1200, complete: true, liveCtt: true }), 8000);
    assert.equal(ledgerMoney({ paySum: 8000, writeoffSum: 0, snap: 1200, complete: true, liveCtt: true, pending: true }), 8000);
    assert.equal(ledgerMoney({ paySum: 1487, writeoffSum: 0, snap: 1488, complete: true }), 1487);
    assert.equal(ledgerMoney({ paySum: 6450, writeoffSum: 0, snap: 6450, complete: true, liveCtt: true }), 6450);
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

  it("списание с состава ученика, если шапка урока 0", () => {
    const lesson = {
      status: 3,
      amount: 0,
      pupils: [
        { customerId: 88, amount: 850, attend: true },
        { customerId: 91, amount: 1200, attend: true },
      ],
    };
    assert.equal(writeoffSumOf([lesson]), 0);
    assert.equal(writeoffSumOf([lesson], 91), 1200);
    assert.equal(writeoffSumOf([lesson], 88), 850);
    assert.equal(chargeFromPupils({ pupils: lesson.pupils, amount: 0 }, 91).amount, 1200);
    assert.equal(chargeFromPupils({ pupils: [{ customerId: 91, amount: 0, attend: true }], amount: 400 }, 91).amount, 0);
    assert.equal(chargeFromPupils({ pupils: [{ customerId: 91, attend: true }], amount: 400 }, 91).amount, 400);
    const pause = packLessonPupils({
      details: [{ customer_id: 4982, is_attend: 0, commission: 0, reason_id: 2, reason_name: "По решению руководства (0% списания)" }],
    });
    assert.equal(pause[0]?.amount, 0);
    assert.equal(pause[0]?.attend, false);
    assert.equal(chargeFromPupils({ pupils: pause, amount: 743.75 }, 4982).amount, 0);
    const thin = packLessonPupils({
      customer_ids: [4982],
      details: [{ customer_id: 4982, is_attend: 1 }],
    });
    assert.equal(thin[0]?.amount, undefined);
    assert.equal(amountGiven(thin[0]?.amount), false);
    assert.equal(writeoffSumOf([{ status: 3, amount: 743.75, pupils: pause }], 4982), 0);
    assert.equal(amountGiven(0), true);
    assert.equal(amountGiven(undefined), false);
    assert.equal(storedWriteoff(0, 743.75, { attend: false }), 0);
    assert.equal(storedWriteoff(undefined, 743.75, { attend: true }), 743.75);
    assert.equal(storedWriteoff(undefined, 743.75, { attend: false }), 0);
  });

  it("одно занятие дважды на диске не удваивает списание", () => {
    const a = { lessonId: 50, date: "01.09.2026", from: "10:00", status: 3, amount: 350 };
    const twinId = { ...a, amount: 350 };
    const shadow = { date: "01.09.2026", from: "10:00", status: 3, amount: 350 };
    const other = { lessonId: 51, date: "02.09.2026", from: "10:00", status: 3, amount: 200 };
    assert.equal(writeoffSumOf([a, twinId, shadow, other]), 550);
    assert.equal(writeoffSumOf([a, twinId, shadow, other], 7), 550);
  });

  it("касса и журнал не ищут модуль кассы живым import — иначе синяя падает", () => {
    const files = [
      new URL("./pupil-tariffs.ts", import.meta.url),
      new URL("./crm-journal-pull.ts", import.meta.url),
      new URL("./crm-balance-audit.ts", import.meta.url),
      new URL("./admin-schedule.ts", import.meta.url),
    ];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      assert.doesNotMatch(src, /await import\(\s*["']\.\/crm-ledger-core["']\s*\)/);
    }
    const hook = readFileSync(new URL("../../scripts/ts-ext-hook.mjs", import.meta.url), "utf8");
    assert.match(hook, /noJs\}\.ts/);
    assert.doesNotMatch(hook, /\.js\|mjs\|cjs\|json\)\$\/i\.test\(specifier\)/);
  });
});
