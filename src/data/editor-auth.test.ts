import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkEditorLogin, defaultEditorLogin } from "./editor-auth.ts";

describe("вход в редактор", () => {
  it("пустой и чужой логин не пускает", () => {
    assert.equal(checkEditorLogin("", ""), false);
    assert.equal(checkEditorLogin("nope", "nope"), false);
    assert.ok(defaultEditorLogin().length >= 2);
  });

  it("форма просит логин и пароль, гость не тянет серверный fn", () => {
    const unlock = readFileSync(new URL("../components/editor-unlock.tsx", import.meta.url), "utf8");
    assert.match(unlock, /Логин/);
    assert.match(unlock, /Пароль/);
    assert.match(unlock, /import\("@\/data\/editor-auth-fn"\)/);
    assert.doesNotMatch(unlock, /from "@\/data\/editor-auth-fn"/);
    assert.doesNotMatch(unlock, /ra_admin/);
    const entry = readFileSync(new URL("../components/editor-entry.tsx", import.meta.url), "utf8");
    assert.match(entry, /Редактор/);
    assert.match(entry, /\?edit=1/);
    assert.doesNotMatch(entry, /editor-auth-fn/);
    assert.doesNotMatch(entry, /ra_admin/);
    const gate = readFileSync(new URL("../components/home-editor-gate.tsx", import.meta.url), "utf8");
    assert.match(gate, /ra_edit/);
    assert.match(gate, /import\("@\/components\/editor-unlock"\)/);
    assert.doesNotMatch(gate, /from "@\/components\/editor-unlock"/);
    assert.doesNotMatch(gate, /editor-auth-fn/);
    const footer = readFileSync(new URL("../components/site-footer.tsx", import.meta.url), "utf8");
    assert.match(footer, /EditorEntry/);
    assert.doesNotMatch(footer, /editor-auth-fn/);
  });
});
