import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatMinsList, parseMinsList } from "./prices-core.ts";

describe("длительности курса за неделю", () => {
  it("два разных занятия: 90 + 180", () => {
    assert.deepEqual(parseMinsList("90 + 180"), [90, 180]);
    assert.deepEqual(parseMinsList("90+180"), [90, 180]);
    assert.equal(formatMinsList([90, 180]), "90 + 180");
  });

  it("два одинаковых: 90 × 2", () => {
    assert.deepEqual(parseMinsList("90 × 2"), [90, 90]);
    assert.equal(formatMinsList([90, 90]), "90 × 2");
  });

  it("одно занятие остаётся числом", () => {
    assert.deepEqual(parseMinsList("90"), [90]);
    assert.equal(formatMinsList([90]), "90");
    assert.equal(formatMinsList(undefined, 90), "90");
  });
});
