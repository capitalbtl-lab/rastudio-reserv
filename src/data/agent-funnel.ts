import type { SessionFacts } from "./agent-facts";
import type { SessionNote } from "./session-note";

const CITY = "Вам удобнее Коломна или Луховицы?";
const CITY_WAIT = "Нажмите кнопку: Коломна или Луховицы.";
const BRANCH = "В Коломне два адреса: ЦМИТ на Октябрьской революции, 340 и Гражданская, 2. Какой ближе?";
const BRANCH_WAIT = "Нажмите филиал: ЦМИТ на Октябрьской, 340 или Гражданская, 2.";
const AGE = "Подскажу программу, которая подойдёт именно вашему ребёнку. Сколько ему лет?";
const AGE_WAIT = "Нажмите, сколько лет ребёнку — кнопки ниже.";

/** Город и филиал не генерирует модель — иначе снова спрашивает. */
export function lockedFunnelReply(who: "oleg" | "olga", facts: SessionFacts, note: SessionNote): string | null {
  const n = who === "olga" ? "Ольга" : "Олег";
  if (!facts.age) return `${n}: ${note.asked.age ? AGE_WAIT : AGE}`;
  if (!facts.city) return `${n}: ${note.asked.city ? CITY_WAIT : CITY}`;
  if (facts.city === "Коломна" && !facts.branchId) return `${n}: ${note.asked.branch ? BRANCH_WAIT : BRANCH}`;
  return null;
}
