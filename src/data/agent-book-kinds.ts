/** Какие занятия консультант может ставить. Источник — галочки Окна, не догадка по названию. */

export const LESSON_TYPE_GROUPS = {
  trial: ["trial", "intro"],
  group: ["group"],
  makeup: ["makeup"],
  overtime: ["overtime"],
  extra: ["extra"],
  individual: ["individual"],
  other: ["master", "open", "excursion", "camp", "event", "interview", "aftercare", "summer"],
} as const;

export type BookTypeFlag =
  | "consultantCanBookTrial"
  | "consultantCanBookGroup"
  | "consultantCanBookMakeup"
  | "consultantCanBookOvertime"
  | "consultantCanBookExtra"
  | "consultantCanBookIndividual"
  | "consultantCanBookOther";

export const BOOK_TYPE_FLAGS: { id: BookTypeFlag; title: string; hint: string; tip: string }[] = [
  {
    id: "consultantCanBookTrial",
    title: "Пробное занятие",
    hint: "submit_trial и book_lesson lesson_type=trial / intro.",
    tip: "Выключено — пробное только по телефону 8 (800) 511-34-01.",
  },
  {
    id: "consultantCanBookGroup",
    title: "Запись в группу",
    hint: "Постоянные занятия, lesson_type=group.",
    tip: "Приоритет 0 с сайта всё равно не записывает — только называет, если разрешено.",
  },
  {
    id: "consultantCanBookMakeup",
    title: "Отработка пропуска",
    hint: "book_lesson lesson_type=makeup в группе того же курса.",
    tip: "Нужен узнанный клиент и свободные места. Явку всей группы не переписывает.",
  },
  {
    id: "consultantCanBookOvertime",
    title: "Сверхурочное занятие",
    hint: "lesson_type=overtime у педагога сверх сетки.",
    tip: "Отдельная заявка. Не путать с отработкой в соседней группе.",
  },
  {
    id: "consultantCanBookExtra",
    title: "Дополнительное занятие",
    hint: "lesson_type=extra сверх абонемента.",
    tip: "Доп. урок, не замена пропуска.",
  },
  {
    id: "consultantCanBookIndividual",
    title: "Индивидуальное занятие",
    hint: "lesson_type=individual с педагогом.",
    tip: "Не группа. Нужны педагог, дата и время.",
  },
  {
    id: "consultantCanBookOther",
    title: "Прочие занятия у педагогов",
    hint: "Мастер-класс, вводное, открытый урок, экскурсия, лагерь, событие, собеседование, продлёнка, лето.",
    tip: "Всё, что не группа/пробное/отработка/доп/индивидуальное.",
  },
];

export type BookSettings = {
  consultantCanBook: boolean;
  consultantCanBookTrial: boolean;
  consultantCanBookGroup: boolean;
  consultantCanBookMakeup: boolean;
  consultantCanBookOvertime: boolean;
  consultantCanBookExtra: boolean;
  consultantCanBookIndividual: boolean;
  consultantCanBookOther: boolean;
};

function flagOf(s: BookSettings, id: BookTypeFlag) {
  return s[id] !== false;
}

export function lessonTypeGroup(kind: string): keyof typeof LESSON_TYPE_GROUPS | "" {
  const k = String(kind || "trial").toLowerCase().trim();
  for (const [group, list] of Object.entries(LESSON_TYPE_GROUPS) as [keyof typeof LESSON_TYPE_GROUPS, readonly string[]][]) {
    if (list.includes(k)) return group;
  }
  return "other";
}

export function allowedLessonType(s: BookSettings, kind: string) {
  if (s.consultantCanBook === false) return false;
  const g = lessonTypeGroup(kind);
  if (g === "trial") return flagOf(s, "consultantCanBookTrial");
  if (g === "group") return flagOf(s, "consultantCanBookGroup");
  if (g === "makeup") return flagOf(s, "consultantCanBookMakeup");
  if (g === "overtime") return flagOf(s, "consultantCanBookOvertime");
  if (g === "extra") return flagOf(s, "consultantCanBookExtra");
  if (g === "individual") return flagOf(s, "consultantCanBookIndividual");
  return flagOf(s, "consultantCanBookOther");
}

export function bookTypesPrompt(s: BookSettings) {
  if (s.consultantCanBook === false) return "Запись консультантом выключена. Только слоты и телефон 8 (800) 511-34-01.";
  const on: string[] = [];
  const off: string[] = [];
  for (const f of BOOK_TYPE_FLAGS) {
    (flagOf(s, f.id) ? on : off).push(f.title);
  }
  return `Можно ставить: ${on.join(", ") || "ничего"}.${off.length ? ` Нельзя: ${off.join(", ")}.` : ""} Индивидуальное и сверхурочное — teacher_id + дата и время.`;
}
