import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  teacherIdsOfSlot,
  teacherAllowed,
  mergeTeacherLists,
  groupsOfTeacher,
  teachersFromSlots,
  pickTeacherIds,
  teachersAtBranchFromSlots,
  subjectsOfTeacher,
} from "./crm-teachers-core.ts";

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

  it("педагог группы филиала не выкидывается, даже если справочник без этого филиала", () => {
    assert.deepEqual(teacherIdsOfSlot({ teacherId: 11, branchId: 1 }, 1, roster), [11]);
  });

  it("пустой teacher_ids урока не затирает группу", () => {
    assert.deepEqual(pickTeacherIds([], [44, 45]), [44, 45]);
    assert.deepEqual(pickTeacherIds([7], [44]), [7]);
    assert.deepEqual(pickTeacherIds(undefined, [9]), [9]);
  });

  it("филиал, предмет и расписание — из групп", () => {
    const slots = [
      { groupId: 76, branchId: 1, teacherId: 10, teacher: "Самсонова", groupName: "Худож 10-14", subjectId: 92, subject: "Художка 10-14", dayLabel: "Пт", timeFrom: "18:10", timeTo: "19:40" },
      { groupId: 12, branchId: 2, teacherId: 10, teacher: "Самсонова", groupName: "Худож ЦМИТ", subjectId: 14, subject: "Художка 7-8", dayLabel: "Сб", timeFrom: "11:00", timeTo: "12:30" },
      { groupId: 3, branchId: 2, teacherId: 11, teacher: "Петрова", groupName: "Роботы", subjectId: 36, subject: "Робототехника" },
    ];
    const derived = teachersFromSlots(slots);
    const sam = derived.find((t) => t.id === 10);
    assert.ok(sam?.branchIds.includes(1) && sam.branchIds.includes(2));
    const merged = mergeTeacherLists([{ id: 10, name: "Самсонова", branchIds: [2] }], derived).items;
    const hit = merged.find((t) => t.id === 10);
    assert.ok(hit?.branchIds.includes(1) && hit.branchIds.includes(2));
    const groups = groupsOfTeacher(10, slots);
    assert.equal(groups.length, 2);
    assert.ok(groups.some((g) => g.branchId === 1 && g.groupId === 76 && g.subjectId === 92 && g.from === "18:10"));
    const subjects = subjectsOfTeacher(10, slots);
    assert.deepEqual(subjects.map((s) => s.id).sort(), [14, 92]);
    const civic = teachersAtBranchFromSlots(1, slots, [{ id: 10, name: "Самсонова", branchIds: [2] }]);
    assert.ok(civic.some((t) => t.id === 10));
    assert.equal(civic.some((t) => t.id === 11), false);
  });
});

describe("связи в экранах", () => {
  it("расписание и вкладка педагогов без fs, урок не затирает группу", () => {
    const sched = readFileSync(new URL("../components/admin-schedule.tsx", import.meta.url), "utf8");
    assert.match(sched, /from "@\/data\/crm-teachers-core"/);
    assert.match(sched, /teachersAtBranchFromSlots/);
    assert.match(sched, /\["teachers", "Педагоги"\]/);
    const pane = readFileSync(new URL("../components/admin-teachers.tsx", import.meta.url), "utf8");
    assert.match(pane, /from "@\/data\/crm-teachers-core"/);
    assert.match(pane, /subjectsOfTeacher/);
    assert.doesNotMatch(pane, /from "@\/data\/crm-teachers"/);
    const alfa = readFileSync(new URL("./alfacrm-schedule.ts", import.meta.url), "utf8");
    assert.match(alfa, /pickTeacherIds\(first\?\.teacher_ids, g.teacher_ids\)/);
    const card = readFileSync(new URL("./customer-card-disk.ts", import.meta.url), "utf8");
    assert.match(card, /teachersAtBranch\(useBranch, listTeachers\(slots\), slots\)/);
  });
});
