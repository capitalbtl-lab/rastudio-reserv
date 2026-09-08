import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { payEffect, balanceOf, displayedBalance, snapshotBalance, accountSnapOf, liveCttOf, paySumForCtt, payCountForCtt, mergePayInbound, payAfterStamp, nextPayStamp, payPollAllowed, payPollHitsInWindow, payPollStampOrEmpty, payPollFirstFill, payCustomerIdOf, alfaPayDate, alfaPayIndexDate, kindFromAlfaPay, ruDateIso, OPENING_NOTE, payAccountLabel, cashPageSlice, cashTakeOf, CASH_PAGE_SIZES, payFillStart, payFillAdvance, payFillOf, payFillNote, type PayRow } from "./crm-pay-core.ts";

function row(p: Partial<PayRow> & Pick<PayRow, "id" | "kind" | "income" | "expenditure">): PayRow {
  return {
    customerId: 10,
    branchId: 1,
    note: "",
    documentDate: "05.09.2026",
    at: "2026-09-05T10:00:00.000Z",
    ...p,
  };
}

describe("журнал денег", () => {
  it("доход, возврат, товар и корректировка", () => {
    assert.deepEqual(payEffect("income", 1000, 200), { income: 1000, expenditure: 0, next: 1200 });
    assert.deepEqual(payEffect("refund", 300, 1000), { income: 0, expenditure: 300, next: 700 });
    assert.deepEqual(payEffect("product", 500, 1000), { income: 500, expenditure: 0, next: 1000 });
    assert.deepEqual(payEffect("correct", 2500, 1000), { income: 1500, expenditure: 0, next: 2500 });
    assert.deepEqual(payEffect("correct", 400, 1000), { income: 0, expenditure: 600, next: 400 });
  });

  it("остаток с диска, без строк — снимок карточки", () => {
    const rows = [
      row({ id: -1, kind: "correct", income: 500, expenditure: 0, note: OPENING_NOTE }),
      row({ id: -2, kind: "income", income: 1000, expenditure: 0 }),
      row({ id: -3, kind: "product", income: 200, expenditure: 0 }),
    ];
    assert.equal(balanceOf(rows), 1500);
    assert.equal(displayedBalance([], "800"), 800);
    assert.equal(displayedBalance(rows, "800"), 1500);
    const fragment = [row({ id: 23529, kind: "income", income: 6450, expenditure: 0 })];
    assert.equal(displayedBalance(fragment, "500"), 500);
    assert.equal(displayedBalance(fragment, "500", true), 6450);
    assert.equal(displayedBalance(fragment, "0"), 0);
    assert.equal(snapshotBalance("1", 6450), 6450);
    assert.equal(snapshotBalance("5000", 0), 5000);
    assert.equal(snapshotBalance("", 0), 0);
    assert.equal(snapshotBalance("1"), 1);
    assert.equal(snapshotBalance("152475", 0, true), 0);
    assert.equal(snapshotBalance("152475", 0, false), 152475);
    assert.equal(accountSnapOf("152475", [{ id: 5016, rest: 0, archived: false }]), 0);
    assert.equal(accountSnapOf("5000", [{ id: 1, rest: 0, archived: true }]), 5000);
    assert.equal(accountSnapOf("5000", []), 5000);
    assert.equal(liveCttOf([{ id: 0, archived: false }, { id: 5016, rest: 0, archived: false }]).length, 1);
    const alehinPays = [
      row({ id: 1, kind: "income", income: 4350, expenditure: 0, cttId: 5016 }),
      row({ id: 2, kind: "income", income: 3950, expenditure: 0, cttId: 4175 }),
      row({ id: 3, kind: "income", income: 200, expenditure: 0 }),
      row({ id: 4, kind: "product", income: 50, expenditure: 0, cttId: 5016 }),
      row({ id: 5, kind: "income", income: 10, expenditure: 0, cttId: 5016, deleted: true }),
    ];
    assert.equal(paySumForCtt(alehinPays, 5016), 4350);
    assert.equal(payCountForCtt(alehinPays, 5016), 2);
    assert.equal(paySumForCtt(alehinPays, 0), 200);
    assert.equal(payCountForCtt(alehinPays, 0), 1);
  });

  it("вход из Alfa не затирает очередь и свои id", () => {
    const prev = [
      row({ id: -4, kind: "income", income: 700, expenditure: 0 }),
      row({ id: 88, kind: "income", income: 100, expenditure: 0 }),
    ];
    const pulled = [
      row({ id: 88, kind: "income", income: 100, expenditure: 0 }),
      row({ id: 99, kind: "income", income: 50, expenditure: 0 }),
    ];
    const merged = mergePayInbound(pulled, prev, [-4]);
    assert.equal(merged.some((x) => x.id === -4), true);
    assert.equal(merged.some((x) => x.id === 99), true);
    assert.equal(merged.find((x) => x.id === -4)?.income, 700);
  });

  it("inbound сохраняет cttId; pending create/delete и deleted не затирает", () => {
    const prev = [
      row({ id: -7, kind: "income", income: 400, expenditure: 0, cttId: 55 }),
      row({ id: 201, kind: "income", income: 100, expenditure: 0, cttId: 12, deleted: true }),
    ];
    const pulled = [
      row({ id: 201, kind: "income", income: 100, expenditure: 0, cttId: 12 }),
      row({ id: 202, kind: "income", income: 800, expenditure: 0, cttId: 77, tariffId: 9, groupId: 465 }),
    ];
    const merged = mergePayInbound(pulled, prev, [-7, 201]);
    assert.equal(merged.some((x) => x.id === -7), true);
    assert.equal(merged.find((x) => x.id === 201)?.deleted, true);
    assert.equal(merged.find((x) => x.id === 202)?.cttId, 77);
    assert.equal(merged.find((x) => x.id === 202)?.tariffId, 9);
    assert.equal(merged.find((x) => x.id === 202)?.groupId, 465);
  });

  it("вход Alfa снимает локальную корректировку с отрицательным id", () => {
    const prev = [
      row({ id: -808, kind: "correct", income: 999, expenditure: 0, note: "корректировка" }),
      row({ id: -1, kind: "correct", income: 1, expenditure: 0, note: OPENING_NOTE }),
    ];
    const pulled = [row({ id: 19767, kind: "income", income: 100, expenditure: 0 })];
    const merged = mergePayInbound(pulled, prev, []);
    assert.equal(merged.some((x) => x.id === -808), false);
    assert.equal(merged.some((x) => x.id === -1), false);
    assert.equal(merged.some((x) => x.id === 19767), true);
  });

  it("deleted не двигает остаток", () => {
    const rows = [
      row({ id: 1, kind: "income", income: 1000, expenditure: 0 }),
      row({ id: 2, kind: "income", income: 500, expenditure: 0, deleted: true }),
    ];
    assert.equal(balanceOf(rows), 1000);
    assert.equal(displayedBalance(rows, "0", true), 1000);
  });

  it("штамп: дата/id ≥, автоопрос 12/час", () => {
    const stamp = { lastId: 50, lastDate: "2026-09-07" };
    assert.equal(payAfterStamp({ id: 51, documentDate: "07.09.2026" }, stamp), true);
    assert.equal(payAfterStamp({ id: 50, documentDate: "07.09.2026" }, stamp), false);
    assert.equal(payAfterStamp({ id: 1, documentDate: "08.09.2026" }, stamp), true);
    assert.equal(payAfterStamp({ id: 99, documentDate: "06.09.2026" }, stamp), false);
    const next = nextPayStamp([{ id: 80, documentDate: "07.09.2026" }, { id: 3, documentDate: "08.09.2026" }], stamp);
    assert.equal(next.lastDate, "2026-09-08");
    assert.equal(next.lastId, 3);
    const now = Date.parse("2026-09-07T12:00:00Z");
    const hits = Array.from({ length: 12 }, (_, i) => new Date(now - i * 60_000).toISOString());
    assert.equal(payPollAllowed(hits, now), false);
    assert.equal(payPollAllowed(hits.slice(1), now), true);
    assert.equal(payPollHitsInWindow(["2026-09-07T10:00:00Z", "2026-09-07T11:50:00Z"], now).length, 1);
    assert.deepEqual(payPollStampOrEmpty({ lastId: 0, lastDate: "2026-09-07" }), { lastId: 0, lastDate: "" });
    assert.equal(payAfterStamp({ id: 9, documentDate: "01.01.2025" }, payPollStampOrEmpty({ lastId: 0, lastDate: "2026-09-07" })), true);
    assert.equal(payPollStampOrEmpty({ lastId: 80, lastDate: "07.09.2026" }).lastId, 80);
    assert.equal(payPollFirstFill({}), true);
    assert.equal(payPollFirstFill({ "1": { lastId: 0, lastDate: "2026-09-07" } }), true);
    assert.equal(payPollFirstFill({ "1": { lastId: 9, lastDate: "2026-09-07" }, "2": { lastId: 0, lastDate: "" }, "3": { lastId: 0, lastDate: "" }, "4": { lastId: 0, lastDate: "" } }), false);
    assert.equal(kindFromAlfaPay({ pay_type_id: 1, income: 100 }), "income");
    assert.equal(kindFromAlfaPay({ pay_type_id: 6, income: -5950 }), "correct");
    assert.equal(kindFromAlfaPay({ id: 23523, income: -5950 }), "correct");
    assert.equal(kindFromAlfaPay({ pay_item_id: 7, income: 10 }), "correct");
    assert.equal(kindFromAlfaPay({ pay_type_id: 2, income: 200 }), "product");
    assert.equal(kindFromAlfaPay({ pay_type_id: 3, expenditure: 50 }), "refund");
    assert.equal(kindFromAlfaPay({ commodity_id: 9, income: 200 }), "product");
    assert.equal(kindFromAlfaPay({ note: "Корректировка остатка", income: 1 }), "correct");
    assert.equal(kindFromAlfaPay({ expenditure: 80 }), "refund");
    assert.equal(payCustomerIdOf({ customer: { id: 44 } }), 44);
    assert.equal(alfaPayDate("2026-09-07"), "07.09.2026");
    assert.equal(alfaPayDate("07.09.2026"), "07.09.2026");
    assert.equal(alfaPayIndexDate("07.09.2026"), "2026.09.07");
    assert.equal(alfaPayIndexDate("2026-09-07"), "2026.09.07");
    assert.equal(ruDateIso("07.09.2026"), "2026-09-07");
  });

  it("базовый счет без абонемента, раздельный — с абонементом; страницы 50/100/500", () => {
    assert.equal(payAccountLabel(undefined), "Базовый счет");
    assert.equal(payAccountLabel(0), "Базовый счет");
    assert.equal(payAccountLabel(-1), "Базовый счет");
    assert.equal(payAccountLabel(192), "Раздельный счет");
    assert.deepEqual([...CASH_PAGE_SIZES], [50, 100, 500]);
    const rows = Array.from({ length: 120 }, (_, i) => i);
    const a = cashPageSlice(rows, 0, 50);
    assert.equal(a.items.length, 50);
    assert.equal(a.pages, 3);
    assert.equal(a.total, 120);
    const b = cashPageSlice(rows, 2, 50);
    assert.deepEqual(b.items[0], 100);
    const c = cashPageSlice(rows, 0, 999);
    assert.equal(c.size, 50);
    assert.equal(cashTakeOf(100), 100);
    assert.equal(cashTakeOf(500), 500);
    assert.equal(cashTakeOf(25), 50);
  });

  it("курсор истории кассы: порции по филиалам, короткая страница — следующий", () => {
    assert.deepEqual(payFillStart(), { bid: 1, page: 0 });
    assert.deepEqual(payFillAdvance({ bid: 1, page: 0 }, false), { bid: 1, page: 1 });
    assert.deepEqual(payFillAdvance({ bid: 1, page: 9 }, true), { bid: 2, page: 0 });
    assert.deepEqual(payFillAdvance({ bid: 4, page: 3 }, true), { bid: 4, page: 3, done: true });
    assert.equal(payFillAdvance({ bid: 4, page: 3, done: true }, false).done, true);
    assert.equal(payFillOf({ bid: 2, page: 4 })?.page, 4);
    assert.equal(payFillOf(null), undefined);
    assert.match(payFillNote({ bid: 3, page: 11 }), /филиал 3/);
    assert.equal(payFillNote({ bid: 4, page: 0, done: true }), "вся касса на диске");
    assert.match(payFillNote(undefined), /ещё не выгружалась/);
  });
});
