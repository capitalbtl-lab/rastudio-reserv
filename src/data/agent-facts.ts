import { CLIENT_SERVICE_ASK } from "./agent-identify.ts";

export type VisitorMode = "fork" | "new" | "client";

export type SessionFacts = {
  mode?: VisitorMode;
  identified?: boolean;
  customerId?: number;
  age?: number;
  band?: string;
  city?: string;
  branch?: string;
  branchId?: number;
  school?: string;
  course?: string;
  child?: string;
  secondChild?: string;
  parent?: string;
  phone?: string;
  intent?: string;
  day?: string;
  pauseUntil?: string;
  wantsBook?: boolean;
  wantsSkip?: boolean;
  briefed?: boolean;
};

const AGE_WORDS: Record<string, number> = {
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
  десять: 10,
  одиннадцать: 11,
  двенадцать: 12,
  тринадцать: 13,
  четырнадцать: 14,
  пятнадцать: 15,
  шестнадцать: 16,
  семнадцать: 17,
};

function bandOf(y: number) {
  if (y <= 4) return "3–4";
  if (y <= 6) return "5–6";
  if (y <= 9) return "7–9";
  if (y <= 14) return "10–14";
  return "15+";
}

function takeAge(text: string) {
  const word = text.match(
    /(?:ребёнк\w*|сын\w*|дочк\w*|дочер\w*|возраст[^\n]{0,12})[^\n]{0,24}(три|четыре|пять|шесть|семь|восемь|девять|десять|одиннадцать|двенадцать|тринадцать|четырнадцать|пятнадцать)|(?:мне|ему|ей)\s+(три|четыре|пять|шесть|семь|восемь|девять|десять)/i,
  );
  if (word) {
    const y = AGE_WORDS[(word[1] || word[2] || "").toLowerCase()];
    if (y) return y;
  }
  const nums = [
    /(\d{1,2})\s*(?:лет|года|год)/i,
    /ребёнк\w*[^\d]{0,18}(\d{1,2})/i,
    /возраст[^\d]{0,10}(\d{1,2})/i,
    /для\s+(\d{1,2})\s*лет/i,
  ];
  for (const re of nums) {
    const m = text.match(re);
    if (!m) continue;
    const y = Number(m[1]);
    if (y >= 3 && y <= 18) return y;
  }
  const bareWord = text.match(
    /^\s*(три|четыре|пять|шесть|семь|восемь|девять|десять|одиннадцать|двенадцать|тринадцать|четырнадцать|пятнадцать|шестнадцать|семнадцать)\s*(?:лет|года|год)?\s*[.!?]*\s*$/i,
  );
  if (bareWord) {
    const y = AGE_WORDS[bareWord[1].toLowerCase()];
    if (y) return y;
  }
  const bareNum = text.match(/^\s*(\d{1,2})\s*(?:лет|года|год)?\s*[.!?]*\s*$/i);
  if (bareNum) {
    const y = Number(bareNum[1]);
    if (y >= 3 && y <= 18) return y;
  }
  return 0;
}

function takeCity(text: string) {
  if (/луховиц|луховец|лухавиц|луговиц|луховниц/i.test(text)) return "Луховицы";
  if (/коломн|коломен|каломн|колумн|калумн|колонн[аеуы]/i.test(text)) return "Коломна";
  return "";
}

function takeBranch(text: string): { branch: string; branchId: number } | null {
  if (/гражданск|олимп/i.test(text)) return { branch: "Коломна, Гражданская, 2", branchId: 1 };
  if (/октябрьск|цмит|революц/i.test(text)) return { branch: "Коломна, ЦМИТ, Октябрьской революции, 340", branchId: 2 };
  if (/луховиц|луховец|лухавиц|пушкин/i.test(text) && /филиал|пушкин|хорош|202/i.test(text)) {
    return { branch: "Луховицы, Пушкина, 202А", branchId: 3 };
  }
  if (/луховиц|луховец|лухавиц/i.test(text) && !/коломн|коломен/i.test(text)) {
    return { branch: "Луховицы, Пушкина, 202А", branchId: 3 };
  }
  return null;
}

