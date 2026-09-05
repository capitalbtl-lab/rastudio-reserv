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
  parent?: string;
  phone?: string;
  intent?: string;
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
  const m = text.match(/(?:\+7|8|7)[\s(.-]*\d{3}[\s).-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}/);
  return m ? m[0].replace(/[^\d+]/g, "") : "";
}

const CLIENT_RE =
  /уже ходим|уже занима|действующ\w* клиент|мы клиент|ходим к вам|занимаемся у вас|наш ребёнок ходит|продолжаем ходить|открыть карточку|телефон для входа/i;
const NEW_RE =
  /впервые|подбираем курс|новый клиент|ещё не ходим|не занимаемся|подобрать курс|хочу пробн|запишите на пробн|подбираем впервые/i;

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
  const user = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  const asst = [...messages].reverse().find((m) => m.role === "assistant")?.content || "";
  if (/это ваш|нашли|ваш ребёнок/i.test(asst) && /^(да|ага|угу|верно|наш|так|это наш)\b/i.test(user.trim())) return true;
  if (/откройте карточку|да, это /i.test(user)) return true;
  return false;
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
  else if (/в группу|абонемент|сразу в/i.test(user)) facts.intent = "группа";
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
  if (facts.mode === "client") facts.identified = identifiedFromMessages(messages);
  return facts;
}

export function nextStepOf(facts: SessionFacts) {
  if (!facts.mode || facts.mode === "fork") {
    return "спросить ТОЛЬКО: уже занимаетесь у нас или подбираете впервые. Возраст не спрашивать.";
  }
  if (facts.mode === "client") {
    if (!facts.phone) return "попросить телефон записи. Не спрашивать возраст и город.";
    if (!facts.identified) return "подтвердить имя ребёнка с диска. Не выдумывать карточку. Возраст не спрашивать.";
    return "клиент узнан. Говорить про его группы, явку, отработку, паузу, абонемент. Не воронка нового. Жалобы и возврат денег — телефон.";
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
  if (facts.parent) lines.push(`родитель: ${facts.parent}`);
  if (facts.phone) lines.push(`телефон: ${facts.phone}`);
  if (facts.intent) lines.push(`намерение: ${facts.intent}`);
  const next = nextStepOf(facts);
  const forbid: string[] = [];
  if (facts.age) forbid.push("возраст");
  if (facts.city) forbid.push("город");
  if (facts.branchId) forbid.push("филиал");
  if (facts.school) forbid.push("направление");
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
