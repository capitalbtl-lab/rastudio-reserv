import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BLOCK_LIBRARY, HOME_TYPE_IDS, PAGE_TYPE_IDS, kindOrder, libraryType, isCanvasExtra } from "./block-library-core.ts";
import {
  addInstance,
  applyHomeToPage,
  applyInstanceToType,
  copyInstanceTo,
  emptyPageDoc,
  extrasOf,
  homeToLayout,
  layoutToHome,
  layoutsEqual,
  normalizePageDoc,
  phoneIssues,
  seedLayout,
  editorMenuTree,
  stylesOf,
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

  it("стили конструктора читаются с любой страницы, не только с главной", () => {
    const layout = seedLayout("school");
    layout.blocks["convert-band"].style = { h: 420, hidden: true };
    const st = stylesOf(layout);
    assert.equal(st["convert-band"]?.h, 420);
    assert.equal(st["convert-band"]?.hidden, true);
    const paint = readFileSync(new URL("../lib/ve-paint.ts", import.meta.url), "utf8");
    assert.match(paint, /paintVeFrames/);
    assert.match(paint, /\[data-ve-frame\]/);
  });

  it("изменения типа идут во все блоки typeId, courseId страницы свой", () => {
    const from = seedLayout("school");
    from.blocks.schedule.style = { h: 480, bg: "ink" };
    from.blocks.schedule.content.courseId = "/robototehnika-v-kolomne";
    const art = seedLayout("school");
    art.blocks.schedule.content.courseId = "/art-studio";
    const next = applyInstanceToType(art, "schedule", from.blocks.schedule);
    assert.equal(next.blocks.schedule.style.h, 480);
    assert.equal(next.blocks.schedule.style.bg, "ink");
    assert.equal(next.blocks.schedule.content.courseId, "/art-studio");
    assert.equal(next.blocks.schedule.onAllPages, true);
    assert.equal(next.blocks["course-hero"].style.h, undefined);
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
    assert.deepEqual(new Set(back.order.filter((id) => defaultHomeOrder().includes(id as ReturnType<typeof defaultHomeOrder>[number]))), new Set(defaultHomeOrder()));
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
    const extras = extrasOf(withArt);
    assert.equal(extras.length, 1);
    assert.equal(extras[0].typeId, "two-col");
    assert.equal(extras[0].title, "На художественной");
    const homeExtras = extrasOf(withHome);
    assert.equal(homeExtras[0].typeId, "two-col");
    assert.notEqual(homeExtras[0].id, extras[0].id);
    const school = seedLayout("school");
    assert.equal(extrasOf(school).length, 0);
    const gallery = addInstance(art.draft, "gallery", null, { title: "Галерея школы", image: "/media/schools/art/a.jpg" });
    const gid = Object.values(gallery.blocks).find((b) => b.typeId === "gallery" && /^inst_/.test(b.id))!;
    assert.equal(isCanvasExtra(gid.typeId, gid.id), true);
    assert.equal(extrasOf(gallery).some((e) => e.id === gid.id && e.image === "/media/schools/art/a.jpg"), true);
    const styled = addInstance(art.draft, "two-col", null, { title: "Жирный" });
    const sid = Object.values(styled.blocks).find((b) => b.typeId === "two-col")!.id;
    styled.blocks[sid].style.bold = true;
    styled.blocks[sid].style.align = "center";
    styled.blocks[sid].content.courseId = "/art-studio";
    const packed = layoutToHome(styled);
    assert.equal(packed.styles[sid]?.bold, true);
    assert.equal(packed.styles[sid]?.align, "center");
    assert.equal(packed.texts[`${sid}.courseId`], "/art-studio");
    const back = homeToLayout(packed);
    assert.equal(back.blocks[sid].style.bold, true);
    assert.equal(back.blocks[sid].content.courseId, "/art-studio");
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
    assert.match(editor, /Поставить этот блок/);
    assert.match(editor, /fromPath/);
    assert.match(editor, /revealBlock/);
    assert.match(editor, /scrollIntoView/);
    assert.match(editor, /PagesTree/);
    assert.match(editor, /Показать курсы школы/);
    assert.match(editor, /path === "\/"/);
    assert.match(editor, /TextToolbar/);
    assert.match(editor, /courseId/);
    assert.match(editor, /HeightField/);
    const blocks = readFileSync(new URL("../components/home-blocks.tsx", import.meta.url), "utf8");
    assert.match(blocks, /data-ve-body/);
    assert.match(editor, /кегль/);
    const css = readFileSync(new URL("../components/home-editor.css", import.meta.url), "utf8");
    assert.match(css, /ve-textbar/);
    assert.match(css, /5\.25rem/);
    assert.match(css, /scroll-margin-top/);
    const cms = readFileSync(new URL("../components/cms-blocks.tsx", import.meta.url), "utf8");
    assert.match(cms, /import\("@\/components\/page-editor"\)/);
    assert.doesNotMatch(cms, /from "@\/components\/page-editor"/);
    assert.match(cms, /import\("@\/components\/page-extras"\)/);
    assert.match(cms, /import\("@\/data\/page-extras-fn"\)/);
    assert.doesNotMatch(cms, /from "@\/components\/page-extras"/);
    assert.doesNotMatch(cms, /page-layout-fn/);
    assert.match(cms, /data-ve-frame="course-hero"/);
    assert.match(cms, /data-ve-frame="school-courses"/);
    const article = readFileSync(new URL("../components/page-article.tsx", import.meta.url), "utf8");
    assert.match(article, /data-ve-frame="teachers"/);
    assert.match(article, /data-ve-frame="ages"/);
    assert.match(article, /data-ve-frame="catalog"/);
    assert.match(article, /data-ve-frame="branches"/);
    assert.match(article, /data-ve-frame="gallery"/);
    assert.match(article, /data-ve-frame="course-story"/);
    const prog = readFileSync(new URL("../components/programming-course.tsx", import.meta.url), "utf8");
    assert.match(prog, /data-ve-frame="trajectory"/);
    assert.match(prog, /data-ve-frame="program"/);
    const convert = readFileSync(new URL("../components/convert.tsx", import.meta.url), "utf8");
    const finder = readFileSync(new URL("../components/schedule-finder.tsx", import.meta.url), "utf8");
    assert.match(finder, /data-ve-frame="schedule"/);
    const schedule = readFileSync(new URL("../routes/schedule.tsx", import.meta.url), "utf8");
    assert.match(schedule, /data-ve-frame="course-story"/);
    assert.match(editor, /Генератор блоков/);
    assert.match(editor, /Из шаблонов/);
    assert.match(editor, /Новый блок/);
    assert.match(editor, /function BlocksRail/);
    assert.match(editor, /BlockPreview/);
    const preview = readFileSync(new URL("../components/block-preview.tsx", import.meta.url), "utf8");
    assert.match(preview, /shot-art/);
    assert.match(preview, /h-\[6\.75rem\]/);
    assert.doesNotMatch(preview, /from "@\/components\/home-editor"/);
    assert.match(editor, /data-ve-stub/);
    assert.doesNotMatch(editor, /aliases/);
    assert.match(editor, /function VeSync/);
    assert.match(editor, /paintVeFrames/);
    assert.match(editor, /Только этот блок/);
    assert.match(editor, /Все блоки/);
    assert.match(editor, /chooseScope/);
    assert.match(editor, /applyTypePatchFn/);
    const extras = readFileSync(new URL("../components/page-extras.tsx", import.meta.url), "utf8");
    assert.match(extras, /block.typeId === "gallery"/);
    assert.match(extras, /createPortal/);
    assert.match(extras, /overflow-x-clip/);
    assert.match(extras, /paintVeFrames/);
    assert.doesNotMatch(extras, /page-layout-fn/);
    const fn = readFileSync(new URL("./page-layout-fn.ts", import.meta.url), "utf8");
    assert.match(fn, /savePageDraft\(path, homeToLayout/);
    assert.match(fn, /publishPage\(path\)/);
    assert.match(fn, /listEditorPagesFn/);
    assert.match(fn, /seed === "template"/);
    assert.match(fn, /findPrototype/);
    assert.match(fn, /applyTypeFrom/);
    assert.doesNotMatch(fn, /publicPageExtrasFn/);
    const pub = readFileSync(new URL("./page-extras-fn.ts", import.meta.url), "utf8");
    assert.match(pub, /publicPageExtrasFn/);
    assert.doesNotMatch(pub, /admin-auth/);
  });

  it("меню редактора: курсы внутри школы, пункты как в шапке", () => {
    const tree = editorMenuTree([
      { path: "/", title: "Главная", kind: "home" },
      { path: "/allcourses", title: "Курсы", kind: "catalog" },
      { path: "/schedule", title: "Расписание", kind: "plain" },
      { path: "/team", title: "Педагоги", kind: "team" },
      { path: "/master-class", title: "Мастер-классы", kind: "master" },
      { path: "/o-nas", title: "О нас", kind: "plain" },
      { path: "/contacts", title: "Контакты", kind: "contacts" },
      { path: "/art-studio", title: "Художественная школа", kind: "school" },
      { path: "/robototehnika-v-kolomne", title: "Школа робототехники", kind: "school" },
      { path: "/art-1", title: "Академический рисунок", kind: "course", parent: "/art-studio" },
      { path: "/rob-1", title: "Робототехника 9-13", kind: "course", parent: "/robototehnika-v-kolomne" },
      { path: "/extra", title: "Лишняя", kind: "plain" },
    ]);
    assert.equal(tree.home?.path, "/");
    assert.equal(tree.schools.length, 2);
    assert.equal(tree.coursesOf("/art-studio").map((c) => c.path).join(), "/art-1");
    assert.equal(tree.coursesOf("/robototehnika-v-kolomne").map((c) => c.path).join(), "/rob-1");
    assert.deepEqual(tree.menu.map((p) => p.path), ["/allcourses", "/schedule", "/team", "/master-class"]);
    assert.deepEqual(tree.more.map((p) => p.path), ["/o-nas", "/contacts"]);
    assert.equal(tree.rest.map((p) => p.path).join(), "/extra");
    const src = readFileSync(new URL("./page-layout.ts", import.meta.url), "utf8");
    assert.match(src, /parent: school/);
  });
});
