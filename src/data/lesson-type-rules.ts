/** Правила урока в AlfaCRM. Один тип — одно правило. Не угадывать по названию. */

export type LessonCreatePolicy = {
  key: string;
  typeId: number;
  allowGroup: boolean;
  attachCgi: boolean;
  needGid: boolean;
  needTeacher: boolean;
  omitRoom: boolean;
  hint: string;
};

const POLICIES: LessonCreatePolicy[] = [
  { key: "group", typeId: 2, allowGroup: true, attachCgi: true, needGid: true, needTeacher: false, omitRoom: false, hint: "Постоянная группа: gid + group_ids, ученика в cgi." },
  { key: "makeup", typeId: 4, allowGroup: true, attachCgi: false, needGid: true, needTeacher: false, omitRoom: false, hint: "Отработка в слоте другой группы того же курса. group_ids есть, в состав не пишем." },
  { key: "extra", typeId: 10, allowGroup: true, attachCgi: false, needGid: false, needTeacher: false, omitRoom: false, hint: "Доп. урок. group_ids если есть слот." },
  { key: "overtime", typeId: 11, allowGroup: true, attachCgi: false, needGid: false, needTeacher: true, omitRoom: false, hint: "Сверхурочное: педагог teacher_id, дата, время." },
  { key: "trial", typeId: 3, allowGroup: false, attachCgi: false, needGid: false, needTeacher: false, omitRoom: true, hint: "Пробное: без group_ids. Зал не слать, если занят." },
  { key: "intro", typeId: 5, allowGroup: false, attachCgi: false, needGid: false, needTeacher: false, omitRoom: true, hint: "Вводное: как пробное, свой тип, без группы." },
  { key: "individual", typeId: 1, allowGroup: false, attachCgi: false, needGid: false, needTeacher: true, omitRoom: true, hint: "Индивидуальное: педагог, дата, время. Без группы." },
  { key: "master", typeId: 6, allowGroup: false, attachCgi: false, needGid: false, needTeacher: false, omitRoom: true, hint: "Мастер-класс, разовое, без группы." },
  { key: "open", typeId: 7, allowGroup: false, attachCgi: false, needGid: false, needTeacher: false, omitRoom: true, hint: "Открытый урок, без группы." },
  { key: "excursion", typeId: 8, allowGroup: false, attachCgi: false, needGid: false, needTeacher: false, omitRoom: true, hint: "Экскурсия, без группы." },
  { key: "camp", typeId: 9, allowGroup: false, attachCgi: false, needGid: false, needTeacher: false, omitRoom: true, hint: "Лагерь, без группы." },
  { key: "event", typeId: 12, allowGroup: false, attachCgi: false, needGid: false, needTeacher: false, omitRoom: true, hint: "Мероприятие, без группы." },
  { key: "interview", typeId: 13, allowGroup: false, attachCgi: false, needGid: false, needTeacher: false, omitRoom: true, hint: "Собеседование, без группы." },
  { key: "aftercare", typeId: 14, allowGroup: false, attachCgi: false, needGid: false, needTeacher: false, omitRoom: true, hint: "Продлёнка, без группы." },
  { key: "summer", typeId: 15, allowGroup: false, attachCgi: false, needGid: false, needTeacher: false, omitRoom: true, hint: "Летняя программа, без группы." },
];

const BY_KEY = new Map(POLICIES.map((p) => [p.key, p]));
const BY_ID = new Map(POLICIES.map((p) => [p.typeId, p]));

export function lessonCreatePolicy(raw?: string | number): LessonCreatePolicy {
  if (typeof raw === "number" && BY_ID.has(raw)) return BY_ID.get(raw)!;
  const s = String(raw || "").toLowerCase().trim();
  if (BY_KEY.has(s)) return BY_KEY.get(s)!;
  const n = Number(s);
  if (BY_ID.has(n)) return BY_ID.get(n)!;
  return BY_KEY.get("trial")!;
}

export function lessonAllowsGroup(raw?: string | number) {
  return lessonCreatePolicy(raw).allowGroup;
}

export function lessonOmitsRoom(raw?: string | number) {
  return lessonCreatePolicy(raw).omitRoom;
}

export const LESSON_POLICY_GROUPS = [
  { title: "В слот группы", keys: ["trial", "group", "makeup"] },
  { title: "Педагог и время", keys: ["individual", "overtime", "extra", "intro"] },
  { title: "Разовые события", keys: ["master", "open", "excursion", "camp", "event", "interview", "aftercare", "summer"] },
] as const;
