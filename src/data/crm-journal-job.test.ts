import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  peopleJobQueue,
  peopleJobFinished,
  shouldRetryCash,
  jobGapMs,
  mergeJobPatch,
  parseJobItems,
  emptyJournalJob,
  PEOPLE_JOB_GAP_MS,
  CATALOG_JOB_GAP_MS,
  JOB_WAIT_CAP,
} from "./crm-journal-job-core.ts";

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
    assert.equal(peopleJobFinished({ cid: 5, branchId: 2, name: "Д", journal: false, pays: true, short: true }, "balance"), true);
    assert.equal(peopleJobFinished({ cid: 5, branchId: 2, name: "Д", journal: false, pays: false }, "balance"), false);
    assert.equal(peopleJobFinished(people[3], "students"), false);
  });

  it("очередь с экрана читается и как массив, и как объект с индексами", () => {
    assert.deepEqual(parseJobItems([{ cid: 670, branchId: 2, name: "Чуднова" }]).map((x) => x.cid), [670]);
    assert.deepEqual(parseJobItems({ 0: { cid: 8037, name: "Анисичкин" }, 1: { cid: 34, name: "Антонов" } }).map((x) => x.cid), [8037, 34]);
    assert.equal(parseJobItems(null).length, 0);
    assert.equal(parseJobItems(undefined).length, 0);
  });

  it("касса не закрыта — тот же id, пауза 5 с; явки не крутят «не ответила»", () => {
    assert.equal(shouldRetryCash("balance", false, { ok: true, student: { paysMore: true } }), true);
    assert.equal(shouldRetryCash("balance", false, { ok: true, extra: "ещё страницы" }), true);
    assert.equal(shouldRetryCash("balance", false, { ok: false, error: "Alfa не ответила, нажмите снова" }), true);
    assert.equal(shouldRetryCash("balance", false, { ok: true, student: { paysOk: false, paysMore: false } }), false);
    assert.equal(shouldRetryCash("balance", false, { ok: true, student: { paysOk: false, paysMore: true } }), true);
    assert.equal(shouldRetryCash("balance", false, { ok: true, student: { paysOk: true, paysMore: false } }), false);
    assert.equal(shouldRetryCash("balance", true, { ok: true, student: { paysOk: true } }), false);
    assert.equal(shouldRetryCash("students", false, { ok: true }), false);
    assert.equal(shouldRetryCash("students", false, { ok: false, error: "Alfa не ответила, нажмите снова" }), false);
    assert.equal(shouldRetryCash("students", false, { ok: false, error: "уже грузим другого ученика" }), true);
    assert.equal(shouldRetryCash("students", false, { ok: false, error: "502" }), true);
    assert.equal(shouldRetryCash("group", false, { ok: false, error: "Alfa не ответила, нажмите снова" }), false);
    assert.equal(JOB_WAIT_CAP, 8);
  });

  it("патч: Стоп липкий, чужой id не затирает диск", () => {
    const a = { ...emptyJournalJob(), id: "a", stop: true, running: true, n: 3, fill: { kind: "students", label: "Иванов", customerId: 1 } };
    const keepStop = mergeJobPatch(a, { id: "a", running: true, stop: false, n: 4 });
    assert.equal(keepStop.stop, true);
    assert.equal(keepStop.n, 4);
    const other = mergeJobPatch(a, { id: "b", running: false, n: 0, msg: "чужой" });
    assert.equal(other.id, "a");
    assert.equal(other.n, 3);
    assert.equal(other.msg, "");
    const fillKeep = mergeJobPatch(a, { id: "a", n: 5 });
    assert.equal(fillKeep.fill?.label, "Иванов");
    const fillClear = mergeJobPatch(a, { id: "a", fill: null });
    assert.equal(fillClear.fill, null);
  });

  it("закон истории: только по одному, пауза 5 с", () => {
    assert.equal(PEOPLE_JOB_GAP_MS, 5000);
    assert.equal(CATALOG_JOB_GAP_MS, 5000);
    assert.equal(jobGapMs("people"), 5000);
    assert.equal(jobGapMs("people-recheck"), 5000);
    assert.equal(jobGapMs("groups"), 5000);
    assert.equal(jobGapMs("catalog"), 5000);
    assert.equal(jobGapMs("audit"), 5000);
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
    assert.match(job, /sleepGap\(step.gap, id\)/);
    assert.match(job, /касса · ещё/);
    assert.match(job, /касса · \$\{item.name\}/);
    assert.match(job, /берём следующего/);
    assert.match(job, /busy && waits > JOB_WAIT_CAP/);
    assert.match(job, /пауза 5 с/);
    assert.match(job, /lite: true/);
    assert.match(job, /if \(id && j.id !== id\) break/);
    assert.doesNotMatch(job, /enqueueExport/);
    assert.doesNotMatch(core, /enqueueExport/);
    assert.match(core, /renameSync/);
    assert.match(pull, /kind === "jobStart"/);
    assert.match(pull, /kind === "jobStatus"/);
    assert.match(pull, /function journalJobView/);
    assert.match(pull, /function litePullState/);
    assert.match(pull, /job: journalJobSnapshot/);
    assert.match(api, /kind !== "jobStart"/);
    assert.match(api, /kind !== "jobStatus"/);
    assert.match(api, /if \(kind !== "jobStatus"\) logAdmin/);
    assert.match(ui, /kind: "jobStart"/);
    assert.match(ui, /kind: "jobStatus"/);
    assert.match(ui, /function applyJobStatus/);
    assert.match(ui, /function requestStop/);
    assert.match(ui, /function startHistJob/);
    assert.match(ui, /periodKey: opts.periodKey/);
    assert.match(ui, /periodLabel: opts.periodLabel/);
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
    assert.match(ui, /jobMode: "life"/);
    assert.match(ui, /jobMode: "archives"/);
    assert.match(ui, /jobMode: "archivesPupils"/);
    assert.match(ui, /jobMode: "details"/);
    assert.match(ui, /onLoad=\{\(row, part, recheck\) =>\s*void startHistJob/);
    assert.doesNotMatch(ui, /onLoad=\{\(row, part, recheck\) =>\s*void runJournal/);
    assert.match(ui, /st\?\.job\?\.running/);
    assert.match(core, /if \(kind === "balance"\) return Boolean\(row.pays\)/);
    assert.doesNotMatch(core, /res.student\?\.paysOk === false/);
    assert.match(ui, /if \(kind === "balance"\) return Boolean\(row.pays\)/);
    assert.match(ui, /if \(journal\?\.job\?\.running\)/);
    assert.match(ui, /Уже идёт/);
    assert.match(ui, /h === "audit"/);
    assert.match(ui, /archived: groupArchived/);
    assert.match(job, /wantArch \? Boolean\(g\.archived\)/);
    assert.match(job, /Кто слева — ещё жёлтые/);
    assert.match(job, /mode === "details"/);
    assert.match(job, /пауза 5 с · ещё ДЗ/);
    assert.match(ui, /function peopleQueue/);
    assert.match(ui, /jobItems: queue.map/);
    assert.match(ui, /jobItems: opts.jobItems/);
    assert.match(ui, /opts.kind === "jobStart"/);
    assert.match(job, /given.length && mode !== "audit"/);
    assert.match(pull, /parseJobItems\(opts.jobItems\)/);
    assert.match(api, /parseJobItems/);
    assert.match(ui, /paintJob\(res.job, "load"\)/);
    assert.match(ui, /jobLive/);
    assert.match(ui, /src === "load" && holdFill.current && !job.running/);
    assert.match(ui, /setSchoolRun\(\{ cur: queue\[0\].name/);
    assert.match(ui, /journal\.job\.kind === "balance"/);
    assert.doesNotMatch(ui, /run && schoolRun \? schoolRun.cur : "Загрузить по одному"/);
    assert.doesNotMatch(ui, /for \(let i = 0; i < queue.length/);
    assert.doesNotMatch(job, /queue.slice\(0, take\)/);
    assert.match(job, /loopPullKind/);
    assert.match(pull, /needProbe.slice\(0, 1\)/);
  });
});
