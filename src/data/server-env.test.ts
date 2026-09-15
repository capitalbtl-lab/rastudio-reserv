import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ADMIN_API_KEYS, isAdminApiKey, valueFromApiConns } from "./server-env.ts";

describe("serverEnv: кабинет API — единственный источник", () => {
  it("заполненное поле админки", () => {
    const got = valueFromApiConns(
      [{ id: "novofon", enabled: true, fields: [{ key: "NOVOFON_SECRET", value: "from-admin" }] }],
      "NOVOFON_SECRET",
    );
    assert.equal(got.owned, true);
    assert.equal(got.disabled, false);
    assert.equal(got.value, "from-admin");
  });

  it("выключенный контур не отдаёт ключ", () => {
    const got = valueFromApiConns(
      [{ id: "novofon", enabled: false, fields: [{ key: "NOVOFON_SECRET", value: "x" }] }],
      "NOVOFON_SECRET",
    );
    assert.equal(got.owned, true);
    assert.equal(got.disabled, true);
    assert.equal(got.value, "");
  });

  it("каталог не читает process.env", () => {
    assert.equal(isAdminApiKey("NOVOFON_SECRET"), true);
    assert.equal(isAdminApiKey("ALFACRM_API_KEY"), true);
    assert.equal(isAdminApiKey("PORT"), false);
    const src = readFileSync(new URL("./server-env.ts", import.meta.url), "utf8");
    const catalogReturn = src.indexOf("if (isAdminApiKey(key) || admin.owned)");
    const dyn = src.indexOf("process?.env");
    assert.ok(catalogReturn >= 0 && dyn > catalogReturn);
    assert.match(src, /return admin\.value;/);
  });

  it("ADMIN_API_KEYS = поля API_CATALOG", () => {
    const cat = readFileSync(new URL("./api-keys.ts", import.meta.url), "utf8");
    for (const key of ADMIN_API_KEYS) {
      assert.match(cat, new RegExp(`key: "${key}"`));
    }
    const keys = [...cat.matchAll(/key: "([A-Z0-9_]+)"/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(keys)].sort(), [...ADMIN_API_KEYS].sort());
  });

  it("novofon не читает novofon.json", () => {
    const novo = readFileSync(new URL("./novofon.ts", import.meta.url), "utf8");
    assert.doesNotMatch(novo, /novofon\.json/);
    const alfa = readFileSync(new URL("./alfacrm.ts", import.meta.url), "utf8");
    assert.doesNotMatch(alfa, /process\.env\.ALFACRM_API_KEY/);
    const py = readFileSync(new URL("../../scripts/transcribe-novofon.py", import.meta.url), "utf8");
    assert.match(py, /def api_fields/);
    assert.doesNotMatch(py, /novofon\.json/);
    assert.doesNotMatch(py, /ROOT \/ "\.env"/);
  });
});
