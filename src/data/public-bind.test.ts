import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { publicSiteBoard, publicGroupsOfCourse, publicCourseIdOf } from "./public-bind-core.ts";
import { resolveGroupCourseId, joinCourseSubject, subjectIdOfCourse, courseSubjectGapText } from "./course-subject-core.ts";
import { DISK_RULES } from "./crm-disk-rules.ts";
import type { SiteTree } from "./site-tree.ts";

const tree: SiteTree = {
  schools: [
    { id: "/art-studio", label: "Художественная", href: "/art-studio" },
    { id: "/robototehnika-v-kolomne", label: "Роботы", href: "/robototehnika-v-kolomne" },
  ],
  courses: [
    { id: "/art-studio-10-14", schoolId: "/art-studio", label: "10-14", href: "/art-studio-10-14", age: "10-14" },
    { id: "/art-studio-5-6", schoolId: "/art-studio", label: "5-6", href: "/art-studio-5-6", age: "5-6" },
    { id: "/robototehnika-7-9", schoolId: "/robototehnika-v-kolomne", label: "7-9", href: "/robototehnika-7-9", age: "7-9" },
  ],
  assign: { "gid:1:580": "/art-studio-10-14" },
};

describe("раздел Сайт по ID", () => {
  it("считает группу по assign, даже если courseId слота пустой", () => {
    const slots = [
      { id: "a", groupId: 580, branchId: 1, groupName: "рис 10-14", subjectId: 14, teacher: "А" },
      { id: "b", groupId: 590, branchId: 1, groupName: "робот", courseId: "/robototehnika-7-9", subjectId: 37, teacher: "Б" },
      { id: "c", groupId: 999, branchId: 2, groupName: "без курса", subjectId: 0 },
    ];
    const board = publicSiteBoard(slots, tree, [{ subjectId: 14, courseId: "/art-studio-5-6" }]);
    const art = board.schools.find((s) => s.id === "/art-studio");
    const ten = art?.courses.find((c) => c.id === "/art-studio-10-14");
    assert.equal(ten?.groups, 1);
    assert.deepEqual(ten?.groupKeys, [{ groupId: 580, branchId: 1 }]);
    const five = art?.courses.find((c) => c.id === "/art-studio-5-6");
    assert.equal(five?.groups, 0);
    assert.equal(board.loose.length, 1);
    assert.equal(board.loose[0].groupId, 999);
    assert.equal(board.loose[0].branchId, 2);
  });

  it("не клеит группу в курс по имени школы", () => {
    const slots = [{ id: "x", groupId: 1, branchId: 1, groupName: "Художественная 5-6", subjectId: 99 }];
    assert.equal(publicGroupsOfCourse(slots, "/art-studio-5-6", tree).length, 0);
  });

  it("сайт и админка стыкуют курс одной функцией", () => {
    const assigned = { id: "a", groupId: 580, branchId: 1, courseId: "", subjectId: 14 };
    const mapped = { id: "m", groupId: 777, branchId: 1, courseId: "", subjectId: 14 };
    const map = [{ subjectId: 14, courseId: "/art-studio-5-6" }];
    assert.equal(publicCourseIdOf(assigned, tree, map), resolveGroupCourseId(assigned, tree, map));
    assert.equal(publicCourseIdOf(assigned, tree, map), "/art-studio-10-14");
    assert.equal(publicCourseIdOf(mapped, tree, map), resolveGroupCourseId(mapped, tree, map));
    assert.equal(publicCourseIdOf(mapped, tree, map), "/art-studio-5-6");
    assert.equal(joinCourseSubject(mapped, tree, map).source, "map");
    assert.equal(joinCourseSubject(assigned, tree, map).source, "assign");
  });

  it("имя «Роботы» не даёт курс, если subjectId другой", () => {
    const join = joinCourseSubject(
      { id: "x", groupId: 1, branchId: 1, courseId: "", subjectId: 99 },
      tree,
      [{ subjectId: 14, courseId: "/art-studio-5-6" }],
    );
    assert.equal(join.courseId, "");
    assert.equal(join.source, "none");
    assert.equal(join.gap, "no-course");
    assert.match(courseSubjectGapText(join), /subjectId 99/);
  });

  it("assign бьёт slot и карту; несколько предметов на курсе не угадываем", () => {
    const s = { id: "a", groupId: 580, branchId: 1, courseId: "/art-studio-5-6", subjectId: 14 };
    const map = [{ subjectId: 14, courseId: "/robototehnika-7-9" }];
    const join = joinCourseSubject(s, tree, map);
    assert.equal(join.courseId, "/art-studio-10-14");
    assert.equal(join.source, "assign");
    const slotOnly = joinCourseSubject(
      { id: "b", groupId: 590, branchId: 1, courseId: "/robototehnika-7-9", subjectId: 14 },
      tree,
      map,
    );
    assert.equal(slotOnly.source, "slot");
    assert.equal(slotOnly.courseId, "/robototehnika-7-9");
    assert.equal(subjectIdOfCourse("/art-studio-5-6", [{ subjectId: 13, courseId: "/art-studio-5-6" }]), 13);
    assert.equal(
      subjectIdOfCourse("/art-studio-5-6", [
        { subjectId: 13, courseId: "/art-studio-5-6" },
        { subjectId: 14, courseId: "/art-studio-5-6" },
      ]),
      0,
    );
  });

  it("правила диска: cgi, живой абонемент, курс/предмет, разъём Alfa, свой id, журнал", () => {
    assert.deepEqual(
      DISK_RULES.map((r) => r.id),
      ["cgi", "tariff", "course", "connector", "local", "journal", "money", "comms"],
    );
    assert.equal(DISK_RULES[2].stage, 3);
    assert.equal(DISK_RULES[3].stage, 5);
    assert.equal(DISK_RULES[4].stage, 6);
    assert.equal(DISK_RULES[5].stage, 7);
    assert.equal(DISK_RULES[6].stage, 8);
    assert.equal(DISK_RULES[7].stage, 9);
    assert.match(DISK_RULES[2].truth, /schedule-map/);
    assert.match(DISK_RULES[2].not, /хэштег|похож/);
    assert.match(DISK_RULES[3].truth, /очередь/);
    assert.match(DISK_RULES[3].field, /linked/);
    assert.match(DISK_RULES[4].truth, /отрицательн/);
    assert.match(DISK_RULES[4].field, /id < 0/);
    assert.match(DISK_RULES[5].field, /customerIds/);
    assert.match(DISK_RULES[5].not, /cgi|last_attend/);
    assert.match(DISK_RULES[6].field, /pays/);
    assert.match(DISK_RULES[6].not, /paid_till|F5/);
    assert.match(DISK_RULES[7].field, /comms/);
    assert.match(DISK_RULES[7].not, /communication\/index/);
  });
});
