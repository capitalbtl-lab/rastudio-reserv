export type SessionFacts = {
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
  return 0;
}

function takeCity(text: string) {
  if (/луховиц|луховец|лухавиц|луховицк/i.test(text)) return "Луховицы";
  if (/коломн|коломен|каломн|коломенск/i.test(text)) return "Коломна";
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
  if (/худож|рисун|живопис|скульпт|манг|digital/i.test(text)) return "художественная школа";
  if (/программ|scratch|python|unity|код|gamedev| scratch/i.test(text)) return "программирование";
  if (/наук|физик|инженер|радио|беспил|3d|компас/i.test(text)) return "науки и инженерия";
  if (/подготовк\w* к школе|ранн(ее|его) развит|лего-матем|steam/i.test(text)) return "раннее развитие";
  if (/модельн|подиум/i.test(text)) return "модельная школа";
  if (/англий|япон|коре|язык/i.test(text)) return "языки";
  if (/мастер-класс|мастер класс/i.test(text)) return "мастер-классы";
  if (/летн(ий|яя|ие)|лагер/i.test(text)) return "летние программы";
  return "";
}

function takePhone(text: string) {
  const m = text.match(/(?:\+7|8|7)[\s(.-]*\d{3}[\s).-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}/);
  return m ? m[0].replace(/[^\d+]/g, "") : "";
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
  const facts: SessionFacts = {};
  const age = takeAge(user) || takeAge(assistant);
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
  facts.briefed =
    /последовательн|ступен|проходят на занят|материал дет|от младшего/i.test(assistant) ||
    /понятно|к пробному|к записи|давайте к/i.test(user);
  return facts;
}

export function nextStepOf(facts: SessionFacts) {
  if (!facts.age) return "спросить ТОЛЬКО возраст. Город и филиал не упоминай.";
  if (!facts.city) return "спросить ТОЛЬКО город: Коломна или Луховицы. Возраст не спрашивай.";
  if (facts.city === "Коломна" && !facts.branchId) {
    return "спросить филиал в Коломне: ЦМИТ, Октябрьской революции 340 или Гражданская 2. Город и возраст НЕ спрашивай — город уже Коломна.";
  }
  if (!facts.school) {
    return "спросить направление / школу. Город, филиал и возраст НЕ спрашивай.";
  }
  if (!facts.briefed) {
    return "рассказать программу выбранного направления и что обучение последовательное, от младшего к старшему. Город не спрашивай. К записи не переходи в этой реплике.";
  }
  return "предложить пробное в группе, пробное в свободный день или сразу в группу. Город не спрашивай.";
}

export function factsPrompt(facts: SessionFacts) {
  const lines: string[] = [];
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
  const lines: string[] = [];
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
  const next = !facts.age
    ? "следующий шаг: возраст"
    : !facts.city
      ? "следующий шаг: город (Коломна или Луховицы)"
      : facts.city === "Коломна" && !facts.branchId
        ? "следующий шаг: филиал в Коломне (ЦМИТ или Гражданская)"
        : !facts.school
          ? "следующий шаг: направление / школа"
          : !facts.briefed
            ? "следующий шаг: рассказать программу направления и про последовательность ступеней. К записи не переходи в этой реплике."
            : "следующий шаг: пробное в группе / пробное в свободный день / сразу в группу. Здесь можно list_groups.";
  if (!lines.length) {
    return `

Факты сессии пустые. ${next}. Один вопрос. Курсы и адреса не называй.`;
  }
  return `

УЖЕ ИЗВЕСТНО В ЭТОЙ СЕССИИ — не спрашивай снова:
${lines.map((l) => `— ${l}`).join("\n")}
Сейчас ${next}. Не начинай диалог заново.`;
}
