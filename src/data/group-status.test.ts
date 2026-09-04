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
import { resolveGroupCourseId } from "./ids.ts";
import { bulkPriorityFromPrompt } from "./crm-slots.ts";
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

describe("курс группы из карты админки", () => {
  const tree = {
    schools: [{ id: "/art-studio", label: "Художественная школа", href: "/art-studio" }],
    courses: [{ id: "/art-studio-5-6", href: "/art-studio-5-6", schoolId: "/art-studio", label: "5-6", age: "5-6" }],
    assign: {},
  };
  const slot = { id: "433", groupId: 433, branchId: 2, courseId: "", subjectId: 13 };

  it("без карты админки заводская таблица не подставляет курс", () => {
    assert.equal(resolveGroupCourseId(slot, tree), "");
  });

  it("карта subjectId → courseId", () => {
    assert.equal(resolveGroupCourseId(slot, tree, [{ subjectId: 13, courseId: "/art-studio-5-6" }]), "/art-studio-5-6");
  });

  it("пустая запись в карте = нет курса", () => {
    assert.equal(resolveGroupCourseId(slot, tree, [{ subjectId: 13, courseId: "" }]), "");
  });
});

describe("массовый приоритет голосом", () => {
  const g = (id: number, branchId: number, priority: number, name: string): CrmSlot =>
    ({
      id: `crm-${id}`,
      groupId: id,
      branchId,
      priority,
      groupName: name,
    }) as CrmSlot;

  const slots = [
    g(580, 1, 0, "2026 Художественная студия (5-6 лет)"),
    g(701, 1, 0, "Проверка rastudio.org"),
    g(453, 1, 0, "Художественная студия (5-6 лет)"),
    g(392, 2, 1, "Художественная студия (5-6 лет)"),
  ];

  it("на Гражданской ставит 1 и группе 580, ЦМИТ не трогает", () => {
    const out = bulkPriorityFromPrompt("во всех группах на гражданской поставить приоритет 1", slots);
    assert.ok(out);
    const ids = out.changes.map((c) => c.id).sort();
    assert.deepEqual(ids, ["crm-453", "crm-580", "crm-701"]);
    assert.ok(out.changes.every((c) => c.to === "1"));
    assert.equal(out.changes.find((c) => c.id === "crm-392"), undefined);
  });

  it("год в названии не фильтр", () => {
    const out = bulkPriorityFromPrompt("всем на гражданской приоритет 1", slots);
    assert.ok(out?.changes.some((c) => c.id === "crm-580"));
  });
});
