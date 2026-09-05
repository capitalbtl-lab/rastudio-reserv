import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyCmsPatch, editOf, fieldForPath, hydrateEdits, pageEdit, resolveField } from "./edits-core.ts";

describe("правки сайта", () => {
  it("поле по-русски и с главной не путает hero с курсом", () => {
    assert.equal(resolveField("заголовок"), "h1");
    assert.equal(resolveField("о курсе"), "about");
    assert.equal(resolveField("почему сейчас"), "why");
    assert.equal(resolveField("текст под заголовком"), "hero_text");
    assert.equal(resolveField("программа"), null);
    assert.equal(resolveField("xyz"), null);
    assert.equal(fieldForPath("/", "h1"), "hero_title");
    assert.equal(fieldForPath("/", "description"), "hero_text");
    assert.equal(fieldForPath("/art-studio", "hero_title"), "h1");
    assert.equal(fieldForPath("/art-studio", "about"), "about");
  });

  it("старый h1 на главной читается как hero, путь и decoded не теряются", () => {
    hydrateEdits({
      "/": { h1: "Было в h1" },
      "/art-studio": { h1: "Студия" },
    });
    assert.equal(pageEdit("/").hero_title, "Было в h1");
    assert.equal(editOf({ "/art-studio": { h1: "Студия" } }, "/art-studio%20x", "/art-studio").h1, "Студия");
  });

  it("описание курса не затирает программу", () => {
    const next = applyCmsPatch(
      { name: "Курс", aboutLead: "лид", aboutBody: "тело", program: "блок программы" },
      { h1: "Новое имя", description: "новый лид" },
    );
    assert.equal(next.name, "Новое имя");
    assert.equal(next.aboutLead, "новый лид");
    assert.equal(next.program, "блок программы");
  });

  it("вкладка не дублирует заголовок, голос умеет сбросить страницу", () => {
    const ui = readFileSync(new URL("../components/admin-voice-edits.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(ui, /Изменение сайта голосом/);
    assert.match(ui, /Править/);
    assert.match(ui, /Вернуть страницу/);
    const chat = readFileSync(new URL("./agent-chat.ts", import.meta.url), "utf8");
    assert.match(chat, /clear_site_page/);
    assert.match(chat, /заголовок \| описание/);
  });
});
