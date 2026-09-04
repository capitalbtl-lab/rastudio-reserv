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
