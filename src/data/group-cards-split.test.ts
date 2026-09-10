import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("карточки групп по файлам", () => {
  it("клик пишет свой json; ночной общий файл один раз раскладывают", () => {
    const cards = readFileSync(new URL("./group-cards.ts", import.meta.url), "utf8");
    assert.match(cards, /storage", "group-cards"\)/);
    assert.match(cards, /\$\{branchId\}-\$\{gid\}\.json/);
    assert.match(cards, /cardMem/);
    assert.match(cards, /hydrateGroupCardsFromMonolith/);
    assert.match(cards, /group-cards\.json/);
    assert.match(cards, /cardFile\(card\.branchId, card\.id\)/);
    assert.match(cards, /storage", "customer-cals"\)/);
    assert.doesNotMatch(cards, /customer-calendars\.json/);
    assert.match(cards, /saveCustomerCalendarList/);
    const pull = readFileSync(new URL("./crm-journal-pull.ts", import.meta.url), "utf8");
    assert.match(pull, /storeMem/);
    assert.match(pull, /skipPeople/);
    const inbound = readFileSync(new URL("./crm-journal-inbound.ts", import.meta.url), "utf8");
    assert.match(inbound, /Promise\.all/);
    assert.match(inbound, /sliceWin/);
  });
});
