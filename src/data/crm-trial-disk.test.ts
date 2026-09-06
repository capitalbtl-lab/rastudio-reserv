import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldEnsureChudnovaTrial } from "./crm-trial-test-core.ts";

describe("пробное Чудновой на диск", () => {
  it("карточка 670 и ФИО — да, Ольга — нет", () => {
    assert.equal(shouldEnsureChudnovaTrial(670), true);
    assert.equal(shouldEnsureChudnovaTrial(1, "Чуднова Александра Алексеевна"), true);
    assert.equal(shouldEnsureChudnovaTrial(1, "Чуднова Ольга Сергеевна"), false);
    assert.equal(shouldEnsureChudnovaTrial(2, "Иванова"), false);
  });

  it("досье пишет диск до Alfa, очередь lesson.create", () => {
    const disk = readFileSync(new URL("./crm-trial-disk.ts", import.meta.url), "utf8");
    assert.match(disk, /upsertCustomerCalendar/);
    assert.match(disk, /enqueueExport/);
    assert.match(disk, /lesson_type_id: 3/);
    assert.match(disk, /room_id: plan.roomId \|\| 28/);
    const card = readFileSync(new URL("./customer-card-disk.ts", import.meta.url), "utf8");
    assert.match(card, /ensureChudnovaTrialDisk/);
    assert.equal(/from "\.\/crm-trial-test"/.test(card), false);
  });
});
