import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isApiClientStudy, isApiLeadStudy, step6ColumnId } from "./crm-step6-core.ts";

describe("шаг 6", () => {
  it("лид по is_study, клиент не лид", () => {
    assert.equal(isApiLeadStudy(0), true);
    assert.equal(isApiLeadStudy(false), true);
    assert.equal(isApiLeadStudy("0"), true);
    assert.equal(isApiLeadStudy(1), false);
    assert.equal(isApiLeadStudy(true), false);
    assert.equal(isApiLeadStudy(undefined), false);
    assert.equal(isApiClientStudy(1), true);
    assert.equal(isApiClientStudy(true), true);
    assert.equal(isApiClientStudy(0), false);
  });

  it("колонка: одно число, несколько не кладём, пусто только по единственному имени", () => {
    const stages = [
      { id: 9, name: "Не разобрано" },
      { id: 2, name: "Ожидает старта" },
    ];
    assert.equal(step6ColumnId([2], stages), 2);
    assert.equal(step6ColumnId([2, 9], stages), null);
    assert.equal(step6ColumnId([], stages), 9);
    assert.equal(step6ColumnId(undefined, stages), 9);
    assert.equal(step6ColumnId([], [{ id: 1, name: "Не разобрано" }, { id: 2, name: "Не разобрано" }]), null);
    assert.equal(step6ColumnId([], [{ id: 1, name: "Ожидает старта" }]), null);
    assert.equal(step6ColumnId({ 0: 2 }, stages), null);
    assert.equal(step6ColumnId(["x"], stages), null);
  });
});
