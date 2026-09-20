import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  compareRuns,
  namedBuckets,
  namedText,
  resultOfPull,
  runIdFor,
  settingsLine,
  stepOfKind,
  summarizeRows,
  rowsToText,
  matchedOf,
  changeLine,
  type StepLogRow,
} from "./crm-step-run-log-core.ts";

function row(p: Partial<StepLogRow>): StepLogRow {
  return {
    id: String(p.id || "r1"),
    at: p.at || "2026-09-20T10:00:00.000Z",
    step: p.step || 5,
    runId: p.runId || "run-a",
    name: p.name || "Тихомирова",
    cid: p.cid ?? 4982,
    action: p.action || "recheck",
    result: p.result || "left",
    ok: p.ok ?? true,
    matched: p.matched,
    note: p.note || "",
    settings: p.settings || { recheck: true, dateFrom: "2015-01-01" },
    before: p.before,
    after: p.after,
  };
}

describe("лог прогонов шагов", () => {
  it("kind → номер шага", () => {
    assert.equal(stepOfKind("roster"), 1);
    assert.equal(stepOfKind("students", "people-recheck"), 2);
    assert.equal(stepOfKind("group"), 3);
    assert.equal(stepOfKind("balance"), 4);
    assert.equal(stepOfKind("audit"), 5);
    assert.equal(stepOfKind("jobStatus"), 0);
  });

  it("сверка: справа / слева / пропуск", () => {
    assert.equal(resultOfPull({ step: 5, lastAudit: { rows: [{ codes: ["ok"] }] } }), "right");
    assert.equal(resultOfPull({ step: 5, lastAudit: { rows: [{ codes: ["writeoff-gap"] }] } }), "left");
    assert.equal(resultOfPull({ step: 5, lastAudit: { rows: [{ codes: ["нет сверки"] }] } }), "skip");
    assert.equal(resultOfPull({ ok: true, student: { done: true } }), "ok");
    assert.equal(resultOfPull({ ok: true, student: { short: true, holeN: 1 } }), "hole");
    assert.equal(resultOfPull({ ok: false, error: "429" }), "fail");
  });

  it("сравнение прогонов ловит прыжок совпало → не совпало", () => {
    const a = [row({ result: "right", matched: true })];
    const b = [row({ result: "left", matched: false })];
    const flips = compareRuns(a, b);
    assert.equal(flips.length, 1);
    assert.equal(flips[0].name, "Тихомирова");
    assert.equal(flips[0].a, "right");
    assert.equal(flips[0].b, "left");
    assert.equal(compareRuns(a, a).length, 0);
  });

  it("сводка считает по последней записи человека, не раздувает повтор", () => {
    const s = summarizeRows([
      row({ result: "right", matched: true }),
      row({ id: "1b", result: "left", matched: false }),
      row({ id: "2", cid: 1, name: "Адильханова", result: "left", matched: false }),
      row({ id: "3", cid: 2, name: "Чуднова", result: "fail", ok: false }),
    ]);
    assert.equal(s.n, 4);
    assert.equal(s.unique, 3);
    assert.equal(s.ok, 0);
    assert.equal(s.left, 2);
    assert.equal(s.fail, 1);
    assert.match(rowsToText([row({ note: "лишнее списание" })]), /Тихомирова №4982/);
  });

  it("поименно: кто совпал и кто нет, с диском до/после", () => {
    const named = namedBuckets([
      row({ result: "right", matched: true, after: { lessonsDisk: 47, lessonsAlfa: 47 } }),
      row({ id: "2", cid: 568, name: "Чуднова", result: "left", matched: false, before: { lessonsDisk: 84, lessonsAlfa: 47, extraN: 37 }, after: { lessonsDisk: 47, lessonsAlfa: 47, extraN: 0 } }),
    ]);
    const text = namedText([
      row({ result: "right", matched: true, after: { lessonsDisk: 47, lessonsAlfa: 47 } }),
      row({ id: "2", cid: 568, name: "Чуднова", result: "left", matched: false, after: { lessonsDisk: 84, extraN: 37 } }),
    ]);
    assert.ok(named.some((b) => b.result === "right" && b.names[0].who.includes("Тихомирова")));
    assert.ok(named.some((b) => b.result === "left" && b.names[0].who.includes("Чуднова")));
    assert.match(text, /Чуднова №568/);
    assert.match(changeLine(row({ before: { lessonsDisk: 84 }, after: { lessonsDisk: 47 } })), /диск 84→47/);
  });

  it("разные настройки — разные прогоны руками", () => {
    const a = runIdFor({ step: 2, settings: { recheck: true, recheckDays: 7, dateFrom: "2015-01-01", study: "1" }, stamp: "2026-09-20" });
    const b = runIdFor({ step: 2, settings: { recheck: true, recheckDays: 365, dateFrom: "2015-01-01", study: "1" }, stamp: "2026-09-20" });
    assert.notEqual(a, b);
    assert.match(settingsLine({ recheck: true, recheckDays: 7, study: "1" }), /перепроверка/);
    assert.equal(matchedOf("ok"), true);
    assert.equal(matchedOf("hole"), false);
  });

  it("шаги не зовут лог изнутри pullOne / auditOne / inbound", () => {
    const pull = readFileSync(new URL("./crm-journal-pull.ts", import.meta.url), "utf8");
    const oneAt = pull.indexOf("async function pullOneStudent");
    const oneEnd = pull.indexOf("export async function journalPull", oneAt);
    const body = pull.slice(oneAt, oneEnd);
    assert.doesNotMatch(body, /observeStepPull|crm-step-run-log/);
    const audit = readFileSync(new URL("./crm-balance-audit.ts", import.meta.url), "utf8");
    assert.doesNotMatch(audit, /observeStepPull|crm-step-run-log/);
    const inbound = readFileSync(new URL("./crm-journal-inbound.ts", import.meta.url), "utf8");
    assert.doesNotMatch(inbound, /observeStepPull|crm-step-run-log/);
  });

  it("наблюдает после historyLoadOne, результат шага не подменяет", () => {
    const load = readFileSync(new URL("./crm-history-load.ts", import.meta.url), "utf8");
    assert.match(load, /observeStepPull/);
    assert.match(load, /return res/);
    assert.match(load, /journalPull\(/);
    const job = readFileSync(new URL("./crm-journal-job.ts", import.meta.url), "utf8");
    assert.match(job, /observeJobStart/);
    assert.match(job, /observeJobClose/);
    assert.doesNotMatch(job, /journalPull\(/);
  });

  it("ядро лога без диска, экран не импортирует fs-файл", () => {
    const disk = readFileSync(new URL("./crm-step-run-log.ts", import.meta.url), "utf8");
    assert.match(disk, /observeStepPull/);
    assert.match(disk, /beginStepRun/);
    assert.doesNotMatch(readFileSync(new URL("./crm-step-run-log-core.ts", import.meta.url), "utf8"), /node:fs/);
    const ui = readFileSync(new URL("../components/admin-step-run-log.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(ui, /crm-step-run-log"/);
    assert.match(ui, /crm-step-run-log-core/);
    const settings = readFileSync(new URL("../components/admin-crm-settings.tsx", import.meta.url), "utf8");
    assert.match(settings, /StepRunLogPanel/);
    assert.match(settings, /Лог обработки/);
    const api = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    assert.match(api, /"stepLog"/);
    assert.match(api, /diskPersonSnap/);
    assert.doesNotMatch(api, /job\.running \? job\.id/);
    const begin = disk.indexOf("export function beginStepRun");
    const beginBody = disk.slice(begin, disk.indexOf("export function closeStepRun", begin));
    assert.doesNotMatch(beginBody, /endedAt: undefined/);
  });
});
