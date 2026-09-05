import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { liveTariffsResume } from "./crm-cache-policy-core.ts";

describe("круг абонементов", () => {
  it("счётчик готов, даже если cgi-круг не дошёл", () => {
    const r = liveTariffsResume({
      overlayNext: 27,
      overlayTotal: 76,
      overlayAt: new Date().toISOString(),
      liveCount: 40,
      cache: true,
      ttlMin: 30,
    });
    assert.equal(r.done, true);
    assert.equal(r.next, 27);
  });

  it("полный свежий круг не читает Alfa", () => {
    const r = liveTariffsResume({
      overlayNext: 76,
      overlayTotal: 76,
      overlayAt: new Date().toISOString(),
      liveCount: 40,
      cache: true,
      ttlMin: 30,
    });
    assert.equal(r.done, true);
    assert.equal(r.next, 76);
  });
});
