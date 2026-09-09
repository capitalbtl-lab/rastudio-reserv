import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { journalPeriods, journalChunks, nextPeriod, periodOfDate, spanOf, expandPeriodKeys, chunkDone } from "./crm-journal-periods.ts";

describe("ручной журнал с Alfa", () => {
  it("кварталы с конца, полугодие и год — пачки", () => {
    const p = journalPeriods(new Date("2026-09-09T12:00:00Z"), 2);
    assert.equal(p[0].key, "2026q3");
    assert.equal(p[1].key, "2026q2");
    assert.equal(p.length, 8);
    assert.equal(nextPeriod(["2026q3"], p)?.key, "2026q2");
    assert.equal(periodOfDate(new Date(2024, 2, 5)), "2024q1");
    assert.equal(spanOf([{ date: "01.09.2025" }, { date: "10.03.2026" }]).from, "сен 2025");
    assert.deepEqual(expandPeriodKeys(["2024-1", "2024-2"]).sort(), ["2024q1", "2024q2", "2024q3", "2024q4"]);
    const year = journalChunks("year", new Date("2026-09-09T12:00:00Z"), 1);
    assert.equal(year[0].key, "2026");
    assert.equal(year[0].keys.length, 4);
    assert.equal(chunkDone(year[0], year[0].keys), true);
    const half = journalChunks("half", new Date("2026-09-09T12:00:00Z"), 1);
    assert.equal(half[0].key, "2026h2");
    assert.match(half[0].label, /июл–дек 2026/);
  });

  it("только кнопка группы и порция, фон сам не качает", () => {
    const pull = readFileSync(new URL("./crm-journal-pull.ts", import.meta.url), "utf8");
    assert.match(pull, /periodKey/);
    assert.match(pull, /grain/);
    assert.match(pull, /Выберите группу и порцию/);
    assert.match(pull, /вся информация загружена/);
    assert.match(pull, /parts/);
    const inbound = readFileSync(new URL("./crm-journal-inbound.ts", import.meta.url), "utf8");
    assert.match(inbound, /opts\?\.lite \|\| windowed/);
    const ui = readFileSync(new URL("../components/admin-crm-settings.tsx", import.meta.url), "utf8");
    assert.match(ui, /GroupFillList/);
    assert.match(ui, /I квартал|Квартал/);
    assert.match(ui, /Порция за одно нажатие/);
    assert.match(ui, /вся информация загружена/);
    assert.match(ui, /periodKey: part.key/);
    assert.doesNotMatch(ui, /setInterval\(\(\) => \{\s*if \(document.hidden/);
    const pack = readFileSync(new URL("./crm-packet-queue.ts", import.meta.url), "utf8");
    assert.doesNotMatch(pack, /inboundJournalChunk\(polJ.journalNext/);
    const api = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    assert.match(api, /periodKey/);
  });
});
