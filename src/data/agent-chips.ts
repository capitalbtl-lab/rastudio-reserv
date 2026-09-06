import { SITE } from "@/data/site";
import { courseHint } from "@/data/agent-courses";
import { factsFromMessages, modeFromMessages, WEEKDAY_CHIPS } from "./agent-facts";
import { nextSlot, slotsFromMessages } from "@/data/funnel-state";
import { summerSeason } from "@/data/agent-playbook";

export type AgentChip = {
  label: string;
  send?: string;
  href?: string;
  primary?: boolean;
  note?: string;
};

const FORK: AgentChip[] = [
  { label: "Уже ходим", send: "Мы уже ходим к вам" },
  { label: "Подбираем впервые", send: "Подбираем курс впервые", primary: true },
  { label: "Правила и цены", send: "Расскажите правила оказания услуг и цены" },
];

export const CLIENT_TOPICS: AgentChip[] = [
  { label: "Расписание", send: "Когда следующее занятие?", primary: true },
  { label: "Отработка", send: "Нужна отработка пропуска" },
  { label: "Не придём", send: "Не сможем прийти на ближайшее занятие" },
  { label: "Пауза", send: "Поставим занятия на паузу" },
  { label: "Абонемент", send: "Что с абонементом и остатком" },
  { label: "Правила", send: "Расскажите правила оказания услуг" },
  { label: "Второму ребёнку", send: "Хочу записать второго ребёнка на пробное" },
  { label: "Другое занятие", send: "Нужно индивидуальное или дополнительное занятие у педагога" },
];

const AGES: AgentChip[] = [
  { label: "3–4 года", send: "Ребёнку 4 года" },
  { label: "5–6 лет", send: "Ребёнку 6 лет" },
  { label: "7–9 лет", send: "Ребёнку 8 лет" },
  { label: "10–14 лет", send: "Ребёнку 12 лет" },
  { label: "15+", send: "Ребёнку 15 лет" },
];

const CITIES: AgentChip[] = [
  { label: "Коломна", send: "Нас интересует Коломна" },
  { label: "Луховицы", send: "Нас интересуют Луховицы" },
];

const KOLOMNA: AgentChip[] = [
  { label: "ЦМИТ · Октябрьской, 340", send: "Удобен филиал ЦМИТ на Октябрьской революции, 340" },
  { label: "Гражданская, 2", send: "Удобен филиал на Гражданской, 2" },
];

const TRIAL: AgentChip[] = [
  { label: "Пробное в группе", send: "Хочу пробное на ближайшем занятии группы", primary: true },
  { label: "Пробное в свободный день", send: "Хочу пробное в свободный день, дату согласуем" },
  { label: "Сразу в группу", send: "Хочу сразу в действующую группу" },
];

function scheduleOffer(groups: AgentChip[]): { hint: string; chips: AgentChip[]; after?: string } | null {
  if (!groups.length) return null;
  const slots = groups.filter((c) => /gid=/i.test(c.send || ""));
  if (!slots.length) return { hint: "Группы", chips: groups };
  const makeup = slots.some((c) => /отработк/i.test(c.send || ""));
  return {
    hint: makeup ? "Слоты отработки" : "Расписание",
    chips: groups,
    after: makeup ? "Выберите слот — поставлю отработку." : "Выберите удобное время, и я запишу вас в группу.",
  };
}

function schoolsFor(age?: number): AgentChip[] {
  const y = age || 8;
  const out: AgentChip[] = [];
  if (y <= 6) out.push({ label: "Раннее развитие", send: "Интересна школа раннего развития" });
  out.push({ label: "Художественная", send: "Интересна художественная школа" });
  if (y >= 5) out.push({ label: "Робототехника", send: "Интересна школа робототехники" });
  if (y >= 5) out.push({ label: "Программирование", send: "Интересна школа программирования" });
  if (y >= 5) out.push({ label: "Науки и инженерия", send: "Интересна школа наук и инженерии" });
  if (y >= 9) out.push({ label: "Модельная", send: "Интересна модельная школа" });
  if (y >= 7) out.push({ label: "Языки", send: "Интересна школа иностранных языков" });
  out.push({ label: "Мастер-классы", send: "Интересны мастер-классы" });
  if (summerSeason()) out.push({ label: "Летние программы", send: "Интересны летние программы" });
  return out;
}

