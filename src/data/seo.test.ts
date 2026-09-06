import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  brandTitle,
  fallbackDescription,
  isCourseSchemaPath,
  pickDescription,
  shouldNoindex,
  stripBrand,
} from "./seo-core.ts";
import { SEO_COPY } from "./seo-copy.ts";
import { SITE, SCHOOLS } from "./site.ts";
import { cleanWixAlt, imageTitle } from "./wix-seo-core.ts";

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

  it("главная и языковая школа берут description с Wix", () => {
    assert.equal(SEO_COPY["/"], undefined);
    assert.match(SITE.homeDescription, /Художественная школа в Коломне/);
    const school = SCHOOLS.find((s) => s.href === "/languageschool");
    assert.equal(school?.filename.includes("11062b"), false);
    assert.match(school?.blurb || "", /английскому, корейскому/);
    const lang = pickDescription({
      title: 'Школа иностранных языков в Студии "Развивайся" | Коломна',
      description: "Обучение английскому, корейскому, китайскому, японскому языкам для детей в Коломне.",
    });
    assert.match(lang, /английскому, корейскому, китайскому, японскому/);
    assert.equal(imageTitle("11062b_e2ae833a8eaa43e38e4aa6d32eb3b8f7f000.jpg", "Школа иностранных языков"), "Школа иностранных языков");
    assert.equal(
      imageTitle("Школа иностранных языков в Студии Развивайся | Коломна.jpg", "x"),
      "Школа иностранных языков в Студии Развивайся | Коломна",
    );
  });

  it("не переписывает description, уже прописанный в Wix", () => {
    const about = pickDescription({
      title: 'Студия "РАЗВИВАЙСЯ" в Коломне | О нас',
      description:
        'Студия искусств и интеллектуального развития "Развивайся" - это дополнительное образование для детей и творческие курсы для взрослых в Коломне в качественно новом формате.',
    });
    assert.match(about, /качественно новом формате/);
    assert.doesNotMatch(about, /с 2016 года: художественная школа/);
    const team = pickDescription({
      title: 'Педагоги Студии и ЦМИТ "Развивайся" (Коломна)',
      description: 'Знакомьтесь с педагогами Студии "Развивайся". Выбирайте профессионалов!',
    });
    assert.match(team, /Выбирайте профессионалов/);
    assert.equal(SEO_COPY["/o-nas"], undefined);
    assert.equal(SEO_COPY["/team"], undefined);
    assert.equal(SEO_COPY["/master-class"], undefined);
    const robot = pickDescription({
      title: "Школа робототехники в Коломне | Для детей 5-7 лет",
      description:
        "Целью обучения детей робототехнике в возрасте 5-7 лет является формирование интереса к дальнейшему развитию в направлении инженерии, информационных технологий и научно-технического творчества, а также формирование естественно-научной картины мира.",
    });
    assert.match(robot, /5-7 лет является формирование интереса/);
    assert.doesNotMatch(robot, /7-9 лет/);
    const podium = pickDescription({
      title: 'Модельная школа "Подиум" в Коломне | Студия "Развивайся"',
      description:
        "Юные леди познакомятся с азами модельного дела. Вас ждут личностные тренинги, знакомство с правилами красоты и ухода за собой, фотосесии и уроки дефиле, изучение правил этикета и развитие уверенности в каждом новом шаге.",
    });
    assert.match(podium, /азами модельного дела/);
  });

  it("берёт alt с Wix и убирает расширение файла", () => {
    assert.equal(
      cleanWixAlt("Школа робототехники в Коломне", "x.png"),
      "Школа робототехники в Коломне",
    );
    assert.equal(
      cleanWixAlt("Курс Киндер-мастер для детей 10-16 лет в Студии Развивайся (1).png"),
      "Курс Киндер-мастер для детей 10-16 лет в Студии Развивайся",
    );
    assert.equal(
      cleanWixAlt("4e33b6_4653b41b8e994af68c1a2ba5397ba322f000.jpg", "", "Студия «Развивайся»"),
      "Студия «Развивайся»",
    );
    const master = fallbackDescription({
      title: 'Мастер-класс "Алые маки"',
      kind: "master",
      h1: 'Мастер-класс "Алые маки"',
      paragraphs: [
        "Мягкий свет студии, спокойная атмосфера творчества и чистый лист акварельной бумаги постепенно превращаются в живую работу.",
      ],
    });
    assert.match(master, /Мягкий свет студии/);
    assert.doesNotMatch(master, /пробное занятие без абонемента/);
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
