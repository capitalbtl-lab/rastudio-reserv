import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeAgentSettings } from "./agent-config.ts";
import { allowedLessonType, BOOK_TYPE_FLAGS, bookTypesPrompt } from "./agent-book-kinds.ts";

describe("окно агента: права и типы занятий", () => {
  it("старый сейв journal раскладывает skip и pause, типы занятий — от записи", () => {
    const off = mergeAgentSettings({ consultantCanJournal: false, consultantCanBook: false });
    assert.equal(off.consultantCanSkip, false);
    assert.equal(off.consultantCanPause, false);
    assert.equal(off.consultantCanBookTrial, false);
    const on = mergeAgentSettings({ consultantCanJournal: true });
    assert.equal(on.consultantCanSkip, true);
    assert.equal(on.consultantCanPause, true);
    assert.equal(on.consultantCanBookTrial, true);
    const split = mergeAgentSettings({ consultantCanSkip: true, consultantCanPause: false });
    assert.equal(split.consultantCanSkip, true);
    assert.equal(split.consultantCanPause, false);
    assert.equal(split.consultantCanJournal, true);
  });

  it("allowedLessonType смотрит галочку типа, не название", () => {
    const s = mergeAgentSettings({
      consultantCanBook: true,
      consultantCanBookTrial: true,
      consultantCanBookGroup: false,
      consultantCanBookOvertime: true,
      consultantCanBookIndividual: false,
      consultantCanBookOther: true,
    });
    assert.equal(allowedLessonType(s, "trial"), true);
    assert.equal(allowedLessonType(s, "intro"), true);
    assert.equal(allowedLessonType(s, "group"), false);
    assert.equal(allowedLessonType(s, "overtime"), true);
    assert.equal(allowedLessonType(s, "individual"), false);
    assert.equal(allowedLessonType(s, "master"), true);
    const locked = mergeAgentSettings({ consultantCanBook: false, consultantCanBookTrial: true });
    assert.equal(allowedLessonType(locked, "trial"), false);
    assert.match(bookTypesPrompt(s), /Пробное/);
    assert.match(bookTypesPrompt(s), /Запись в группу/);
    assert.equal(BOOK_TYPE_FLAGS.length, 7);
  });

  it("окно чата: сброс, Олег/Ольга, перебивание, ответы не стираются, озвучка", () => {
    const chat = readFileSync(new URL("../components/agent-chat.tsx", import.meta.url), "utf8");
    assert.match(chat, /Говорить с <\/span>Ольгой/);
    assert.match(chat, /Говорить с <\/span>Олегом/);
    assert.match(chat, /Сбросить диалог/);
    assert.match(chat, /allowReset/);
    assert.match(chat, /allowBarge/);
    assert.match(chat, /bargeRef\.current/);
    assert.match(chat, /interimResults = !!bargeRef/);
    assert.match(chat, /startVad/);
    assert.match(chat, /maybeSpeak/);
    assert.match(chat, /speakEveryReply/);
    assert.match(chat, /keepAssistantReplies/);
    assert.match(chat, /войти в административный режим/);
    assert.match(chat, /Включить голосовой режим/);
    assert.match(chat, /echoCancellation: true/);
    const win = readFileSync(new URL("../components/admin-agent.tsx", import.meta.url), "utf8");
    assert.match(win, /BOOK_TYPE_FLAGS\.map/);
    assert.match(win, /ROLE_FLAGS\.map/);
    assert.match(win, /Какие занятия консультант ставит/);
    const cfg = readFileSync(new URL("./agent-config.ts", import.meta.url), "utf8");
    assert.match(cfg, /id: "consultantCanSkip"/);
    assert.match(cfg, /id: "consultantCanPause"/);
    assert.doesNotMatch(cfg, /id: "consultantCanJournal"/);
    const server = readFileSync(new URL("./agent-chat.ts", import.meta.url), "utf8");
    assert.match(server, /allowedLessonType/);
    assert.match(server, /consultantCanSkip === false/);
    assert.match(server, /consultantCanPause === false/);
    assert.match(server, /adminVoiceCanConsult/);
    const voice = readFileSync(new URL("./schedule-voice.ts", import.meta.url), "utf8");
    assert.match(voice, /adminVoiceCanWrite/);
    assert.match(voice, /adminVoiceCanConsult/);
  });
});
