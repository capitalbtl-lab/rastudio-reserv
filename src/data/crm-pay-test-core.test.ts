import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isChudnovaAlexandra, planChudnovaPays, PAY_TEST_NAME } from "./crm-pay-test-core.ts";
import { planChudnovaTrial, TRIAL_TEST_DATE, TRIAL_TEST_TIME } from "./crm-trial-test-core.ts";

describe("тест кассы только Чудновой Александре", () => {
  it("берёт Александру, не Ольгу", () => {
    assert.equal(isChudnovaAlexandra("Чуднова Александра"), true);
    assert.equal(isChudnovaAlexandra("Чуднова Александра Сергеевна"), true);
    assert.equal(isChudnovaAlexandra("Чуднова Ольга Сергеевна"), false);
    assert.equal(isChudnovaAlexandra("Иванова Александра"), false);
  });

  it("два платежа по 1 ₽ — наличные и карта, один клиент", () => {
    const rows = planChudnovaPays(7759, 1, "06.09.2026");
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((r) => r.payMethod),
      ["cash", "card"],
    );
    assert.ok(rows.every((r) => r.customerId === 7759 && r.amount === 1 && r.branchId === 1));
    assert.match(rows[0].note, new RegExp(PAY_TEST_NAME));
    assert.equal(planChudnovaPays(0, 1, "06.09.2026").length, 0);
  });
});

describe("пробное Чудновой Александре", () => {
  it("план: отдельная дата, тип trial, не Ольга", () => {
    const row = planChudnovaTrial({ customerId: 670, branchId: 1, gid: 76, subjectId: 92, roomId: 3 });
    assert.equal(row?.type, "trial");
    assert.equal(row?.date, "11.10.2026");
    assert.equal(row?.time, "18:10");
    assert.equal(row?.teacherId, 2);
    assert.equal(row?.customerId, 670);
    assert.equal(row?.subjectId, 92);
    assert.match(row?.note || "", /Чуднова Александра/);
    assert.equal(planChudnovaTrial({ customerId: 0, branchId: 1 }), null);
  });

  it("очередь выгрузки ставит пробное после кассы", () => {
    const q = readFileSync(new URL("./crm-export-queue.ts", import.meta.url), "utf8");
    assert.match(q, /maybeBookChudnovaTrial/);
    const book = readFileSync(new URL("./crm-trial-test.ts", import.meta.url), "utf8");
    assert.match(book, /createAlfaLesson/);
    assert.match(book, /id: 670/);
    assert.match(book, /upsertCustomerCalendar/);
    assert.match(book, /roomId: 0/);
    assert.match(q, /job.op === "lesson.create"/);
    assert.match(q, /createAlfaLesson/);
  });
});
