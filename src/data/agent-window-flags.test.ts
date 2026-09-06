import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allowedLessonType, BOOK_TYPE_FLAGS, bookTypesPrompt, emptyBookFlags, type BookSettings } from "./agent-book-kinds.ts";

function book(partial: Partial<BookSettings>): BookSettings {
  return {
    consultantCanBook: true,
    ...emptyBookFlags(true),
    ...partial,
  };
}

describe("окно агента: права и типы занятий", () => {
  it("каждый тип Alfa — своя галочка, одно правило book_lesson", () => {
    const s = book({
      consultantCanBookTrial: true,
      consultantCanBookGroup: false,
      consultantCanBookOvertime: true,
      consultantCanBookIndividual: false,
      consultantCanBookMaster: true,
      consultantCanBookIntro: false,
    });
    assert.equal(allowedLessonType(s, "trial"), true);
    assert.equal(allowedLessonType(s, "intro"), false);
    assert.equal(allowedLessonType(s, "group"), false);
    assert.equal(allowedLessonType(s, "overtime"), true);
    assert.equal(allowedLessonType(s, "individual"), false);
    assert.equal(allowedLessonType(s, "master"), true);
    assert.equal(allowedLessonType(s, "мастер-класс"), true);
    assert.equal(allowedLessonType(book({ consultantCanBook: false, consultantCanBookTrial: true }), "trial"), false);
    assert.equal(BOOK_TYPE_FLAGS.length, 15);
    assert.match(bookTypesPrompt(s), /то же правило, что пробное/);
    assert.match(bookTypesPrompt(s), /Мастер-класс/);
  });

  it("старый сейв «прочие» раскладывается на отдельные типы", () => {
    const off = book({ consultantCanBookOther: false });
    delete (off as { consultantCanBookMaster?: boolean }).consultantCanBookMaster;
    assert.equal(allowedLessonType(off, "master"), false);
    assert.equal(allowedLessonType(off, "trial"), true);
  });

  it("старый journal раскладывается, skip и pause в окне раздельно", () => {
    const cfg = readFileSync(new URL("./agent-config.ts", import.meta.url), "utf8");
    assert.match(cfg, /function mergeAgentSettings/);
    assert.match(cfg, /incoming\.consultantCanSkip == null/);
    assert.match(cfg, /incoming\.consultantCanPause == null/);
    assert.match(cfg, /id: "consultantCanSkip"/);
    assert.match(cfg, /id: "consultantCanPause"/);
    assert.doesNotMatch(cfg, /id: "consultantCanJournal"/);
    assert.match(cfg, /consultantCanBookTrial/);
    assert.match(cfg, /consultantCanBookOther: flag/);
    assert.match(cfg, /BOOK_TYPE_FLAGS\.map/);
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
    assert.match(chat, /Повторить ответ/);
    assert.match(chat, /replayLast/);
    assert.match(chat, /Repeat2/);
    assert.match(chat, /agent-input-wink/);
    assert.match(chat, /needTypedText/);
    assert.match(chat, /AudioLines/);
    assert.equal(/voiceOn && uiOn\("allowVoice"\) \? null/.test(chat), false);
    assert.match(chat, /Включить перебивание/);
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
    assert.match(server, /completeClientAction/);
    assert.match(server, /impliedIdentify/);
    const voice = readFileSync(new URL("./schedule-voice.ts", import.meta.url), "utf8");
    assert.match(voice, /adminVoiceCanWrite/);
    assert.match(voice, /adminVoiceCanConsult/);
  });
});
