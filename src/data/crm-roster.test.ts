import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("шаг 1: группы и состав", () => {
  it("фильтр «кто активный» читается с кнопки Запомнить", () => {
    const src = readFileSync(new URL("./crm-roster.ts", import.meta.url), "utf8");
    assert.match(src, /if \(\/leads=1\/\.test\(q\)\) out\.leads = true/);
    assert.match(src, /if \(\/arch=0\/\.test\(q\)\) out\.archiveInLive = false/);
    assert.match(src, /n === 0 \|\| n === 15 \|\| n === 30 \|\| n === 150/);
    const ui = readFileSync(new URL("../components/admin-crm-settings.tsx", import.meta.url), "utf8");
    assert.match(ui, /leads=\$\{rosterLeads \? 1 : 0\}&arch=\$\{rosterArchLive \? 1 : 0\}&days=\$\{rosterDays\}/);
    assert.match(ui, /kind: "rosterPolicy"/);
  });

  it("читает cgi, пишет диск, Alfa не трогает", () => {
    const src = readFileSync(new URL("./crm-roster.ts", import.meta.url), "utf8");
    const pull = readFileSync(new URL("./crm-journal-pull.ts", import.meta.url), "utf8");
    const job = readFileSync(new URL("./crm-journal-job.ts", import.meta.url), "utf8");
    const ui = readFileSync(new URL("../components/admin-crm-settings.tsx", import.meta.url), "utf8");
    const sched = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    const load = readFileSync(new URL("./crm-history-load.ts", import.meta.url), "utf8");
    assert.match(src, /cgi\/index\?group_id=/);
    assert.match(src, /customer\/index/);
    assert.match(src, /applyCrmCustomer/);
    assert.match(src, /groupLink: \{/);
    assert.match(src, /stampLink\(cid, bid, gid, name, true\)/);
    assert.match(src, /stampLink\(cid, bid, gid, name, false\)/);
    assert.doesNotMatch(src, /enqueueExport/);
    assert.doesNotMatch(src, /customer\.update/);
    assert.doesNotMatch(src, /cgi\/create/);
    assert.match(pull, /kind === "roster"/);
    assert.match(pull, /kind === "rosterPolicy"/);
    assert.match(pull, /pullGroupRoster/);
    assert.match(pull, /rosterPolicy: loadRosterPolicy/);
    assert.match(job, /mode === "roster"/);
    assert.match(job, /liveAdminGroups\(school\)/);
    assert.match(job, /name: item.name/);
    assert.match(load, /mode === "roster" \|\| mode === "roster-recheck"/);
    assert.match(load, /name: spec.name/);
    assert.match(sched, /kind !== "roster"/);
    assert.match(sched, /kind !== "rosterPolicy"/);
    assert.match(ui, /Шаг 1 · Группы и состав/);
    assert.match(ui, /jobMode: "roster"/);
    assert.match(ui, /Требуют загрузки состава/);
    assert.match(ui, /loadRosterOne/);
    assert.match(ui, /HINT\.tabRoster/);
    assert.doesNotMatch(ui, /enqueueExport/);
  });
});
