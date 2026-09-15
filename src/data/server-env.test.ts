import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { valueFromApiConns } from "./server-env.ts";

describe("serverEnv: кабинет API старше .env", () => {
  it("заполненное поле админки бьёт пустой env", () => {
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

  it("чужой ключ не из каталога — не owned", () => {
    const got = valueFromApiConns([{ id: "novofon", enabled: true, fields: [{ key: "NOVOFON_SECRET", value: "x" }] }], "PORT");
    assert.equal(got.owned, false);
    assert.equal(got.value, "");
  });

  it("порядок в serverEnv: api-keys.json до process.env", () => {
    const src = readFileSync(new URL("./server-env.ts", import.meta.url), "utf8");
    const admin = src.indexOf("fromAdmin(key)");
    const dyn = src.indexOf("process?.env");
    assert.ok(admin >= 0 && dyn > admin);
  });
});
