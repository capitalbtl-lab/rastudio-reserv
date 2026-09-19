import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  defaultHomeOrder,
  moveHomeBlock,
  normalizeHomeLayout,
  normalizeHomeOrder,
  patchHomeStyle,
  placeHomeBlock,
  setHomeText,
  visibleHomeOrder,
  clampH,
  MAX_SECTION_H,
} from "./home-layout-core.ts";

describe("макет главной", () => {
  it("неизвестный id отбрасывается, inst_ и слот школы остаются", () => {
    const order = normalizeHomeOrder(["about", "ghost", "hero", "about"]);
    assert.equal(order[0], "about");
    assert.equal(order[1], "hero");
    assert.ok(!order.includes("ghost" as typeof order[number]));
    assert.deepEqual(new Set(order), new Set(defaultHomeOrder()));
    const withInst = normalizeHomeOrder(["course-hero", "inst_ab12cd"], ["course-hero", "inst_ab12cd"], false);
    assert.deepEqual(withInst, ["course-hero", "inst_ab12cd"]);
  });

  it("сдвиг вверх-вниз и перестановка перед блоком", () => {
    const base = defaultHomeOrder();
    const up = moveHomeBlock(base, "catalog", -1);
    assert.ok(up.indexOf("catalog") < up.indexOf("schools"));
    const down = moveHomeBlock(base, "hero", 1);
    assert.equal(down[1], "hero");
    const placed = placeHomeBlock(base, "trial", "hero");
    assert.equal(placed[0], "trial");
    assert.equal(placed[1], "hero");
  });

  it("документ: скрытие, отступ, текст, старый массив", () => {
    const fromArr = normalizeHomeLayout(["about", "hero"]);
    assert.equal(fromArr.order[0], "about");
    let doc = normalizeHomeLayout({ order: ["hero"], styles: { hero: { hidden: true, padTop: 40, bg: "ink" } }, texts: { "hero.title": "Новый заголовок" } });
    assert.equal(doc.styles.hero?.hidden, true);
    assert.equal(doc.styles.hero?.padTop, 40);
    assert.equal(doc.texts["hero.title"], "Новый заголовок");
    assert.ok(!visibleHomeOrder(doc, false).includes("hero"));
    assert.ok(visibleHomeOrder(doc, true).includes("hero"));
    doc = patchHomeStyle(doc, "hero", { hidden: false, padTop: 0 });
    assert.equal(doc.styles.hero?.hidden, undefined);
    doc = setHomeText(doc, "hero.title", "  ");
    assert.equal(doc.texts["hero.title"], undefined);
  });

  it("свой блок и медиа попадают в макет", () => {
    const doc = normalizeHomeLayout({
      order: ["hero", "c_abc1"],
      customs: [{ id: "c_abc1", kicker: "Сезон", title: "Летний интенсив", text: "Короткая смена." }],
      media: { about: "/media/home/hero.mp4" },
    });
    assert.ok(doc.order.includes("c_abc1"));
    assert.equal(doc.customs[0].title, "Летний интенсив");
    assert.equal(doc.media.about, "/media/home/hero.mp4");
  });

  it("пустой title не выкидывает inst_ и хранит кегль", () => {
    const emptyTitle = normalizeHomeLayout(
      {
        order: ["inst_ab12cd"],
        customs: [{ id: "inst_ab12cd", typeId: "two-col", kicker: "", title: "", text: "x" }],
        styles: { inst_ab12cd: { bold: true, fontSize: 48, align: "center" } },
      },
      false,
    );
    assert.equal(emptyTitle.customs[0]?.id, "inst_ab12cd");
    assert.equal(emptyTitle.styles.inst_ab12cd?.bold, true);
    assert.equal(emptyTitle.styles.inst_ab12cd?.fontSize, 48);
    assert.equal(clampH(2000), MAX_SECTION_H);
    assert.equal(MAX_SECTION_H, 1200);
  });

  it("главная оборачивает каждый блок и правит текст", () => {
    const src = readFileSync(new URL("../routes/index.tsx", import.meta.url), "utf8");
    for (const id of defaultHomeOrder()) {
      if (id.startsWith("c_")) continue;
      assert.match(src, new RegExp(`HomeSlot id="${id}"`));
    }
    assert.match(src, /HomeCanvas/);
    assert.match(src, /EditText id="hero.title"/);
    assert.match(src, /from "@\/components\/home-read"/);
    assert.doesNotMatch(src, /from "@\/components\/home-editor"/);
    const editor = readFileSync(new URL("../components/home-editor.tsx", import.meta.url), "utf8");
    assert.match(editor, /Инспектор/);
    assert.match(editor, /StudioPanel/);
    assert.match(editor, /\["pages", Files, "Разделы"\]/);
    assert.match(editor, /\["ai", Sparkles, "Блоки"\]/);
    assert.match(editor, /\["agent", Bot, "Агент"\]/);
    assert.match(editor, /home-editing/);
    assert.match(editor, /edit=1/);
    assert.match(editor, /\["layers", "Слои"\]/);
    assert.match(editor, /Панель/);
    assert.match(editor, /Опубликовать/);
    assert.match(editor, /Предпросмотр/);
    assert.match(editor, /href=\{editUrl\(p\.path\)\}/);
    assert.match(editor, /if \(p\.kind === "school"\) setOpen/);
    assert.doesNotMatch(editor, /max-w-\[390px\]/);
    const read = readFileSync(new URL("../components/home-read.tsx", import.meta.url), "utf8");
    assert.match(read, /contentEditable/);
    const blocks = readFileSync(new URL("../components/home-blocks.tsx", import.meta.url), "utf8");
    assert.match(blocks, /HomeEditorGate/);
    assert.match(blocks, /home-device-phone/);
    assert.match(blocks, /ve-canvas/);
    assert.doesNotMatch(blocks, /from "@\/components\/home-editor"/);
    const gate = readFileSync(new URL("../components/home-editor-gate.tsx", import.meta.url), "utf8");
    assert.match(gate, /edit=1/);
    assert.match(gate, /ra_edit/);
    assert.match(gate, /import\("@\/components\/editor-unlock"\)/);
    assert.doesNotMatch(gate, /sessionStorage.setItem\("ra_debug"/);
    assert.doesNotMatch(gate, /ra_admin/);
    assert.doesNotMatch(gate, /from "@\/components\/editor-unlock"/);
    const footer = readFileSync(new URL("../components/site-footer.tsx", import.meta.url), "utf8");
    assert.match(footer, /EditorEntry/);
    const entry = readFileSync(new URL("../components/editor-entry.tsx", import.meta.url), "utf8");
    assert.match(entry, /Редактор/);
    assert.match(entry, /\?edit=1/);
    assert.doesNotMatch(entry, /ra_debug/);
    const editorCss = readFileSync(new URL("../components/home-editor.css", import.meta.url), "utf8");
    assert.match(editorCss, /html\.home-editing main/);
    assert.match(editorCss, /18\.5rem/);
    assert.match(editorCss, /\.ve-rail[\s\S]{0,120}left:\s*0/);
    const pub = readFileSync(new URL("../components/admin-public-site.tsx", import.meta.url), "utf8");
    assert.match(pub, /\/\?edit=1/);
    assert.match(pub, /Редактор главной/);
    assert.match(pub, /target="_blank"/);
    assert.doesNotMatch(blocks, /max-w-\[390px\].*lg:pr/);
    const admin = readFileSync(new URL("../routes/admin.tsx", import.meta.url), "utf8");
    assert.match(admin, /StaffShell/);
    assert.doesNotMatch(admin, /SiteShell/);
    const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    assert.match(css, /html\.home-editing \.mobile-dock/);
    assert.match(css, /html\.home-editing \.agent-shell/);
    assert.match(css, /html\.home-editing \.debug-dock/);
    assert.match(css, /display: none !important/);
    const studio = readFileSync(new URL("../components/home-studio.tsx", import.meta.url), "utf8");
    assert.match(studio, /view \?/);
    assert.match(studio, /view === "ai"/);
    assert.match(studio, /Придумать новый блок/);
    assert.match(studio, /DeepSeek: править текст/);
    assert.match(studio, /Сохранить агента страницы/);
    assert.match(studio, /"set"/);
    assert.match(studio, /И этот/);
    assert.doesNotMatch(studio, /<video src=\{item\.src\}/);
  });
});
