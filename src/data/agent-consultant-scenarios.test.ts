import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  factsFromMessages,
  identifiedFromMessages,
  modeFromMessages,
  nextStepOf,
  takeWeekday,
  talkFallback,
} from "./agent-facts.ts";
import { asIdentifyHits, confirmedFromHistory, identifyLocked, impliedIdentify } from "./agent-identify.ts";
import { lockedFunnelReply } from "./agent-funnel.ts";
import { pauseUntilIso, STUDIO_ADDR_SHORT, STUDIO_HOURS_SHORT, STUDIO_RULES_SHORT } from "./agent-client-desk-core.ts";

const alex = asIdentifyHits([{ crmId: 42, child: { first: "Александра", fio: "Александра" } }]);

function clientThread(...extra: { role: string; content: string }[]) {
  return [
    { role: "assistant", content: "Ольга: Вы уже занимаетесь у нас или подбираете впервые?" },
    { role: "user", content: "Мы уже ходим к вам" },
    { role: "assistant", content: "Ольга: Напишите телефон, который указывали при записи." },
    { role: "user", content: "89163389392" },
    { role: "assistant", content: "Ольга: Нашла на сайте: Александра. Это ваш ребёнок?" },
    ...extra,
  ];
}

describe("сценарии консультанта", () => {
  it("после «да, это Александра» имя не спрашивать, чипы — темы клиента", () => {
    const msgs = clientThread({ role: "user", content: "Да, это Александра" });
    const facts = factsFromMessages(msgs);
    assert.equal(facts.mode, "client");
    assert.equal(facts.identified, true);
    assert.equal(facts.child, "Александра");
    assert.equal(facts.intent || "", "");
    assert.doesNotMatch(nextStepOf(facts), /подтвердить имя/);
    assert.equal(identifyLocked("olga", { phone: facts.phone, hits: alex, identified: true }), null);
    const chipsSrc = readFileSync(new URL("./agent-chips.ts", import.meta.url), "utf8");
    assert.match(chipsSrc, /CLIENT_TOPICS/);
    assert.match(chipsSrc, /Отработка/);
    assert.match(chipsSrc, /Не придём/);
    assert.match(chipsSrc, /Пауза/);
  });

  it("услуга сразу после «нашла Александра» = подтверждение, не цикл имени", () => {
    const msgs = clientThread({ role: "user", content: "Нужна отработка пропуска" });
    assert.equal(identifiedFromMessages(msgs), true);
    assert.equal(impliedIdentify(alex, "Нужна отработка пропуска")?.customerId, 42);
    const facts = factsFromMessages(msgs);
    assert.equal(facts.identified, true);
    assert.equal(facts.intent, "отработка");
    assert.doesNotMatch(nextStepOf(facts), /подтвердить имя/);
    assert.match(nextStepOf(facts), /день отработки|Не предлагать пробное/);
    const chipsSrc = readFileSync(new URL("./agent-chips.ts", import.meta.url), "utf8");
    assert.match(chipsSrc, /facts\.intent === "отработка" && !facts\.day/);
    assert.match(chipsSrc, /WEEKDAY_CHIPS/);
  });

  it("суббота — отработка, не пробное", () => {
    const msgs = clientThread(
      { role: "user", content: "Да, это Александра" },
      { role: "assistant", content: "Ольга: Александра в карточке. Чем помочь?" },
      { role: "user", content: "Нужна отработка пропуска" },
      { role: "user", content: "в субботу" },
    );
    const facts = factsFromMessages(msgs);
    assert.equal(facts.identified, true);
    assert.equal(facts.intent, "отработка");
    assert.equal(facts.day, "суббота");
    assert.equal(takeWeekday("в субботу"), "суббота");
    assert.match(nextStepOf(facts), /суббота/);
    assert.doesNotMatch(nextStepOf(facts), /подтвердить имя|пробное занятие/i);
    assert.match(talkFallback("olga", facts), /Пробное не предлагаю/);
    const desk = readFileSync(new URL("./agent-client-desk.ts", import.meta.url), "utf8");
    assert.match(desk, /Пробное вместо отработки не ставлю/);
  });

  it("пропуск и пауза — разные намерения", () => {
    const skip = factsFromMessages(
      clientThread({ role: "user", content: "Да, это Александра" }, { role: "user", content: "Не сможем прийти на ближайшее занятие" }),
    );
    assert.equal(skip.intent, "пропуск");
    assert.notEqual(skip.intent, "пауза");
    const pause = factsFromMessages(
      clientThread({ role: "user", content: "Да, это Александра" }, { role: "user", content: "Поставим занятия на паузу" }),
    );
    assert.equal(pause.intent, "пауза");
    assert.match(nextStepOf(pause), /пауз/i);
    const until = factsFromMessages([
      ...clientThread({ role: "user", content: "Да, это Александра" }, { role: "user", content: "Поставим занятия на паузу" }),
      { role: "user", content: "Пауза на две недели" },
    ]);
    assert.equal(until.pauseUntil, "две недели");
    assert.equal(pauseUntilIso("две недели", new Date("2026-09-06T00:00:00Z")), "2026-09-20");
  });

  it("«спасибо, этого достаточно» не возвращает к пропуску и не спрашивает имя", () => {
    const msgs = clientThread(
      { role: "user", content: "Да, это Александра" },
      { role: "user", content: "Не сможем прийти на ближайшее занятие" },
      { role: "user", content: "Да, отметьте пропуск ближайшего занятия" },
      { role: "assistant", content: "Ольга: Отметила пропуск Александра. Нужна отработка?" },
      { role: "user", content: "Спасибо, этого достаточно" },
    );
    const facts = factsFromMessages(msgs);
    assert.equal(facts.identified, true);
    assert.equal(facts.intent, "готово");
    assert.doesNotMatch(nextStepOf(facts), /подтвердить имя|note_skip/);
    assert.match(talkFallback("olga", facts), /Хорошо/);
  });

  it("второй ребёнок: возраст один раз, карточку первого не трогать", () => {
    const base = clientThread({ role: "user", content: "Да, это Александра" }, { role: "user", content: "Хочу записать второго ребёнка на пробное" });
    const ask = factsFromMessages(base);
    assert.equal(ask.intent, "второй");
    assert.equal(ask.age || 0, 0);
    assert.match(nextStepOf(ask), /возраст второго/);
    const aged = factsFromMessages([...base, { role: "user", content: "Второму ребёнку 8 лет" }]);
    assert.equal(aged.age, 8);
    assert.match(nextStepOf(aged), /имя второго/);
    assert.doesNotMatch(nextStepOf(aged), /Спросить возраст второго/);
    const named = factsFromMessages([
      ...base,
      { role: "user", content: "Второму ребёнку 8 лет" },
      { role: "user", content: "Зовут Маша" },
    ]);
    assert.equal(named.secondChild, "Маша");
    assert.equal(named.child, "Александра");
    assert.match(nextStepOf(named), /Пробное на телефон/);
  });

  it("привет на развилке — озвучить кнопки, не молчать", () => {
    const fork = [{ role: "assistant", content: "Ольга: Здравствуйте. Я Ольга, студия «Развивайся». Вы уже занимаетесь у нас или подбираете впервые?" }];
    const hit = lockedFunnelReply("olga", [...fork, { role: "user", content: "Привет" }], true);
    assert.match(hit?.reply || "", /уже ходим/i);
    assert.match(hit?.reply || "", /правил/i);
    assert.equal(modeFromMessages([...fork, { role: "user", content: "Привет" }]), "fork");
    assert.match(talkFallback("olga", factsFromMessages([...fork, { role: "user", content: "Привет" }])), /уже ходим/i);
  });

  it("развилка: правила, часы, адрес — без возраста", () => {
    const fork = [{ role: "assistant", content: "Ольга: Вы уже занимаетесь у нас или подбираете впервые?" }];
    const rules = lockedFunnelReply("olga", [...fork, { role: "user", content: "Расскажите правила оказания услуг и цены" }]);
    assert.match(rules?.reply || "", /Отработка/);
    assert.match(rules?.reply || "", /подбираете впервые/);
    assert.equal(factsFromMessages([...fork, { role: "user", content: "Расскажите правила оказания услуг и цены" }]).mode, "fork");
    const hours = lockedFunnelReply("olga", [...fork, { role: "user", content: "Когда вы работаете?" }]);
    assert.match(hours?.reply || "", /10:00–19:00|по расписанию/i);
    const addr = lockedFunnelReply("olga", [...fork, { role: "user", content: "Где вы находитесь?" }]);
    assert.match(addr?.reply || "", /Октябрьской|Гражданская|Пушкина/);
    assert.match(STUDIO_RULES_SHORT, /Пауза/);
    assert.match(STUDIO_HOURS_SHORT, /ЦМИТ/);
    assert.match(STUDIO_ADDR_SHORT, /511-34-01/);
  });

  it("новый набор — возраст, не имя клиента", () => {
    const msgs = [
      { role: "assistant", content: "Ольга: Вы уже занимаетесь у нас или подбираете впервые?" },
      { role: "user", content: "Подбираем курс впервые" },
    ];
    assert.equal(modeFromMessages(msgs), "new");
    assert.match(nextStepOf(factsFromMessages(msgs)), /возраст|лет/);
    const age = factsFromMessages([...msgs, { role: "user", content: "Ребёнку 8 лет" }]);
    assert.equal(age.age, 8);
    assert.match(nextStepOf(age), /Коломна или Луховицы/);
    const asked = [
      ...msgs,
      { role: "assistant", content: "Ольга: Скажите, сколько лет ребёнку — сразу подберу то, что зайдёт именно ему." },
      { role: "user", content: "ещё не знаю" },
    ];
    const again = lockedFunnelReply("olga", asked, true);
    assert.match(again?.reply || "", /скажите или напишите возраст или нажмите кнопку/i);
    assert.doesNotMatch(again?.reply || "", /цифрой/);
  });

  it("телефон 10 цифр и «конечно» подтверждают карточку", () => {
    const ten = factsFromMessages([
      { role: "user", content: "Мы уже ходим к вам" },
      { role: "user", content: "9163389392" },
    ]);
    assert.match(ten.phone || "", /79163389392/);
    const hit = confirmedFromHistory(alex, [
      { role: "assistant", content: "Ольга: Нашла на сайте: Александра. Это ваш ребёнок?" },
      { role: "user", content: "конечно" },
    ]);
    assert.equal(hit?.customerId, 42);
    const da = confirmedFromHistory(alex, [
      { role: "assistant", content: "Ольга: Нашла на сайте: Александра. Это ваш ребёнок?" },
      { role: "user", content: "да" },
    ]);
    assert.equal(da?.customerId, 42);
  });

  it("стол: пропуск, пауза, teacher_id, второй не зациклен", () => {
    const desk = readFileSync(new URL("./agent-client-desk.ts", import.meta.url), "utf8");
    assert.match(desk, /completeClientAction/);
    assert.match(desk, /facts\.intent === "пауза" && facts\.pauseUntil/);
    assert.match(desk, /facts\.wantsSkip/);
    assert.match(desk, /teacher_id=/);
    assert.match(desk, /if \(!facts\.age\)/);
    assert.match(desk, /if \(!facts\.secondChild\)/);
    assert.match(desk, /Пробное вместо отработки не ставлю/);
    assert.match(desk, /intent === "готово"/);
    const chat = readFileSync(new URL("./agent-chat.ts", import.meta.url), "utf8");
    assert.match(chat, /talkFallback/);
    assert.match(chat, /impliedIdentify/);
    assert.match(chat, /completeClientAction/);
    assert.doesNotMatch(chat, /Повторите, пожалуйста — я на связи/);
  });

  it("абонемент — шаблоны tariffId, не имя; переигровка голоса", () => {
    const desk = readFileSync(new URL("./agent-client-desk.ts", import.meta.url), "utf8");
    assert.match(desk, /intent === "абонемент"/);
    assert.match(desk, /tariffsForClient/);
    assert.match(desk, /Повесьте абонемент tariff_id=/);
    assert.match(desk, /consultantCanTariff === false/);
    assert.match(desk, /applyClientTariff/);
    assert.doesNotMatch(desk, /похожее название абонемента/);
    const ui = readFileSync(new URL("../components/agent-chat.tsx", import.meta.url), "utf8");
    assert.match(ui, /Повторить ответ/);
    assert.match(ui, /async function replayLast/);
    assert.match(ui, /await speak\(last\)/);
  });
});
