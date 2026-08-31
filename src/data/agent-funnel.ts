import { nextSlot, PROMPT, slotsFromMessages, type Slots } from "./funnel-state";

export type FunnelHit = { reply: string };

function lastAssistant(messages: { role: string; content: string }[]) {
  return [...messages].reverse().find((m) => m.role === "assistant")?.content || "";
}

/** Один слот — всегда видимая и озвучиваемая фраза. Молчание запрещено: ответ не удаляется. */
export function lockedFunnelReply(
  who: "oleg" | "olga",
  messages: { role: string; content: string }[],
  _voice = false,
  slots?: Slots,
): FunnelHit | null {
  const n = who === "olga" ? "Ольга" : "Олег";
  const s = slots || slotsFromMessages(messages);
  const open = nextSlot(s);
  const last = lastAssistant(messages);
  const asked = (re: RegExp) => re.test(last);

  if (open === "age") {
    if (asked(/цифрой или кнопк|кнопку ниже/i)) {
      return { reply: `${n}: Направление запомним. Сначала возраст — цифра или кнопка.` };
    }
    if (asked(/сколько.{0,28}лет|возраст/i)) {
      return { reply: `${n}: Чтобы не предложить слишком сложное, напишите возраст цифрой или нажмите кнопку.` };
    }
    return { reply: `${n}: ${PROMPT.age}` };
  }
  if (open === "city") {
    if (asked(/коломна или луховиц|удобнее коломн/i)) {
      return { reply: `${n}: Коломна или Луховицы — нажмите кнопку или скажите город.` };
    }
    return { reply: `${n}: ${PROMPT.city}` };
  }
  if (open === "branch") {
    if (asked(/цмит|гражданская, 2|какой ближе/i)) {
      return { reply: `${n}: Какой филиал ближе: ЦМИТ на Октябрьской, 340 или Гражданская, 2?` };
    }
    return { reply: `${n}: ${PROMPT.branch}` };
  }
  return null;
}
