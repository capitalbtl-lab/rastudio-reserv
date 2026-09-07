import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nightHourMoscow, nightWindowOpen } from "./crm-night-groups.ts";

describe("окно ночного inbound", () => {
  it("04:00 Москва — открыто, день — нет, force — да", () => {
    const at4 = Date.parse("2026-09-07T01:00:00Z");
    const atDay = Date.parse("2026-09-07T12:00:00Z");
    assert.equal(nightHourMoscow(at4).hour, 4);
    assert.equal(nightWindowOpen(at4, false), true);
    assert.equal(nightWindowOpen(atDay, false), false);
    assert.equal(nightWindowOpen(atDay, true), true);
  });
});
