import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isMakeupMore,
  isMakeupOtherTeacher,
  makeupDateLabel,
  pageMakeup,
  rankMakeupSlots,
  takeMakeupWeek,
  weekWindow,
} from "./agent-makeup.ts";

describe("отработка: неделя и три слота педагога", () => {
  it("неделя из речи", () => {
    assert.equal(takeMakeupWeek("Отработка на этой неделе"), "this");
    assert.equal(takeMakeupWeek("на следующей неделе"), "next");
    assert.equal(takeMakeupWeek("позже"), "later");
    assert.equal(isMakeupMore("Покажите ещё три варианта отработки"), true);
    assert.equal(isMakeupOtherTeacher("Предложите другого педагога"), true);
  });

  it("окно этой недели — с сегодня до воскресенья", () => {
    const wed = new Date("2026-09-09T10:00:00");
    const w = weekWindow("this", wed);
    assert.equal(w.from.getDay(), 3);
    assert.equal(w.to.getDay(), 0);
    const next = weekWindow("next", wed);
    assert.equal(next.from.getDay(), 1);
    assert.ok(next.from > w.to);
  });

  it("сначала свой педагог, по три, потом другой", () => {
    const rows = [
      { gid: "1", at: 3, seats: "свободно 2 из 8", priority: 1, ownGid: true, ownTeacher: true },
      { gid: "2", at: 1, seats: "свободно 1 из 8", priority: 1, ownGid: false, ownTeacher: true },
      { gid: "3", at: 2, seats: "свободно 3 из 8", priority: 1, ownGid: false, ownTeacher: true },
      { gid: "4", at: 4, seats: "свободно 2 из 8", priority: 1, ownGid: false, ownTeacher: true },
      { gid: "5", at: 5, seats: "мест нет", priority: 1, ownGid: false, ownTeacher: true },
      { gid: "6", at: 0, seats: "свободно 4 из 8", priority: 1, ownGid: false, ownTeacher: false },
    ];
    const ranked = rankMakeupSlots(rows, false);
    assert.deepEqual(ranked.pool.map((g) => g.gid), ["2", "3", "4"]);
    const first = pageMakeup(ranked.pool, 0, 3);
    assert.deepEqual(first.slice.map((g) => g.gid), ["2", "3", "4"]);
    assert.equal(first.more, false);
    const other = rankMakeupSlots(rows, true);
    assert.deepEqual(other.pool.map((g) => g.gid), ["6"]);
    assert.match(makeupDateLabel(new Date("2026-09-11T18:10:00")), /пт 11\.09/);
  });
});
