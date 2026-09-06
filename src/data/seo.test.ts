import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  brandTitle,
  courseJsonLd,
  enrichPage,
  fallbackDescription,
  isCourseSchemaPath,
  organizationJsonLd,
  pageHead,
  shouldNoindex,
  stripBrand,
} from "./seo.ts";

describe("seo", () => {
  it("не отдаёт главную description пустым страницам и убирает RASTUDIO.ORG", () => {
    const teacher = enrichPage({
      title: "Аверина Любовь Алексеевна | RASTUDIO.ORG",
      description: "",
      canonical: "",
      path: "/team/аверина-любовь-алексеевна",
      kind: "teacher",
      h1: "Аверина Любовь Алексеевна",
      paragraphs: ["Преподаватель академической художественной школы."],
    });
    assert.equal(stripBrand("События | RASTUDIO.ORG"), "События");
    assert.match(brandTitle("События | RASTUDIO.ORG"), /Развивайся/);
    assert.doesNotMatch(teacher.title, /RASTUDIO\.ORG/i);
    assert.match(teacher.description, /Аверина/);
    assert.doesNotMatch(teacher.description, /Художественная школа в Коломне для детей и взрослых/);
    assert.ok(teacher.description.length <= 180);
  });

  it("Course schema только у курсов, с площадкой и провайдером", () => {
    assert.equal(isCourseSchemaPath("/charity", "course"), false);
    assert.equal(isCourseSchemaPath("/art-studio-5-6", "course"), true);
    assert.equal(shouldNoindex("/admin"), true);
    assert.equal(shouldNoindex("/hs-2-risunok"), true);
    const json = courseJsonLd({
      title: 'Художественная студия (5-6 лет) в Коломне | Студия "Развивайся"',
      description: "Рисование и лепка для детей 5–6 лет.",
      canonical: "",
      path: "/art-studio-5-6",
      kind: "course",
      h1: 'Художественная студия "Развивайся" Рисование и лепка для детей 5-6 лет',
    });
    assert.ok(json);
    assert.equal(json["@type"], "Course");
    assert.equal(json.hasCourseInstance["@type"], "CourseInstance");
    assert.equal(json.hasCourseInstance.courseMode, "Onsite");
    assert.equal(json.provider.name, "Студия «Развивайся»");
    assert.equal(courseJsonLd({ title: "Благотворительность", description: "x", canonical: "", path: "/charity", kind: "course" }), null);
  });

  it("организация с часами, годом основания и двумя городами", () => {
    const org = organizationJsonLd()["@graph"][0];
    assert.equal(org.foundingDate, "2016");
    assert.ok(org.openingHoursSpecification?.length);
    assert.ok(org.areaServed.some((c: { name: string }) => c.name === "Луховицы"));
    const head = pageHead({
      title: "Каталог",
      description: "",
      canonical: "",
      path: "/allcourses",
      kind: "catalog",
      h1: "Все курсы",
    });
    const geo = head.meta.find((m: { name?: string }) => m.name === "geo.placename");
    assert.match(String(geo?.content), /Луховицы/);
    const robots = head.meta.find((m: { name?: string }) => m.name === "robots");
    assert.match(String(robots?.content), /max-image-preview:large/);
    assert.match(fallbackDescription({ title: "Мастер-класс", description: "", canonical: "", kind: "master", h1: "Мастер-класс «Маки»" }), /Коломна/);
  });

  it("robots закрывает кабинет, карта сайта не тащит hs-2", () => {
    const robots = readFileSync(new URL("../../public/robots.txt", import.meta.url), "utf8");
    assert.match(robots, /Disallow: \/admin/);
    assert.match(robots, /Disallow: \/hs-2-/);
    assert.match(robots, /Host: www\.rastudio\.org/);
    const map = readFileSync(new URL("../../scripts/write-sitemap.mjs", import.meta.url), "utf8");
    assert.match(map, /\/hs-2-/);
    assert.doesNotMatch(map, /master-klassy/);
  });
});
