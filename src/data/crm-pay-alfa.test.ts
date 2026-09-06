import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { packAlfaPayCreate, locationIdForBranch, ALFA_PAY_ITEMS, payItemGroups } from "./crm-pay-alfa.ts";

describe("касса Alfa: поля модалки «Добавить доход»", () => {
  it("статьи как в форме Alfa", () => {
    assert.ok(ALFA_PAY_ITEMS.some((x) => x.id === 2 && x.name === "Групповые занятия"));
    assert.ok(ALFA_PAY_ITEMS.some((x) => x.id === 23 && x.name === "Пробные занятия"));
    assert.equal(payItemGroups().length, 2);
    assert.equal(locationIdForBranch(1), 1);
    assert.equal(locationIdForBranch(2), 0);
  });

  it("pay.create несёт счёт, статью, локацию, клиента", () => {
    const body = packAlfaPayCreate({
      customerId: 7759,
      documentDate: "06.09.2026",
      income: 5000,
      expenditure: 0,
      note: "Оплата за обучение",
      localId: -12,
      kind: "income",
      payAccountId: 1,
      payItemId: 2,
      locationId: 1,
      managerId: 501,
      cttId: 88,
      payerName: "Иванова",
      groupId: 406,
      payMethod: "card",
    });
    assert.equal(body.customer_id, 7759);
    assert.equal(body.pay_account_id, 1);
    assert.equal(body.pay_item_id, 2);
    assert.equal(body.location_id, 1);
    assert.equal(body.manager_id, 501);
    assert.equal(body.ctt_id, 88);
    assert.equal(body.payer_name, "Иванова");
    assert.equal(body.group_id, 406);
    assert.equal(body.income, 5000);
    assert.match(String(body.note), /Карта/);
    assert.equal(body.customer_contract_id, undefined);
  });

  it("пустые справочники не уходят нулями", () => {
    const body = packAlfaPayCreate({
      customerId: 1,
      documentDate: "06.09.2026",
      income: 100,
      expenditure: 0,
      note: "",
      localId: -1,
      kind: "income",
    });
    assert.equal(body.pay_account_id, 1);
    assert.equal(body.pay_item_id, undefined);
    assert.equal(body.location_id, undefined);
    assert.equal(body.manager_id, undefined);
  });
});
