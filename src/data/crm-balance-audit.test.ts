import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { classifyAudit, auditOnRight, moneyClose, alfaHeaderOf, alfaBalancePresent, shouldStampAlfaHeader, sameCustomerId } from "./crm-balance-audit-core.ts";

describe("шаг 5 сверка остатка", () => {
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
    const lessonHole = classifyAudit({
      alfaOk: true,
      clients: 350,
      alfa: 350,
      cash: 350,
      paysComplete: true,
      lessonsDisk: 10,
      lessonsAlfa: 12,
      woCard: 1000,
      woCal: 1000,
      liveCtt: false,
      repaired: false,
    });
    assert.ok(lessonHole.includes("lessons"));
    assert.ok(lessonHole.includes("ok"));
    assert.equal(auditOnRight(lessonHole), true);
  });

  it("шапка Alfa = customer.balance число, не rest и не строка", () => {
    assert.equal(alfaHeaderOf({ balance: 2025 }, 0, 1), 2025);
    assert.equal(alfaHeaderOf({ balance: -2125 }, 0, 2), -2125);
    assert.equal(alfaHeaderOf({ balance: 0 }, 8000, 1), 0);
    assert.equal(alfaHeaderOf({ balance: "-987.5" }, 0, 1), -987.5);
    assert.equal(alfaBalancePresent({ balance: 1975 }), true);
    assert.equal(alfaBalancePresent({ balance: 0 }), true);
    assert.equal(alfaBalancePresent({ balance: "" }), false);
    assert.equal(alfaBalancePresent({}), false);
    assert.equal(shouldStampAlfaHeader({ alfaOk: true, headerOk: true, pendingPay: false }), true);
    assert.equal(shouldStampAlfaHeader({ alfaOk: true, headerOk: true, pendingPay: true }), false);
    assert.equal(shouldStampAlfaHeader({ alfaOk: false, headerOk: true, pendingPay: false }), false);
    assert.equal(shouldStampAlfaHeader({ alfaOk: true, headerOk: false, pendingPay: false }), false);
    assert.equal(alfaHeaderOf({}, -987, 1), 0);
    assert.equal(alfaHeaderOf({ balance: { m: 100 } }), 100);
    assert.equal(alfaHeaderOf({ balance: { m: 100, c: 2 } }), 0);
    assert.equal(sameCustomerId("12", 12), true);
    assert.equal(sameCustomerId(12, 13), false);
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

  it("шапка сошлась, касса нет — не справа, товар отдельный сегмент", () => {
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
      goodsNet: 2000,
    });
    assert.equal(codes.includes("ok"), false);
    assert.ok(codes.includes("snap"));
    assert.ok(codes.includes("status"));
    assert.ok(codes.includes("goods"));
    assert.equal(auditOnRight(codes), false);
    const three = classifyAudit({
      alfaOk: true,
      clients: 4350,
      alfa: 4350,
      cash: 6350,
      paysComplete: false,
      lessonsDisk: 10,
      lessonsAlfa: 12,
      woCard: 1000,
      woCal: 800,
      liveCtt: false,
      repaired: false,
      badStatus: true,
    });
    assert.equal(three.includes("ok"), false);
    assert.ok(three.includes("wo"));
    assert.equal(auditOnRight(three), false);
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
    const afterShow = classifyAudit({
      alfaOk: true,
      clients: 1200,
      alfa: 1200,
      cash: 8000,
      paysComplete: true,
      lessonsDisk: 20,
      lessonsAlfa: 20,
      woCard: 100,
      woCal: 100,
      liveCtt: true,
      repaired: false,
    });
    assert.equal(afterShow.includes("ok"), false);
    assert.ok(afterShow.includes("wo"));
    assert.equal(afterShow.includes("ctt"), false);
    assert.equal(auditOnRight(afterShow), false);
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

  it("модуль не пишет в Alfa, не качает кассу и журнал", () => {
    const src = readFileSync(new URL("./crm-balance-audit.ts", import.meta.url), "utf8");
    assert.doesNotMatch(src, /enqueueExport/);
    assert.doesNotMatch(src, /customer\.update/);
    assert.doesNotMatch(src, /applyCrmCustomer/);
    assert.doesNotMatch(src, /balance: String\(first\.cash\)/);
    assert.doesNotMatch(src, /inboundCustomerPays/);
    assert.doesNotMatch(src, /inboundCustomerLessons/);
    assert.doesNotMatch(src, /pageSize: 10/);
    assert.match(src, /stampDossierAlfaBalance/);
    assert.match(src, /shouldStampAlfaHeader/);
    assert.match(src, /shown\.alfa/);
    assert.match(src, /pay\.create/);
    assert.match(src, /stampCustomerSync/);
    assert.match(src, /payCustomerFilled/);
    assert.match(src, /sameCustomerId/);
    assert.match(src, /id: cid, page: 0/);
    assert.match(src, /кассы нет \/ нет А/);
    assert.match(src, /alfaPayIndexDate/);
    assert.doesNotMatch(src, /payPending && \(Number\(first\.livePays\)/);
    assert.match(src, /диск: \$\{err\}/);
    assert.match(src, /peekAlfaLessonCommission/);
    assert.match(src, /lesson\/index/);
    assert.match(src, /нет роли/);
    assert.match(src, /нет сверки/);
    assert.match(src, /step5StudyNum/);
    assert.doesNotMatch(src, /study: Number\(d\?\.extras\?\.is_study\)/);
    assert.match(src, /alfa: Number\.NaN/);
    assert.doesNotMatch(src, /extras\.is_study =/);
    assert.doesNotMatch(src, /extras\.removed =/);
  });

  it("карточка шага 5: товар не в формуле, живые списания, чипы пропуска", () => {
    const ui = readFileSync(new URL("../components/admin-crm-settings.tsx", import.meta.url), "utf8");
    assert.match(ui, /не влияет на остаток клиента/);
    assert.match(ui, /Товар в ленте, в шапку Alfa не входит/);
    assert.match(ui, /const n = pay \+ corr - wo;/);
    assert.match(ui, /alfaWoOk/);
    assert.match(ui, /id: "no-id"/);
    assert.match(ui, /id: "no-role"/);
    assert.match(ui, /id: "no-sverka"/);
    assert.match(ui, /headerStamped/);
    assert.match(ui, /Касса не закрыта шагом 4/);
    assert.doesNotMatch(ui, /if \(who === "лид"\)/);
    assert.doesNotMatch(ui, /includes\("лид"\) && !\(r\.codes \|\| \[\]\)\.includes\("ok"\)/);
    assert.match(ui, /Товар в ленте, в остаток Alfa не входит/);
    assert.doesNotMatch(ui, /Продажа товара вычитает из остатка/);
    assert.doesNotMatch(ui, /платежи − списания − товар/);
  });

  it("касса и открытие карточки не затирают extras.balance", () => {
    const pay = readFileSync(new URL("./crm-pay.ts", import.meta.url), "utf8");
    const stamp = pay.slice(pay.indexOf("async function stampPayBalances"), pay.indexOf("export async function inboundCustomerPays"));
    assert.doesNotMatch(stamp, /upsertDossier/);
    assert.doesNotMatch(stamp, /balance: String\(next\)/);
    const api = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    const at = api.indexOf('data.action === "customerGet"');
    const next = api.indexOf('data.action === "customerSave"', at + 10);
    const chunk = api.slice(at, next > at ? next : at + 8000);
    assert.doesNotMatch(chunk, /balance: String\(customer.balance\)/);
    const disk = readFileSync(new URL("./customer-card-disk.ts", import.meta.url), "utf8");
    assert.match(disk, /archived: true/);
    assert.match(disk, /loadCustomerCalendar/);
    assert.doesNotMatch(disk, /liveCtt.length \? 0 : snap/);
    const core = readFileSync(new URL("./crm-pay-core.ts", import.meta.url), "utf8");
    assert.doesNotMatch(core, /if \(hasCtt\) return rest;\s*if \(rest\) return rest/);
  });

  it("товар в кассе, шапка без него — goods; корректировка с текстом не режет ₽", () => {
    const goods = classifyAudit({
      alfaOk: true,
      clients: 2000,
      alfa: 0,
      cash: 2000,
      paysComplete: true,
      lessonsDisk: 1,
      lessonsAlfa: 1,
      woCard: 0,
      woCal: 0,
      liveCtt: false,
      repaired: false,
      goodsNet: 2000,
    });
    assert.ok(goods.includes("goods"));
    assert.equal(goods.includes("ok"), false);
    const corrFlag = classifyAudit({
      alfaOk: true,
      clients: 47504,
      alfa: 47504,
      cash: 47504,
      paysComplete: true,
      lessonsDisk: 10,
      lessonsAlfa: 10,
      woCard: 4900,
      woCal: 4900,
      liveCtt: false,
      repaired: false,
      corrLooksGoods: true,
    });
    assert.ok(corrFlag.includes("ok"));
    assert.ok(corrFlag.includes("corr-goods"));
    assert.equal(auditOnRight(corrFlag), true);
    const refundGoods = classifyAudit({
      alfaOk: true,
      clients: -2000,
      alfa: 0,
      cash: -2000,
      paysComplete: true,
      lessonsDisk: 1,
      lessonsAlfa: 1,
      woCard: 0,
      woCal: 0,
      liveCtt: false,
      repaired: false,
      refundGoodsSum: 2000,
    });
    assert.ok(refundGoods.includes("refund-goods"));
    const src = readFileSync(new URL("./crm-balance-audit.ts", import.meta.url), "utf8");
    assert.match(src, /goodsNetOf/);
    assert.match(src, /step5RemainderFormula/);
    const pay = readFileSync(new URL("./crm-pay.ts", import.meta.url), "utf8");
    const inbound = pay.slice(pay.indexOf("export async function inboundCustomerPays"), pay.indexOf("export type PayPollResult"));
    assert.doesNotMatch(inbound, /enqueueExport/);
  });
});