function takeSchool(text: string) {
  if (/робот/i.test(text)) return "робототехника";
  if (/худож|рисун|живопис|скульпт|манг|digital|творчеств/i.test(text)) return "художественная школа";
  if (/программ|scratch|python|unity|код|gamedev| scratch/i.test(text)) return "программирование";
  if (/наук|физик|инженер|радио|беспил|3d|компас/i.test(text)) return "науки и инженерия";
  if (/подготовк\w* к школе|ранн(ее|его) развит|лего-матем|steam/i.test(text)) return "раннее развитие";
  if (/модельн|подиум|макияж|личностн/i.test(text)) return "модельная школа";
  if (/англий|япон|коре|язык/i.test(text)) return "языки";
  if (/мастер-класс|мастер класс/i.test(text)) return "мастер-классы";
  if (/летн(ий|яя|ие)|лагер/i.test(text)) return "летние программы";
  return "";
}

function takePhone(text: string) {
  const m =
    text.match(/(?:\+7|8|7)[\s(.-]*\d{3}[\s).-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}/) ||
    text.match(/(?:^|[^\d])(9\d{2}[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2})(?:[^\d]|$)/);
  if (!m) return "";
  let d = (m[1] && m[1][0] === "9" ? m[1] : m[0]).replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("9")) d = `7${d}`;
  if (d.length === 11 && d.startsWith("8")) d = `7${d.slice(1)}`;
  return d ? `+${d}` : "";
}

function takeSecondName(text: string) {
  const m =
    text.match(/(?:второго?|ещё одн(?:ого|у))[^\n]{0,24}зовут\s+([А-ЯЁ][а-яё]+)/i) ||
    text.match(/зовут\s+([А-ЯЁ][а-яё]+)/i) ||
    text.match(/^([А-ЯЁ][а-яё]{2,})\s*[.!,]*$/);
  const n = m?.[1] || "";
  if (!n || /лет|год|недел|месяц|робот|худож|программ|спасибо/i.test(n)) return "";
  return n;
}

const CLIENT_RE =
  /уже ходим|уже занима|действующ\w* клиент|мы клиент|ходим к вам|занимаемся у вас|наш ребёнок ходит|продолжаем ходить|открыть карточку|телефон для входа/i;
const NEW_RE =
  /впервые|подбираем курс|новый клиент|ещё не ходим|не занимаемся|подобрать курс|хочу пробн|запишите на пробн|подбираем впервые|хочу записаться|запишите нас\b/i;

export function modeFromMessages(messages: { role: string; content: string }[]): VisitorMode {
  const userMsgs = messages.filter((m) => m.role === "user").map((m) => m.content);
  for (const u of [...userMsgs].reverse()) {
    if (NEW_RE.test(u)) return "new";
    if (CLIENT_RE.test(u)) return "client";
  }
  const user = userMsgs.join("\n");
  if (takeAge(user)) return "new";
  return "fork";
}

export function identifiedFromMessages(messages: { role: string; content: string }[]) {
  const yes = /^(да|ага|угу|верно|наш|так|это наш|это он|это она|да,\s*это|конечно|именно|она|он)(?=$|[\s,.!?…])/i;
  const deny = /другой ребёнок|это не (наш|он|она)|не наш ребёнок|подбираем впервые|подбираем курс впервые/i;
  let ok = false;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const u = m.content.trim();
    if (deny.test(u)) {
      ok = false;
      continue;
    }
    const prev = [...messages.slice(0, i)].reverse().find((x) => x.role === "assistant")?.content || "";
    if (/откройте карточку|да,\s*это\s+|да,\s*[А-ЯЁа-яё]{2,}/i.test(u)) ok = true;
    else if (/это ваш|нашл|ваш ребёнок|несколько детей/i.test(prev) && (yes.test(u) || CLIENT_SERVICE_ASK.test(u))) ok = true;
  }
  return ok;
}

export const WEEKDAY_CHIPS: { label: string; send: string; primary?: boolean }[] = [
  { label: "Пн", send: "в понедельник" },
  { label: "Вт", send: "во вторник" },
  { label: "Ср", send: "в среду" },
  { label: "Чт", send: "в четверг" },
  { label: "Пт", send: "в пятницу" },
  { label: "Сб", send: "в субботу", primary: true },
  { label: "Вс", send: "в воскресенье" },
];

const WEEKDAY_NAME: { re: RegExp; day: string }[] = [
  { re: /понедельник/i, day: "понедельник" },
  { re: /вторник/i, day: "вторник" },
  { re: /сред[ауые]/i, day: "среда" },
  { re: /четверг/i, day: "четверг" },
  { re: /пятниц/i, day: "пятница" },
  { re: /суббот/i, day: "суббота" },
  { re: /воскресен/i, day: "воскресенье" },
];

