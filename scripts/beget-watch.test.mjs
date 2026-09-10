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
    assert.match(watch, /RA_DEPLOY_BG/);
    assert.match(sh, /status.*online/);
    assert.doesNotMatch(sh, /pm2 restart rastudio-deploy --update-env/);
    assert.match(watch, /building\(\)/);
    assert.match(watch, /return lockHeld\(\)/);
    assert.doesNotMatch(watch, /\.build-stage", "package\.json"\)/);
    assert.match(sh, /fail_cleanup/);
    assert.match(sh, /3000 уже слушает/);
    assert.match(sh, /rm -f "\$LOCK"/);
  });
});
