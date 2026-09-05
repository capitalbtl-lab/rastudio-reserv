import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { schoolIdOfCourse, listPriceRows } from "./prices-core.ts";
import { coursesForSchool, courseInGroup } from "./site.ts";

describe("цены: школа и курс как в группах", () => {
  it("посев прайса ставит schoolId по direction, не по regex URL", () => {
    const art = listPriceRows().find((r) => r.path === "/art-studio-7-8");
    assert.equal(art?.schoolId, "/art-studio");
    assert.equal(schoolIdOfCourse("/art-studio-7-8"), "/art-studio");
    assert.equal(schoolIdOfCourse("/robototehnika-7-9"), "/robototehnika-v-kolomne");
  });

  it("курсы школы и фильтр каталога только по schoolId", () => {
    const cards = [
      { href: "/art-studio-7-8" },
      { href: "/robototehnika-7-9" },
      { href: "/gamedesign" },
    ];
    const art = coursesForSchool("/art-studio", cards).map((c) => c.href);
    assert.deepEqual(art, ["/art-studio-7-8"]);
    assert.equal(courseInGroup("/art-studio-7-8", ["/art-studio"]), true);
    assert.equal(courseInGroup("/gamedesign", ["/robototehnika-v-kolomne"]), false);
    assert.equal(courseInGroup("/gamedesign", ["/promising-professions"]), true);
  });
});
