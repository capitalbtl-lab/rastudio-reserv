import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  roomBelongsToBranch,
  roomArchived,
  roomsOfBranchList,
  roomsCatalog,
  roomsSelectGroups,
  mergeRooms,
  SEED_ROOMS,
} from "./crm-rooms.ts";
import { addMinsHm, joinHm, splitHm, HOUR_OPTS, MIN_OPTS } from "./crm-lesson-time.ts";

describe("аудитории филиала", () => {
  it("только ID филиала, без подстановки всех комнат", () => {
    const raw = [
      { id: 1, name: "ЦМИТ зал", branch_ids: [2] },
      { id: 2, name: "Гражданская", branch_id: 1 },
      { id: 3, name: "Архив ЦМИТ", branch_ids: [2], is_archived: 1 },
      { id: 4, name: "Без филиала" },
    ];
    const cmit = roomsOfBranchList(raw, 2);
    assert.deepEqual(
      cmit.map((r) => r.id),
      [1],
    );
    assert.equal(roomBelongsToBranch({ branch_ids: [1] }, 2), false);
    assert.equal(roomArchived({ is_archived: 1 }), true);
  });

  it("каталог ЦМИТ содержит аудитории модалки Alfa", () => {
    const rooms = roomsCatalog([{ roomId: 19, branchId: 2 }]);
    const cmit = rooms.filter((r) => r.branchId === 2);
    assert.ok(SEED_ROOMS.every((s) => cmit.some((r) => r.id === s.id && r.name === s.name)));
    const groups = roomsSelectGroups(rooms, 2);
    assert.equal(groups.length, 1);
    assert.match(groups[0].label, /ЦМИТ/);
    assert.ok(groups[0].options.some((o) => o.label === "Ауд.1"));
    const civic = roomsSelectGroups(rooms, 1);
    assert.ok(civic.length >= 1);
    assert.ok(civic.some((g) => g.options.length));
    const assumed = roomsOfBranchList([{ id: 8, name: "Зал Гражданская" }], 1, true);
    assert.equal(assumed[0]?.id, 8);
    assert.equal(roomsOfBranchList([{ id: 8, name: "Зал Гражданская" }], 1, false).length, 0);
  });

  it("у Гражданской свои залы, чужие не подмешиваются", () => {
    const rooms = mergeRooms(SEED_ROOMS, [{ id: 3, name: "Зал 1", branchId: 1 }]);
    const civic = roomsSelectGroups(rooms, 1);
    assert.equal(civic.length, 1);
    assert.match(civic[0].label, /Гражданская/);
    assert.deepEqual(
      civic[0].options.map((o) => o.value),
      ["3"],
    );
  });
});

describe("время занятия", () => {
  it("с 16:00 на 90 мин — до 17:30, 18:10 есть в списках", () => {
    assert.equal(addMinsHm("16:00", 90), "17:30");
    assert.equal(addMinsHm("18:10", 90), "19:40");
    assert.equal(joinHm(18, 10), "18:10");
    assert.deepEqual(splitHm("18:10"), { h: 18, min: 10 });
    assert.equal(splitHm("").h, -1);
    assert.ok(HOUR_OPTS.some((o) => o.value === "16"));
    assert.ok(MIN_OPTS.some((o) => o.value === "10"));
  });
});
