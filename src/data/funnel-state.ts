/** Единственный источник воронки. LLM сюда не пишет и не спрашивает. */
import { withoutPhones } from "./agent-phone.ts";

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
  восемнадцать: 18,
};

export function ageFromText(text: string) {
  text = withoutPhones(text);
  const valid = (raw: string | undefined) => {
    const y = Number(raw) || AGE_WORDS[String(raw || "").toLowerCase()] || 0;
    return y >= 3 && y <= 18 ? y : 0;
  };
  const words = Object.keys(AGE_WORDS).sort((a, b) => b.length - a.length).join("|");
  const range = text.match(/(?<!\d)(\d{1,2})\s*[–—-]\s*(\d{1,2})(?!\d)/);
  if (range && valid(range[2])) return valid(range[2]);
  const explicit = text.match(/(?<!\d)(\d{1,2})\s*(?:лет|года|год)(?![а-яё])/i);
  if (explicit && valid(explicit[1])) return valid(explicit[1]);
  const context = text.match(new RegExp(`(?:реб[её]н[а-яё]*|сын[а-яё]*|доч[а-яё]*|возраст|ему|ей|мне|второму)[^\\n\\d]{0,24}(?<![а-яё])(${words}|\\d{1,2})(?![а-яё\\d])`, "i"));
  if (context && valid(context[1])) return valid(context[1]);
  const bare = text.trim().match(new RegExp(`^(${words}|\\d{1,2})\\s*(?:лет|года|год)?[.!?,]*$`, "i"));
  return bare ? valid(bare[1]) : 0;
}

function lastChoice(text: string, choices: { re: RegExp; value: number }[]) {
  const hits = choices.flatMap((c) => [...text.matchAll(c.re)].filter((m) => !/(?:^|[\s,])не\s*$/i.test(text.slice(0, m.index))).map((m) => ({ index: m.index!, value: c.value })));
  return hits.sort((a, b) => b.index - a.index)[0]?.value || 0;
}

function takeCity(text: string): City | "" {
  const choice = lastChoice(text, [
    { re: /луховиц[а-яё]*|луховец[а-яё]*|лухавиц[а-яё]*|луговиц[а-яё]*|луховниц[а-яё]*/gi, value: 3 },
    { re: /коломн[а-яё]*|коломен[а-яё]*|каломн[а-яё]*|колумн[а-яё]*|калумн[а-яё]*|колонн[аеуы]/gi, value: 2 },
  ]);
  return choice === 3 ? "Луховицы" : choice === 2 ? "Коломна" : "";
}

function takeBranch(text: string): { branch: string; branchId: number } | null {
  const choice = lastChoice(text, [
    { re: /гражданск[а-яё]*|олимп[а-яё]*/gi, value: 1 },
    { re: /октябрьск[а-яё]*|цмит|революц[а-яё]*/gi, value: 2 },
    { re: /пушкин[а-яё]*|202[аa]?/gi, value: 3 },
  ]);
  if (choice === 1) return { branch: "Коломна, Гражданская, 2", branchId: 1 };
  if (choice === 2) return { branch: "Коломна, ЦМИТ, Октябрьской революции, 340", branchId: 2 };
  if (choice === 3) return { branch: "Луховицы, Пушкина, 202А", branchId: 3 };
  return null;
}

export function slotsFromText(text: string): Slots {
  text = withoutPhones(text);
  const out: Slots = {};
  const age = ageFromText(text);
  if (age) out.age = age;
  const city = takeCity(text);
  if (city) out.city = city;
  const br = takeBranch(text);
  if (br && (!city || city === (br.branchId === 3 ? "Луховицы" : "Коломна"))) {
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
  if (add.age) next.age = add.age;
  if (add.city && add.city !== next.city) {
    delete next.branchId;
    delete next.branch;
  }
  if (add.city) next.city = add.city;
  if (add.branchId) {
    next.branchId = add.branchId;
    next.branch = add.branch;
    next.city = add.branchId === 3 ? "Луховицы" : "Коломна";
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
  age: "Скажите, сколько лет ребёнку — сразу подберу то, что зайдёт именно ему.",
  city: "Вам удобнее Коломна или Луховицы?",
  branch: "В Коломне два адреса: ЦМИТ на Октябрьской революции, 340 и Гражданская, 2. Какой ближе?",
} as const;
