import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { factsFromMessages, identifiedFromMessages, takeWeekday } from "./agent-facts.ts";
import { slotsFromMessages, slotsFromText } from "./funnel-state.ts";
import { confirmedHit, confirmedFromHistory, identifyLocked, impliedIdentify } from "./agent-identify.ts";
import { bookingIdentity } from "./agent-booking-identity.ts";

const user = (content: string) => ({ role: "user", content });
const assistant = (content: string) => ({ role: "assistant", content });
const first = [user("Подбираем курс впервые"), user("8"), user("Коломна"), user("ЦМИТ")];
const children = [{ customerId: 42, first: "Маша", child: "Петрова Маша" }];
const client = [user("Мы уже ходим"), user("+79990000001"), assistant("Нашла Маша. Это ваш ребёнок?"), user("Да, это Маша")];

describe("память клиентского диалога", () => {
  it("возраст одной цифрой сохраняется после следующих ответов", () => {
    const facts = factsFromMessages(first);
    assert.equal(facts.age, 8);
    assert.equal(facts.branchId, 2);
  });
  it("уточнённый возраст одинаков в воронке и фактах", () => {
    const messages = [...first, user("Уточняю: ребёнку 10 лет")];
    assert.equal(factsFromMessages(messages).age, 10);
    assert.equal(slotsFromMessages(messages).age, 10);
  });
  it("смена города снимает филиал прежнего города", () => {
    const messages = [...first, user("Нет, удобнее Луховицы")];
    assert.deepEqual(slotsFromMessages(messages), { age: 8, city: "Луховицы", branchId: 3, branch: "Луховицы, Пушкина, 202А" });
    assert.equal(factsFromMessages(messages).branchId, 3);
    const back = [...messages, user("Всё-таки Коломна")];
    assert.equal(slotsFromMessages(back).branchId, undefined);
  });
  it("последний выбранный филиал заменяет первый", () => {
    assert.equal(slotsFromMessages([...first, user("Лучше Гражданская")]).branchId, 1);
    assert.equal(slotsFromText("Не Гражданская, лучше ЦМИТ").branchId, 2);
    assert.equal(slotsFromText("Не Луховицы, а Коломна").city, "Коломна");
    assert.equal(slotsFromText("ЦМИТ неудобен, лучше Луховицы").branchId, 3);
  });
  it("понимает возраст словами и не принимает телефон за возраст", () => {
    for (const [text, age] of [["Сыну восемь лет", 8], ["Дочери шестнадцать", 16], ["Семнадцать", 17], ["18", 18]] as const) {
      assert.equal(slotsFromText(text).age, age);
    }
    assert.equal(slotsFromText("+79990000001").age, undefined);
    assert.deepEqual(slotsFromText("+7 (202) 123-12-14"), {});
    assert.equal(slotsFromText("Ребёнку 8 лет, телефон +7 (999) 123-12-14").age, 8);
  });
  it("смена направления заменяет предыдущий выбор", () => {
    assert.equal(factsFromMessages([...first, user("Интересна робототехника"), user("Лучше художественная школа")]).school, "художественная школа");
  });
  it("новый телефон заменяет старый и требует нового подтверждения", () => {
    const messages = [...client, user("Другой телефон +79990000002")];
    assert.equal(factsFromMessages(messages).phone, "+79990000002");
    assert.equal(identifiedFromMessages(messages), false);
    assert.equal(confirmedFromHistory(children, messages), null);
    assert.equal(factsFromMessages([...client, user("Сейчас назову другой телефон")]).phone, undefined);
  });
  it("не берёт возраст ребёнка из вопроса ассистента", () => {
    const messages = [user("Подбираем впервые"), assistant("Восемь или девять лет ребёнку?")];
    assert.equal(factsFromMessages(messages).age, undefined);
  });
  it("второй ребёнок сохраняет свои имя и возраст после выбора направления", () => {
    const messages = [...client, user("Первому ребёнку 12 лет"), user("Хочу записать второго ребёнка"), user("Ему 6 лет"), assistant("Как зовут второго?"), user("Петя"), user("Интересна робототехника")];
    const facts = factsFromMessages(messages);
    assert.equal(facts.age, 6);
    assert.equal(facts.secondChild, "Петя");
    assert.equal(facts.child, "Маша");
    assert.equal(facts.parent, undefined);
    assert.equal(facts.school, "робототехника");
  });
  it("новому второму ребёнку не подставляет прежний возраст", () => {
    const facts = factsFromMessages([...client, user("Ребёнку 12 лет"), user("Хочу записать второго ребёнка")]);
    assert.equal(facts.age, undefined);
    assert.equal(facts.secondChild, undefined);
  });
  it("выбор пробного не теряет второго ребёнка и не возвращает в начало воронки", () => {
    const messages = [...client, user("Хочу записать второго ребёнка"), user("Ему 6 лет"), assistant("Как зовут второго?"), user("Петя"), user("Интересна робототехника")];
    for (const [choice, format] of [["Хочу пробное на ближайшем занятии группы", "group"], ["Хочу пробное в свободный день, дату согласуем", "free"]] as const) {
      const facts = factsFromMessages([...messages, user(choice), assistant("Выберите время"), user("В субботу")]);
      assert.equal(facts.mode, "client");
      assert.equal(facts.intent, "второй");
      assert.equal(facts.secondChild, "Петя");
      assert.equal(facts.age, 6);
      assert.equal(facts.secondTrial, format);
    }
  });
  it("заявка второго ребёнка использует его данные даже при ошибке модели", () => {
    const facts = { intent: "второй", secondChild: "Петя", age: 6, phone: "+79990000001" };
    const result = bookingIdentity(facts, { child: "Маша", age: 12, dob: "01.01.2014", phone: "+79990000002", gid: "123" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.args, { child: "Петя", age: 6, dob: "", phone: "+79990000001", gid: "123" });
    assert.equal(bookingIdentity({ ...facts, secondChild: undefined }, {}).ok, false);
    const fullName = bookingIdentity(facts, { child: "Иванов Петя" });
    assert.equal(fullName.ok && fullName.args.child, "Иванов Петя");
  });
  it("новая пауза и новая отработка не наследуют параметры завершённой заявки", () => {
    const pause = factsFromMessages([...client, user("Пауза на две недели"), assistant("Поставила паузу"), user("Спасибо"), user("Поставим занятия на паузу")]);
    assert.equal(pause.intent, "пауза");
    assert.equal(pause.pauseUntil, undefined);
    const makeup = factsFromMessages([...client, user("Нужна отработка на следующей неделе в субботу"), user("Спасибо"), user("Нужна отработка")]);
    assert.equal(makeup.makeupWeek, undefined);
    assert.equal(makeup.day, undefined);
  });
});

describe("подтверждение ребёнка", () => {
  it("отрицание имени не считается подтверждением", () => {
    for (const text of ["Нет, это не Маша", "Это не Маша", "Нет", "Неверно"]) {
      assert.equal(confirmedHit(children, text, "Нашла Маша. Это ваш ребёнок?"), null);
    }
  });
  it("имя Анна не совпадает с именем Жанна", () => {
    const hits = [{ customerId: 1, first: "Анна", child: "Иванова Анна" }, { customerId: 2, first: "Жанна", child: "Петрова Жанна" }];
    assert.equal(confirmedHit(hits, "Да, это Жанна", "Несколько детей")?.customerId, 2);
  });
  it("запрос услуги после отказа от имени не открывает отвергнутую карточку", () => {
    const messages = [...client, user("Нет, это не Маша"), assistant("Назовите другой телефон"), user("Нужна отработка")];
    assert.equal(confirmedFromHistory(children, messages), null);
    assert.equal(impliedIdentify(children, "Нужна отработка", false, messages), null);
    assert.equal(confirmedFromHistory(children, [...messages, user("Да, это Маша")])?.customerId, 42);
    const changed = [...client, user("Другой телефон +79990000002"), assistant("Нашла Петя. Это ваш ребёнок?"), user("Да, это Петя")];
    assert.equal(factsFromMessages(changed).child, "Петя");
  });
  it("одинаковые имена требуют полного имени, а кнопки различаются", () => {
    const hits = [{ customerId: 1, first: "Анна", child: "Иванова Анна" }, { customerId: 2, first: "Анна", child: "Петрова Анна" }];
    assert.equal(confirmedHit(hits, "Откройте карточку Анна", "Несколько детей"), null);
    assert.equal(confirmedHit(hits, "Откройте карточку Петрова Анна", "Несколько детей")?.customerId, 2);
    const lock = identifyLocked("olga", { phone: "+79990000001", hits });
    assert.notEqual(lock?.chips[0].send, lock?.chips[1].send);
  });
});

describe("уточнения после подтверждения клиента", () => {
  it("отказ от времени не закрывает уже подтверждённую карточку", () => {
    for (const answer of ["Нет, в воскресенье", "Это не то время", "Неверно, нужно позже"]) {
      const messages = [...client, user("Нужна отработка"), assistant("Подойдёт суббота?"), user(answer)];
      assert.equal(identifiedFromMessages(messages), true, answer);
      assert.equal(confirmedFromHistory(children, messages)?.customerId, 42, answer);
    }
    for (const confirmation of ["Да, это Маша", "Да", "Откройте карточку Петрова Маша"]) {
      const history = [...client.slice(0, -1), user(confirmation), assistant("Выбрать время позже?"), user("Да, нужно позже")];
      assert.equal(identifiedFromMessages(history), true);
      const denied = [...history, user("Нет, это не маша")];
      assert.equal(confirmedFromHistory(children, denied), null, confirmation);
      assert.equal(identifiedFromMessages(denied), false, confirmation);
    }
  });
  it("дата и год не превращаются в филиал или возраст ребёнка", () => {
    for (const text of ["Можно 17.10.2026 в 12:00", "Дата 2026-10-17", "Группа Роботы 2026", "gid=202", "Ребёнок родился 12.05.2020"]) {
      assert.deepEqual(slotsFromText(text), {}, text);
      assert.equal(slotsFromMessages([...first, user(text)]).branchId, 2, text);
    }
    assert.equal(slotsFromText("Ребёнку 8 лет, дата 2026-10-17").age, 8);
    assert.equal(slotsFromText("Пушкина 202").branchId, 3);
    assert.equal(slotsFromText("202А").branchId, 3);
  });
  it("при исправлении дня учитывает последний выбранный день", () => {
    assert.equal(takeWeekday("Не в субботу, лучше в воскресенье"), "воскресенье");
    assert.equal(takeWeekday("В воскресенье, не в субботу"), "воскресенье");
  });
  it("повторное упоминание отработки сохраняет неделю текущего запроса", () => {
    const messages = [...client, user("Нужна отработка"), user("На следующей неделе"), assistant("Какой день удобнее?"), user("Нужна отработка в воскресенье")];
    const facts = factsFromMessages(messages);
    assert.equal(facts.makeupWeek, "next");
    assert.equal(facts.day, "воскресенье");
    const fresh = factsFromMessages([...messages, user("Спасибо"), user("Нужна отработка")]);
    assert.equal(fresh.makeupWeek, undefined);
    assert.equal(fresh.day, undefined);
  });
  it("завершённая пауза не выполняется снова при следующем сообщении", () => {
    const messages = [...client, user("Пауза на две недели"), assistant("Ольга: Поставила паузу Маша до 2026-10-30. Когда вернуться — напишите, сниму."), user("Хорошо")];
    const facts = factsFromMessages(messages);
    assert.equal(facts.pauseUntil, undefined);
    assert.notEqual(facts.intent, "пауза");
    const next = factsFromMessages([...messages, user("Поставим занятия на паузу")]);
    assert.equal(next.intent, "пауза");
    assert.equal(next.pauseUntil, undefined);
  });
  it("полное имя второго ребёнка сохраняется при уточнении записи", () => {
    for (const name of ["Петя Иванов", "Иванов Пётр Сергеевич", "анна-мария петрова"]) {
      const messages = [...client, user("Хочу записать второго ребёнка"), user("Ему 6 лет"), assistant("Как зовут второго?"), user(name), user("Интересна робототехника"), user("Хочу записать второго ребёнка в группу")];
      const facts = factsFromMessages(messages);
      assert.equal(facts.secondChild?.toLowerCase(), name.toLowerCase());
      assert.equal(facts.age, 6);
      assert.equal(facts.school, "робототехника");
    }
  });
  it("дополненное ФИО второго ребёнка сохраняется при создании заявки", () => {
    const result = bookingIdentity({ intent: "второй", secondChild: "Иванов Пётр", age: 6, phone: "+79990000001" }, { child: "Иванов Пётр Сергеевич" });
    assert.equal(result.ok && result.args.child, "Иванов Пётр Сергеевич");
  });
});
