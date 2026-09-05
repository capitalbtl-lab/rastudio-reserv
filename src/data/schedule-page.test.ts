import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readPriority, sessionMatchesPage, slotOnPublicSchedule, mergeStatusPublish, sessionCourseId } from "./group-status.ts";

describe("витрина rastudio.org", () => {
  it("пустой приоритет = 0, не на сайте", () => {
    const pub = mergeStatusPublish(null);
    const slot = { statusId: 2, priority: readPriority(undefined), courseId: "/art-studio-10-14" };
    assert.equal(slot.priority, 0);
    assert.equal(slotOnPublicSchedule(slot, pub), false);
    assert.equal(slotOnPublicSchedule({ ...slot, priority: 1 }, pub), true);
  });

  it("страница курса и школы — только ID, без regex по имени", () => {
    const tree = {
      schools: [
        { id: "/art-studio", href: "/art-studio" },
        { id: "/model-school", href: "/model-school" },
      ],
      courses: [
        { id: "/art-studio-10-14", href: "/art-studio-10-14", schoolId: "/art-studio" },
        { id: "/art-studio-5-6", href: "/art-studio-5-6", schoolId: "/art-studio" },
        { id: "/model-school-podium", href: "/model-school-podium", schoolId: "/model-school" },
      ],
    };
    const art = { siteCourseId: "/art-studio-10-14", path: "/art-studio-10-14" };
    const model = { siteCourseId: "/model-school-podium", path: "/model-school-podium" };
    assert.equal(sessionMatchesPage(art, "/art-studio-10-14", tree), true);
    assert.equal(sessionMatchesPage(art, "/art-studio-5-6", tree), false);
    assert.equal(sessionMatchesPage(art, "/art-studio", tree), true);
    assert.equal(sessionMatchesPage(model, "/art-studio", tree), false);
    assert.equal(sessionMatchesPage(model, "/model-school", tree), true);
    assert.equal(sessionMatchesPage({ courseId: "/art-studio-10-14" }, "/art-studio-10-14", tree), true);
    assert.equal(sessionMatchesPage({ courseId: "13", path: "" }, "/art-studio-5-6", tree), false);
    assert.equal(sessionCourseId({ courseId: "14" }), "");
    assert.equal(sessionCourseId({ courseId: "/art-studio-10-14" }), "/art-studio-10-14");
    assert.equal(sessionCourseId({ siteCourseId: "/art-studio-5-6", courseId: "14" }), "/art-studio-5-6");
  });
});
