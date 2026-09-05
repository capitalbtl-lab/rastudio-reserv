import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupMapByTree } from "./crm-map-board.ts";

const tree = {
  schools: [
    { id: "/art-studio", label: "Художественная школа" },
    { id: "/robototehnika-v-kolomne", label: "Робототехника" },
  ],
  courses: [
    { id: "/art-studio-5-6", schoolId: "/art-studio", label: "5–6 лет", age: "5-6" },
    { id: "/robototehnika-7-9", schoolId: "/robototehnika-v-kolomne", label: "7–9 лет", age: "7-9" },
  ],
};

describe("доска соответствий по ID", () => {
  it("не копирует непривязанные предметы в каждую школу", () => {
    const board = groupMapByTree(tree, [
      { id: 13, title: "ИЗО 5-6", courseId: "/art-studio-5-6", schoolId: "/art-studio" },
      { id: 99, title: "Сирота", courseId: "", schoolId: "" },
      { id: 37, title: "Роботы", courseId: "", schoolId: "/robototehnika-v-kolomne" },
    ]);
    const art = board.find((s) => s.schoolId === "/art-studio");
    const robot = board.find((s) => s.schoolId === "/robototehnika-v-kolomne");
    const other = board.find((s) => s.schoolId === "other");
    assert.deepEqual(art?.courses.find((c) => c.courseId === "/art-studio-5-6")?.items.map((i) => i.id), [13]);
    assert.equal(art?.courses.some((c) => c.label === "Без курса"), false);
    assert.deepEqual(robot?.courses.find((c) => c.label === "Без курса")?.items.map((i) => i.id), [37]);
    assert.deepEqual(other?.courses[0]?.items.map((i) => i.id), [99]);
  });

  it("не склеивает школу по названию", () => {
    const board = groupMapByTree(tree, [{ id: 1, title: "x", courseId: "", schoolId: "Художественная школа" }]);
    assert.equal(board.find((s) => s.schoolId === "/art-studio")?.courses.some((c) => c.label === "Без курса"), false);
    assert.deepEqual(board.find((s) => s.schoolId === "other")?.courses[0]?.items.map((i) => i.id), [1]);
  });

  it("абонемент с двумя курсами — две строки, не одна", () => {
    const board = groupMapByTree(tree, [
      { id: 10, title: "Абонемент 3850", courseId: "/art-studio-5-6", schoolId: "/art-studio" },
      { id: 10, title: "Абонемент 3850", courseId: "/robototehnika-7-9", schoolId: "/robototehnika-v-kolomne" },
    ]);
    assert.equal(board.find((s) => s.schoolId === "/art-studio")?.courses[0].items.length, 1);
    assert.equal(board.find((s) => s.schoolId === "/robototehnika-v-kolomne")?.courses[0].items.length, 1);
  });
});
