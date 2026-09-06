import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collageShotsFor } from "./hero-shots.ts";

describe("чёрный герой страниц", () => {
  it("подбирает тематические кадры школы", () => {
    const art = collageShotsFor("/art-studio-5-6", []);
    assert.ok(art.some((s) => /shot-art|art-studio/.test(s.src + s.href)));
    const robot = collageShotsFor("/robototehnika-7-9", []);
    assert.ok(robot.some((s) => /shot-robot|robototehnika/.test(s.src + (s.href || ""))));
    assert.ok(collageShotsFor("/schedule", []).length >= 3);
  });

  it("черный блок стоит на внутренних страницах", () => {
    const article = readFileSync(new URL("../components/page-article.tsx", import.meta.url), "utf8");
    assert.match(article, /CoursePageHero/);
    assert.match(article, /kicker="Педагоги/);
    assert.match(article, /kicker="Семь школ/);
    assert.match(article, /kicker="Три студии/);
    const schedule = readFileSync(new URL("../routes/schedule.tsx", import.meta.url), "utf8");
    assert.match(schedule, /CoursePageHero/);
    const hero = readFileSync(new URL("../components/cms-blocks.tsx", import.meta.url), "utf8");
    assert.match(hero, /HeroCollage/);
    assert.match(hero, /lg:min-h-\[88dvh\]/);
  });
});
