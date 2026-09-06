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
} from "./home-layout-core.ts";

describe("макет главной", () => {
  it("неизвестный id отбрасывается, новые блоки дописываются", () => {
    const order = normalizeHomeOrder(["about", "ghost", "hero", "about"]);
    assert.equal(order[0], "about");
    assert.equal(order[1], "hero");
    assert.ok(!order.includes("ghost" as typeof order[number]));
    assert.deepEqual(new Set(order), new Set(defaultHomeOrder()));
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

  it("главная оборачивает каждый блок и правит текст", () => {
    const src = readFileSync(new URL("../routes/index.tsx", import.meta.url), "utf8");
    for (const id of defaultHomeOrder()) {
      assert.match(src, new RegExp(`HomeSlot id="${id}"`));
    }
    assert.match(src, /HomeCanvas/);
    assert.match(src, /EditText id="hero.title"/);
    const editor = readFileSync(new URL("../components/home-editor.tsx", import.meta.url), "utf8");
    assert.match(editor, /Инспектор/);
    assert.match(editor, /contentEditable/);
  });
});
