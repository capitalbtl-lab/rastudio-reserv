import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { journalPeriods, nextPeriod, periodOfDate, spanOf } from "./crm-journal-periods.ts";

describe("ручной журнал с Alfa", () => {
  it("полугодия с конца в начало", () => {
    const p = journalPeriods(new Date("2026-09-09T12:00:00Z"), 2);
    assert.equal(p[0].key, "2026-2");
    assert.equal(p[1].key, "2026-1");
    assert.equal(p[2].key, "2025-2");
    assert.equal(p.length, 4);
    assert.equal(nextPeriod(["2026-2"], p)?.key, "2026-1");
    assert.equal(periodOfDate(new Date(2024, 2, 5)), "2024-1");
    assert.equal(spanOf([{ date: "01.09.2025" }, { date: "10.03.2026" }]).from, "сен 2025");
  });

  it("пакеты: группа по полугодию, 10 учеников, карточка целиком", () => {
    const pull = readFileSync(new URL("./crm-journal-pull.ts", import.meta.url), "utf8");
    assert.match(pull, /kind === "group"/);
    assert.match(pull, /kind === "school"/);
    assert.match(pull, /pickSlice\(people, idx, 10\)/);
    assert.match(pull, /kind === "balance"/);
    assert.match(pull, /dateFrom: period.from/);
    assert.match(pull, /stampJournalPeriod/);
    assert.match(pull, /groupFillRow/);
    assert.match(pull, /есть с/);
    assert.match(pull, /deep: 12/);
    assert.match(pull, /inboundCustomerPays/);
    assert.match(pull, /pullCustomerTariffs/);
    assert.match(pull, /force: true/);
    assert.match(pull, /все полугодия/);
    const inbound = readFileSync(new URL("./crm-journal-inbound.ts", import.meta.url), "utf8");
    assert.match(inbound, /opts\?\.lite \|\| windowed/);
    assert.match(inbound, /journalAt: now/);
    const ui = readFileSync(new URL("../components/admin-crm-settings.tsx", import.meta.url), "utf8");
    assert.match(ui, /GroupFillList/);
    assert.match(ui, /полугодий/);
    assert.match(ui, /Загрузить следующее полугодие/);
    assert.match(ui, /грузим/);
    const api = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    assert.match(api, /"journalPull"/);
    assert.match(api, /journalPullState/);
  });
});
