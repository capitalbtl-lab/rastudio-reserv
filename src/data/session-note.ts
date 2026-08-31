import { factsFromMessages, type SessionFacts } from "./agent-facts";

export type NoteField = "age" | "city" | "branch" | "school" | "course" | "service";

export type SessionNote = {
  asked: Record<NoteField, boolean>;
  askedCount: Record<NoteField, number>;
  age?: number;
  band?: string;
  city?: string;
  branch?: string;
  branchId?: number;
  school?: string;
  course?: string;
  service?: string;
  child?: string;
  parent?: string;
  phone?: string;
  intent?: string;
  briefed?: boolean;
  next: string;
  essence: string;
  details: string[];
};

const EMPTY_ASKED = (): Record<NoteField, boolean> => ({
  age: false,
  city: false,
  branch: false,
  school: false,
  course: false,
  service: false,
});

const EMPTY_COUNT = (): Record<NoteField, number> => ({
  age: 0,
  city: 0,
  branch: 0,
  school: 0,
  course: 0,
  service: 0,
});

const ASK: Record<NoteField, RegExp> = {
  age: /сколько лет|какой возраст|возраст реб|нажмите[^.]*лет|скажите[^.]*лет|сначала возраст|сколько ребёнк/i,
  city: /какой город|коломна или луховиц|удобнее коломн|какой город удобн|нас интересует город/i,
  branch: /какой филиал|какой адрес|цмит или гражданск|октябрьской.{0,40}гражданск|какой ближе|филиал в коломн/i,
  school: /какое направление|какая школа|что ближе|художественн.{0,40}робототехник|направление ближе/i,
  course: /какой курс|какая программ|какой кружок|какой из курс/i,
  service: /какая услуга|мастер-класс|летн(ие|ий) програм|что ещё интересует/i,
};

function takeService(text: string) {
  if (/мастер-класс|мастер класс/i.test(text)) return "мастер-классы";
  if (/летн(ий|яя|ие)|лагер/i.test(text)) return "летние программы";
  if (/пробн/i.test(text)) return "пробное занятие";
  if (/день рожден|праздник/i.test(text)) return "день рождения / праздник";
  if (/экскур/i.test(text)) return "экскурсия";
  return "";
}

function askedIn(text: string): NoteField[] {
  return (Object.keys(ASK) as NoteField[]).filter((k) => ASK[k].test(text));
}

export function buildSessionNote(messages: { role: string; content: string }[]): SessionNote {
  const facts: SessionFacts = factsFromMessages(messages);
  const asked = EMPTY_ASKED();
  const askedCount = EMPTY_COUNT();
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    for (const k of askedIn(m.content)) {
      asked[k] = true;
      askedCount[k] += 1;
    }
  }
  const user = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
  const service = takeService(user);
  const next = nextFromNote({ ...facts, asked, askedCount, service });
  const details: string[] = [];
  if (facts.age) details.push(`возраст: ${facts.age} лет${facts.band ? ` (${facts.band})` : ""}`);
  else if (asked.age) details.push("возраст: спрашивали, ответа нет");
  if (facts.city) details.push(`город: ${facts.city}`);
  else if (asked.city) details.push("город: спрашивали, ответа нет");
  if (facts.branch) details.push(`филиал: ${facts.branch}`);
  else if (asked.branch) details.push("филиал: спрашивали, ответа нет");
  if (facts.school) details.push(`школа / направление: ${facts.school}`);
  else if (asked.school) details.push("направление: спрашивали, ответа нет");
  if (facts.course) details.push(`курс: ${facts.course}`);
  else if (asked.course) details.push("курс: спрашивали, ответа нет");
  if (service) details.push(`услуга: ${service}`);
  if (facts.child) details.push(`ребёнок: ${facts.child}`);
  if (facts.parent) details.push(`родитель: ${facts.parent}`);
  if (facts.phone) details.push(`телефон: ${facts.phone}`);
  if (facts.intent) details.push(`намерение: ${facts.intent}`);
  const essence = essenceOf(facts, service, next);
  return {
    asked,
    askedCount,
    age: facts.age,
    band: facts.band,
    city: facts.city,
    branch: facts.branch,
    branchId: facts.branchId,
    school: facts.school,
    course: facts.course,
    service: service || undefined,
    child: facts.child,
    parent: facts.parent,
    phone: facts.phone,
    intent: facts.intent,
    briefed: facts.briefed,
    next,
    essence,
    details,
  };
}

