/** Правила диска: одно поле — одна правда. Имя и «похоже» не ключ. Alfa — разъём, не склад. */

export type DiskRule = {
  id: "cgi" | "tariff" | "course" | "local" | "journal" | "connector" | "money" | "comms";
  stage: 1 | 2 | 3 | 5 | 6 | 7 | 8 | 9;
  title: string;
  field: string;
  truth: string;
  not: string;
};

export const DISK_RULES: DiskRule[] = [
  {
    id: "cgi",
    stage: 1,
    title: "Состав группы",
    field: "groupLinks[].id + branchId",
    truth: "cgi-строка на диске, active≠false. taken = живые связи.",
    not: "group_ids карточки клиента, явка урока, quantity",
  },
  {
    id: "tariff",
    stage: 2,
    title: "Живой абонемент",
    field: "extras.live_tariff",
    truth: "строка CRM: id есть, removed≠1, e_date пусто или ≥ сегодня МСК. tariffRowLive.",
    not: "paid_till, balance, касса, архив шаблона",
  },
  {
    id: "course",
    stage: 3,
    title: "Курс и предмет",
    field: "courseId + subjectId",
    truth: "courseId = assign[gid:branchId:groupId] → slot.courseId → schedule-map[subjectId]. Предмет = subjectId CRM.",
    not: "название группы, хэштег, «похожий» курс, Number(пути)",
  },
  {
    id: "connector",
    stage: 5,
    title: "Alfa — разъём",
    field: "linked | offline",
    truth: "Склад — диск. Выход — очередь. Вход — фон и «Обновить», если по этому id нет очереди. Уход = offline, кабинет не переписываем.",
    not: "ждать API чтобы показать экран, затирать невыгруженное снимком Alfa, хранить правду только в Alfa",
  },
  {
    id: "local",
    stage: 6,
    title: "Свой id",
    field: "id < 0",
    truth: "Новая сущность на диске сразу с отрицательным id. Alfa вернула номер — перепись диска и очереди. Предметы 9000+ — старые свои.",
    not: "ждать номер Alfa, склеивать по имени, считать 9000+ номером клиента",
  },
  {
    id: "journal",
    stage: 7,
    title: "Журнал уроков",
    field: "calendar[].lessonId + customerIds + status",
    truth: "Занятие группы на диске. Явка = customerIds. status 1 план · 2 отмена · 3 проведено. cgi копируется в журнал только при «проведено» без списка.",
    not: "cgi как явка на каждый F5, last_attend, live lesson/index без кнопки «Обновить»",
  },
  {
    id: "money",
    stage: 8,
    title: "Деньги",
    field: "pays[].id + customerId",
    truth: "Журнал платежей на диске. Остаток = сумма строк (товар не двигает). Нет строк — снимок extras.balance. Alfa касса — очередь pay.create и «Обновить».",
    not: "live customer.balance на F5, paid_till, живой абонемент как касса",
  },
  {
    id: "comms",
    stage: 9,
    title: "Каналы консультанта",
    field: "comms[].id + customerId + channel",
    truth: "Лента на диске. actor: human|assistant|consultant|sync. Заявка, чат, ВК, MAX и SMS пишут сразу. Alfa communication — «Обновить», не затирает свои id и не-sync.",
    not: "live communication/index на F5, пустые comms как правда, факты только из Alfa",
  },
];

export function diskRuleOf(id: DiskRule["id"]) {
  return DISK_RULES.find((r) => r.id === id) || DISK_RULES[0];
}