/** Кнопки строго под последнюю фразу ассистента. Не показываем возраст, если в тексте не спрашивают возраст. */
export function chipsForReply(
  last: string,
  messages: { role: string; content: string }[],
  groups: AgentChip[] = [],
): { hint: string; chips: AgentChip[]; after?: string } {
  const t = last.toLowerCase();
  if (!t.trim()) return { hint: "", chips: [] };
  if (/кодовое слово/.test(t)) return { hint: "Назовите кодовое слово", chips: [] };
  const mode = modeFromMessages(messages);
  const facts = factsFromMessages(messages);
  if (mode === "fork") {
    if (/правил|цен[аыу]|оферт/.test(t)) {
      return { hint: "Дальше", chips: FORK };
    }
    return { hint: "С чего начнём", chips: FORK };
  }
  if (mode === "client") {
    if (facts.identified) {
      if (facts.intent === "отработка" && !facts.day) {
        return { hint: "День отработки", chips: WEEKDAY_CHIPS };
      }
      if (facts.intent === "пауза" && !facts.pauseUntil) {
        return {
          hint: "Срок паузы",
          chips: [
            { label: "Неделя", send: "Пауза на неделю" },
            { label: "Две недели", send: "Пауза на две недели", primary: true },
            { label: "Месяц", send: "Пауза на месяц" },
          ],
        };
      }
      if (facts.intent === "пропуск" && !facts.wantsSkip) {
        if (/другую дату|другая дата/i.test(t) || (!facts.day && /другую дату/i.test(messages.filter((m) => m.role === "user").slice(-1)[0]?.content || ""))) {
          return { hint: "День пропуска", chips: WEEKDAY_CHIPS };
        }
        return {
          hint: "Отметить пропуск",
          chips: [
            { label: "Да, отметить", send: "Да, отметьте пропуск ближайшего занятия", primary: true },
            { label: "Другая дата", send: "Пропуск в другую дату" },
          ],
        };
      }
      if (facts.intent === "второй") {
        if (!facts.age) {
          return {
            hint: "Возраст второго",
            chips: AGES.map((c) => ({ ...c, send: String(c.send || "").replace("Ребёнку", "Второму ребёнку") })),
          };
        }
        if (!facts.secondChild) {
          return { hint: "Имя второго", chips: [] };
        }
        return { hint: "Направление второго", chips: schoolsFor(facts.age) };
      }
      if (facts.intent === "готово") {
        return { hint: "Если понадобится", chips: CLIENT_TOPICS };
      }
      if ((facts.intent === "индивидуальное" || facts.intent === "сверхурочное" || facts.intent === "дополнительное") && !facts.day) {
        return { hint: "День занятия", chips: WEEKDAY_CHIPS };
      }
      const slots = scheduleOffer(groups);
      if (slots) return slots;
      return { hint: "Что нужно", chips: CLIENT_TOPICS };
    }
    if (/телефон|по нему открою/.test(t)) {
      return { hint: "Телефон записи", chips: [] };
    }
    if (/это ваш|нашл|несколько детей/.test(t)) {
      return { hint: "Это ваш ребёнок?", chips: groups.length ? groups : [] };
    }
    if (/карточк|абонемент|занят|отработк|не прид/.test(t)) {
      return { hint: "Что нужно", chips: CLIENT_TOPICS };
    }
    return { hint: "Телефон записи", chips: [] };
  }
  if (/заявк|записал|принял заявку|готово, заявк/.test(t)) {
    return {
      hint: "Полезно сразу",
      chips: [
        { label: "Личный кабинет", href: SITE.cabinet, primary: true },
        { label: "Расписание", href: "/schedule" },
        { label: "Написать в Telegram", href: SITE.telegram },
      ],
    };
  }
  if (/здравствуйте|сколько лет ребёнк|подберу программу|проконсультирую/.test(t) && !slotsFromMessages(messages).age) {
    return mode === "new" ? { hint: "Скажите или нажмите", chips: AGES } : { hint: "С чего начнём", chips: FORK };
  }
  if (/сколько.{0,28}лет|возраст|цифрой или кнопк|кнопки ниже|скажите или напишите/.test(t)) {
    return { hint: "Скажите или нажмите", chips: AGES };
  }
  if (/коломна или луховиц|удобнее коломн/.test(t)) {
    return { hint: "Город", chips: CITIES };
  }
  const listed = scheduleOffer(groups);
  if (listed && /групп|расписан|слот|ближайш|запишу вас в группу|есть несколько|пробн|запис/.test(t)) {
    return listed;
  }
  if (/какой ближе|цмит или гражданск|два адреса|филиал ближе|удобен филиал/.test(t)) {
    return { hint: "Филиал", chips: KOLOMNA };
  }
  if (listed) return listed;
  if (/пробн|сразу в групп|запис/.test(t)) {
    const page = courseHint(messages.map((m) => m.content).slice(-6).join(" "));
    return { hint: "Запись", chips: [...TRIAL, ...(page ? [{ label: "Подробнее о курсе", href: page.path }] : [])] };
  }
  if (/подробнее или сразу|рассказать подробнее|сразу на пробное/.test(t)) {
    return {
      hint: "",
      chips: [
        { label: "Подробнее", send: "Расскажите подробнее, чем занимаются на уроке" },
        { label: "Сразу пробное", send: "Давайте сразу на пробное занятие", primary: true },
      ],
    };
  }
  if (/мастерить руками или рисовать|творчеств.{0,12}или.{0,12}техник/.test(t)) {
    return {
      hint: "Что ближе",
      chips: [
        { label: "Творчество", send: "Ближе творчество и рисовать" },
        { label: "Техника", send: "Ближе техника, роботы и мастерить" },
      ],
    };
  }
  const slots = slotsFromMessages(messages);
  const allSchools = schoolsFor(slots.age);
  const named = allSchools.filter((c) => {
    const key = c.label.toLowerCase();
    return t.includes(key) || (c.send && t.includes(c.send.toLowerCase().replace("интересна ", "").replace("интересны ", "")));
  });
  if (named.length >= 2) return { hint: "Направление", chips: named };
  if (/школ|направлен|что ближе|чем заняться|рисова|робот|программир|раннее развитие|подготовка к школе|художка|инженер/.test(t) && !facts.school) {
    return { hint: "Направление", chips: allSchools };
  }
  if (/понятно|к записи|рассказать подробнее/.test(t)) {
    return { hint: "", chips: [{ label: "Понятно, к записи", send: "Понятно. Давайте к пробному или в группу", primary: true }] };
  }
  return { hint: "", chips: [] };
}

