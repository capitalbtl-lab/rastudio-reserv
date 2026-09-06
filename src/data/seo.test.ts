import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  brandTitle,
  fallbackDescription,
  isCourseSchemaPath,
  shouldNoindex,
  stripBrand,
} from "./seo-core.ts";

describe("seo", () => {
  it("не отдаёт главную description пустым страницам и убирает RASTUDIO.ORG", () => {
    const teacher = fallbackDescription({
      title: "Аверина Любовь Алексеевна | RASTUDIO.ORG",
      description: "",
      kind: "teacher",
      h1: "Аверина Любовь Алексеевна",
      paragraphs: ["Преподаватель академической художественной школы."],
    });
    assert.equal(stripBrand("События | RASTUDIO.ORG"), "События");
    assert.match(brandTitle("События | RASTUDIO.ORG"), /Развивайся/);
    assert.doesNotMatch(brandTitle("События | RASTUDIO.ORG"), /RASTUDIO\.ORG/i);
    assert.match(teacher, /Аверина/);
    assert.doesNotMatch(teacher, /Художественная школа в Коломне для детей и взрослых/);
    assert.ok(teacher.length <= 180);
  });

  it("Course schema только у курсов, кабинет закрыт", () => {
    assert.equal(isCourseSchemaPath("/charity", "course"), false);
    assert.equal(isCourseSchemaPath("/art-studio-5-6", "course"), true);
    assert.equal(isCourseSchemaPath("/hs-2-risunok", "course"), false);
    assert.equal(shouldNoindex("/admin"), true);
    assert.equal(shouldNoindex("/hs-2-risunok"), true);
    assert.equal(shouldNoindex("/art-studio"), false);
    assert.match(fallbackDescription({ title: "Мастер-класс", kind: "master", h1: "Мастер-класс «Маки»" }), /Коломна/);
  });

  it("разметка организации, robots и карта сайта", () => {
    const seo = readFileSync(new URL("./seo.ts", import.meta.url), "utf8");
    assert.match(seo, /foundingDate: "2016"/);
    assert.match(seo, /hasCourseInstance/);
    assert.match(seo, /Коломна, Луховицы/);
    assert.match(seo, /max-image-preview:large/);
    const robots = readFileSync(new URL("../../public/robots.txt", import.meta.url), "utf8");
    assert.match(robots, /Disallow: \/admin/);
    assert.match(robots, /Disallow: \/hs-2-/);
    assert.match(robots, /Host: www\.rastudio\.org/);
    const map = readFileSync(new URL("../../scripts/write-sitemap.mjs", import.meta.url), "utf8");
    assert.match(map, /\/hs-2-/);
    assert.doesNotMatch(map, /master-klassy/);
  });
});
