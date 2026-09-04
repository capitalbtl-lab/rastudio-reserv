/**
 * Точки восстановления кабинета rastudio.org.
 * Имя «ромашка N» — снимок архитектуры, к которому можно откатиться.
 *
 * ромашка 1 — кабинет, цены, расписание, AlfaCRM.
 * ромашка 2 — карта ID (customerId / groupId / branchId / courseId / card:*).
 * ромашка 3 — единая карточка клиента, занятия и абонемент из карточки,
 *             лиды/архив только по кнопке, липкий рабочий стол клиентов.
 * ромашка 4 — пропущена (заказ сразу «Ромашка-5»).
 * ромашка 5 — группы как в CRM (статусы, приоритет, состав-roster),
 *             витрина сайта, запись без iframe, роли ИИ консультант/админка.
 *
 * Полный бэкап: storage/backups/ромашка-5-full.tar.gz
 * Замороженная ветка: restore/romashka-5
 * Тег: romashka-5
 */
export const ROMASHKA_REV = 5;
export const ROMASHKA_NAME = "Ромашка-5";
export const ROMASHKA_ID = "romashka-5";
export const ROMASHKA_AT = "2026-09-04T09:37:00Z";

export const ROMASHKA_NOTE = [
  "Карта ID без имён: groupId+branchId, customerId, subjectId, courseId, tariffId, statusId, priority.",
  "Статусы групп = AlfaCRM: 1 набор, 6 старт, 2 обучается набор идёт, 4 обучается набор закрыт (живая), 5 пауза, 10 не учится, 3 архив. Не путать 4 с архивом.",
  "Состав группы = roster CRM (учится + лиды), не явка на уроке. Все привязанные видны.",
  "Приоритет custom_prioritet: 1 первая запись, 2–3 очередь, 0 не на витрине. Колонки статус и приоритет в таблице расписания сразу пишут в CRM.",
  "Витрина rastudio.org: Админка → Сайт, матрица schedule/trial/group по statusId + priority ≥ 1 + courseId.",
  "Страница курса — только этот курс и возраст. Школа — курсы школы. Имя группы и «2024» не фильтр.",
  "Запись: кнопки пробное/в группу, окно сайта, не iframe AlfaCRM. Консультант (Олег/Ольга) записывает сам.",
  "Абонементы: карта tariff-map (сайт, не CRM). Мастер абонементов учеников — все ученики группы.",
  "Предметы: «нет курса», счётчики гр/уч, колонки тянутся. Цены — колонка «Все» база прайса.",
  "Модельная школа: отдельно курсы Подиум, макияж, личностный рост.",
  "ИИ: два мира. Консультант — родители. Голос админки — сотрудник. Граница в Ассистент ИИ → Окно.",
].join(" ");

export type RestorePoint = {
  id: string;
  name: string;
  rev: number;
  at: string;
  git: string;
  note: string;
};

export function currentRestorePoint(git = ""): RestorePoint {
  return {
    id: ROMASHKA_ID,
    name: ROMASHKA_NAME,
    rev: ROMASHKA_REV,
    at: ROMASHKA_AT,
    git,
    note: ROMASHKA_NOTE,
  };
}
