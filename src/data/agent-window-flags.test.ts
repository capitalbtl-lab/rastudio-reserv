import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allowedLessonType, BOOK_TYPE_FLAGS, bookTypesPrompt, type BookSettings } from "./agent-book-kinds.ts";

function book(partial: Partial<BookSettings>): BookSettings {
  return {
    consultantCanBook: true,
    consultantCanBookTrial: true,
    consultantCanBookGroup: true,
    consultantCanBookMakeup: true,
    consultantCanBookOvertime: true,
    consultantCanBookExtra: true,
    consultantCanBookIndividual: true,
    consultantCanBookOther: true,
    ...partial,
  };
}

describe("окно агента: права и типы занятий", () => {
  it("allowedLessonType смотрит галочку типа, не название", () => {
    const s = book({
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
    assert.equal(allowedLessonType(book({ consultantCanBook: false, consultantCanBookTrial: true }), "trial"), false);
    assert.match(bookTypesPrompt(s), /Пробное/);
    assert.match(bookTypesPrompt(s), /Запись в группу/);
    assert.equal(BOOK_TYPE_FLAGS.length, 7);
  });

  it("старый journal раскладывается, skip и pause в окне раздельно", () => {
    const cfg = readFileSync(new URL("./agent-config.ts", import.meta.url), "utf8");
    assert.match(cfg, /function mergeAgentSettings/);
    assert.match(cfg, /incoming\.consultantCanSkip == null/);
    assert.match(cfg, /incoming\.consultantCanPause == null/);
    assert.match(cfg, /id: "consultantCanSkip"/);
    assert.match(cfg, /id: "consultantCanPause"/);
    assert.doesNotMatch(cfg, /id: "consultantCanJournal"/);
    assert.match(cfg, /consultantCanBookTrial: flag/);
    assert.match(cfg, /consultantCanBookOther: flag/);
    const win = readFileSync(new URL("../components/admin-agent.tsx", import.meta.url), "utf8");
    assert.match(win, /BOOK_TYPE_FLAGS\.map/);
    assert.match(win, /ROLE_FLAGS\.map/);
    assert.match(win, /Какие занятия консультант ставит/);
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
    assert.match(chat, /agent-voice-loop/);
    assert.match(chat, /vadTick/);
    assert.match(chat, /bargeInterimReady/);
    assert.match(chat, /srShouldRestart/);
    const server = readFileSync(new URL("./agent-chat.ts", import.meta.url), "utf8");
    assert.match(server, /allowedLessonType/);
    assert.match(server, /consultantCanSkip === false/);
    assert.match(server, /consultantCanPause === false/);
    assert.match(server, /adminVoiceCanConsult/);
    assert.match(server, /teacher_id/);
    assert.match(server, /lockedClientTurn\(soloWho, facts,/);
    const voice = readFileSync(new URL("./schedule-voice.ts", import.meta.url), "utf8");
    assert.match(voice, /adminVoiceCanWrite/);
    assert.match(voice, /adminVoiceCanConsult/);
  });
});
