import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { classifyAudit, auditOnRight, moneyClose } from "./crm-balance-audit-core.ts";

describe("шаг 4 сверка остатка", () => {
  it("совпало ±1 — ok справа", () => {
    const codes = classifyAudit({
      alfaOk: true,
      clients: 350,
      alfa: 350,
      cash: 350,
      paysComplete: true,
      lessonsDisk: 10,
      lessonsAlfa: 10,
      woCard: 1000,
      woCal: 1000,
      liveCtt: false,
      repaired: false,
    });
    assert.deepEqual(codes, ["ok"]);
    assert.equal(auditOnRight(codes), true);
    assert.equal(moneyClose(100, 101), true);
    assert.equal(moneyClose(100, 102), false);
  });

  it("нет ответа Alfa не совпало", () => {
    const codes = classifyAudit({
      alfaOk: false,
      clients: 0,
      alfa: 0,
      cash: 0,
      paysComplete: false,
      lessonsDisk: 0,
      lessonsAlfa: 0,
      woCard: 0,
      woCal: 0,
      liveCtt: false,
      repaired: false,
    });
    assert.deepEqual(codes, ["нет ответа"]);
    assert.equal(auditOnRight(codes), false);
  });

  it("ctt: Клиенты=касса, Alfa=rest", () => {
    const codes = classifyAudit({
      alfaOk: true,
      clients: 8000,
      alfa: 1200,
      cash: 8000,
      paysComplete: true,
      lessonsDisk: 20,
      lessonsAlfa: 20,
      woCard: 100,
      woCal: 100,
      liveCtt: true,
      repaired: true,
    });
    assert.ok(codes.includes("ctt"));
    assert.equal(auditOnRight(codes), false);
  });

  it("0/0 без журнала и кассы не совпало", () => {
    const codes = classifyAudit({
      alfaOk: true,
      clients: 0,
      alfa: 0,
      cash: 0,
      paysComplete: false,
      lessonsDisk: 0,
      lessonsAlfa: 0,
      woCard: 0,
      woCal: 0,
      liveCtt: false,
      repaired: false,
    });
    assert.ok(codes.includes("snap"));
    assert.equal(codes.includes("ok"), false);
    assert.equal(auditOnRight(codes), false);
  });

  it("src при разных списаниях журнала и календаря", () => {
    const codes = classifyAudit({
      alfaOk: true,
      clients: 500,
      alfa: 400,
      cash: 500,
      paysComplete: true,
      lessonsDisk: 8,
      lessonsAlfa: 8,
      woCard: 900,
      woCal: 200,
      liveCtt: false,
      repaired: true,
    });
    assert.ok(codes.includes("src"));
  });

  it("модуль не пишет в Alfa и не подгоняет extras.balance", () => {
    const src = readFileSync(new URL("./crm-balance-audit.ts", import.meta.url), "utf8");
    assert.doesNotMatch(src, /enqueueExport/);
    assert.doesNotMatch(src, /customer\.update/);
    assert.doesNotMatch(src, /extras:\s*\{[^}]*balance:\s*String\(shown/);
    assert.doesNotMatch(src, /applyCrmCustomer/);
    assert.match(src, /inboundCustomerLessons/);
    assert.match(src, /inboundCustomerPays/);
    assert.match(src, /markPayJournalIncomplete/);
    assert.match(src, /stampCustomerSync/);
  });
});
