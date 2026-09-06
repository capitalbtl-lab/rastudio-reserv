import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { teacherIdsOfSlot, teacherAllowed, mergeTeacherLists, groupsOfTeacher, teachersFromSlots } from "./crm-teachers.ts";
import type { CrmSlot } from "./crm-slots-core.ts";

describe("педагоги только по teacherId", () => {
  const roster = [
    { id: 10, name: "Иванова", branchIds: [1] },
    { id: 11, name: "Петрова", branchIds: [2] },
  ];

  it("берёт teacherIds филиала, имя игнорирует", () => {
    assert.deepEqual(teacherIdsOfSlot({ teacherId: 10, teacherIds: [10, 11] }, 1, roster), [10]);
    assert.deepEqual(teacherIdsOfSlot({ teacherId: 11 }, 1, roster), []);
    assert.deepEqual(teacherIdsOfSlot({ teacherIds: [] }, 1, roster), []);
    assert.equal(teacherAllowed(10, 2, roster), false);
    assert.equal(teacherAllowed(10, 1, roster), true);
  });

  it("филиал педагога — из групп, ЦМИТ не затирает Гражданскую", () => {
    const slots = [
      { groupId: 76, branchId: 1, teacherId: 10, teacher: "Самсонова", groupName: "Худож 10-14" },
      { groupId: 12, branchId: 2, teacherId: 10, teacher: "Самсонова", groupName: "Худож ЦМИТ" },
      { groupId: 3, branchId: 2, teacherId: 11, teacher: "Петрова", groupName: "Роботы" },
    ] as CrmSlot[];
    const derived = teachersFromSlots(slots);
    const sam = derived.find((t) => t.id === 10);
    assert.ok(sam?.branchIds.includes(1) && sam.branchIds.includes(2));
    const merged = mergeTeacherLists([{ id: 10, name: "Самсонова", branchIds: [2] }], derived).items;
    const hit = merged.find((t) => t.id === 10);
    assert.ok(hit?.branchIds.includes(1));
    assert.ok(hit?.branchIds.includes(2));
    const groups = groupsOfTeacher(10, slots);
    assert.equal(groups.length, 2);
    assert.ok(groups.some((g) => g.branchId === 1 && g.groupId === 76));
  });
});