export function nextChips(messages: { role: string; content: string }[], groups: AgentChip[] = []) {
  const last = [...messages].reverse().find((m) => m.role === "assistant")?.content || "";
  const fromText = chipsForReply(last, messages, groups);
  if (fromText.chips.length) return fromText;
  const open = nextSlot(slotsFromMessages(messages));
  if (open === "age" && /лет|возраст/.test(last)) return { hint: "Скажите или нажмите", chips: AGES };
  return { hint: fromText.hint || "", chips: [] as AgentChip[] };
}

/** Поле ввода нужно, когда ответ нельзя выбрать кнопкой: телефон, имя, код. */
export function needTypedText(last: string, chips: { label?: string }[] = []) {
  const t = String(last || "").toLowerCase();
  if (/кодовое слово/.test(t)) return true;
  if (/напишите телефон|телефон, который указывали|по нему открою/.test(t)) return true;
  if (/имя второго|как зовут|напишите имя|назовите имя/.test(t)) return true;
  if (chips.length) return false;
  if (/напишите|назовите|введите/.test(t) && !/нажмите кнопку|или нажмите/.test(t)) return true;
  return false;
}

export function typedPrompt(last: string) {
  const t = String(last || "").toLowerCase();
  if (/телефон/.test(t)) return "Напишите телефон";
  if (/кодовое/.test(t)) return "Кодовое слово";
  if (/имя/.test(t)) return "Напишите имя";
  return "Напишите здесь";
}