const WEEKDAY_SHORT: Record<string, string> = {
  пн: "понедельник",
  вт: "вторник",
  ср: "среда",
  чт: "четверг",
  пт: "пятница",
  сб: "суббота",
  вс: "воскресенье",
};

export function takeWeekday(text: string) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return "";
  if (WEEKDAY_SHORT[t]) return WEEKDAY_SHORT[t];
  for (const w of WEEKDAY_NAME) if (w.re.test(t)) return w.day;
  return "";
}

function takeClientIntent(messages: { role: string; content: string }[]) {
  const users = messages.filter((m) => m.role === "user").map((m) => m.content);
  for (const u of [...users].reverse()) {
    if (/этого достаточно|всё,? спасибо|^спасибо[.!?]*$|пока,? спасибо|больше ничего не нужно/i.test(u)) return "готово";
    if (/второго ребёнк|ещё одн(ого|у) ребёнк|второй ребёнок/i.test(u)) return "второй";
    if (/отработк|пропустил занят|как записаться на отработ|взамен пропущен/i.test(u)) return "отработка";
    if (/пауз|приостанов|замороз|каникул|уед(ем|у)/i.test(u)) return "пауза";
    if (/не прид|не сможем прийти|боле(ем|ет)|пропуск(?!а)|не будет сегодня|отмените (сегодня|ближайш)/i.test(u)) return "пропуск";
    if (/абонемент|остат|сколько занятий|оплат|закончил/i.test(u)) return "абонемент";
    if (/правил|оферт|условия оказания/i.test(u)) return "правила";
    if (/когда следующее|расписан|во сколько|какой день ходим|когда занима/i.test(u)) return "расписание";
    if (/индивидуальн/i.test(u)) return "индивидуальное";
    if (/сверхурочн/i.test(u)) return "сверхурочное";
    if (/дополнительн(ое|ый) занят/i.test(u)) return "дополнительное";
  }
  return "";
}

