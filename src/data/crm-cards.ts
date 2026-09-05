/** Типы единых карточек клиента и группы. Без node:fs — можно импортировать в клиенте. */

export type ClientGroupLink = {
  id: number;
  name: string;
  branchId: number;
  school: string;
  active: boolean;
  subjectId?: number;
  courseId?: string;
};

export type ClientRegular = {
  groupId: number;
  groupName: string;
  day: string;
  from: string;
  to: string;
  teacher: string;
  subject: string;
  branch: string;
  room?: string;
  lessonId?: number;
  subjectId?: number;
  teacherId?: number;
  roomId?: number;
};

export type ClientLesson = {
  id: number;
  date: string;
  from: string;
  to: string;
  type: string;
  typeId: number;
  group: string;
  teacher: string;
  status?: number;
  subject?: string;
  room?: string;
};

export type ClientTariff = {
  id: number;
  tariffId?: number;
  name: string;
  rest: number;
  lessons: number;
  archived?: boolean;
  bDate?: string;
  eDate?: string;
  price?: number;
};

export type GroupMember = {
  id: number;
  name: string;
  parent: string;
  dob: string;
  age: string;
  phone: string;
  phones: string[];
  email: string;
  gender: string;
  from: string;
  to: string;
  archived: boolean;
  status: string;
};

export type CustomerComm = {
  id: number;
  at: string;
  who: string;
  channel: string;
  text: string;
  incoming: boolean;
};

export type CustomerPay = {
  id: number;
  kind: string;
  income: number;
  expenditure: number;
  note: string;
  documentDate: string;
};

export type CustomerCard = {
  id: number;
  cardId?: string;
  branchId: number;
  name: string;
  parent: string;
  dob: string;
  age: string;
  gender: string;
  phones: string[];
  emails: string[];
  address: string;
  status: string;
  isStudy?: number;
  leadStatusId?: number;
  studyStatus?: string;
  studyStatusId?: number;
  note: string;
  paidTill: string;
  teacher?: string;
  balance?: number;
  lessonsLeft?: number;
  url: string;
  schools: string[];
  groups: ClientGroupLink[];
  regular?: ClientRegular[];
  calendar?: ClientLesson[];
  tariffs?: ClientTariff[];
  comms: CustomerComm[];
  pays?: CustomerPay[];
  catalog?: LessonCatalog;
};

export type ClientRow = {
  id: string;
  crmId: number | null;
  cardId?: string;
  branchId: number | null;
  branchIds?: number[];
  child: string;
  parent: string;
  phone: string;
  age: number | string | null;
  ageBand?: string;
  gender: string;
  status: string;
  studyStatus?: string;
  courses: string[];
  schools?: string[];
  city: string;
  branch: string;
  groupLinks?: ClientGroupLink[];
  archived: boolean;
  leadStatusId?: number;
  note?: string;
  updatedAt?: string;
  hasLiveTariff?: boolean;
};

export type LessonCatalogItem = { id: number; name: string };
export type TariffOffer = {
  id: number;
  name: string;
  price: number;
  lessons: number;
  subjectIds?: number[];
  lessonTypeIds?: number[];
  periodCount?: number;
  periodType?: number;
  periodLabel?: string;
  eDate?: string;
  calculationType?: number;
};
export type GroupOffer = {
  id: number;
  name: string;
  branchId: number;
  subjectId?: number;
  teacher?: string;
  day?: string;
  from?: string;
  to?: string;
  course?: string;
  school?: string;
  schoolId?: string;
  courseId?: string;
};
export type LessonCatalog = {
  subjects: LessonCatalogItem[];
  teachers: LessonCatalogItem[];
  rooms: LessonCatalogItem[];
  tariffs?: TariffOffer[];
  groups?: GroupOffer[];
};

/** Типы занятий — те же id, что в AlfaCRM / LESSON_TYPES. */
export const CARD_LESSON_TYPES = [
  { id: 2, key: "group", name: "Групповое" },
  { id: 3, key: "trial", name: "Пробное" },
  { id: 4, key: "makeup", name: "Отработка" },
  { id: 5, key: "intro", name: "Вводное" },
  { id: 10, key: "extra", name: "Дополнительное" },
  { id: 11, key: "overtime", name: "Сверхурочное" },
  { id: 1, key: "individual", name: "Индивидуальное" },
  { id: 15, key: "summer", name: "Летняя программа" },
  { id: 13, key: "interview", name: "Собеседование" },
  { id: 7, key: "open", name: "Открытый урок" },
  { id: 6, key: "master", name: "Мастер-класс" },
  { id: 8, key: "excursion", name: "Экскурсия" },
  { id: 12, key: "event", name: "Мероприятие" },
  { id: 9, key: "camp", name: "Летний лагерь" },
  { id: 14, key: "aftercare", name: "Продлёнка" },
] as const;

export const CARD_PAY_KINDS = [
  { id: "income", name: "Доход" },
  { id: "product", name: "Продажа товара" },
  { id: "refund", name: "Возврат средств" },
  { id: "correct", name: "Корректировка" },
] as const;

export const CARD_STUDY_STATUS = [
  { id: 1, name: "Обучается" },
  { id: 4, name: "Ожидает старта" },
  { id: 8, name: "Ждём на занятиях" },
  { id: 7, name: "Пропустил 1 занятие" },
  { id: 10, name: "Пропустил 2 занятия" },
  { id: 11, name: "Пропустил 3 занятия" },
  { id: 5, name: "Должник" },
  { id: 2, name: "Завершил" },
  { id: 9, name: "Без статуса" },
] as const;
