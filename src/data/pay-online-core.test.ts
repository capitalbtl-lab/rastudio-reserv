import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  rubAmount,
  parseYooNotification,
  shouldApplySucceeded,
  yooCreateBody,
  payInvoiceKind,
} from "./pay-online-core.ts";

describe("ЮKassa → диск → Alfa", () => {
  it("сумма в рублях с копейками", () => {
    assert.equal(rubAmount(1500), "1500.00");
    assert.equal(rubAmount(99.9), "99.90");
    assert.equal(rubAmount(-10), "10.00");
  });

  it("уведомление payment.succeeded читается", () => {
    const n = parseYooNotification({
      event: "payment.succeeded",
      object: {
        id: "pay_1",
        status: "succeeded",
        amount: { value: "1500.00", currency: "RUB" },
        metadata: { customerId: "7759", branchId: "2", invoiceId: "p-1", kind: "income" },
      },
    });
    assert.ok(n);
    assert.equal(n!.paymentId, "pay_1");
    assert.equal(n!.status, "succeeded");
    assert.equal(n!.amount, 1500);
    assert.equal(n!.metadata.customerId, "7759");
  });

  it("повтор succeeded не проводится", () => {
    assert.equal(shouldApplySucceeded({ status: "pending" }), true);
    assert.equal(shouldApplySucceeded({ status: "paid" }), false);
    assert.equal(shouldApplySucceeded(null), true);
  });

  it("тело платежа несёт customerId в metadata", () => {
    const body = yooCreateBody({
      amount: 1500,
      returnUrl: "https://www.rastudio.org/pay?ok=1",
      description: "РАЗВИВАЙСЯ",
      invoiceId: "p-1",
      customerId: 7759,
      branchId: 2,
      kind: "income",
    });
    assert.equal(body.amount.value, "1500.00");
    assert.equal(body.capture, true);
    assert.equal(body.metadata.customerId, "7759");
    assert.equal(payInvoiceKind("product"), "product");
    assert.equal(payInvoiceKind("refund"), "income");
  });

  it("очередь и кабинет: ссылка, webhook, каталог", () => {
    const pay = readFileSync(new URL("./pay-online.ts", import.meta.url), "utf8");
    assert.match(pay, /appendPay/);
    assert.match(pay, /pay.create/);
    assert.match(pay, /actor: "sync"/);
    assert.equal(/loadLeadsBoard/.test(pay), false);
    const sched = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    assert.match(sched, /customerPayLink/);
    assert.match(sched, /createOnlinePay/);
    const keys = readFileSync(new URL("./api-keys.ts", import.meta.url), "utf8");
    assert.match(keys, /yookassa/);
    assert.match(keys, /YOOKASSA_SHOP_ID/);
    const ui = readFileSync(new URL("../components/crm-client-card.tsx", import.meta.url), "utf8");
    assert.match(ui, /customerPayLink/);
    assert.match(ui, /Ссылка ЮKassa/);
    const route = readFileSync(new URL("../routes/api/pay.yookassa.ts", import.meta.url), "utf8");
    assert.match(route, /applyYooPayment/);
    const alfa = readFileSync(new URL("./crm-alfa-link-core.ts", import.meta.url), "utf8");
    assert.match(alfa, /id: "pay"/);
  });
});
