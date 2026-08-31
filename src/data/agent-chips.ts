import { SITE } from "@/data/site";
import { courseHint } from "@/data/agent-courses";
import { factsFromMessages } from "@/data/agent-facts";
import { nextSlot, slotsFromMessages } from "@/data/funnel-state";
import { summerSeason } from "@/data/agent-playbook";

export type AgentChip = {
  label: string;
  send?: string;
  href?: string;
  primary?: boolean;
};

const AGES: AgentChip[] = [
  { label: "3–4 года", send: "Ребёнку 4 года" },
  { label: "5–6 лет", send: "Ребёнку 6 лет" },
  { label: "7–9 лет", send: "Ребёнку 8 лет" },
  { label: "10–14 лет", send: "Ребёнку 12 лет" },
  { label: "15+", send: "Ребёнку 15 лет" },
];

const CITIES: AgentChip[] = [
  { label: "Коломна", send: "Нас интересует Коломна" },
  { label: "Луховицы", send: "Нас интересуют Луховицы" },
];

const KOLOMNA: AgentChip[] = [
  { label: "ЦМИТ · Октябрьской, 340", send: "Удобен филиал ЦМИТ на Октябрьской революции, 340" },
  { label: "Гражданская, 2", send: "Удобен филиал на Гражданской, 2" },
];

const TRIAL: AgentChip[] = [
  { label: "Пробное в группе", send: "Хочу пробное на ближайшем занятии группы", primary: true },
  { label: "Пробное в свободный день", send: "Хочу пробное в свободный день, дату согласуем" },
  { label: "Сразу в группу", send: "Хочу сразу в действующую группу" },
];

function schoolsFor(age?: number): AgentChip[] {
  const y = age || 8;
  const out: AgentChip[] = [];
  if (y <= 6) out.push({ label: "Раннее развитие", send: "Интересна школа раннего развития" });
  out.push({ label: "Художественная", send: "Интересна художественная школа" });
  if (y >= 5) out.push({ label: "Робототехника", send: "Интересна школа робототехники" });
  if (y >= 5) out.push({ label: "Программирование", send: "Интересна школа программирования" });
  if (y >= 5) out.push({ label: "Науки и инженерия", send: "Интересна школа наук и инженерии" });
  if (y >= 9) out.push({ label: "Модельная", send: "Интересна модельная школа" });
  if (y >= 7) out.push({ label: "Языки", send: "Интересна школа иностранных языков" });
  out.push({ label: "Мастер-классы", send: "Интересны мастер-классы" });
  if (summerSeason()) out.push({ label: "Летние программы", send: "Интересны летние программы" });
  return out;
}

/** Кнопки строго под последнюю фразу ассистента. Не показываем возраст, если в тексте не спрашивают возраст. */
export function chipsForReply(
  last: string,
  messages: { role: string; content: string }[],
  groups: AgentChip[] = [],
): { hint: string; chips: AgentChip[] } {
  const t = last.toLowerCase();
  if (!t.trim()) return { hint: "", chips: [] };
  if (/кодовое слово/.test(t)) return { hint: "Назовите кодовое слово", chips: [] };
  if (/заявк|записал|принял заявку|готово, заявк/.test(t)) {
    return {
      hint: "Полезно сразу",
      chips: [
        { label: "Личный кабинет", href: SITE.cabinet, primary: true },
        { label: "Расписание", href: "/schedule" },
        { label: "Написать в Telegram", href: SITE.telegram },
      ],
    };
  }
  if (/здравствуйте|рады приветствовать|подберу программу|проконсультирую/.test(t) && !slotsFromMessages(messages).age) {
    return { hint: "Сколько лет ребёнку", chips: AGES };
  }
  if (/сколько.{0,28}лет|возраст|цифрой или кнопк|кнопки ниже/.test(t)) {
    return { hint: "Сколько лет ребёнку", chips: AGES };
  }
  if (/коломна или луховиц|удобнее коломн/.test(t)) {
    return { hint: "Город", chips: CITIES };
  }
  if (/цмит|октябрьской революции|гражданская, 2|какой ближе/.test(t)) {
    return { hint: "Филиал", chips: KOLOMNA };
  }
  if (groups.length && /групп|пробн|слот|свободн.{0,12}мест|ближайш/.test(t)) {
    return { hint: "Группы", chips: groups };
  }
  if (/пробн|сразу в групп|запис/.test(t)) {
    const page = courseHint(messages.map((m) => m.content).slice(-6).join(" "));
    return { hint: "Запись", chips: [...TRIAL, ...(page ? [{ label: "Подробнее о курсе", href: page.path }] : [])] };
  }
  const facts = factsFromMessages(messages);
  const slots = slotsFromMessages(messages);
  const allSchools = schoolsFor(slots.age);
  const named = allSchools.filter((c) => {
    const key = c.label.toLowerCase();
    return t.includes(key) || (c.send && t.includes(c.send.toLowerCase().replace("интересна ", "").replace("интересны ", "")));
  });
  if (named.length >= 2) return { hint: "Направление", chips: named };
  if (/школ|направлен|что ближе|чем заняться/.test(t) && !facts.school) {
    return { hint: "Направление", chips: allSchools };
  }
  if (/понятно|к записи|рассказать подробнее/.test(t)) {
    return { hint: "", chips: [{ label: "Понятно, к записи", send: "Понятно. Давайте к пробному или в группу", primary: true }] };
  }
  return { hint: "", chips: [] };
}

export function nextChips(messages: { role: string; content: string }[], groups: AgentChip[] = []) {
  const last = [...messages].reverse().find((m) => m.role === "assistant")?.content || "";
  const fromText = chipsForReply(last, messages, groups);
  if (fromText.chips.length) return fromText;
  const open = nextSlot(slotsFromMessages(messages));
  if (open === "age" && /лет|возраст/.test(last)) return { hint: "Сколько лет ребёнку", chips: AGES };
  return { hint: "", chips: [] };
}
