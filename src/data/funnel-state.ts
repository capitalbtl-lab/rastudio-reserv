/** Единственный источник воронки. LLM сюда не пишет и не спрашивает. */

export type City = "Коломна" | "Луховицы";

export type Slots = {
  age?: number;
  city?: City;
  branchId?: number;
  branch?: string;
};

export type SlotName = "age" | "city" | "branch" | "talk";

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

function takeAge(text: string) {
  const range = text.match(/(\d{1,2})\s*[–—-]\s*(\d{1,2})/);
  if (range) {
    const hi = Number(range[2]);
    if (hi >= 3 && hi <= 18) return hi;
  }
  const word = text.match(
    /(?:ребёнк\w*|возраст|ему|ей|мне)[^\n]{0,20}(три|четыре|пять|шесть|семь|восемь|девять|десять|одиннадцать|двенадцать|тринадцать|четырнадцать|пятнадцать)/i,
  );
  if (word) return AGE_WORDS[word[1].toLowerCase()] || 0;
  const num = text.match(/(\d{1,2})\s*(?:лет|года|год)/i) || text.match(/ребёнк\w*[^\d]{0,18}(\d{1,2})/i);
  if (num) {
    const y = Number(num[1]);
    if (y >= 3 && y <= 18) return y;
  }
  const bare = text.match(/^\s*(три|четыре|пять|шесть|семь|восемь|девять|десять|одиннадцать|двенадцать|тринадцать|четырнадцать|пятнадцать)\s*(?:лет|года|год)?\s*$/i);
  if (bare) return AGE_WORDS[bare[1].toLowerCase()] || 0;
  const bareN = text.match(/^\s*(\d{1,2})\s*(?:лет|года|год)?\s*$/i);
  if (bareN) {
    const y = Number(bareN[1]);
    if (y >= 3 && y <= 18) return y;
  }
  return 0;
}

function takeCity(text: string): City | "" {
  if (/луховиц|луховец|лухавиц|луговиц/i.test(text)) return "Луховицы";
  if (/коломн|коломен|каломн|колумн|колонн[аеуы]/i.test(text)) return "Коломна";
  return "";
}

function takeBranch(text: string): { branch: string; branchId: number } | null {
  if (/гражданск|олимп/i.test(text)) return { branch: "Коломна, Гражданская, 2", branchId: 1 };
  if (/октябрьск|цмит|революц/i.test(text)) return { branch: "Коломна, ЦМИТ, Октябрьской революции, 340", branchId: 2 };
  if (/луховиц|пушкин/i.test(text) && /филиал|пушкин|хорош|202/i.test(text)) {
    return { branch: "Луховицы, Пушкина, 202А", branchId: 3 };
  }
  return null;
}

export function slotsFromText(text: string): Slots {
  const out: Slots = {};
  const age = takeAge(text);
  if (age) out.age = age;
  const city = takeCity(text);
  if (city) out.city = city;
  const br = takeBranch(text);
  if (br) {
    out.branch = br.branch;
    out.branchId = br.branchId;
    if (!out.city) out.city = br.branchId === 3 ? "Луховицы" : "Коломна";
  }
  if (out.city === "Луховицы" && !out.branchId) {
    out.branch = "Луховицы, Пушкина, 202А";
    out.branchId = 3;
  }
  return out;
}

export function mergeSlots(prev: Slots, add: Slots): Slots {
  const next: Slots = { ...prev };
  if (add.age && !next.age) next.age = add.age;
  if (add.city && !next.city) next.city = add.city;
  if (add.branchId && !next.branchId) {
    next.branchId = add.branchId;
    next.branch = add.branch;
  }
  if (next.city === "Луховицы" && !next.branchId) {
    next.branch = "Луховицы, Пушкина, 202А";
    next.branchId = 3;
  }
  return next;
}

export function slotsFromMessages(messages: { role: string; content: string }[]): Slots {
  let slots: Slots = {};
  for (const m of messages) {
    if (m.role !== "user") continue;
    slots = mergeSlots(slots, slotsFromText(m.content));
  }
  return slots;
}

export function nextSlot(s: Slots): SlotName {
  if (!s.age) return "age";
  if (!s.city) return "city";
  if (s.city === "Коломна" && !s.branchId) return "branch";
  return "talk";
}

export const PROMPT = {
  city: "Вам удобнее Коломна или Луховицы?",
  branch: "В Коломне два адреса: ЦМИТ на Октябрьской революции, 340 и Гражданская, 2. Какой ближе?",
} as const;
