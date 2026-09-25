import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { step7Keep } from "./crm-step7-core.ts";

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

  it("действующий клиент и удалённый не входят", () => {
    assert.equal(step7Keep({ id: 9, is_study: 1, removed: 0 }, live), false);
    assert.equal(step7Keep({ id: 11, is_study: 1, removed: 1 }, live), false);
  });
});
