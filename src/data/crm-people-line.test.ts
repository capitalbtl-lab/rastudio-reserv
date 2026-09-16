import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { keepAlfa, peopleClock, peopleLessonsLine, peopleStudentAction, peopleStudentBadge, peopleStudentHint, PEOPLE_PACK } from "./crm-people-line.ts";

describe("карточка шага 2: дырка/лишние по id · пачка · +K", () => {
  it("пачка как take качки, 7", () => {
    assert.equal(PEOPLE_PACK, 7);
  });

  it("Alfa keep — меньшим не затираем", () => {
    assert.equal(keepAlfa(771, 760), 771);
    assert.equal(keepAlfa(339, 338), 339);
    assert.equal(keepAlfa(undefined, 286), 286);
    assert.equal(keepAlfa(286, undefined), 286);
    assert.equal(keepAlfa(142, 0), 0);
    assert.equal(keepAlfa(0, 142), 142);
  });

  it("часы штампа — Москва ЧЧ:ММ", () => {
    assert.equal(peopleClock("2026-09-12T01:13:00.000Z"), "04:13");
    assert.equal(peopleClock("2026-09-12T01:02:00.000Z"), "04:02");
    assert.equal(peopleClock("2026-09-12T01:20:00.000Z"), "04:20");
    assert.equal(peopleClock(""), "");
  });

  it("диск и Alfa на карточке, дырка по id", () => {
    const r = peopleLessonsLine({ disk: 602, alfa: 771, hole: 169, plus: 0, at: "2026-09-12T01:13:00.000Z" });
    assert.equal(r.line, "диск 602 · Alfa 771 · дырка 169 · пачка 7 · +0 · 04:13");
    assert.equal(r.hint, "пачка прошла · не сели · не жать ещё раз");
    assert.equal(/осталось/.test(r.line), false);
  });

  it("дырка 1 — диск 338 · Alfa 339, не 338/339 как закон", () => {
    const r = peopleLessonsLine({ disk: 338, alfa: 339, hole: 1, plus: 0, at: "2026-09-12T01:02:00.000Z" });
    assert.equal(r.line, "диск 338 · Alfa 339 · дырка 1 · пачка 7 · +0 · 04:02");
    assert.equal(r.hint, "пачка прошла · не сели · не жать ещё раз");
  });

  it("качка живая: диск / Alfa / дырка / пачка", () => {
    const r = peopleLessonsLine({ disk: 276, alfa: 286, hole: 10, plus: 8, at: "2026-09-12T01:20:00.000Z" });
    assert.equal(r.line, "диск 276 · Alfa 286 · дырка 10 · пачка 7 · +8 · 04:20");
    assert.equal(r.hint, "идёт · ещё 2 пачки");
    assert.equal(r.packsLeft, 2);
  });

  it("без дырки в штампе — не считаем Alfa − диск", () => {
    const idle = peopleLessonsLine({ disk: 602, alfa: 771, at: "2026-09-12T01:13:00.000Z" });
    assert.equal(idle.line, "диск 602 · Alfa 771 · пачка 7 · 04:13");
    assert.equal(idle.hint, "");
    const run = peopleLessonsLine({ disk: 602, alfa: 771, plus: 0, running: true, at: "2026-09-12T01:13:00.000Z" });
    assert.equal(run.line, "диск 602 · Alfa 771 · пачка 7 · +0 · 04:13");
    assert.equal(run.hint, "");
  });

  it("лишние id на карточке", () => {
    const r = peopleLessonsLine({ disk: 141, alfa: 142, hole: 0, extra: 2, plus: 0, at: "2026-09-12T01:02:00.000Z" });
    assert.equal(r.line, "диск 141 · Alfa 142 · лишние 2 · пачка 7 · +0 · 04:02");
    const ok = peopleLessonsLine({ disk: 286, alfa: 286, hole: 0, extra: 0, plus: 8, at: "2026-09-12T01:20:00.000Z" });
    assert.equal(ok.line, "диск 286 · Alfa 286 · пачка 7 · +8 · 04:20");
    assert.equal(ok.hint, "ничего нового");
  });

  it("short важнее dups: Баукина — Добрать, бейдж «в Alfa больше»", () => {
    assert.equal(peopleStudentAction({ short: true, dups: true, journal: false }), "dobrat");
    assert.equal(peopleStudentAction({ short: false, dups: true, journal: true }), "dobrat");
    assert.equal(peopleStudentBadge({ short: true, dups: true, full: false }), "short");
    assert.equal(peopleStudentHint({ short: true, dups: true, lineHint: "пачка прошла · не сели · не жать ещё раз" }), "пачка прошла · не сели · не жать ещё раз");
    assert.equal(peopleStudentHint({ short: true, dups: true }), "добрать · есть дубли");
    assert.equal(peopleStudentAction({ short: true, dups: true, journal: false, holeApproved: true }), "recheck");
    assert.equal(peopleStudentHint({ short: true, dups: true, holeApproved: true, lineHint: "ничего нового" }), "ничего нового");
    assert.equal(peopleStudentBadge({ short: false, dups: true, full: true }), "dups");
  });

  it("экран: диск/Alfa на карточке, закон — набор id", () => {
    const ui = readFileSync(new URL("../components/admin-crm-settings.tsx", import.meta.url), "utf8");
    assert.match(ui, /peopleLessonsLine/);
    assert.match(ui, /disk: row.lessons/);
    assert.match(ui, /alfa: alfaShown/);
    assert.match(ui, /hole: row.holeN/);
    assert.match(ui, /extra: row.extraN/);
    assert.match(ui, /keepAlfa/);
    assert.match(ui, /PEOPLE_PACK/);
    assert.match(ui, /packMemo/);
    assert.match(ui, /nums\.hint/);
    assert.match(ui, /nums\.line/);
    assert.doesNotMatch(ui, /Alfa не отвечает, пауза/);
    assert.match(ui, /пауза \$\{waits\}\/8/);
    assert.match(ui, /total \? `\$\{n\}\/\$\{total\}`/);
    assert.doesNotMatch(ui, /total \? `\$\{n\} из \$\{total\}`/);
    assert.match(ui, /peopleStudentAction/);
    assert.match(ui, /peopleStudentBadge/);
    assert.doesNotMatch(ui, /full \|\| dups/);
    assert.doesNotMatch(ui, /на диске \$\{row\.lessons\} · в Alfa/);
    assert.doesNotMatch(ui, /счёт: диск \$\{row\.lessons\}/);
    const resetAt = ui.indexOf("async function resetPersonHistory");
    const holeAt = ui.indexOf("async function holeMark");
    assert.equal(resetAt > 0, true);
    assert.doesNotMatch(ui.slice(resetAt, holeAt > resetAt ? holeAt : ui.length), /loadPerson/);
    assert.match(ui, /Number\(row\.alfa\) === 0/);
    assert.match(ui, /colLock/);
    assert.doesNotMatch(ui, /скоро/);
    const fin = ui.slice(ui.indexOf("function peopleFinished"), ui.indexOf("function peopleQueue"));
    assert.match(fin, /if \(kind === "balance"\) return Boolean\(row\.paysScanned \|\| row\.pays\)/);
    assert.match(fin, /if \(row\.short\) return false/);
    assert.match(fin, /if \(row\.dups\) return false/);
    assert.match(fin, /return Boolean\(row\.journal\)/);
  });
});
