import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allowedLessonType, emptyBookFlags, type BookSettings } from "./agent-book-kinds.ts";

function book(partial: Partial<BookSettings>): BookSettings {
  return { consultantCanBook: true, ...emptyBookFlags(true), ...partial };
}

describe("ассистент: прогноз ошибок после чистки", () => {
  it("мастер записи выключает все типы, без него trial живой", () => {
    assert.equal(allowedLessonType(book({ consultantCanBook: false, consultantCanBookTrial: true }), "trial"), false);
    assert.equal(allowedLessonType(book({ consultantCanBookTrial: false }), "trial"), false);
    assert.equal(allowedLessonType(book({ consultantCanBookTrial: true }), "trial"), true);
  });

  it("open_group больше не инструмент модели", () => {
    const chat = readFileSync(new URL("./agent-chat.ts", import.meta.url), "utf8");
    assert.equal(/name:\s*"open_group"/.test(chat), false);
    assert.match(chat, /book_lesson с lesson_type/);
    assert.doesNotMatch(chat, /Запись в группу — book_lesson lesson_type=group, не open_group/);
  });

  it("заводские шаги воронки помечены, карта обучения ≠ карта ID", () => {
    const cfg = readFileSync(new URL("./agent-config.ts", import.meta.url), "utf8");
    assert.match(cfg, /export const LOCKED_SCRIPT_IDS/);
    assert.match(cfg, /"age"/);
    const train = readFileSync(new URL("../components/admin-train.tsx", import.meta.url), "utf8");
    assert.match(train, /LOCKED_SCRIPT_IDS/);
    assert.match(train, /Карта обучения/);
    assert.match(train, /Базе знаний/);
    const win = readFileSync(new URL("../components/admin-agent.tsx", import.meta.url), "utf8");
    assert.match(win, /disabled=\{settings\.consultantCanBook === false\}/);
    assert.match(win, /offByDefault/);
  });

  it("промпт ролей не обещает два разных инструмента записи как разные пути", () => {
    const cfg = readFileSync(new URL("./agent-config.ts", import.meta.url), "utf8");
    assert.match(cfg, /book_lesson \(пробное = lesson_type=trial или submit_trial\)/);
    assert.doesNotMatch(cfg, /МОЖНО submit_trial и book_lesson"/);
  });
});
