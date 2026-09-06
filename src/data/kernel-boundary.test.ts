import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DISK_RULES, KERNEL_FILES, KERNEL_KEYS } from "./kernel.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function src(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("ядро: границы вкладок", () => {
  it("файлы ядра на месте, ключи в правилах диска", () => {
    for (const f of KERNEL_FILES) assert.equal(existsSync(join(root, f)), true, f);
    const rules = DISK_RULES.map((r) => r.field).join(" ");
    assert.match(rules, /groupLinks/);
    assert.match(rules, /live_tariff/);
    assert.match(rules, /courseId/);
    assert.match(rules, /lessonId/);
    assert.match(rules, /customerId/);
    assert.ok(KERNEL_KEYS.includes("groupId"));
    assert.ok(KERNEL_KEYS.includes("customerId"));
  });

  it("публичный сайт не ходит в Alfa и не тащит кабинет", () => {
    for (const f of ["src/routes/index.tsx", "src/routes/schedule.tsx", "src/routes/$.tsx"]) {
      const t = src(f);
      assert.doesNotMatch(t, /from ["']@\/data\/alfacrm["']/);
      assert.doesNotMatch(t, /from ["']@\/components\/admin-/);
      assert.doesNotMatch(t, /s20\.online/);
    }
    const index = src("src/routes/index.tsx");
    assert.doesNotMatch(index, /from ["']@\/components\/home-editor["']/);
    const pages = src("src/data/load-site-page.ts");
    assert.doesNotMatch(pages, /from ["']\.\/alfacrm-schedule["']/);
    assert.match(pages, /sessionsFromDisk/);
    const admin = src("src/routes/admin.tsx");
    assert.match(admin, /StaffShell/);
    assert.doesNotMatch(admin, /SiteShell/);
  });

  it("воронка и чипы консультанта не вызывают Alfa напрямую", () => {
    for (const f of [
      "src/data/agent-funnel.ts",
      "src/data/agent-chips.ts",
      "src/data/agent-facts.ts",
      "src/data/agent-makeup.ts",
    ]) {
      const t = src(f);
      assert.doesNotMatch(t, /from ["']\.\/alfacrm["']/);
      assert.doesNotMatch(t, /s20\.online/);
    }
  });

  it("GROK-TABS знает ядро", () => {
    const tabs = src("GROK-TABS.md");
    assert.match(tabs, /диск = правда|Источник правды — диск/);
    assert.match(tabs, /crm-disk-rules/);
    assert.match(tabs, /kernel/);
  });

  it("каналы зовут тот же chatAgent, не второй мозг", () => {
    const inbox = src("src/data/agent-inbox.ts");
    assert.match(inbox, /import\("\.\/agent-chat"\)/);
    assert.match(inbox, /channel: ev\.channel/);
    const api = src("src/routes/api/agent.$channel.ts");
    assert.match(api, /handleWebhook/);
  });
});
