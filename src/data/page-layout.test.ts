import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BLOCK_LIBRARY, HOME_TYPE_IDS, PAGE_TYPE_IDS, kindOrder, libraryType } from "./block-library-core.ts";
import {
  addInstance,
  applyHomeToPage,
  copyInstanceTo,
  emptyPageDoc,
  homeToLayout,
  layoutToHome,
  layoutsEqual,
  normalizePageDoc,
  phoneIssues,
  seedLayout,
} from "./page-layout-core.ts";
import { defaultHomeOrder, normalizeHomeLayout } from "./home-layout-core.ts";

describe("библиотека и документ страницы", () => {
  it("библиотека содержит все слоты главной и блоки школы/курса", () => {
    for (const id of HOME_TYPE_IDS) assert.ok(libraryType(id), id);
    for (const id of PAGE_TYPE_IDS) assert.ok(libraryType(id), id);
    assert.equal(libraryType("hero")?.locked, true);
    assert.equal(libraryType("course-hero")?.locked, true);
    assert.ok(BLOCK_LIBRARY.length >= 20);
    assert.ok(kindOrder("home").includes("hero"));
    assert.ok(kindOrder("school").includes("course-hero"));
    assert.ok(kindOrder("course").includes("course-hero"));
  });

  it("главная мигрирует в PageDoc и обратно без потери слотов", () => {
    const home = normalizeHomeLayout({
      order: ["about", "hero", "c_abc1"],
      customs: [{ id: "c_abc1", kicker: "Сезон", title: "Лето", text: "Интенсив." }],
      texts: { "hero.title": "Заголовок" },
      media: { about: "/media/home/hero.mp4" },
      styles: { hero: { padTop: 24 } },
    });
    const layout = homeToLayout(home);
    assert.equal(layout.blocks.hero.content.title, "Заголовок");
    assert.equal(layout.blocks.c_abc1.typeId, "custom");
    assert.equal(layout.blocks.about.content.image, "/media/home/hero.mp4");
    const back = layoutToHome(layout);
    assert.ok(back.order.includes("hero"));
    assert.ok(back.order.includes("c_abc1"));
    assert.equal(back.texts["hero.title"], "Заголовок");
    assert.equal(back.customs[0].title, "Лето");
    assert.deepEqual(new Set(back.order.filter((id) => defaultHomeOrder().includes(id as (typeof defaultHomeOrder)[number]))), new Set(defaultHomeOrder()));
  });

  it("миграция копирует текущую главную даже без кастомных блоков", () => {
    const home = normalizeHomeLayout({ order: ["hero", "about"], styles: { about: { padTop: 32, bg: "paper" } } });
    const layout = homeToLayout(home);
    assert.equal(layout.blocks.about.style.padTop, 32);
    assert.equal(layout.blocks.about.style.bg, "paper");
    assert.ok(layout.order.includes("hero"));
    const back = layoutToHome(layout);
    assert.equal(back.styles.about?.padTop, 32);
  });

  it("один typeId — два экземпляра на разных страницах, разный контент", () => {
    const home = emptyPageDoc("/", "Главная", "home");
    const art = emptyPageDoc("/art-studio", "Художка", "school");
    const withHome = addInstance(home.draft, "two-col", null, { title: "На главной", text: "Главная колонка", image: "/media/home/a.jpg" });
    const withArt = addInstance(art.draft, "two-col", null, { title: "На художественной", text: "Другой текст", image: "/media/courses/x.jpg" });
    const a = Object.values(withHome.blocks).find((b) => b.typeId === "two-col")!;
    const b = Object.values(withArt.blocks).find((b) => b.typeId === "two-col")!;
    assert.equal(a.typeId, b.typeId);
    assert.notEqual(a.id, b.id);
    assert.equal(a.content.title, "На главной");
    assert.equal(b.content.title, "На художественной");
    const copied = copyInstanceTo(art.draft, a);
    const c = copied.blocks[copied.order[copied.order.length - 1]];
    assert.equal(c.content.title, "На главной");
    assert.notEqual(c.id, a.id);
  });

  it("roundtrip inst_ и школы не подмешивает слоты главной", () => {
    const art = emptyPageDoc("/art-studio", "Художка", "school");
    const withCol = addInstance(art.draft, "two-col", null, { title: "Колонка", image: "/media/schools/art/a.jpg" });
    const inst = Object.values(withCol.blocks).find((b) => b.typeId === "two-col")!;
    assert.match(inst.id, /^inst_/);
    const shaped = layoutToHome(withCol);
    assert.ok(shaped.order.includes("course-hero"), "шапка школы жива");
    assert.ok(shaped.order.includes(inst.id), "атом не выкинут");
    assert.ok(!shaped.order.includes("ticker"), "бегущая строка главной не приехала");
    const back = homeToLayout(shaped);
    assert.equal(back.blocks[inst.id]?.content.title, "Колонка");
    assert.equal(back.blocks[inst.id]?.content.image, "/media/schools/art/a.jpg");
    assert.ok(back.order.includes("course-hero"));
    assert.ok(!back.order.includes("ticker"));
  });

  it("черновик не равен опубликованному до publish; телефон ругает ширину", () => {
    let doc = emptyPageDoc("/", "Главная", "home");
    assert.equal(layoutsEqual(doc.draft, doc.published), true);
    doc = { ...doc, draft: addInstance(doc.draft, "heading", null, { title: "Черновик" }) };
    assert.equal(layoutsEqual(doc.draft, doc.published), false);
    const wide = seedLayout("plain");
    wide.blocks["course-hero"].style.w = 900;
    wide.blocks["course-hero"].style.x = 80;
    const issues = phoneIssues(wide);
    assert.ok(issues.some((s) => s.includes("ширина")));
    const round = normalizePageDoc(JSON.parse(JSON.stringify(doc)), { path: "/", title: "Главная", kind: "home" });
    assert.equal(round.path, "/");
    assert.ok(round.draft.order.includes("hero"));
  });

  it("PageDoc применяется к главной без дыр в системных слотах", () => {
    const page = emptyPageDoc("/", "Главная", "home");
    const home = normalizeHomeLayout({ texts: { "hero.title": "Новый" } });
    const next = applyHomeToPage(page, home);
    assert.equal(next.draft.blocks.hero.content.title, "Новый");
    for (const id of HOME_TYPE_IDS) assert.ok(next.draft.blocks[id], id);
  });

  it("файлы редактора на месте, витрина не импортирует page-editor", () => {
    const index = readFileSync(new URL("../routes/index.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(index, /from "@\/components\/page-editor"/);
    assert.doesNotMatch(index, /from "@\/components\/home-editor"/);
    const editor = readFileSync(new URL("../components/home-editor.tsx", import.meta.url), "utf8");
    assert.match(editor, /Опубликовать/);
    assert.match(editor, /Предпросмотр/);
    assert.match(editor, /Сохранить/);
    const cms = readFileSync(new URL("../components/cms-blocks.tsx", import.meta.url), "utf8");
    assert.match(cms, /import\("@\/components\/page-editor"\)/);
    assert.doesNotMatch(cms, /from "@\/components\/page-editor"/);
    const fn = readFileSync(new URL("./page-layout-fn.ts", import.meta.url), "utf8");
    assert.match(fn, /savePageDraft\(path, homeToLayout/);
    assert.match(fn, /publishPage\(path\)/);
  });
});
