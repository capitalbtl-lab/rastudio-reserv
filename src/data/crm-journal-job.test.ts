import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { peopleJobQueue, peopleJobFinished, shouldRetryCash, jobGapMs, PEOPLE_JOB_GAP_MS, CATALOG_JOB_GAP_MS } from "./crm-journal-job-core.ts";

describe("фон истории из Alfa", () => {
  it("очередь учеников: слева неготовые, справа перепроверка", () => {
    const people = [
      { cid: 1, branchId: 2, name: "А", journal: false, pays: false },
      { cid: 2, branchId: 2, name: "Б", journal: true, pays: true, rechecked: true, paysRechecked: true },
      { cid: 3, branchId: 2, name: "В", journal: true, pays: true, rechecked: false, paysRechecked: false },
      { cid: 4, branchId: 2, name: "Г", journal: true, pays: false, short: true },
    ];
    assert.deepEqual(peopleJobQueue(people, "students", false).map((x) => x.cid), [1, 4]);
    assert.deepEqual(peopleJobQueue(people, "students", true).map((x) => x.cid), [3]);
    assert.equal(peopleJobFinished(people[1], "balance"), true);
    assert.equal(peopleJobFinished(people[3], "students"), false);
  });

  it("касса не закрыта — тот же id, пауза 5 с", () => {
    assert.equal(shouldRetryCash("balance", false, { ok: true, student: { paysMore: true } }), true);
    assert.equal(shouldRetryCash("balance", false, { ok: true, extra: "ещё страницы" }), true);
    assert.equal(shouldRetryCash("balance", false, { ok: false, error: "Alfa не ответила, нажмите снова" }), true);
    assert.equal(shouldRetryCash("balance", true, { ok: true, student: { paysOk: true } }), false);
    assert.equal(shouldRetryCash("students", false, { ok: true }), false);
  });

  it("пауза 5 с у явок и кассы, 1 с у архива и сверки", () => {
    assert.equal(PEOPLE_JOB_GAP_MS, 5000);
    assert.equal(jobGapMs("people"), 5000);
    assert.equal(jobGapMs("people-recheck"), 5000);
    assert.equal(jobGapMs("groups"), 5000);
    assert.equal(CATALOG_JOB_GAP_MS, 1000);
    assert.equal(jobGapMs("catalog"), 1000);
    assert.equal(jobGapMs("audit"), 1000);
  });

  it("сервер крутит цикл, вкладка только старт/стоп/прогресс", () => {
    const job = readFileSync(new URL("./crm-journal-job.ts", import.meta.url), "utf8");
    const core = readFileSync(new URL("./crm-journal-job-core.ts", import.meta.url), "utf8");
    const pull = readFileSync(new URL("./crm-journal-pull.ts", import.meta.url), "utf8");
    const ui = readFileSync(new URL("../components/admin-crm-settings.tsx", import.meta.url), "utf8");
    const api = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    assert.match(job, /export function startJournalJob/);
    assert.match(job, /export function stopJournalJob/);
    assert.match(job, /void tickJob/);
    assert.match(job, /await sleepGap/);
    assert.match(job, /касса · ещё/);
    assert.match(job, /пауза 5 с/);
    assert.doesNotMatch(job, /enqueueExport/);
    assert.doesNotMatch(core, /enqueueExport/);
    assert.match(pull, /kind === "jobStart"/);
    assert.match(pull, /job: journalJobSnapshot/);
    assert.match(api, /kind !== "jobStart"/);
    assert.match(ui, /kind: "jobStart"/);
    assert.match(ui, /function requestStop/);
    assert.match(ui, /function startHistJob/);
    assert.match(ui, /Загрузить по одному/);
    assert.match(ui, /Перепроверить по одному/);
    assert.match(ui, /PEOPLE_LOAD_GAP_MS = 5000/);
    assert.match(ui, /function pauseFive/);
    assert.match(ui, /async function recheckSchool/);
    assert.match(ui, /async function recheckPeople/);
    assert.match(ui, /async function pullAudit/);
    const schoolAt = ui.indexOf("async function recheckSchool");
    const schoolFn = ui.slice(schoolAt, ui.indexOf("async function recheckGroupsOne"));
    assert.match(schoolFn, /holdFill\.current = true/);
    assert.doesNotMatch(schoolFn, /recheck: true/);
    assert.match(ui, /"people-recheck" : "people"/);
    assert.match(ui, /jobMode: "groups"/);
    assert.match(ui, /jobMode: "catalog"/);
    assert.match(ui, /jobMode: "audit"/);
    assert.doesNotMatch(ui, /for \(let i = 0; i < queue.length/);
  });
});
