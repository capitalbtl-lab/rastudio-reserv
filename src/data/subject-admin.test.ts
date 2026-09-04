import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { countSubjectUsage } from "./subject-usage.ts";

describe("предметы: группы и ученики по филиалам", () => {
  it("считает уникальные группы и сумму учеников, архив пропускает", () => {
    const by = countSubjectUsage([
      { groupId: 581, branchId: 1, subjectId: 12, taken: 3, statusId: 1 },
      { groupId: 581, branchId: 1, subjectId: 12, taken: 3, statusId: 1 },
      { groupId: 658, branchId: 2, subjectId: 12, taken: 0, statusId: 1 },
      { groupId: 99, branchId: 2, subjectId: 12, taken: 5, statusId: 3 },
      { groupId: 10, branchId: 2, subjectId: 37, taken: 8, statusId: 1 },
    ]);
    const art = by.get(12);
    assert.equal(art?.groupTotal, 2);
    assert.equal(art?.studentTotal, 3);
    assert.equal(art?.groups[1], 1);
    assert.equal(art?.groups[2], 1);
    assert.equal(art?.students[1], 3);
    assert.equal(art?.students[2], 0);
    assert.equal(by.get(37)?.groupTotal, 1);
    assert.equal(by.get(37)?.studentTotal, 8);
  });
});
