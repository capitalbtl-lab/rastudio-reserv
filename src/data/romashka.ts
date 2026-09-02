/**
 * Точки восстановления кабинета rastudio.org.
 * Имя «ромашка N» — снимок архитектуры, к которому можно откатиться.
 *
 * ромашка 1 — кабинет, цены, расписание, AlfaCRM.
 * ромашка 2 — карта ID (customerId / groupId / branchId / courseId / card:*).
 * ромашка 3 — единая карточка клиента, занятия и абонемент из карточки,
 *             лиды/архив только по кнопке, липкий рабочий стол клиентов.
 */
export const ROMASHKA_REV = 3;
export const ROMASHKA_NAME = "ромашка 3";
export const ROMASHKA_ID = "romashka-3";
export const ROMASHKA_AT = "2026-09-03";

export const ROMASHKA_NOTE = [
  "Карта ID: customerId, groupId, branchId, subjectId, courseId, tariffId, clientCardId, groupCardId, cabinetId.",
  "Карточка клиента одна: CrmClientCard. На десктопе правая панель, без «Скрыть», по умолчанию первая в списке.",
  "Контакты — две колонки равной ширины: ребёнок | заказчик; телефон | заметка; почта.",
  "Сохранить — кнопка в шапке. Назначить занятие — popup (дата, время, аудитория, группа, предмет, педагог, тема, комментарий, тип).",
  "Добавить абонемент — кнопка в блоке Остаток, popup tariffId + дата начала.",
  "Ближайшие занятия — плитки LessonStrip как у группы.",
  "Обновить = is_study=1 removed=0. Загрузить лиды = is_study=0 removed=0. Архив только тихой кнопкой.",
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
