import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  appendTurn,
  asHookChannel,
  greetingFor,
  maxKeyboard,
  parseHook,
  publicReply,
  threadId,
  vkKeyboard,
  duplicateTurn,
} from "./agent-inbox-core.ts";

describe("разбор входящих каналов", () => {
  it("вк confirmation и message_new", () => {
    const confirm = parseHook("vk", { type: "confirmation", group_id: 1 });
    assert.equal(confirm?.kind, "confirm");
    const msg = parseHook("vkontakte", {
      type: "message_new",
      object: { message: { from_id: 55, text: "Уже ходим", payload: JSON.stringify({ send: "Мы уже ходим к вам" }) } },
    });
    assert.equal(msg?.channel, "vk");
    assert.equal(msg?.peerId, "55");
    assert.equal(msg?.kind, "message");
    assert.equal(msg?.text, "Уже ходим");
  });

  it("max message_created, bot_started, callback", () => {
    const start = parseHook("max", { update_type: "bot_started", user: { user_id: 9 } });
    assert.equal(start?.kind, "start");
    assert.equal(start?.peerId, "9");
    const created = parseHook("max", {
      update_type: "message_created",
      message: { sender: { user_id: 9 }, body: { text: "Подбираем курс впервые" } },
    });
    assert.equal(created?.kind, "message");
    assert.equal(created?.text, "Подбираем курс впервые");
    const nested = parseHook("max", {
      update: {
        update_type: "message_callback",
        callback: { payload: "Расписание" },
        message: { recipient: { user_id: 3 } },
      },
    });
    assert.equal(nested?.peerId, "3");
    assert.equal(nested?.text, "Расписание");
  });

  it("novofon sms и старт звонка с телефоном, без «уже ходим»", () => {
    const sms = parseHook("phone", { event: "SMS", caller_id: "89161234567", text: "Когда занятие?" });
    assert.equal(sms?.channel, "phone");
    assert.equal(sms?.phone, "79161234567");
    assert.equal(sms?.kind, "message");
    const start = parseHook("novofon", { event: "NOTIFY_START", caller_id: "9161234567", called_did: "78005113401" });
    assert.equal(start?.kind, "start");
    assert.equal(start?.phone, "79161234567");
    assert.match(start?.text || "", /Телефон 79161234567/);
    assert.doesNotMatch(start?.text || "", /уже ходим/);
  });

  it("публичный ответ без «Ольга:», клавиатуры, тред", () => {
    assert.equal(publicReply("Ольга: Добрый день"), "Добрый день");
    assert.equal(asHookChannel("ВК"), "vk");
    assert.equal(threadId("vk", "55"), "vk:55");
    const vk = vkKeyboard([{ label: "Уже ходим", send: "Мы уже ходим к вам" }]);
    assert.equal(vk?.one_time, true);
    assert.equal(vk?.buttons[0][0].action.type, "text");
    const max = maxKeyboard([{ label: "Сайт", href: "https://www.rastudio.org" }]);
    assert.equal(max?.[0].payload.buttons[0][0].type, "link");
    const cb = maxKeyboard([{ label: "Уже ходим", send: "Мы уже ходим к вам" }]);
    assert.equal(cb?.[0].payload.buttons[0][0].type, "callback");
    const greet = greetingFor("vk", "olga");
    assert.match(greet, /уже занимаетесь у нас или подбираете впервые/);
    const thread = appendTurn({ id: "vk:1", channel: "vk", peerId: "1", messages: [], at: new Date().toISOString() }, "привет", "Ольга: да");
    assert.equal(thread.messages.length, 2);
    assert.equal(duplicateTurn(thread, "привет"), true);
  });
});
