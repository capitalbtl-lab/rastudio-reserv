import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

describe("база знаний: предметы и роли", () => {
  it("заводской текст содержит курс сайта, счётчики, роли и статусы", () => {
    const src = readFileSync(new URL("./agent-section-guides-data.ts", import.meta.url), "utf8");
    assert.match(src, /GUIDE_REV = "2026-09-05-clients-tariff"/);
    assert.match(src, /id: "subjects"/);
    assert.match(src, /id: "roles"/);
    assert.match(src, /function subjectsBody/);
    assert.match(src, /function rolesBody/);
    assert.match(src, /нет курса/);
    assert.match(src, /pane=subjects/);
    assert.match(src, /schedule-map\.json/);
    assert.match(src, /groupByBranch/);
    assert.match(src, /не уходит/);
    assert.match(src, /гр \/ уч|групп \/ ученик/);
    assert.match(src, /consultantCanBook/);
    assert.match(src, /custom_prioritet/);
    assert.match(src, /status 4/);
    assert.match(src, /custom_hashtagkursa/);
    assert.match(src, /branchId/);
    assert.match(src, /id: "tariffs"/);
    assert.match(src, /id: "pupil-wizard"/);
    assert.match(src, /function tariffsBody/);
    assert.match(src, /pupilTariffAssign/);
    assert.match(src, /is_separate_balance/);
    assert.match(src, /path add\|change\|remove/);
    assert.match(src, /clientsLiveTariffs/);
  });
});
