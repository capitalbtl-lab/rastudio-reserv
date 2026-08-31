export type SessionFacts = {
  age?: number;
  band?: string;
  branch?: string;
  branchId?: number;
  course?: string;
  child?: string;
  parent?: string;
  phone?: string;
  intent?: string;
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

function takeBranch(text: string): { branch: string; branchId: number } | null {
  if (/луховиц/i.test(text)) return { branch: "Луховицы, Пушкина, 202А", branchId: 3 };
  if (/гражданск/i.test(text)) return { branch: "Коломна, Гражданская, 2", branchId: 1 };
  if (/октябрьск|цмит|революц/i.test(text)) return { branch: "Коломна, ЦМИТ, Октябрьской революции, 340", branchId: 2 };
  if (/коломн/i.test(text)) return { branch: "Коломна (филиал: ЦМИТ или Гражданская — уточнить только если ещё не выбран)", branchId: 0 };
  return null;
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
  const all = messages.map((m) => m.content).join("\n");
  const user = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
  const facts: SessionFacts = {};
  const age = takeAge(all);
  if (age) {
    facts.age = age;
    facts.band = bandOf(age);
  }
  const br = takeBranch(all);
  if (br) {
    facts.branch = br.branch;
    if (br.branchId) facts.branchId = br.branchId;
  }
  const phone = takePhone(user);
  if (phone) facts.phone = phone;
  const course = takeCourse(user) || takeCourse(all);
  if (course) facts.course = course;
  const child = user.match(
    /(?:ребёнк\w*|сына?|дочку?|дочь)\s+(?:зовут\s+)?([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){0,2})/,
  );
  if (child) facts.child = child[1];
  const parent = user.match(/(?:меня зовут|я\s+)\s*([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){0,2})/);
  if (parent) facts.parent = parent[1];
  if (/пробн/i.test(all)) facts.intent = "пробное";
  else if (/в группу|абонемент|сразу в/i.test(all)) facts.intent = "группа";
  return facts;
}

export function factsPrompt(facts: SessionFacts) {
  const lines: string[] = [];
  if (facts.age) lines.push(`возраст ребёнка: ${facts.age} лет${facts.band ? ` (группа ${facts.band})` : ""}`);
  if (facts.branch) lines.push(`филиал / город: ${facts.branch}${facts.branchId ? ` (id ${facts.branchId})` : ""}`);
  if (facts.course) lines.push(`курс / интерес: ${facts.course}`);
  if (facts.child) lines.push(`ребёнок: ${facts.child}`);
  if (facts.parent) lines.push(`родитель: ${facts.parent}`);
  if (facts.phone) lines.push(`телефон: ${facts.phone}`);
  if (facts.intent) lines.push(`намерение: ${facts.intent}`);
  if (!lines.length) {
    return `

Факты сессии пока пустые. Спроси только следующее недостающее поле — сначала возраст, потом филиал. Один вопрос за реплику. Не повторяй вопрос, если родитель уже ответил.`;
  }
  return `

УЖЕ ИЗВЕСТНО В ЭТОЙ СЕССИИ. Родитель это уже сказал. ЗАПРЕЩЕНО спрашивать снова:
${lines.map((l) => `— ${l}`).join("\n")}
Не начинай диалог заново. Не пиши «сколько лет» и «какой филиал / город», если они есть выше. Спрашивай только то, чего здесь нет. Один новый вопрос за реплику.`;
}
