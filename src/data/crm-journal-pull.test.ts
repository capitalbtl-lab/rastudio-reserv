import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("ручной журнал с Alfa", () => {
  it("пакеты: группа, школа по 3, 10 учеников, карточка целиком", () => {
    const pull = readFileSync(new URL("./crm-journal-pull.ts", import.meta.url), "utf8");
    assert.match(pull, /kind === "group"/);
    assert.match(pull, /kind === "school"/);
    assert.match(pull, /take = kind === "school" \? 3 : 1/);
    assert.match(pull, /pickSlice\(people, idx, 10\)/);
    assert.match(pull, /kind === "balance"/);
    assert.match(pull, /inboundJournalGroup\(g.branchId, g.groupId, \{ deep: true \}\)/);
    assert.match(pull, /deep: 12/);
    assert.match(pull, /inboundCustomerPays/);
    assert.match(pull, /pullCustomerTariffs/);
    assert.match(pull, /force: true/);
    const inbound = readFileSync(new URL("./crm-journal-inbound.ts", import.meta.url), "utf8");
    assert.match(inbound, /export async function enrichCalendarDetails/);
    assert.match(inbound, /opts\?\.deep/);
    assert.match(inbound, /raw.homework/);
    assert.match(inbound, /opts\?\.force/);
    const api = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    assert.match(api, /"journalPull"/);
    assert.match(api, /journalPullState/);
    const ui = readFileSync(new URL("../components/admin-crm-settings.tsx", import.meta.url), "utf8");
    assert.match(ui, /Мастер журнала Alfa/);
    assert.match(ui, /function journalPlan/);
    assert.match(ui, /setWizWhatSafe/);
    assert.match(ui, /1\. Что загрузить/);
    assert.match(ui, /2\. Откуда/);
    assert.match(ui, /3\. Загрузить пакет/);
    assert.match(ui, /runJournal\(\)/);
    assert.match(ui, /Карточки целиком/);
    assert.match(ui, /Ещё пакет/);
    assert.match(pull, /rankedStudentIds\(study, group, group \? "" : school\)/);
  });
});
