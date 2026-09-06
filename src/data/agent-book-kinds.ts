/** Какие занятия консультант ставит. Один тип Alfa — одна галочка. Тот же book_lesson, что пробное и отработка. */

export type BookTypeFlag =
  | "consultantCanBookTrial"
  | "consultantCanBookGroup"
  | "consultantCanBookMakeup"
  | "consultantCanBookOvertime"
  | "consultantCanBookExtra"
  | "consultantCanBookIndividual"
  | "consultantCanBookIntro"
  | "consultantCanBookMaster"
  | "consultantCanBookOpen"
  | "consultantCanBookExcursion"
  | "consultantCanBookCamp"
  | "consultantCanBookEvent"
  | "consultantCanBookInterview"
  | "consultantCanBookAftercare"
  | "consultantCanBookSummer";

type FlagRow = { id: BookTypeFlag; key: string; title: string; hint: string; tip: string };

export const BOOK_TYPE_FLAGS: FlagRow[] = [
  { id: "consultantCanBookTrial", key: "trial", title: "Пробное занятие", hint: "book_lesson lesson_type=trial. Тот же путь, что остальные типы.", tip: "Выключено — только телефон 8 (800) 511-34-01." },
  { id: "consultantCanBookGroup", key: "group", title: "Групповое занятие", hint: "book_lesson lesson_type=group. Запись в постоянную группу.", tip: "Приоритет 0 с сайта не записывает." },
  { id: "consultantCanBookMakeup", key: "makeup", title: "Отработка пропуска", hint: "book_lesson lesson_type=makeup в группе того же курса.", tip: "Нужен узнанный клиент и свободные места." },
  { id: "consultantCanBookOvertime", key: "overtime", title: "Сверхурочное занятие", hint: "book_lesson lesson_type=overtime. Педагог, дата, время.", tip: "Не путать с отработкой в соседней группе." },
  { id: "consultantCanBookExtra", key: "extra", title: "Дополнительное занятие", hint: "book_lesson lesson_type=extra сверх абонемента.", tip: "Доп. урок, не замена пропуска." },
  { id: "consultantCanBookIndividual", key: "individual", title: "Индивидуальное занятие", hint: "book_lesson lesson_type=individual. Педагог, дата, время.", tip: "Не группа." },
  { id: "consultantCanBookIntro", key: "intro", title: "Вводное занятие", hint: "book_lesson lesson_type=intro. Как пробное, свой тип в Alfa.", tip: "Не подменять пробным." },
  { id: "consultantCanBookMaster", key: "master", title: "Мастер-класс", hint: "book_lesson lesson_type=master.", tip: "Разовое, не слот расписания." },
  { id: "consultantCanBookOpen", key: "open", title: "Открытый урок", hint: "book_lesson lesson_type=open.", tip: "Разовое." },
  { id: "consultantCanBookExcursion", key: "excursion", title: "Экскурсия", hint: "book_lesson lesson_type=excursion.", tip: "Разовое." },
  { id: "consultantCanBookCamp", key: "camp", title: "Летний лагерь", hint: "book_lesson lesson_type=camp.", tip: "Разовое." },
  { id: "consultantCanBookEvent", key: "event", title: "Мероприятие", hint: "book_lesson lesson_type=event.", tip: "Разовое." },
  { id: "consultantCanBookInterview", key: "interview", title: "Собеседование", hint: "book_lesson lesson_type=interview.", tip: "Разовое." },
  { id: "consultantCanBookAftercare", key: "aftercare", title: "Продлёнка", hint: "book_lesson lesson_type=aftercare.", tip: "Разовое." },
  { id: "consultantCanBookSummer", key: "summer", title: "Летняя программа", hint: "book_lesson lesson_type=summer.", tip: "Разовое." },
];

/** Старые сейвы: одна галочка «прочие» закрывала типы ниже. */
export const LEGACY_OTHER_FLAGS: BookTypeFlag[] = [
  "consultantCanBookIntro",
  "consultantCanBookMaster",
  "consultantCanBookOpen",
  "consultantCanBookExcursion",
  "consultantCanBookCamp",
  "consultantCanBookEvent",
  "consultantCanBookInterview",
  "consultantCanBookAftercare",
  "consultantCanBookSummer",
];

export type BookSettings = {
  consultantCanBook: boolean;
  consultantCanBookOther?: boolean;
} & Record<BookTypeFlag, boolean>;

export function emptyBookFlags(on = true): Record<BookTypeFlag, boolean> {
  return Object.fromEntries(BOOK_TYPE_FLAGS.map((f) => [f.id, on])) as Record<BookTypeFlag, boolean>;
}

const ALIASES: Record<string, string> = {
  пробное: "trial",
  проба: "trial",
  групповое: "group",
  группа: "group",
  отработка: "makeup",
  индивидуальное: "individual",
  индивидуал: "individual",
  сверхурочное: "overtime",
  дополнительное: "extra",
  вводное: "intro",
  "мастер-класс": "master",
  мастеркласс: "master",
  "открытый урок": "open",
  экскурсия: "excursion",
  лагерь: "camp",
  "летний лагерь": "camp",
  мероприятие: "event",
  собеседование: "interview",
  продленка: "aftercare",
  продлёнка: "aftercare",
  "летняя программа": "summer",
};

function kindKey(kind: string) {
  const raw = String(kind || "trial").toLowerCase().trim();
  if (ALIASES[raw]) return ALIASES[raw];
  const hit = BOOK_TYPE_FLAGS.find((f) => f.key === raw || f.id === raw);
  return hit?.key || raw;
}

export function lessonTypeGroup(kind: string) {
  return kindKey(kind);
}

function flagOf(s: BookSettings, id: BookTypeFlag) {
  if (s[id] != null) return s[id] !== false;
  if (LEGACY_OTHER_FLAGS.includes(id)) return s.consultantCanBookOther !== false;
  return true;
}

export function allowedLessonType(s: BookSettings, kind: string) {
  if (s.consultantCanBook === false) return false;
  const key = kindKey(kind);
  const row = BOOK_TYPE_FLAGS.find((f) => f.key === key);
  if (!row) return s.consultantCanBookOther !== false;
  return flagOf(s, row.id);
}

export function bookTypesPrompt(s: BookSettings) {
  if (s.consultantCanBook === false) return "Запись консультантом выключена. Только слоты и телефон 8 (800) 511-34-01.";
  const on: string[] = [];
  const off: string[] = [];
  for (const f of BOOK_TYPE_FLAGS) {
    (flagOf(s, f.id) ? on : off).push(f.title);
  }
  return `Каждый тип — то же правило, что пробное: book_lesson с lesson_type. Можно ставить: ${on.join(", ") || "ничего"}.${off.length ? ` Нельзя: ${off.join(", ")}.` : ""} Индивидуальное и сверхурочное — teacher_id + дата и время.`;
}