function takeCourse(text: string) {
  const m = text.match(
    /(?:курс[аеу]?\s+|интересен?\s+|про\s+|запис\w+\s+на\s+|подробнее\s+про\s+)[«"]?([^«»"\n.]{8,72})/i,
  );
  return m ? m[1].replace(/[«»"]/g, "").trim().slice(0, 80) : "";
}

export function factsFromMessages(messages: { role: string; content: string }[]): SessionFacts {
  const user = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
  const assistant = messages
    .filter((m) => m.role === "assistant")
    .map((m) => m.content)
    .join("\n");
  const facts: SessionFacts = { mode: modeFromMessages(messages) };
  const age = takeAge(user) || (facts.mode === "new" ? takeAge(assistant) : 0);
  if (age) {
    facts.age = age;
    facts.band = bandOf(age);
  }
  const city = takeCity(user);
  if (city) facts.city = city;
  const br = takeBranch(user);
  if (br) {
    facts.branch = br.branch;
    facts.branchId = br.branchId;
    if (!facts.city) facts.city = br.branchId === 3 ? "Луховицы" : "Коломна";
  }
  if (facts.city === "Луховицы" && !facts.branchId) {
    facts.branch = "Луховицы, Пушкина, 202А";
    facts.branchId = 3;
  }
  const school = takeSchool(user);
  if (school) facts.school = school;
  const phone = takePhone(user);
  if (phone) facts.phone = phone;
  const course = takeCourse(user);
  if (course) facts.course = course;
  const child = user.match(
    /(?:ребёнк\w*|сына?|дочку?|дочь)\s+(?:зовут\s+)?([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){0,2})/,
  );
  if (child) facts.child = child[1];
  const parent = user.match(/(?:меня зовут|я\s+)\s*([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){0,2})/);
  if (parent) facts.parent = parent[1];
  if (/свободн\w+ день|согласуем|пустую дату/i.test(user)) facts.intent = "пробное-свободный-день";
  else if (/пробн/i.test(user)) facts.intent = "пробное";
  else if (/в группу|сразу в/i.test(user)) facts.intent = "группа";
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  if (!facts.age) {
    const loose = takeAge(lastUser);
    if (loose) {
      facts.age = loose;
      facts.band = bandOf(loose);
    }
  }
  facts.briefed =
    /последовательн|ступен|проходят на занят|материал дет|от младшего/i.test(assistant) ||
    /понятно|к пробному|к записи|давайте к/i.test(user);
  if (facts.mode !== "client") {
    if (/правил|оферт|цен[аыу]|сколько стоит|стоимост/i.test(lastUser)) facts.intent = "правила";
    else if (/час[ыа] работ|когда открыт|график работ|во сколько работаете|когда вы работа|когда работаете|во сколько открыт/i.test(lastUser)) facts.intent = "часы";
    else if (/где .{0,16}наход|как пройти|как проехать|адрес/i.test(lastUser)) facts.intent = "адрес";
  }
  if (facts.mode === "client") {
    facts.identified = identifiedFromMessages(messages);
    const want = takeClientIntent(messages);
    if (want) facts.intent = want;
    const day = [...messages]
      .filter((m) => m.role === "user")
      .map((m) => takeWeekday(m.content))
      .reverse()
      .find(Boolean);
    if (day) facts.day = day;
    const pause = [...messages]
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .reverse()
      .map((u) => {
        if (/на две недели/i.test(u)) return "две недели";
        if (/на неделю/i.test(u)) return "неделя";
        if (/на месяц/i.test(u)) return "месяц";
        const till = u.match(/до\s+(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)/i);
        return till ? till[1] : "";
      })
      .find(Boolean);
    if (pause) facts.pauseUntil = pause;
    if (/gid=\d/i.test(lastUser) || /поставьте отработку|запишите на пробное gid=/i.test(lastUser)) facts.wantsBook = true;
    if (/отметьте пропуск|да, отметить/i.test(lastUser)) facts.wantsSkip = true;
    if (facts.identified && !facts.child) {
      const named = messages
        .filter((m) => m.role === "user")
        .map((m) => m.content.match(/да,\s*это\s+([А-ЯЁа-яё]+)/i))
        .find(Boolean);
      if (named?.[1]) facts.child = named[1];
    }
    if (facts.intent === "второй") {
      const secondAge = takeAge(lastUser);
      if (secondAge) {
        facts.age = secondAge;
        facts.band = bandOf(secondAge);
      }
      const sn = takeSecondName(lastUser);
      if (sn) facts.secondChild = sn;
    }
  }
  return facts;
}

export function nextStepOf(facts: SessionFacts) {
  if (!facts.mode || facts.mode === "fork") {
    if (facts.intent === "правила" || facts.intent === "часы" || facts.intent === "адрес") {
      return "коротко ответить по факту и снова спросить: уже занимаетесь или подбираете впервые. Возраст не спрашивать.";
    }
    return "спросить ТОЛЬКО: уже занимаетесь у нас или подбираете впервые. Возраст не спрашивать.";
  }
  if (facts.mode === "client") {
    if (!facts.phone) return "попросить телефон записи. Не спрашивать возраст и город.";
    if (!facts.identified) return "подтвердить имя ребёнка с диска. Не выдумывать карточку. Возраст не спрашивать.";
    if (facts.intent === "отработка") {
      if (!facts.day) {
        return "ребёнок уже подтверждён — имя больше не спрашивать. Спросить ТОЛЬКО день отработки. Не предлагать пробное.";
      }
      return `ребёнок уже подтверждён — имя больше не спрашивать. День: ${facts.day}. list_groups по courseId из карточки, weekday=${facts.day}. Если в своей группе нет этого дня — другие группы того же курса. Затем book_lesson makeup. Не предлагать пробное.`;
    }
    if (facts.intent === "пауза") {
      return "ребёнок уже подтверждён. Если срока паузы нет — спросить до какой даты. Если дата есть — pause_classes. Не переспрашивать имя.";
    }
    if (facts.intent === "пропуск") {
      return "ребёнок уже подтверждён. note_skip на ближайшее занятие, если дату не назвали. Не переспрашивать имя.";
    }
    if (facts.intent === "абонемент") {
      return "ребёнок уже подтверждён. Сказать абонемент и остаток с диска. Не переспрашивать имя. Не воронка нового.";
    }
    if (facts.intent === "правила") {
      return "ребёнок уже подтверждён. Коротко правила: пропуск заранее, отработка в другой группе того же курса при наличии мест, пауза по заявлению. Один вопрос: что именно из правил нужно.";
    }
    if (facts.intent === "расписание") {
      return "ребёнок уже подтверждён. Ближайшее занятие с диска. Не переспрашивать имя.";
    }
    if (facts.intent === "второй") {
      if (!facts.age) return "это второй ребёнок той же семьи. Не открывать карточку первого. Спросить возраст второго. Не воронка с нуля без телефона.";
      if (!facts.secondChild) return "возраст второго уже есть. Спросить ТОЛЬКО имя второго. Не переспрашивать возраст и не трогать карточку первого.";
      return "имя и возраст второго есть. Пробное на телефон родителя, submit_trial. Не путать с customerId первого.";
    }
    if (facts.intent === "индивидуальное" || facts.intent === "сверхурочное" || facts.intent === "дополнительное") {
      return `ребёнок уже подтверждён. ${facts.intent}: нужны педагог teacher_id, дата и время. list_groups по курсу карточки. Не предлагать пробное вместо этого типа. Имя не спрашивать.`;
    }
    if (facts.intent === "готово") {
      return "клиент узнан, вопрос закрыт. Коротко «хорошо». Не спрашивать имя. Не предлагать пробное.";
    }
    return "клиент узнан. Не спрашивать снова «это ваш ребёнок». Говорить про его группы, явку, отработку, паузу, абонемент. Не воронка нового. Жалобы и возврат денег — телефон.";
  }
  if (!facts.age) return "спросить ТОЛЬКО возраст: «Сколько лет ребёнку?» Ждать ответ. Город не упоминать.";
  if (!facts.city) return "подтвердить возраст тремя словами и спросить ТОЛЬКО город: Коломна или Луховицы. Возраст больше не спрашивай.";
  if (facts.city === "Коломна" && !facts.branchId) {
    return "спросить филиал в Коломне: ЦМИТ, Октябрьской революции 340 или Гражданская 2. Город и возраст НЕ спрашивай — город уже Коломна.";
  }
  if (!facts.school) {
    return "спросить направление узко по возрасту, 2–3 варианта, не меню из восьми школ. Город, филиал и возраст НЕ спрашивай.";
  }
  if (!facts.briefed) {
    return "два предложения про выбранное направление. Спросить: подробнее или сразу пробное. Город не спрашивай. К записи не переходи, пока не ответили.";
  }
  return "предложить пробное в группе, пробное в свободный день или сразу в группу. Город не спрашивай.";
}

export function factsPrompt(facts: SessionFacts) {
  const lines: string[] = [];
  if (facts.mode) lines.push(`режим: ${facts.mode === "client" ? "действующий" : facts.mode === "new" ? "новый" : "развилка"}`);
  if (facts.identified) lines.push("клиент узнан по телефону, карточка с диска");
  if (facts.customerId) lines.push(`customerId ${facts.customerId}`);
  if (facts.age) lines.push(`возраст ребёнка: ${facts.age} лет${facts.band ? ` (группа ${facts.band})` : ""}`);
  if (facts.city) lines.push(`город: ${facts.city}`);
  if (facts.branch) lines.push(`филиал: ${facts.branch}${facts.branchId ? ` (id ${facts.branchId})` : ""}`);
  if (facts.school) lines.push(`направление: ${facts.school}`);
  if (facts.course) lines.push(`курс: ${facts.course}`);
  if (facts.briefed) lines.push("программу направления уже рассказали");
  if (facts.child) lines.push(`ребёнок: ${facts.child}`);
  if (facts.secondChild) lines.push(`второй ребёнок: ${facts.secondChild}`);
  if (facts.parent) lines.push(`родитель: ${facts.parent}`);
  if (facts.phone) lines.push(`телефон: ${facts.phone}`);
  if (facts.intent) lines.push(`намерение: ${facts.intent}`);
  const next = nextStepOf(facts);
  const forbid: string[] = [];
  if (facts.age) forbid.push("возраст");
  if (facts.city) forbid.push("город");
  if (facts.branchId) forbid.push("филиал");
  if (facts.school) forbid.push("направление");
  if (facts.identified) forbid.push("это ваш ребёнок");
  const ban = forbid.length
    ? `\nЗАПРЕЩЕНО спрашивать: ${forbid.join(", ")}. Эти слова в вопросе к родителю не используй.`
    : "";
  if (!lines.length) {
    return `

Факты сессии пустые. Сейчас ${next}${ban}`;
  }
  return `

УЖЕ ИЗВЕСТНО — это сказал родитель, не ты. Скрипт воронки здесь не важнее:
${lines.map((l) => `— ${l}`).join("\n")}
Сейчас ${next}${ban}
Если в скрипте ниже написано «спроси город», а город уже есть — игнорируй скрипт.`;
}

export function talkFallback(who: "oleg" | "olga", facts: SessionFacts) {
  const n = who === "olga" ? "Ольга" : "Олег";
  if (facts.mode === "client" && facts.identified) {
    const child = facts.child || "ребёнок";
    if (facts.intent === "отработка") {
      return facts.day
        ? `${n}: Ищу отработку на ${facts.day} в группах того же курса, не только в своей. Пробное не предлагаю.`
        : `${n}: На какой день поставить отработку ${child}?`;
    }
    if (facts.intent === "расписание") return `${n}: ${child} — ближайшее занятие в карточке. Чем ещё помочь?`;
    if (facts.intent === "абонемент") return `${n}: Сейчас скажу абонемент и остаток по карточке ${child}.`;
    if (facts.intent === "пауза") return `${n}: На какой срок поставить паузу ${child}?`;
    if (facts.intent === "пропуск") return `${n}: Отметить, что ${child} не придёт на ближайшее занятие?`;
    if (facts.intent === "правила") {
      return `${n}: Пропуск лучше предупредить заранее. Отработка — в другой группе того же курса при наличии мест. Пауза — по заявлению до даты. Что именно нужно?`;
    }
    if (facts.intent === "второй") {
      if (!facts.age) return `${n}: Второго ребёнка запишу на ваш телефон. Сколько лет второму?`;
      if (!facts.secondChild) return `${n}: Второму ${facts.age} лет. Как зовут?`;
      return `${n}: ${facts.secondChild}, ${facts.age} лет — пробное на ваш телефон. Какое направление?`;
    }
    if (facts.intent === "готово") return `${n}: Хорошо. Если понадобится отработка, пропуск или пауза — напишите.`;
    if (facts.intent === "индивидуальное" || facts.intent === "сверхурочное" || facts.intent === "дополнительное") {
      return `${n}: На какой день поставить ${facts.intent} для ${child}? Нужны педагог, дата и время.`;
    }
    return `${n}: ${child} уже в карточке. Расписание, отработка, пропуск или абонемент?`;
  }
  if (!facts.mode || facts.mode === "fork") {
    if (facts.intent === "правила") {
      return `${n}: Пропуск лучше предупредить заранее. Отработка в другой группе того же курса, если есть места. Пауза по заявлению. Уже ходите или подбираете впервые?`;
    }
    if (facts.intent === "часы") {
      return `${n}: ЦМИТ на Октябрьской — ср–вс 10:00–19:00. Гражданская 2 — по расписанию занятий. Луховицы — по согласованию. Уже ходите или подбираете впервые?`;
    }
    if (facts.intent === "адрес") {
      return `${n}: Коломна: ЦМИТ, Октябрьской революции 340 и Гражданская 2. Луховицы: Пушкина 202А. Телефон 8 (800) 511-34-01. Уже ходите или подбираете впервые?`;
    }
    return `${n}: Вы уже занимаетесь у нас или подбираете впервые?`;
  }
  if (facts.school) {
    return `${n}: В этом направлении дети идут от простого к сложному. Рассказать подробнее или сразу на пробное?`;
  }
  if (facts.mode === "client" && !facts.identified) {
    return facts.phone
      ? `${n}: Проверяю карточку по телефону на сайте.`
      : `${n}: Напишите телефон, который указывали при записи.`;
  }
  if (facts.mode === "client") return `${n}: Чем помочь: расписание, отработка, пропуск или абонемент?`;
  if (!facts.age) return `${n}: Сколько лет ребёнку?`;
  if (!facts.city) return `${n}: ${facts.age} лет, хорошо. Вам удобнее Коломна или Луховицы?`;
  if (facts.city === "Коломна" && !facts.branchId) {
    return `${n}: В Коломне два адреса — ЦМИТ на Октябрьской или Гражданская. Какой ближе?`;
  }
  if (!facts.school) {
    const y = facts.age || 8;
    if (y <= 4) return `${n}: В этом возрасте ближе раннее развитие или рисовать?`;
    if (y <= 6) return `${n}: Что ближе — творчество, роботы или подготовка к школе?`;
    if (y <= 9) return `${n}: Рисовать, собирать роботов или программировать?`;
    return `${n}: Художка, робототехника, программирование или инженерия?`;
  }
  return `${n}: Пробное занятие или сразу в группу?`;
}
