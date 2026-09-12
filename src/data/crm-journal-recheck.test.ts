import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pulledPeriodKeys,
  chunkOverlapsLife,
  chunkDone,
  journalChunks,
  groupAge,
  lifeLabel,
  toAlfaLessonDate,
  clampGrain,
} from "./crm-journal-periods.ts";
import { lessonNeedsHomework, lessonNeedsDetails } from "./crm-slots-core.ts";
import { readFileSync } from "node:fs";

function completeOf(lifeFrom: string, lifeTo: string, fill: { done?: string[]; pulled?: Record<string, string>; weak?: string[] }) {
  const done = pulledPeriodKeys(fill);
  const weak = new Set(fill.weak || []);
  const parts = journalChunks("quarter").filter((c) => chunkOverlapsLife(c, lifeFrom, lifeTo));
  const ready = parts.filter((p) => chunkDone(p, done) && !p.keys.some((k) => weak.has(k)));
  return { total: parts.length, done: ready.length, complete: parts.length > 0 && ready.length === parts.length, keys: parts.map((p) => p.key) };
}

describe("перепроверка журнала", () => {
  it("Alfa date_from: 01.07.2026 → 2026-07-01, не 400", () => {
    assert.equal(toAlfaLessonDate("01.07.2026"), "2026-07-01");
    assert.equal(toAlfaLessonDate("30.09.2026"), "2026-09-30");
    assert.equal(toAlfaLessonDate("2026-07-01"), "2026-07-01");
    assert.equal(toAlfaLessonDate("1.7.2026"), "2026-07-01");
  });

  it("робототехника: 8 кварталов, один клик не закрывает группу", () => {
    const lifeFrom = "01.09.2024";
    const lifeTo = "31.08.2026";
    const inferred = { done: ["2024q3", "2024q4", "2025q1", "2025q2", "2025q3", "2025q4", "2026q1", "2026q2"] };
    const polluted = completeOf(lifeFrom, lifeTo, inferred);
    assert.equal(polluted.complete, false);
    assert.ok(polluted.total >= 7, `ожидали ~8 кварталов, получили ${polluted.total}: ${polluted.keys.join(",")}`);
    assert.equal(polluted.done, 0);

    const one = completeOf(lifeFrom, lifeTo, { pulled: { "2026q2": "2026-09-09T00:00:00Z" }, done: inferred.done });
    assert.equal(one.complete, false);
    assert.equal(one.done, 1);

    const allPulled: Record<string, string> = {};
    for (const k of polluted.keys) allPulled[k] = "x";
    const full = completeOf(lifeFrom, lifeTo, { pulled: allPulled });
    assert.equal(full.complete, true);
    assert.equal(full.done, full.total);
  });

  it("английский на полгода не предлагает 2024", () => {
    const parts = journalChunks("quarter").filter((c) => chunkOverlapsLife(c, "01.02.2026", "30.06.2026"));
    assert.ok(parts.every((p) => p.key.startsWith("2026")));
    assert.ok(!parts.some((p) => p.key.startsWith("2024")));
    assert.equal(groupAge("01.02.2026", "30.06.2026", new Date("2026-09-09")).id, "young");
    assert.match(lifeLabel("01.02.2026", "30.06.2026"), /фев 2026/);
  });

  it("обрыв пакета: weak не даёт зелёный бейдж", () => {
    const row = completeOf("15.07.2026", "15.09.2026", { pulled: { "2026q3": "x" }, weak: ["2026q3"] });
    assert.ok(row.keys.includes("2026q3"));
    assert.equal(row.complete, false);
    assert.equal(row.done, 0);
    const ok = completeOf("15.07.2026", "15.09.2026", { pulled: { "2026q3": "x" }, weak: [] });
    assert.equal(ok.complete, true);
    assert.equal(ok.done, ok.total);
  });

  it("перепроверка: повторный квартал остаётся в списке порций", () => {
    const chunks = journalChunks("quarter").filter((c) => c.key === "2026q3");
    assert.equal(chunks.length, 1);
    assert.equal(chunkDone(chunks[0], ["2026q3"]), true);
    assert.equal(chunkDone(chunks[0], []), false);
  });

  it("сентябрь показывает IV квартал 2026; октябрьская группа не закрывается одним III", () => {
    const now = new Date("2026-09-09");
    const qs = journalChunks("quarter", now);
    assert.ok(qs.some((c) => c.key === "2026q4"), "должен быть IV квартал 2026");
    const fall = completeOf("01.10.2026", "31.12.2026", { pulled: { "2026q3": "x" } });
    assert.ok(fall.keys.includes("2026q4"));
    assert.equal(fall.complete, false);
  });

  it("0/0 кварталов не готово; год только у молодых", () => {
    const empty = completeOf("01.01.2090", "02.01.2090", { pulled: {} });
    assert.ok(empty.total === 0 || empty.complete === false);
    assert.equal(clampGrain("old", "year"), "half");
    assert.equal(clampGrain("mid", "year"), "half");
    assert.equal(clampGrain("young", "year"), "year");
    assert.equal(clampGrain("old", "quarter"), "quarter");
  });

  it("кнопка ДЗ пропадает после detailsAt, даже если тема в Alfa пустая", () => {
    const raw = { lessonId: 9, date: "01.09.2026", from: "10:00", to: "11:00", status: 3, type: "group" };
    assert.equal(lessonNeedsHomework(raw), true);
    assert.equal(lessonNeedsHomework({ ...raw, topic: "натюрморт" }), false);
    assert.equal(lessonNeedsHomework({ ...raw, detailsAt: "2026-09-09T12:00:00Z" }), false);
    assert.equal(lessonNeedsHomework({ ...raw, status: 1 }), false);
    assert.equal(lessonNeedsDetails({ ...raw, detailsAt: "x" }), false);
  });

  it("перепроверка явок не стирает уже скачанные тему, ДЗ и таблицу", () => {
    const cards = readFileSync(new URL("./group-cards.ts", import.meta.url), "utf8");
    assert.match(cards, /detailsAt: old\.detailsAt \|\| row\.detailsAt/);
    assert.match(cards, /topic: String\(row\.topic/);
    assert.match(cards, /mode: "replace" \| "union" = "union"/);
    const ui = readFileSync(new URL("../components/admin-crm-settings.tsx", import.meta.url), "utf8");
    assert.match(ui, /holdFill/);
    assert.match(ui, /colLock/);
    assert.match(ui, /Сверить счёт/);
    assert.match(ui, /function HintI/);
    assert.match(ui, /Загрузить всю историю/);
    assert.match(ui, /PEOPLE_FROM_OPTS/);
    assert.match(ui, /YearsSelect/);
    assert.match(ui, /HINT\.loadOneGroups/);
    assert.match(ui, /HINT\.loadOneMoney/);
    assert.match(ui, /h-\[8px\] w-\[8px\]/);
    assert.match(ui, /BTN_RED/);
    assert.match(ui, /bg-red-600/);
    assert.match(ui, /PEOPLE_FROM_OPTS/);
    assert.match(ui, /с начала · 2015/);
    assert.match(ui, /Загрузить всю историю/);
    assert.match(ui, /peopleDateFrom/);
    assert.doesNotMatch(ui, /Догрузить текущих/);
    assert.doesNotMatch(ui, /Перепроверить загруженных/);
    assert.match(ui, /peopleLock/);
    assert.match(ui, /PEOPLE_LOAD_GAP_MS = 5000/);
    assert.match(ui, /пауза 5 с/);
    assert.match(ui, /function pauseFive/);
    assert.doesNotMatch(ui, /runStudentPack/);
    assert.doesNotMatch(ui, /const total = 10/);
    assert.doesNotMatch(ui, /const auto = kind === "students"/);
    assert.doesNotMatch(ui, /Очередь \$\{schoolRun/);
    assert.doesNotMatch(ui, /Грузим \$\{schoolRun.n\}/);
    const pullLock = readFileSync(new URL("./crm-journal-pull.ts", import.meta.url), "utf8");
    assert.match(pullLock, /studentPullCid/);
    assert.match(pullLock, /уже грузим/);
    assert.match(pullLock, /row\.blocked/);
    assert.match(pullLock, /homeOnly: false/);
    assert.match(pullLock, /if \(!recheck && first\.ok && disk >= alfa0\)/);
    assert.match(pullLock, /probeCustomerLessons/);
    const inbound = readFileSync(new URL("./crm-journal-inbound.ts", import.meta.url), "utf8");
    assert.match(inbound, /waitLockStudentAlfa/);
    assert.match(inbound, /homeLite/);
    assert.match(inbound, /maxPages = homeLite \? 1/);
    assert.match(inbound, /const homeLite = Boolean\(opts\?\.homeOnly\);/);
    assert.match(inbound, /opts\?\.dateFrom/);
    assert.match(inbound, /deepHist/);
    assert.doesNotMatch(inbound, /homeOnly\) \|\| Number\(opts\?\.take\)/);
    assert.match(inbound, /export async function probeCustomerLessons/);
    assert.match(inbound, /pruneCalendarToAlfaIds/);
    assert.match(inbound, /opts\?\.prune/);
    assert.match(pullLock, /prune: recheck/);
    assert.match(cards, /canFanOutToCalendar/);
    assert.match(inbound, /!opts\?\.force/);
    assert.doesNotMatch(pullLock, /error: "Фон с AlfaCRM выключен\."/);
    const api = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    assert.match(api, /"union"/);
    const pull = readFileSync(new URL("./crm-journal-pull.ts", import.meta.url), "utf8");
    assert.match(pull, /fanOutLessonWriteoffs\(calendar\)/);
    assert.match(pull, /lessonsJournalReady\(sync\)/);
    assert.match(pull, /homeOnly: false/);
    assert.match(pull, /opts.dateFrom/);
    assert.doesNotMatch(pull, /groupsReady/);
  });
});
