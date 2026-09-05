import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { factsFromMessages, modeFromMessages, nextStepOf } from "./agent-facts.ts";
import { asIdentifyHits, confirmedHit, identifyLocked } from "./agent-identify.ts";

describe("развилка новый / уже ходим", () => {
  it("приветствие не спрашивает возраст", () => {
    const msgs = [{ role: "assistant", content: "Ольга: Здравствуйте. Вы уже занимаетесь у нас или подбираете впервые?" }];
    assert.equal(modeFromMessages(msgs), "fork");
    assert.match(nextStepOf(factsFromMessages(msgs)), /впервые|уже занимаетесь/);
    const greet = readFileSync(new URL("../components/agent-chat.tsx", import.meta.url), "utf8");
    assert.match(greet, /уже занимаетесь у нас или подбираете впервые/);
    assert.doesNotMatch(greet, /Сколько лет ребёнку\?/);
    const chips = readFileSync(new URL("./agent-chips.ts", import.meta.url), "utf8");
    assert.match(chips, /Уже ходим/);
    assert.match(chips, /Подбираем впервые/);
    assert.match(chips, /CLIENT_TOPICS/);
    assert.match(chips, /Пауза/);
    const inbox = readFileSync(new URL("./agent-inbox.ts", import.meta.url), "utf8");
    assert.match(inbox, /handleWebhook/);
    assert.match(inbox, /sendChannel/);
    assert.match(inbox, /chatAgent/);
    const funnel = readFileSync(new URL("./agent-funnel.ts", import.meta.url), "utf8");
    assert.match(funnel, /mode === "fork"/);
    assert.match(funnel, /mode === "client"/);
  });

  it("впервые — шаг возраста", () => {
    const msgs = [
      { role: "assistant", content: "Ольга: Вы уже занимаетесь у нас или подбираете впервые?" },
      { role: "user", content: "Подбираем курс впервые" },
    ];
    assert.equal(modeFromMessages(msgs), "new");
    assert.match(nextStepOf(factsFromMessages(msgs)), /возраст|лет/);
  });

  it("уже ходим — телефон, не возраст", () => {
    const msgs = [
      { role: "assistant", content: "Ольга: Вы уже занимаетесь у нас или подбираете впервые?" },
      { role: "user", content: "Мы уже ходим к вам" },
    ];
    assert.equal(modeFromMessages(msgs), "client");
    const step = nextStepOf(factsFromMessages(msgs));
    assert.match(step, /телефон/);
    assert.doesNotMatch(step, /спросить ТОЛЬКО возраст/);
  });

  it("после «уже ходим» можно перейти к «впервые»", () => {
    const msgs = [
      { role: "user", content: "Телефон 79161234567" },
      { role: "assistant", content: "Ольга: Вы уже занимаетесь у нас или подбираете впервые?" },
      { role: "user", content: "Мы уже ходим к вам" },
      { role: "user", content: "Подбираем курс впервые" },
    ];
    assert.equal(modeFromMessages(msgs), "new");
  });

  it("карточка только после подтверждения имени", () => {
    const chat = readFileSync(new URL("./agent-chat.ts", import.meta.url), "utf8");
    assert.match(chat, /identifyLocked/);
    assert.match(chat, /facts.identified && facts.customerId/);
    assert.match(chat, /dossiersByPhone/);
    assert.match(chat, /fromMessenger/);
    assert.match(chat, /channelId === "phone"/);
  });
});

describe("вход по телефону с диска", () => {
  it("один ребёнок — спросить подтверждение, не отдавать карточку", () => {
    const hits = asIdentifyHits([{ crmId: 11, child: { fio: "Иванов Петя", first: "Петя" } }]);
    const locked = identifyLocked("olga", { phone: "79161234567", hits });
    assert.match(locked?.reply || "", /Петя/);
    assert.ok(locked?.chips.some((c) => /Петя/.test(c.label)));
  });

  it("да — это тот ребёнок", () => {
    const hits = asIdentifyHits([{ crmId: 11, child: { first: "Петя", fio: "Иванов Петя" } }]);
    const hit = confirmedHit(hits, "Да, это Петя", "Нашла на сайте: Петя. Это ваш ребёнок?");
    assert.equal(hit?.customerId, 11);
  });

  it("пусто — не выдумывать карточку", () => {
    const locked = identifyLocked("oleg", { phone: "79160000000", hits: [] });
    assert.match(locked?.reply || "", /никого нет/);
  });
});
