import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isAdminGroup,
  isArchivedGroup,
  readPriority,
  slotOnPublicSchedule,
  slotPublicGroup,
  slotPublicTrial,
  mergeStatusPublish,
} from "./group-status.ts";
import { inheritSchoolBySubject } from "./schedule-map.ts";
import type { CrmSlot } from "./crm-slots-core.ts";

describe("статусы групп CRM", () => {
  it("4 — обучается (набор завершен), не архив", () => {
    assert.equal(isArchivedGroup(4), false);
    assert.equal(isAdminGroup(4), true);
    assert.equal(isAdminGroup(2), true);
    assert.equal(isAdminGroup(3), false);
    assert.equal(isAdminGroup(7), false);
  });

  it("пустой приоритет = 1, явный 0 сохраняется", () => {
    assert.equal(readPriority(undefined), 1);
    assert.equal(readPriority(""), 1);
    assert.equal(readPriority(0), 0);
    assert.equal(readPriority("0"), 0);
    assert.equal(readPriority("2"), 2);
  });

  it("витрина: status 2 + priority 1 на сайте, 0 — нет, 4 без записи в группу", () => {
    const pub = mergeStatusPublish(null);
    const g2 = { statusId: 2, priority: 1, courseId: "/model-school-podium" };
    assert.equal(slotOnPublicSchedule(g2, pub), true);
    assert.equal(slotPublicTrial(g2, pub), true);
    assert.equal(slotPublicGroup(g2, pub), true);
    assert.equal(slotOnPublicSchedule({ ...g2, priority: 0 }, pub), false);
    const g4 = { statusId: 4, priority: 1, courseId: "/art-studio-9-13" };
    assert.equal(slotOnPublicSchedule(g4, pub), true);
    assert.equal(slotPublicGroup(g4, pub), false);
    assert.equal(slotOnPublicSchedule({ statusId: 2, priority: 1 }, pub), false);
  });
});

describe("школа по subjectId", () => {
  it("непривязанная группа берёт школу соседней с тем же предметом", () => {
    const mapped = {
      id: "592",
      groupId: 592,
      branchId: 1,
      subjectId: 4,
      schoolId: "/model-school",
      school: "Модельная школа",
      courseId: "/model-school-podium",
    } as CrmSlot;
    const loose = {
      id: "594",
      groupId: 594,
      branchId: 1,
      subjectId: 4,
      schoolId: "",
      school: "",
      courseId: "",
    } as CrmSlot;
    const otherBranch = {
      id: "433",
      groupId: 433,
      branchId: 2,
      subjectId: 4,
      schoolId: "",
      school: "",
      courseId: "",
    } as CrmSlot;
    const out = inheritSchoolBySubject([mapped, loose, otherBranch]);
    const g594 = out.find((s) => s.groupId === 594);
    assert.equal(g594?.school, "Модельная школа");
    assert.equal(g594?.schoolId, "/model-school");
    assert.equal(g594?.courseId, "");
    const g433 = out.find((s) => s.groupId === 433);
    assert.equal(g433?.school, "Без школы на сайте");
    assert.equal(g433?.schoolId || "", "");
  });
});
