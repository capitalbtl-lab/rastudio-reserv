import { SITE } from "@/data/site";
import { courseHint } from "@/data/agent-courses";
import { factsFromMessages } from "@/data/agent-facts";
import { summerSeason } from "@/data/agent-playbook";

export type AgentChip = {
  label: string;
  send?: string;
  href?: string;
  primary?: boolean;
};

const AGES: AgentChip[] = [
  { label: "3–4 года", send: "Ребёнку 3–4 года" },
  { label: "5–6 лет", send: "Ребёнку 5–6 лет" },
  { label: "7–9 лет", send: "Ребёнку 7–9 лет" },
  { label: "10–14 лет", send: "Ребёнку 10–14 лет" },
  { label: "15+", send: "Подросток 15 лет и старше" },
];

const CITIES: AgentChip[] = [
  { label: "Коломна", send: "Нас интересует Коломна" },
  { label: "Луховицы", send: "Нас интересуют Луховицы" },
];

const KOLOMNA: AgentChip[] = [
  { label: "ЦМИТ · Октябрьской, 340", send: "Удобен филиал ЦМИТ на Октябрьской революции, 340" },
  { label: "Гражданская, 2", send: "Удобен филиал на Гражданской, 2" },
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

function booked(messages: { role: string; content: string }[]) {
  const last = [...messages].reverse().find((m) => m.role === "assistant")?.content || "";
  return /заявк|записал|принял|готово/.test(last);
}

export function nextChips(messages: { role: string; content: string }[]): { hint: string; chips: AgentChip[] } {
  if (booked(messages)) {
    return {
      hint: "Полезно сразу",
      chips: [
        { label: "Личный кабинет", href: SITE.cabinet, primary: true },
        { label: "Расписание", href: "/schedule" },
        { label: "Написать в Telegram", href: SITE.telegram },
      ],
    };
  }
  const facts = factsFromMessages(messages);
  if (!facts.age) return { hint: "Возраст", chips: AGES };
  if (!facts.city) return { hint: "Город", chips: CITIES };
  if (facts.city === "Коломна" && !facts.branchId) return { hint: "Филиал", chips: KOLOMNA };
  if (!facts.school) return { hint: "Направление", chips: schoolsFor(facts.age) };
  if (!facts.briefed) {
    return {
      hint: "Когда программа ясна",
      chips: [{ label: "Понятно, к записи", send: "Понятно. Давайте к пробному или в группу", primary: true }],
    };
  }
  const page = courseHint(messages.map((m) => m.content).slice(-4).join(" "));
  return {
    hint: "Как удобнее начать",
    chips: [
      { label: "Пробное в группе", send: "Хочу пробное на ближайшем занятии группы", primary: true },
      { label: "Пробное в свободный день", send: "Хочу пробное в свободный день, дату согласуем" },
      { label: "Сразу в группу", send: "Хочу сразу в действующую группу" },
      ...(page ? [{ label: "Подробнее о курсе", href: page.path }] : []),
    ],
  };
}
