import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { factsFromMessages, modeFromMessages, nextStepOf, takeWeekday } from "./agent-facts.ts";
import { asIdentifyHits, confirmedHit, confirmedFromHistory, identifyLocked } from "./agent-identify.ts";

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
    assert.match(chat, /lockedClientTurn/);
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

  it("после «да, это» не переспрашивать имя", () => {
    const msgs = [
      { role: "assistant", content: "Ольга: Вы уже занимаетесь у нас или подбираете впервые?" },
      { role: "user", content: "Мы уже ходим к вам" },
      { role: "assistant", content: "Ольга: Напишите телефон, который указывали при записи." },
      { role: "user", content: "89163389392" },
      { role: "assistant", content: "Ольга: Нашла на сайте: Александра. Это ваш ребёнок?" },
      { role: "user", content: "Да, это Александра" },
      { role: "assistant", content: "Ольга: Александра занимается в художественной школе. Чем помочь?" },
      { role: "user", content: "Нужна отработка пропуска" },
    ];
    const facts = factsFromMessages(msgs);
    assert.equal(facts.mode, "client");
    assert.equal(facts.identified, true);
    assert.equal(facts.intent, "отработка");
    assert.match(nextStepOf(facts), /не спрашивать|подтверждён|list_groups/i);
    assert.doesNotMatch(nextStepOf(facts), /подтвердить имя/);
    const hits = asIdentifyHits([{ crmId: 42, child: { first: "Александра", fio: "Александра" } }]);
    assert.equal(confirmedFromHistory(hits, msgs)?.customerId, 42);
    const locked = identifyLocked("olga", {
      phone: "89163389392",
      hits,
      identified: facts.identified,
      lastUser: "Нужна отработка пропуска",
      lastAssistant: "Ольга: Александра занимается в художественной школе. Чем помочь?",
    });
    assert.equal(locked, null);
  });

  it("суббота — день отработки, имя больше не спрашивать", () => {
    assert.equal(takeWeekday("суббота"), "суббота");
    assert.equal(takeWeekday("в субботу"), "суббота");
    const msgs = [
      { role: "user", content: "Мы уже ходим к вам" },
      { role: "assistant", content: "Ольга: Нашла на сайте: Александра. Это ваш ребёнок?" },
      { role: "user", content: "Да, это Александра" },
      { role: "user", content: "Нужна отработка пропуска" },
    ];
    const facts = factsFromMessages(msgs);
    assert.equal(facts.identified, true);
    assert.equal(facts.intent, "отработка");
    assert.equal(facts.day || "", "");
    assert.match(nextStepOf(facts), /день/);
    const chipsSrc = readFileSync(new URL("./agent-chips.ts", import.meta.url), "utf8");
    assert.match(chipsSrc, /WEEKDAY_CHIPS/);
    const sat = factsFromMessages([...msgs, { role: "user", content: "суббота" }]);
    assert.equal(takeWeekday("суббота"), "суббота");
    assert.equal(takeWeekday("в субботу"), "суббота");
    assert.equal(sat.day, "суббота");
    assert.match(nextStepOf(sat), /суббота/);
    assert.doesNotMatch(nextStepOf(sat), /подтвердить имя/);
  });

  it("двойное имя в реплике не рисует два пузыря", async () => {
    const { parseTurns } = await import("./agent-turns.ts");
    const turns = parseTurns("Ольга: Ольга: Нашла на сайте: Александра. Это ваш ребёнок?");
    assert.equal(turns.length, 1);
    assert.equal(turns[0].who, "olga");
    assert.match(turns[0].text, /^Нашла/);
  });

  it("пусто — не выдумывать карточку", () => {
    const locked = identifyLocked("oleg", { phone: "79160000000", hits: [] });
    assert.match(locked?.reply || "", /никого нет/);
  });
});
