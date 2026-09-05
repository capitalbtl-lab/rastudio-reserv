import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repairSiteFlags, siteFlagsAllOff, SITE_WINDOW_IDS } from "./agent-window-core.ts";

describe("окно и отладка раздельно", () => {
  it("битый сейв всех галочек видимости чинится, смешанный нет", () => {
    const dead: Record<string, unknown> = Object.fromEntries(SITE_WINDOW_IDS.map((id) => [id, false]));
    assert.equal(siteFlagsAllOff(dead), true);
    const defaults = Object.fromEntries(SITE_WINDOW_IDS.map((id) => [id, true])) as Record<(typeof SITE_WINDOW_IDS)[number], boolean>;
    const fix = repairSiteFlags(dead, defaults);
    assert.equal(fix.showChat, true);
    assert.equal(fix.allowOlga, true);
    const mixed = { ...dead, showChat: true };
    assert.equal(siteFlagsAllOff(mixed), false);
    assert.equal(repairSiteFlags(mixed, defaults), mixed);
    assert.equal(SITE_WINDOW_IDS.length, 8);
  });

  it("три вкладки: окно, кнопки, отладка — не один экран", () => {
    const panes = readFileSync(new URL("./agent-panes.ts", import.meta.url), "utf8");
    assert.match(panes, /id: "window"/);
    assert.match(panes, /id: "chips"/);
    assert.match(panes, /id: "debug"/);
    assert.match(panes, /label: "Окно"/);
    assert.match(panes, /label: "Кнопки"/);
    assert.match(panes, /label: "Отладка"/);
    const win = readFileSync(new URL("../components/admin-agent.tsx", import.meta.url), "utf8");
    assert.match(win, /action: "getSettings"/);
    assert.match(win, /FRAME_WINDOW_FLAGS\.map/);
    assert.match(win, /CHIP_FLAGS\.map/);
    assert.match(win, /pane === "chips"/);
    assert.match(win, /pane === "debug"/);
    assert.match(win, /Сохранить окно/);
    assert.match(win, /Сохранить кнопки/);
    assert.doesNotMatch(win, /SITE_WINDOW_FLAGS\.map/);
    const dbg = readFileSync(new URL("../components/admin-debug.tsx", import.meta.url), "utf8");
    assert.match(dbg, /Последние ответы модели/);
    assert.match(dbg, /Сохранить отладку/);
    assert.doesNotMatch(dbg, /WINDOW_FLAGS\.map/);
    assert.doesNotMatch(dbg, /Окно и кнопки/);
  });
});