function nextFromNote(n: {
  age?: number;
  city?: string;
  branchId?: number;
  school?: string;
  course?: string;
  briefed?: boolean;
  asked: Record<NoteField, boolean>;
  askedCount: Record<NoteField, number>;
  service?: string;
}) {
  if (!n.age) {
    if (n.asked.age) {
      return "Возраст уже спрашивали. ЗАПРЕЩЕНО спрашивать возраст снова. Если в последней реплике есть число или слово «лет» — зафиксируй. Иначе переходи к городу.";
    }
    return "Спроси ТОЛЬКО возраст ребёнка. Город не упоминай.";
  }
  if (!n.city) {
    if (n.asked.city) {
      return "Город уже спрашивали. ЗАПРЕЩЕНО спрашивать город, «Коломна или Луховицы», «какой город». Напиши только: нажмите кнопку Коломна или Луховицы ниже. Дальше — филиал, если город уже ясен из кнопки.";
    }
    return "Спроси ТОЛЬКО город: Коломна или Луховицы. Возраст не спрашивай.";
  }
  if (n.city === "Коломна" && !n.branchId) {
    if (n.asked.branch) {
      return "Филиал уже спрашивали. Не спрашивай адрес снова. Если не расслышала — предложи два названия без слова «ещё раз».";
    }
    return "Спроси филиал в Коломне: ЦМИТ, Октябрьской 340 или Гражданская 2. Город и возраст не спрашивай.";
  }
  if (!n.school) {
    if (n.asked.school) {
      return "Направление уже спрашивали. Не повторяй список школ. Если не ответили — предложи 2 варианта по возрасту.";
    }
    return "Спроси направление / школу. Город, филиал и возраст не спрашивай.";
  }
  if (!n.course && !n.briefed) {
    return "Расскажи программу выбранного направления и что обучение идёт ступенями, от младшего к старшему. Затем спроси, какой курс внутри школы ближе. Город не спрашивай.";
  }
  if (!n.briefed) {
    return "Коротко расскажи про выбранный курс. К записи не переходи в этой реплике. Город не спрашивай.";
  }
  return "Предложи пробное в группе, пробное в свободный день или сразу в группу. Не спрашивай возраст и город.";
}

function essenceOf(facts: SessionFacts, service: string, next: string) {
  const bits = [
    facts.age ? `${facts.age} лет` : null,
    facts.city || null,
    facts.branch ? facts.branch.replace(/^Коломна,\s*/, "") : null,
    facts.school || null,
    facts.course || null,
    service || null,
    facts.intent || null,
  ].filter(Boolean);
  const head = bits.length ? bits.join(" · ") : "пока только приветствие";
  const wait = next.replace(/^Спроси ТОЛЬКО /i, "ждём: ").replace(/^ЗАПРЕЩЕНО[^.]+\.\s*/i, "");
  return `${head}. ${wait}`.slice(0, 280);
}

export function notePrompt(note: SessionNote) {
  const asked = (Object.keys(note.asked) as NoteField[]).filter((k) => note.asked[k]);
  const known = note.details.filter((d) => !d.includes("ответа нет"));
  const missing = note.details.filter((d) => d.includes("ответа нет"));
  return `

ЗАМЕТКА СЕССИИ — открой её ДО любого вопроса. Это память этого разговора, не общая инструкция.
Уже спрашивал: ${asked.length ? asked.join(", ") : "ничего"}.
Известно от клиента:
${known.length ? known.map((l) => `— ${l}`).join("\n") : "— пока пусто"}
${missing.length ? `Спрашивал, но не зафиксировал:\n${missing.map((l) => `— ${l}`).join("\n")}` : ""}
Сейчас сделать: ${note.next}
Правило: поле, которое уже спрашивал, повторно не спрашивай — даже другими словами. Не пиши «ещё раз», «уточните возраст», «какой город», «Коломна или Луховицы».
Суть разговора: ${note.essence}
`;
}

export function guardReply(text: string, facts: SessionFacts) {
  const m = text.trim().match(/^(Ольга|Олег):\s*([\s\S]*)$/);
  const prefix = m ? `${m[1]}: ` : "";
  let body = (m ? m[2] : text).trim();
  const drop = (re: RegExp) => {
    body = body.replace(re, " ").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  };
  if (facts.city || facts.branchId) {
    drop(/[^.!?\n]*((какой город)|(удобнее )?(коломна или луховиц\w*)|(город удобн)|(нас интересует город))[^.!?\n]*[.!?…]?/gi);
  }
  if (facts.age) {
    drop(/[^.!?\n]*(сколько лет( ребёнк\w*)?|какой возраст|скажите[^.!?\n]{0,24}лет)[^.!?\n]*[.!?…]?/gi);
  }
  if (body.length < 8) {
    if (facts.city === "Коломна" && !facts.branchId) {
      body = "В Коломне два адреса: ЦМИТ на Октябрьской революции, 340 и Гражданская, 2. Какой ближе?";
    } else if (facts.city === "Луховицы" && !facts.school) {
      body = "В Луховицах филиал на Пушкина, 202А. Какое направление ближе?";
    } else if (facts.city && !facts.school) {
      body = "Какое направление ближе — художественная, робототехника, программирование или науки?";
    } else if (facts.age && !facts.city) {
      body = "Нажмите кнопку: Коломна или Луховицы.";
    }
  }
  return `${prefix}${body}`.trim();
}

export function noteToFacts(note: SessionNote): SessionFacts {
  return {
    age: note.age,
    band: note.band,
    city: note.city,
    branch: note.branch,
    branchId: note.branchId,
    school: note.school,
    course: note.course,
    child: note.child,
    parent: note.parent,
    phone: note.phone,
    intent: note.intent,
    briefed: note.briefed,
  };
}
