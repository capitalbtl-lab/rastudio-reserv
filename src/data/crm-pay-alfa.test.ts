import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  packAlfaPayCreate,
  locationIdForBranch,
  locationBelongsToBranch,
  locationsOfBranch,
  defaultPayItemId,
  payItemGroups,
  ALFA_PAY_ITEMS,
} from "./crm-pay-alfa.ts";

describe("касса Alfa по филиалам", () => {
  it("Гражданская: локация id=1 из формы Alfa", () => {
    assert.equal(locationIdForBranch(1), 1);
    assert.equal(locationBelongsToBranch(1, 1), true);
    assert.equal(locationsOfBranch(1)[0].name.includes("Гражданская"), true);
    assert.equal(defaultPayItemId(1), 2);
  });

  it("ЦМИТ, Луховицы, Лето: свой location_id = филиал", () => {
    assert.equal(locationIdForBranch(2), 2);
    assert.equal(locationIdForBranch(3), 3);
    assert.equal(locationIdForBranch(4), 4);
    assert.equal(locationBelongsToBranch(1, 2), false);
    assert.equal(locationBelongsToBranch(2, 2), true);
    assert.equal(locationBelongsToBranch(1, 3), false);
    assert.match(locationsOfBranch(2)[0].name, /ЦМИТ/);
    assert.match(locationsOfBranch(3)[0].name, /Луховицы/);
    assert.equal(defaultPayItemId(4), 11);
  });

  it("статьи: студия vs лето", () => {
    const studio = payItemGroups(2).flatMap((g) => g.options).map((o) => o.value);
    assert.ok(studio.includes("2"));
    assert.equal(studio.includes("11"), false);
    const summer = payItemGroups(4).flatMap((g) => g.options).map((o) => o.value);
    assert.ok(summer.includes("11"));
    assert.equal(summer.includes("2"), false);
    assert.ok(ALFA_PAY_ITEMS.some((x) => x.id === 23));
  });

  it("pay.create Гражданская несёт location_id 1", () => {
    const body = packAlfaPayCreate({
      customerId: 7759,
      branchId: 1,
      documentDate: "06.09.2026",
      income: 5000,
      expenditure: 0,
      note: "Оплата за обучение",
      localId: -12,
      kind: "income",
      payAccountId: 1,
      payItemId: 2,
      locationId: 1,
      groupId: 406,
    });
    assert.equal(body.location_id, 1);
    assert.equal(body.pay_item_id, 2);
    assert.equal(body.pay_account_id, 1);
    assert.equal(body.pay_type_id, 1);
    const withCtt = packAlfaPayCreate({
      customerId: 7759,
      branchId: 1,
      documentDate: "06.09.2026",
      income: 5000,
      expenditure: 0,
      note: "Оплата за обучение",
      localId: -12,
      kind: "income",
      cttId: 4412,
      tariffId: 9,
    });
    assert.equal(withCtt.ctt_id, 4412);
  });

  it("pay.create ЦМИТ — location_id 2, не Гражданская", () => {
    const body = packAlfaPayCreate({
      customerId: 100,
      branchId: 2,
      documentDate: "06.09.2026",
      income: 3000,
      expenditure: 0,
      note: "",
      localId: -3,
      kind: "income",
      locationId: 1,
      payItemId: 2,
    });
    assert.equal(body.location_id, undefined);
    const cmit = packAlfaPayCreate({
      customerId: 100,
      branchId: 2,
      documentDate: "06.09.2026",
      income: 3000,
      expenditure: 0,
      note: "",
      localId: -3,
      kind: "income",
      payItemId: 2,
    });
    assert.equal(cmit.location_id, 2);
    const lukh = packAlfaPayCreate({
      customerId: 101,
      branchId: 3,
      documentDate: "06.09.2026",
      income: 2000,
      expenditure: 0,
      note: "",
      localId: -4,
      kind: "income",
    });
    assert.equal(lukh.location_id, 3);
    const summer = packAlfaPayCreate({
      customerId: 102,
      branchId: 4,
      documentDate: "06.09.2026",
      income: 8000,
      expenditure: 0,
      note: "",
      localId: -5,
      kind: "income",
      payItemId: 11,
    });
    assert.equal(summer.location_id, 4);
    assert.equal(summer.pay_item_id, 11);
  });
});
