import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveSignupIds } from "./site-signup-ids.ts";

describe("заявка с сайта: subjectId в Alfa", () => {
  const slots = [
    { groupId: 580, branchId: 1, subjectId: 13, courseId: "/art-studio-5-6" },
    { groupId: 656, branchId: 2, subjectId: 37, courseId: "/robototehnika-7-9" },
  ];

  it("gid важнее courseId дерева: не Number('/art-studio')", () => {
    const hit = resolveSignupIds({
      gid: "580",
      branchId: 1,
      courseId: "/art-studio-5-6",
      slots,
    });
    assert.equal(hit.subjectId, 13);
    assert.equal(hit.source, "group");
    assert.equal(hit.groupId, 580);
  });

  it("без группы — subject из карты курса, не из имени", () => {
    const hit = resolveSignupIds({
      courseId: "/robototehnika-7-9",
      slots,
      subjectOfCourse: (id) => (id === "/robototehnika-7-9" ? 37 : 0),
    });
    assert.equal(hit.subjectId, 37);
    assert.equal(hit.source, "map");
  });

  it("путь курса не становится subjectId", () => {
    const hit = resolveSignupIds({ courseId: "/art-studio-5-6", slots: [] });
    assert.equal(hit.subjectId, 0);
    assert.equal(hit.source, "none");
  });
});
