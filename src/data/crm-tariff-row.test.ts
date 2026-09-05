import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { liveTariffCustomerIds, tariffDateToIso, tariffRowHasTemplate, tariffRowLive } from "./crm-tariff-row.ts";

describe("живая строка абонемента", () => {
  const today = "2026-09-05";

  it("одно правило: id есть, не removed, срок не вышел; tariff_id не обязателен", () => {
    assert.equal(tariffRowLive({ id: 1, tariff_id: 12, e_date: "04.07.2027" }, today), true);
    assert.equal(tariffRowLive({ id: 88, removed: 0, e_date: "04.07.2027" }, today), true);
    assert.equal(tariffRowLive({ id: 1, tariff_id: 12, e_date: "" }, today), true);
    assert.equal(tariffRowLive({ id: 1, tariff_id: 12, e_date: "0000-00-00" }, today), true);
    assert.equal(tariffRowLive({ id: 1, tariff_id: 12, b_date: "06.09.2026", e_date: "04.07.2027" }, today), true);
    assert.equal(tariffRowLive({ id: 1, tariff_id: 12, e_date: "04.09.2026" }, today), false);
    assert.equal(tariffRowLive({ id: 1, tariff_id: 12, removed: 1 }, today), false);
    assert.equal(tariffRowLive({ id: 0, tariff_id: 12 }, today), false);
  });

  it("назначение шаблона требует tariff_id, счётчик — нет", () => {
    const nameless = { id: 88, removed: 0, e_date: "04.07.2027" };
    assert.equal(tariffRowLive(nameless, today), true);
    assert.equal(tariffRowHasTemplate(nameless, today), false);
    assert.equal(tariffRowHasTemplate({ id: 1, tariff_id: 12, e_date: "04.07.2027" }, today), true);
  });

  it("касса не участвует: paid_till и balance не делают строку живой или мёртвой", () => {
    assert.equal(tariffRowLive({ id: 1, tariff_id: 12, paid_till: "01.01.2020", balance: 0 }, today), true);
    assert.equal(tariffRowLive({ id: 1, removed: 1, paid_till: "01.01.2030", balance: 9000 }, today), false);
  });

  it("счётчик — уникальные ученики с живой строкой", () => {
    const ids = liveTariffCustomerIds(
      [
        { id: 1, customer_id: 10, tariff_id: 12, e_date: "04.07.2027" },
        { id: 2, customer_id: 10, e_date: "04.07.2027" },
        { id: 3, customer_id: 11, removed: 1 },
        { id: 4, customer: { id: 12 }, e_date: "01.01.2020" },
        { id: 5, customer_ids: [13] },
      ],
      today,
    );
    assert.deepEqual([...ids].sort((a, b) => a - b), [10, 13]);
  });

  it("даты 0000 и мусор не считаются сроком", () => {
    assert.equal(tariffDateToIso("0000-00-00"), "");
    assert.equal(tariffDateToIso("00.00.0000"), "");
    assert.equal(tariffDateToIso("5.9.2026"), "2026-09-05");
  });
});
