import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { teaser, videoPack, wixStory } from "./page-media.ts";

describe("page-media", () => {
  it("ставит Wix-видео на главную, художественные курсы и билингвальную робототехнику", () => {
    assert.equal(videoPack("/").hero, "/media/home/hero.mp4");
    assert.equal(videoPack("/").clips?.length, 4);
    assert.match(videoPack("/art-studio-5-6").hero || "", /art-studio-5-6\/intro\.mp4/);
    assert.equal(videoPack("/roboticsinenglish").clips?.length, 4);
    assert.match(videoPack("/digitalartschool").hero || "", /digitalartschool\/intro\.mp4/);
    assert.equal(videoPack("/digitalartschool").clips?.length, 2);
  });

  it("видео курсов Wix идут в ленту, чёрный верх робототехники 5–7 остаётся фото", () => {
    assert.equal(videoPack("/robototehnika-5-7").hero, undefined);
    assert.match(videoPack("/robototehnika-5-7").clips?.[0] || "", /robototehnika-5-7\/intro\.mp4/);
    assert.match(videoPack("/englishlanguagegg").clips?.[0] || "", /englishlanguagegg\/intro\.mp4/);
    assert.match(videoPack("/languageschool").clips?.[0] || "", /languageschool\/intro\.mp4/);
    assert.match(videoPack("/programming-school").clips?.[0] || "", /programming-school\/intro\.mp4/);
    assert.equal(videoPack("/robototehnika-v-kolomne").hero, "/media/home/robot-english.mp4");
  });

  it("берёт живой текст Wix, а не выдуманную подмену", () => {
    const wix = wixStory("/model-school", {
      description: "Юные леди познакомятся с азами модельного дела.",
      paragraphs: ["Присоединяйтесь к модельной школе «Подиум» с Ольгой Кудрейко."],
    }, ["Выдуманный абзац"]);
    assert.match(wix[0], /Ольгой Кудрейко/);
    const empty = wixStory("/robototehnika-5-7", { paragraphs: [] }, ["LEGO SPIKE Start"]);
    assert.match(empty[0], /LEGO SPIKE Start/);
  });

  it("коротко обрезает длинный Wix-текст для карточки", () => {
    const long = "Первое предложение. Второе предложение ещё длиннее и про курс. Третье.";
    const short = teaser(long, 40);
    assert.ok(short.endsWith("…") || short.length <= 42);
    assert.match(short, /Первое/);
  });

  it("видео на сайте не автозапускаются, старт с начала без звука", () => {
    const player = readFileSync(new URL("../components/site-video.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(player, /autoPlay/);
    assert.match(player, /el\.currentTime = 0/);
    assert.match(player, /el\.muted = true/);
    assert.match(player, /Смотреть/);
    const robot = readFileSync(new URL("../components/robot-videos.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(robot, /autoPlay/);
    assert.match(robot, /SiteVideo/);
    const home = readFileSync(new URL("../components/home-blocks.tsx", import.meta.url), "utf8");
    assert.match(home, /SiteVideo/);
    const cms = readFileSync(new URL("../components/cms-blocks.tsx", import.meta.url), "utf8");
    assert.match(cms, /SiteVideo/);
  });
});
