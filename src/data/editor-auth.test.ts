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

  it("форма просит логин и пароль, cookie кабинета не открывает редактор", () => {
    const entry = readFileSync(new URL("../components/editor-entry.tsx", import.meta.url), "utf8");
    assert.match(entry, /Логин/);
    assert.match(entry, /Пароль/);
    assert.match(entry, /editorLogin/);
    assert.match(entry, /autoComplete="username"/);
    assert.doesNotMatch(entry, /unlockDebug/);
    assert.doesNotMatch(entry, /ra_admin/);
    const gate = readFileSync(new URL("../components/home-editor-gate.tsx", import.meta.url), "utf8");
    assert.match(gate, /ra_edit/);
    assert.match(gate, /EditorUnlock/);
    assert.doesNotMatch(gate, /ra_admin/);
    assert.doesNotMatch(gate, /unlockDebug/);
    const editor = readFileSync(new URL("../components/home-editor.tsx", import.meta.url), "utf8");
    assert.match(editor, /ra_edit/);
    assert.doesNotMatch(editor, /localStorage.getItem\("ra_admin"\)/);
  });
});
