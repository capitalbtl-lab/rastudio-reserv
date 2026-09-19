import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mediaFolder, mediaSchoolId, mediaUploadRel, schoolSlug } from "./media-context.ts";

describe("папки медиатеки", () => {
  it("пишет загрузку школы в media/schools/{slug}", () => {
    assert.equal(schoolSlug("/art-studio"), "art-studio");
    assert.equal(mediaUploadRel("/art-studio"), "media/schools/art-studio");
    assert.equal(mediaUploadRel("home"), "media/home");
    assert.equal(mediaUploadRel(""), "media/uploads");
    assert.equal(mediaFolder("/media/schools/art-studio/a.jpg"), "art-studio");
  });

  it("привязывает файл курса к школе", () => {
    const schools = [{ id: "/art-studio" }, { id: "/robototehnika-v-kolomne" }];
    const courses = [{ id: "/art-studio-5-6", schoolId: "/art-studio" }];
    assert.equal(mediaSchoolId("/media/schools/art-studio/x.jpg", schools, courses), "/art-studio");
    assert.equal(mediaSchoolId("/media/courses/art-studio-5-6/x.jpg", schools, courses), "/art-studio");
    assert.equal(mediaSchoolId("/media/home/hero.mp4", schools, courses), "");
  });

  it("студия спрашивает подпись и тащит файл в блок", () => {
    const studio = readFileSync(new URL("../components/home-studio.tsx", import.meta.url), "utf8");
    assert.match(studio, /И этот/);
    assert.match(studio, /Не добавлять/);
    assert.match(studio, /startMediaDrag/);
    assert.match(studio, /folder/);
    const blocks = readFileSync(new URL("../components/home-blocks.tsx", import.meta.url), "utf8");
    assert.match(blocks, /mediaFromDrop/);
    assert.match(blocks, /setHomeMedia/);
    const fn = readFileSync(new URL("./site-studio-fn.ts", import.meta.url), "utf8");
    assert.match(fn, /askCaption/);
    assert.match(fn, /proposeMediaCaption/);
    assert.doesNotMatch(fn, /describeMediaForPulse/);
  });
});
