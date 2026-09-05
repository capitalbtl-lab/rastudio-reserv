import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { publicSiteBoard, publicGroupsOfCourse } from "./public-bind-core.ts";
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
});
