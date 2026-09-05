import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickCoursePage } from "./agent-course-page.ts";

const tree = {
  schools: [
    { id: "/art-studio", href: "/art-studio", label: "Художественная школа" },
    { id: "/robototehnika-v-kolomne", href: "/robototehnika-v-kolomne", label: "Школа робототехники" },
  ],
  courses: [
    { id: "/art-studio-10-14", href: "/art-studio-10-14", schoolId: "/art-studio", label: "10-14", age: "10-14" },
    { id: "/art-studio-5-6", href: "/art-studio-5-6", schoolId: "/art-studio", label: "5-6", age: "5-6" },
  ],
};

const rows = [
  { path: "/art-studio-10-14", name: "Художка 10-14" },
  { path: "/art-studio-5-6", name: "Художка 5-6" },
  { path: "/art-studio", name: "Художественная школа" },
  { path: "/robototehnika-v-kolomne", name: "Роботы" },
];

describe("open_course только по ID дерева", () => {
  it("точный courseId и речь с возрастом", () => {
    assert.equal(pickCoursePage("/art-studio-10-14", rows, tree)?.path, "/art-studio-10-14");
    assert.equal(pickCoursePage("рисовать 10-14", rows, tree)?.path, "/art-studio-10-14");
    assert.equal(pickCoursePage("рисовать 5-6", rows, tree)?.path, "/art-studio-5-6");
  });

  it("речь без возраста → школа, не случайный курс", () => {
    assert.equal(pickCoursePage("робототехника", rows, tree)?.path, "/robototehnika-v-kolomne");
  });

  it("имя группы CRM не открывает курс", () => {
    assert.equal(pickCoursePage("блабла 2026", rows, tree), null);
    assert.equal(pickCoursePage("Робототехника 2024 группа 580", rows, tree)?.path, "/robototehnika-v-kolomne");
  });
});
