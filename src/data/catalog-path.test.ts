import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lastPathSlug, pageLookupKeys } from "./catalog-path.ts";
import { readFileSync } from "node:fs";

describe("поиск страницы курса", () => {
  it("раскодирует кириллицу в URL Unity", () => {
    const enc =
      "kursy-shkoly-programmirovaniya/it-%D1%88%D0%BA%D0%BE%D0%BB%D0%B0-%D1%80%D0%B0%D0%B7%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D0%BA%D0%B0-%D0%B8%D0%B3%D1%80-%D0%BD%D0%B0-unity";
    const keys = pageLookupKeys(enc);
    assert.ok(keys.some((k) => k.includes("it-школа-разработка-игр-на-unity")));
    assert.equal(lastPathSlug(enc), "it-школа-разработка-игр-на-unity");
  });

  it("catch-all больше не тащит CoursePageHero в 404", () => {
    const splat = readFileSync(new URL("../routes/$.tsx", import.meta.url), "utf8");
    assert.match(splat, /NotFoundPage/);
    assert.doesNotMatch(splat, /CoursePageHero/);
    assert.match(splat, /params\._splat/);
    const load = readFileSync(new URL("./load-site-page.ts", import.meta.url), "utf8");
    assert.match(load, /method: "POST"/);
  });
});
