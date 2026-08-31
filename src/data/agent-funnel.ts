import type { SessionFacts } from "./agent-facts";
import type { SessionNote } from "./session-note";

const CITY = "Вам удобнее Коломна или Луховицы?";
const BRANCH = "В Коломне два адреса: ЦМИТ на Октябрьской революции, 340 и Гражданская, 2. Какой ближе?";

function said(messages: { role: string; content: string }[], re: RegExp) {
  return messages.some((m) => m.role === "assistant" && re.test(m.content));
}

export type FunnelHit = { reply: string } | { silent: true };

/** Возраст спрашивает только приветствие и кнопки. Повторных реплик нет. */
export function lockedFunnelReply(
  who: "oleg" | "olga",
  facts: SessionFacts,
  note: SessionNote,
  messages: { role: string; content: string }[] = [],
): FunnelHit | null {
  const n = who === "olga" ? "Ольга" : "Олег";
  const ok = who === "olga" ? "Запомнила" : "Запомнил";
  const askedCity = note.asked.city || said(messages, /коломна или луховиц|удобнее коломн/i);
  const askedBranch = note.asked.branch || said(messages, /цмит|гражданская, 2|какой ближе/i);

  if (!facts.age) {
    if (facts.city && !said(messages, /запомнил[аи]/i)) {
      return { reply: `${n}: ${ok}: ${facts.city}.` };
    }
    return { silent: true };
  }
  if (!facts.city) {
    if (askedCity) return { silent: true };
    return { reply: `${n}: ${CITY}` };
  }
  if (facts.city === "Коломна" && !facts.branchId) {
    if (askedBranch) return { silent: true };
    return { reply: `${n}: ${BRANCH}` };
  }
  return null;
}
