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

  it("пробное в Alfa без group_ids, зал перебирается", () => {
    const alfa = readFileSync(new URL("./alfacrm.ts", import.meta.url), "utf8");
    const fnAt = alfa.indexOf("export async function createAlfaLesson");
    const fn = alfa.slice(fnAt, fnAt + 4500);
    assert.match(fn, /allowGroup/);
    assert.match(fn, /аудитория занята/);
    assert.match(fn, /rooms = roomId \? \[roomId, 0\] : \[0\]/);
    assert.match(fn, /teacher_ids: teacherIds/);
    assert.equal(/SEED_ROOMS/.test(fn), false);
    assert.equal(/17:30/.test(fn), false);
    const inbound = readFileSync(new URL("./crm-journal-inbound.ts", import.meta.url), "utf8");
    assert.match(inbound, /inboundCustomerLessons/);
    assert.match(inbound, /customer_id: id/);
    assert.match(inbound, /isOneOffLesson/);
    const get = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    assert.match(get, /inboundCustomerLessons/);
  });
});
