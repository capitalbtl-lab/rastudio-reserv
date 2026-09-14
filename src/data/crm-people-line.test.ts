import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { keepAlfa, peopleClock, peopleLessonsLine, peopleStudentAction, peopleStudentBadge, peopleStudentHint, PEOPLE_PACK } from "./crm-people-line.ts";

describe("карточка шага 2: диск / Alfa · осталось · пачка · +K", () => {
  it("пачка как take качки, 7", () => {
    assert.equal(PEOPLE_PACK, 7);
  });

  it("Alfa keep — меньшим не затираем", () => {
    assert.equal(keepAlfa(771, 760), 771);
    assert.equal(keepAlfa(339, 338), 339);
    assert.equal(keepAlfa(undefined, 286), 286);
    assert.equal(keepAlfa(286, undefined), 286);
  });

  it("часы штампа — Москва ЧЧ:ММ", () => {
    assert.equal(peopleClock("2026-09-12T01:13:00.000Z"), "04:13");
    assert.equal(peopleClock("2026-09-12T01:02:00.000Z"), "04:02");
    assert.equal(peopleClock("2026-09-12T01:20:00.000Z"), "04:20");
    assert.equal(peopleClock(""), "");
  });

  it("№17 Лушникова 602/771 +0 — дырка, без «скоро»", () => {
    const r = peopleLessonsLine({ disk: 602, alfa: 771, plus: 0, at: "2026-09-12T01:13:00.000Z" });
    assert.equal(r.line, "602 / 771 · осталось 169 · пачка 7 · +0 · 04:13");
    assert.equal(r.hint, "пачка прошла · не сели · не жать ещё раз");
    assert.equal(r.packsLeft, undefined);
    assert.equal(/скоро/i.test(r.line + r.hint), false);
  });

  it("№5497 Ежкова 338/339 +0 — один не сел", () => {
    const r = peopleLessonsLine({ disk: 338, alfa: 339, plus: 0, at: "2026-09-12T01:02:00.000Z" });
    assert.equal(r.line, "338 / 339 · осталось 1 · пачка 7 · +0 · 04:02");
    assert.equal(r.hint, "пачка прошла · не сели · не жать ещё раз");
    assert.equal(/скоро/i.test(r.hint), false);
  });

  it("№2124 Галустян 276/286 +8 — качка живая, ещё пачки", () => {
    const r = peopleLessonsLine({ disk: 276, alfa: 286, plus: 8, at: "2026-09-12T01:20:00.000Z" });
    assert.equal(r.line, "276 / 286 · осталось 10 · пачка 7 · +8 · 04:20");
    assert.equal(r.hint, "идёт · ещё 2 пачки");
    assert.equal(r.packsLeft, 2);
  });

  it("без пачки в сессии плюс не пишем; при +0 во время качки не орём «не сели»", () => {
    const idle = peopleLessonsLine({ disk: 602, alfa: 771, at: "2026-09-12T01:13:00.000Z" });
    assert.equal(idle.line, "602 / 771 · осталось 169 · пачка 7 · 04:13");
    assert.equal(idle.hint, "");
    const run = peopleLessonsLine({ disk: 602, alfa: 771, plus: 0, running: true, at: "2026-09-12T01:13:00.000Z" });
    assert.equal(run.line, "602 / 771 · осталось 169 · пачка 7 · +0 · 04:13");
    assert.equal(run.hint, "");
  });

  it("осталось 0 — ничего нового, «ещё N пачек» нет", () => {
    const r = peopleLessonsLine({ disk: 286, alfa: 286, plus: 8, at: "2026-09-12T01:20:00.000Z" });
    assert.equal(r.line, "286 / 286 · осталось 0 · пачка 7 · +8 · 04:20");
    assert.equal(r.hint, "ничего нового");
    assert.equal(r.packsLeft, undefined);
  });

  it("short важнее dups: Баукина 364/366 — Добрать, бейдж «в Alfa больше»", () => {
    assert.equal(peopleStudentAction({ short: true, dups: true, journal: false }), "dobrat");
    assert.equal(peopleStudentBadge({ short: true, dups: true, full: false }), "short");
    assert.equal(peopleStudentHint({ short: true, dups: true, lineHint: "пачка прошла · не сели · не жать ещё раз" }), "пачка прошла · не сели · не жать ещё раз");
    assert.equal(peopleStudentHint({ short: true, dups: true }), "добрать · есть дубли");
    assert.equal(peopleStudentAction({ short: true, dups: true, journal: false, holeApproved: true }), "recheck");
    assert.equal(peopleStudentHint({ short: true, dups: true, holeApproved: true, lineHint: "ничего нового" }), "ничего нового");
    assert.equal(peopleStudentBadge({ short: false, dups: true, full: true }), "dups");
  });

  it("экран: строка на карточке, keep Alfa, очередь n/total, пауза без «не отвечает»", () => {
    const ui = readFileSync(new URL("../components/admin-crm-settings.tsx", import.meta.url), "utf8");
    assert.match(ui, /peopleLessonsLine/);
    assert.match(ui, /keepAlfa/);
    assert.match(ui, /PEOPLE_PACK/);
    assert.match(ui, /packMemo/);
    assert.match(ui, /alfaKeep/);
    assert.match(ui, /nums\.hint/);
    assert.match(ui, /nums\.line/);
    assert.doesNotMatch(ui, /Alfa не отвечает, пауза/);
    assert.match(ui, /пауза \$\{waits\}\/8/);
    assert.match(ui, /total \? `\$\{n\}\/\$\{total\}`/);
    assert.doesNotMatch(ui, /total \? `\$\{n\} из \$\{total\}`/);
    assert.match(ui, /peopleStudentAction/);
    assert.match(ui, /peopleStudentBadge/);
    assert.doesNotMatch(ui, /full \|\| dups/);
    assert.match(ui, /colLock/);
    assert.doesNotMatch(ui, /скоро/);
    const fin = ui.slice(ui.indexOf("function peopleFinished"), ui.indexOf("function peopleQueue"));
    assert.match(fin, /if \(kind === "balance"\) return Boolean\(row\.paysScanned \|\| row\.pays\)/);
    assert.match(fin, /if \(row\.short\) return false/);
    assert.match(fin, /return Boolean\(row\.journal\)/);
  });
});
