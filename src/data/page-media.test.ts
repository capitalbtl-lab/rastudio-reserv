import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { teaser, videoPack } from "./page-media.ts";

describe("page-media", () => {
  it("ставит Wix-видео на главную, художественные курсы и билингвальную робототехнику", () => {
    assert.equal(videoPack("/").hero, "/media/home/hero.mp4");
    assert.equal(videoPack("/").clips?.length, 4);
    assert.match(videoPack("/art-studio-5-6").hero || "", /art-studio-5-6\/intro\.mp4/);
    assert.equal(videoPack("/roboticsinenglish").clips?.length, 4);
    assert.match(videoPack("/digitalartschool").hero || "", /digitalartschool\/intro\.mp4/);
    assert.equal(videoPack("/digitalartschool").clips?.length, 2);
  });

  it("коротко обрезает длинный Wix-текст для карточки", () => {
    const long = "Первое предложение. Второе предложение ещё длиннее и про курс. Третье.";
    const short = teaser(long, 40);
    assert.ok(short.endsWith("…") || short.length <= 42);
    assert.match(short, /Первое/);
  });
});
