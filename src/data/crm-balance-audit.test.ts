import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { classifyAudit, auditOnRight, moneyClose, alfaHeaderOf } from "./crm-balance-audit-core.ts";

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

  it("шапка Alfa = customer.balance, не rest абонемента", () => {
    assert.equal(alfaHeaderOf({ balance: 2025 }, 0, 1), 2025);
    assert.equal(alfaHeaderOf({ balance: -2125 }, 0, 2), -2125);
    assert.equal(alfaHeaderOf({ balance: 0 }, 8000, 1), 0);
    assert.equal(alfaHeaderOf({ balance: "-987.5" }, 0, 1), -987.5);
    assert.equal(alfaHeaderOf({}, -987, 1), -987);
  });

  it("ok и status — справа: будущий урок с ценой не дыра", () => {
    const codes = classifyAudit({
      alfaOk: true,
      clients: -987,
      alfa: -987,
      cash: -987,
      paysComplete: true,
      lessonsDisk: 31,
      lessonsAlfa: 31,
      woCard: 5000,
      woCal: 5000,
      liveCtt: true,
      repaired: false,
      badStatus: true,
    });
    assert.ok(codes.includes("ok"));
    assert.ok(codes.includes("status"));
    assert.equal(auditOnRight(codes), true);
  });

  it("снимок 0 = шапка 0 при неполной кассе 2000 — не совпало", () => {
    const codes = classifyAudit({
      alfaOk: true,
      clients: 0,
      alfa: 0,
      cash: 2000,
      paysComplete: false,
      lessonsDisk: 40,
      lessonsAlfa: 40,
      woCard: 1000,
      woCal: 1000,
      liveCtt: true,
      repaired: false,
      badStatus: true,
    });
    assert.equal(codes.includes("ok"), false);
    assert.ok(codes.includes("snap"));
    assert.ok(codes.includes("lessons"));
    assert.equal(auditOnRight(codes), false);
  });

  it("касса = шапка, Клиенты нет — formula, не pays", () => {
    const codes = classifyAudit({
      alfaOk: true,
      clients: 0,
      alfa: 2025,
      cash: 2025,
      paysComplete: true,
      lessonsDisk: 11,
      lessonsAlfa: 11,
      woCard: 0,
      woCal: 0,
      liveCtt: true,
      repaired: false,
    });
    assert.ok(codes.includes("formula"));
    assert.equal(codes.includes("pays"), false);
    assert.equal(codes.includes("lessons"), false);
    assert.equal(auditOnRight(codes), false);
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

  it("formula без ремонта: касса полная, Клиенты ≠ Alfa, не ctt", () => {
    const codes = classifyAudit({
      alfaOk: true,
      clients: 400,
      alfa: 500,
      cash: 500,
      paysComplete: true,
      lessonsDisk: 8,
      lessonsAlfa: 8,
      woCard: 100,
      woCal: 100,
      liveCtt: false,
      repaired: false,
    });
    assert.ok(codes.includes("formula"));
    assert.equal(auditOnRight(codes), false);
  });

  it("src не маскируем как formula", () => {
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
    assert.equal(codes.includes("formula"), false);
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
    assert.match(src, /payCustomerFilled/);
    assert.match(src, /alfaHeaderOf/);
    assert.doesNotMatch(src, /isPayJournalComplete/);
    assert.doesNotMatch(src, /live \? rest/);
    assert.match(src, /for \(let i = 0; i < 4/);
    assert.match(src, /диск: \$\{err\}/);
  });
});
