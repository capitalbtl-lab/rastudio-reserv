import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FUNNEL_AUTO_DEFAULT, resolveFunnelAuto } from "./funnel-auto.ts";

describe("автоматизация воронки", () => {
  it("заявка с сайта — в Разбирается", () => {
    assert.equal(resolveFunnelAuto("site", { isStudy: 0, statusId: 0 }), 1);
  });

  it("добавили в группу — в Ожидает старта, если ещё не оплатил", () => {
    assert.equal(resolveFunnelAuto("group", { isStudy: 0, statusId: 1 }), 2);
    assert.equal(resolveFunnelAuto("group", { isStudy: 0, statusId: 0 }), 2);
    assert.equal(resolveFunnelAuto("group", { isStudy: 0, statusId: 4 }), null);
  });

  it("абонемент — в Оплатил даже с Отложен", () => {
    assert.equal(resolveFunnelAuto("tariff", { isStudy: 0, statusId: 7 }), 4);
    assert.equal(resolveFunnelAuto("tariff", { isStudy: 0, statusId: 2 }), 4);
    assert.equal(resolveFunnelAuto("tariff", { isStudy: 0, statusId: 4 }), null);
  });

  it("ученик и архив не двигаются", () => {
    assert.equal(resolveFunnelAuto("group", { isStudy: 1, statusId: 0 }), null);
    assert.equal(resolveFunnelAuto("tariff", { isStudy: 2, statusId: 1 }), null);
  });

  it("выключенное правило ничего не делает", () => {
    assert.equal(resolveFunnelAuto("group", { isStudy: 0, statusId: 1 }, { ...FUNNEL_AUTO_DEFAULT, groupOn: false }), null);
  });
});
