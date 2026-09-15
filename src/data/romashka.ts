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
 * ромашка 16 — полный снимок дерева системы: код, public (включая media),
 *              scripts, docs, storage точки восстановления, конфиги.
 *              Без node_modules / .output / .git (собираются заново).
 *              Живой диск кабинета VPS (crm-*.json) в этом клоне отсутствовал.
 *
 * Полный бэкап: storage/backups/ромашка-16-full.tar.gz
 * Исходники: storage/backups/ромашка-16-src.tar.gz
 * Замороженная ветка: restore/romashka-16
 * Тег: romashka-16
 * Предыдущая: ромашка 15 (`romashka-15`)
 */
export const ROMASHKA_REV = 16;
export const ROMASHKA_NAME = "Ромашка-16";
export const ROMASHKA_ID = "romashka-16";
export const ROMASHKA_AT = "2026-09-15T16:01:00Z";

export const ROMASHKA_NOTE = [
  "Всё из Ромашки-15: История из Alfa, очередь rastudio-history, касса 10/час, журнал-job на диске.",
  "Полный tar дерева: src, public (media), scripts, docs, content, server, migrations, storage точек, конфиги.",
  "Не в tar: node_modules, .output, .git. Живые crm-*.json кабинета — на VPS, в этом снимке их не было.",
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
