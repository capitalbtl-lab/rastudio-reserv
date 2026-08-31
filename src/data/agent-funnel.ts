import type { SessionFacts } from "./agent-facts";
import type { SessionNote } from "./session-note";

const CITY = "Вам удобнее Коломна или Луховицы?";
const CITY_WAIT = "Нажмите кнопку: Коломна или Луховицы.";
const BRANCH = "В Коломне два адреса: ЦМИТ на Октябрьской революции, 340 и Гражданская, 2. Какой ближе?";
const BRANCH_WAIT = "Нажмите филиал: ЦМИТ на Октябрьской, 340 или Гражданская, 2.";
const AGE = "Подскажу программу, которая подойдёт именно вашему ребёнку. Сколько ему лет?";
const AGE_WAIT = "Нажмите, сколько лет ребёнку — кнопки ниже.";

function said(messages: { role: string; content: string }[], re: RegExp) {
  return messages.some((m) => m.role === "assistant" && re.test(m.content));
}

/** Город, возраст и филиал не генерирует модель — иначе повторяет вопрос. */
export function lockedFunnelReply(
  who: "oleg" | "olga",
  facts: SessionFacts,
  note: SessionNote,
  messages: { role: string; content: string }[] = [],
): string | null {
  const n = who === "olga" ? "Ольга" : "Олег";
  const ok = who === "olga" ? "Запомнила" : "Запомнил";
  const askedAge = note.asked.age || said(messages, /сколько.{0,24}лет/i);
  const askedCity = note.asked.city || said(messages, /коломна или луховиц|удобнее коломн/i);
  const askedBranch = note.asked.branch || said(messages, /цмит|гражданская, 2|какой ближе/i);

  if (!facts.age) {
    if (facts.city) return `${n}: ${ok}: ${facts.city}. ${AGE_WAIT}`;
    if (askedAge) return `${n}: ${AGE_WAIT}`;
    return `${n}: ${AGE}`;
  }
  if (!facts.city) {
    if (askedCity) return `${n}: ${CITY_WAIT}`;
    return `${n}: ${CITY}`;
  }
  if (facts.city === "Коломна" && !facts.branchId) {
    if (askedBranch) return `${n}: ${BRANCH_WAIT}`;
    return `${n}: ${BRANCH}`;
  }
  return null;
}
