/**
 * Точки восстановления кабинета rastudio.org.
 * Имя «ромашка N» — снимок архитектуры, к которому можно откатиться.
 *
 * ромашка 1 — кабинет, цены, расписание, AlfaCRM.
 * ромашка 2 — карта ID (customerId / groupId / branchId / courseId / card:*).
 * ромашка 3–9 — сняты с диска (теги удалены 2026-09-15); история в git жива.
 * ромашка 10 — карточка с диска без ожидания Alfa; касса: автоопрос 15 мин.
 * ромашка 12 — два педагога на группе, сверка экспорта шаблона, мультивыбор.
 * ромашка 13 — История из Alfa шаги 1–3. До ТЗ «Центр связи с AlfaCRM».
 * ромашка 14 — шаг 4 сверка остатка: эталон = шапка Alfa (customer.balance).
 * ромашка 15 — очередь rastudio-history, касса 10/час, журнал-job на диске.
 * ромашка 16 — полный снимок дерева: код, public (media), scripts, docs,
 *              storage точек. Без node_modules / .output / .git.
 *              Живой диск кабинета VPS (crm-*.json) в клоне отсутствовал.
 * ромашка 17 — полный снимок после канонов 4–5, пульта, сверки кассы
 *              (возврат −, корректировки ±, товар в оплатах не в остатке),
 *              ТЗ 1–5 (грязь / экраны / шаг 6–8). Код на main bf0e213
 *              плюс этот штамп. Живой диск VPS в клоне не входил.
 *
 * Полный бэкап: storage/backups/ромашка-17-full.tar.gz
 * Исходники: storage/backups/ромашка-17-src.tar.gz
 * Замороженная ветка: restore/romashka-17
 * Тег: romashka-17
 * Предыдущая: ромашка 16 (`romashka-16`)
 */
export const ROMASHKA_REV = 17;
export const ROMASHKA_NAME = "Ромашка-17";
export const ROMASHKA_ID = "romashka-17";
export const ROMASHKA_AT = "2026-09-18T22:01:01Z";

export const ROMASHKA_NOTE = [
  "Всё из Ромашки-16 плюс каноны шагов 4–5, пульт синхронизации, сверка кассы по API Alfa (возврат вычитает, корректировки ±, товар не в остатке).",
  "Полный tar дерева: src, public (media), scripts, docs, content, server, migrations, ТЗ, storage точек, конфиги.",
  "Не в tar: node_modules, .output, .git. Живые crm-*.json кабинета — на VPS, в этом снимке их нет.",
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
