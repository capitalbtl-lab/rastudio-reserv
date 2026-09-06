import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isChudnovaAlexandra, planChudnovaPays, PAY_TEST_NAME } from "./crm-pay-test-core.ts";

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
