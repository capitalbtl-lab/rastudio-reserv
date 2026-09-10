import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("автовыкладка Beget", () => {
  it("вотчер не дублирует сборку и читает обе метки", () => {
    const watch = readFileSync(new URL("./beget-watch.mjs", import.meta.url), "utf8");
    const sh = readFileSync(new URL("./beget-deploy.sh", import.meta.url), "utf8");
    assert.match(watch, /lockHeld/);
    assert.match(watch, /\.deploy-rev/);
    assert.match(watch, /сборка уже идёт/);
    assert.match(sh, /ROOT\/\.deploy-rev/);
    assert.match(sh, /exit 0/);
    assert.doesNotMatch(sh, /вотчер повторит/);
  });
});
