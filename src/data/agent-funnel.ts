import { nextSlot, PROMPT, slotsFromMessages, type Slots } from "./funnel-state.ts";
import { modeFromMessages, factsFromMessages, wantsEnroll } from "./agent-facts.ts";
import { STUDIO_ADDR_SHORT, STUDIO_HOURS_SHORT, STUDIO_RULES_SHORT } from "./agent-client-desk-core.ts";
import { isSocialHello, FORK_ASK } from "./agent-voice-loop.ts";

export type FunnelHit = { reply: string };

function lastAssistant(messages: { role: string; content: string }[]) {
  return [...messages].reverse().find((m) => m.role === "assistant")?.content || "";
}

export { FORK_ASK };

/** Один слот — всегда видимая и озвучиваемая фраза. Молчание запрещено: ответ не удаляется. */
export function lockedFunnelReply(
  who: "oleg" | "olga",
  messages: { role: string; content: string }[],
  _voice = false,
  slots?: Slots,
): FunnelHit | null {
  const n = who === "olga" ? "Ольга" : "Олег";
  const mode = modeFromMessages(messages);
  if (mode === "fork") {
    const last = lastAssistant(messages);
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
    if (/правил|оферт|цен[аыу]|сколько стоит|стоимост/i.test(lastUser)) {
      return { reply: `${n}: ${STUDIO_RULES_SHORT} Уже ходите к нам или подбираете впервые?` };
    }
    if (/час[ыа] работ|когда открыт|график работ|во сколько работаете|когда вы работа|когда работаете|во сколько открыт/i.test(lastUser)) {
      return { reply: `${n}: ${STUDIO_HOURS_SHORT} Уже ходите к нам или подбираете впервые?` };
    }
    if (/где .{0,16}наход|как пройти|как проехать|адрес|филиал/i.test(lastUser)) {
      return { reply: `${n}: ${STUDIO_ADDR_SHORT} Уже ходите к нам или подбираете впервые?` };
    }
    if (isSocialHello(lastUser) || /уже занимаетесь|подбираете впервые|с чего начнём|нажмите кнопку/i.test(last)) {
      return { reply: `${n}: ${FORK_ASK}` };
    }
    return { reply: `${n}: ${FORK_ASK}` };
  }
  if (mode === "client") {
    const facts = factsFromMessages(messages);
    if (!facts.phone) {
      return { reply: `${n}: Напишите телефон, который указывали при записи. По нему открою карточку на сайте.` };
    }
    return null;
  }
  const s = slots || slotsFromMessages(messages);
  const open = nextSlot(s);
  const last = lastAssistant(messages);
  const asked = (re: RegExp) => re.test(last);

  if (open === "age") {
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
    if (wantsEnroll(lastUser) && !asked(/лет ребёнк|подберу курс/i)) {
      return { reply: `${n}: Запишем. Сколько лет ребёнку — подберу курс. Можно сказать, написать или нажать направление.` };
    }
    if (asked(/скажите или напишите возраст|цифрой или кнопк|кнопку ниже|нажмите кнопку/i)) {
      return { reply: `${n}: Чтобы не предложить слишком сложное, скажите или напишите возраст или нажмите кнопку.` };
    }
    if (asked(/сколько.{0,28}лет|возраст/i)) {
      return { reply: `${n}: Чтобы не предложить слишком сложное, скажите или напишите возраст или нажмите кнопку.` };
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
