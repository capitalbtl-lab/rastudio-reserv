import { nextSlot, PROMPT, slotsFromMessages, type Slots } from "./funnel-state";

export type FunnelHit = { reply: string } | { silent: true };

function said(messages: { role: string; content: string }[], re: RegExp) {
  return messages.some((m) => m.role === "assistant" && re.test(m.content));
}

/** До направления модель молчит. Один слот — либо кнопки, либо одна голосовая фраза. */
export function lockedFunnelReply(
  who: "oleg" | "olga",
  messages: { role: string; content: string }[],
  voice = false,
  slots?: Slots,
): FunnelHit | null {
  const n = who === "olga" ? "Ольга" : "Олег";
  const ok = who === "olga" ? "Запомнила" : "Запомнил";
  const s = slots || slotsFromMessages(messages);
  const open = nextSlot(s);

  if (open === "age") {
    if (s.city && !said(messages, /запомнил[аи]/i)) return { reply: `${n}: ${ok}: ${s.city}.` };
    return { silent: true };
  }
  if (open === "city") {
    if (!voice || said(messages, /коломна или луховиц|удобнее коломн/i)) return { silent: true };
    return { reply: `${n}: ${PROMPT.city}` };
  }
  if (open === "branch") {
    if (!voice || said(messages, /цмит|гражданская, 2|какой ближе/i)) return { silent: true };
    return { reply: `${n}: ${PROMPT.branch}` };
  }
  return null;
}
