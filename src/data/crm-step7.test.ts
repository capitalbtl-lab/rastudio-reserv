import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { step7Keep, step7RejectId } from "./crm-step7-core.ts";

describe("шаг 7", () => {
  const live = new Set([10]);

  it("архивный клиент вне живой группы остаётся", () => {
    assert.equal(step7Keep({ id: 7, is_study: 1, removed: 2 }, live), true);
  });

  it("кто уже в действующей группе — не входит", () => {
    assert.equal(step7Keep({ id: 10, is_study: 1, removed: 2 }, live), false);
  });

  it("архивный лид — это шаг 6, не шаг 7", () => {
    assert.equal(step7Keep({ id: 8, is_study: 0, removed: 2 }, live), false);
  });

  it("активный и удалённый в строке не входят", () => {
    assert.equal(step7Keep({ id: 9, is_study: 1, removed: 0 }, live), false);
    assert.equal(step7Keep({ id: 11, is_study: 1, removed: 1 }, live), false);
  });

  it("пустое removed в строке не выкидывает: фильтр уже removed 2", () => {
    assert.equal(step7Keep({ id: 12, is_study: 1 }, live), true);
    assert.equal(step7Keep({ id: 13, is_study: "1", removed: "" }, live), true);
  });

  it("причина архива — customer_reject_id, пустое не причина", () => {
    assert.equal(step7RejectId({ customer_reject_id: 6 }), 6);
    assert.equal(step7RejectId({ customer_reject_id: "6" }), 6);
    assert.equal(step7RejectId({}), 0);
    assert.equal(step7RejectId({ customer_reject_id: 0 }), 0);
    assert.equal(step7RejectId({ customer_reject_id: "" }), 0);
    assert.equal(step7RejectId({ customer_reject_id: null }), 0);
  });
});
