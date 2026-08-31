import { SITE } from "@/data/site";

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

const PLACES: AgentChip[] = [
  { label: "Коломна · Октябрьской", send: "Удобен филиал в Коломне на Октябрьской революции, 340" },
  { label: "Коломна · Гражданская", send: "Удобен филиал в Коломне на Гражданской, 2" },
  { label: "Луховицы", send: "Удобен филиал в Луховицах" },
];

const COURSES: Record<string, AgentChip[]> = {
  "3-4": [
    { label: "Художка 3–4", send: "Интересна художественная студия 3–4 года" },
    { label: "Лего-математика", send: "Интересна Лего-математика" },
    { label: "К школе", send: "Интересна подготовка к школе" },
  ],
  "5-6": [
    { label: "Художка 5–6", send: "Интересна художественная студия 5–6 лет" },
    { label: "Робототехника", send: "Интересна робототехника 5–6 лет" },
    { label: "Наука", send: "Интересен курс «Увлекательная наука»" },
    { label: "Английский", send: "Интересен английский Super Minds" },
    { label: "К школе", send: "Интересна подготовка к школе" },
  ],
  "7-9": [
    { label: "Художка 7–9", send: "Интересна художественная студия 7–9 лет" },
    { label: "Робототехника", send: "Интересна робототехника 7–9 лет" },
    { label: "Программирование", send: "Интересно программирование для 7–9 лет" },
    { label: "Наука", send: "Интересен курс «Увлекательная наука»" },
    { label: "Английский", send: "Интересен английский" },
  ],
  "10-14": [
    { label: "Художественная школа", send: "Интересна художественная школа 10–14" },
    { label: "Робототехника", send: "Интересна робототехника 10–14 лет" },
    { label: "Python", send: "Интересно программирование на Python" },
    { label: "Игры / Unity", send: "Интересен GameDev и Unity" },
    { label: "Физика", send: "Интересна физика инноваций" },
  ],
  "15+": [
    { label: "Подготовка в вуз", send: "Интересна подготовка в художественный вуз" },
    { label: "Модельная школа", send: "Интересна модельная школа" },
    { label: "Python / C++", send: "Интересно программирование Python или C++" },
    { label: "Blender / Unity", send: "Интересны Blender и разработка игр" },
  ],
};

function blobOf(messages: { role: string; content: string }[]) {
  return messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" \n ")
    .toLowerCase();
}

function ageBand(blob: string) {
  if (/15\+|старше|подростк|15 лет/.test(blob)) return "15+";
  if (/10\s*[-–]?\s*14|11 лет|12 лет|13 лет|14 лет/.test(blob)) return "10-14";
  if (/7\s*[-–]?\s*9|7 лет|8 лет|9 лет/.test(blob)) return "7-9";
  if (/5\s*[-–]?\s*6|5 лет|6 лет/.test(blob)) return "5-6";
  if (/3\s*[-–]?\s*4|3 года|4 года/.test(blob)) return "3-4";
  const n = blob.match(/(?:ребёнк\w*|лет|года)[^\d]{0,8}(\d{1,2})|(\d{1,2})\s*лет/);
  const y = Number(n?.[1] || n?.[2] || 0);
  if (y) {
    if (y <= 4) return "3-4";
    if (y <= 6) return "5-6";
    if (y <= 9) return "7-9";
    if (y <= 14) return "10-14";
    return "15+";
  }
  return "";
}

function hasCity(blob: string) {
  return /коломн|луховиц|октябрьск|гражданск|филиал/.test(blob);
}

function hasCourse(blob: string) {
  return /худож|робот|лего|наук|англий|python|программ|unity|blender|физик|вуз|модельн|scratch|подготовк|gamedev|игр/.test(
    blob,
  );
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
  const blob = blobOf(messages);
  const age = ageBand(blob);
  if (!age) return { hint: "Сколько лет ребёнку", chips: AGES };
  if (!hasCity(blob)) return { hint: "Какой филиал удобнее", chips: PLACES };
  if (!hasCourse(blob)) {
    return { hint: "Что откликается", chips: COURSES[age] || COURSES["7-9"] };
  }
  return {
    hint: "Следующий шаг",
    chips: [
      { label: "Записать на пробное", send: "Да, запишите на пробное занятие", primary: true },
      { label: "Смотреть расписание", href: "/schedule" },
      { label: "Позвонить", href: "tel:+78005113401" },
    ],
  };
}
