import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultHomeOrder, moveHomeBlock, normalizeHomeOrder, placeHomeBlock } from "./home-layout-core.ts";

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
});
