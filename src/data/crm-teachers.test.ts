import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { teacherIdsOfSlot, teacherAllowed } from "./crm-teachers.ts";

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
});
