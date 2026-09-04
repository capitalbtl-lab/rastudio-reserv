/**
 * КАРТА ID — граф студии «Развивайся» для ИИ и CRM.
 * Точка восстановления: ромашка 3 (2026-09-03).
 *
 * ПРАВИЛО (обязательно для кода и агента):
 *   сущность ищется, пишется и связывается ТОЛЬКО по ID.
 *   Имя — подпись на экране, не ключ.
 *   Запрещено склеивать группу, курс, предмет, цену, абонемент или клиента
 *   по тексту («Бальные танцы» ≠ ключ). Если ID нет — сущность «без связи»,
 *   не угадывать «похожий» курс.
 *
 * ДВА ПРОСТРАНСТВА ID (не путать):
 *   AlfaCRM — числа: branchId, groupId, subjectId, tariffId, teacherId,
 *     customerId, lessonId, lessonTypeId.
 *   Сайт — строки: schoolId, courseId, priceId.
 *   CmsSession.courseId на публичном расписании = String(subjectId). Это
 *     ДРУГОЕ поле, не courseId дерева. В кабинете всегда CrmSlot.courseId.
 *
 * AlfaCRM:
 *   branchId     1 Гражданская · 2 ЦМИТ · 3 Луховицы · 4 лето
 *   groupId      gid группы (регулярное расписание)
 *   subjectId    предмет CRM (Настройки → Предметы)
 *   tariffId     абонемент CRM
 *   teacherId    педагог CRM
 *   customerId   клиент CRM = dossier.crmId
 *   lessonId     конкретный урок
 *   lessonTypeId 2 групповое, 1 пробное, 3 индивидуальное, …
 *
 * Сайт (storage/site-tree.json, prices.json):
 *   schoolId     школа в дереве, напр. /art-studio
 *   courseId     курс/направление, напр. /art-studio-3-4
 *                у новых папок: /school-{ts}#{ts}
 *   priceId      строка цены = PriceRow.id, обычно path курса
 *
 * СВЯЗИ (только эти поля):
 *   school 1—N course     course.schoolId
 *   course 1—N group      group.courseId  и  tree.assign[gid:{branchId}:{groupId}]
 *   group  N—1 subject    group.subjectId
 *   group  N—1 branch     group.branchId
 *   group  N—1 teacher    group.teacherId
 *   subject N—1 course    map.courses[].subjectId → courseId   (вкладка Соответствия)
 *   tariff  N—1 course    tariff-map.tariffId → courseId       (сайт, не CRM)
 *   price  N—1 course     price.courseId || price.path === course.id|href
 *   tariff N—M subject    tariff.subjectIds
 *   tariff N—M branch     tariff.branchIds
 *   client N—1 customer   dossier.crmId
 *   client N—M group      dossier.groupLinks[].id (=groupId) + .branchId
 *                         + .subjectId + .courseId
 *
 * КАК РЕЗОЛВИТЬ courseId ГРУППЫ (порядок, без имён):
 *   1. tree.assign[gid:{branchId}:{groupId}]
 *   2. slot.courseId, если такой курс есть в дереве
 *   3. schedule-map.courses[subjectId].courseId — пустая запись = «нет курса», шаг 4 не брать
 *   4. SUBJECT_TO_COURSE[subjectId] — только если предмета нет в карте
 *   иначе — «Без курса». Оператор выбирает папку (treeMove) или карту.
 *
 * КАК РЕЗОЛВИТЬ subjectId ГРУППЫ:
 *   1. group.subject_id из CRM
 *   2. regular-lesson.subject_id
 *   3. URL курса в заметке группы → обратный SUBJECT_TO_COURSE
 *   4. карта Соответствия: courseId → subjectId
 *   иначе 0 — жёлтая плашка «создать предмет в филиале».
 *
 * ОПЕРАЦИИ АГЕНТА:
 *   создать группу     courseId + branchId + teacherId [+ subjectId]
 *   перенести группу   treeMove { ids, courseId } — не переименовывать
 *   предмет к курсу    map.courses[subjectId].courseId = courseId
 *   абонемент к группе 1) slot.tariffId
 *                      2) tariff-map.tariffId → courseId = group.courseId
 *                      3) tariff.subjectIds ∋ group.subjectId
 *                         и tariff.branchIds ∋ group.branchId
 *                         и |duration − минут группы| ≤ 5
 *   абонемент к курсу  tariff-map.json (сайт, не CRM)
 *   клиент в группе    customerId + groupId + branchId, не ФИО
 *   цена курса         price.courseId = course.id (path)
 *   нет ID             спросить уточнение, не подбирать «похожий»
 *
 * Файлы: site-tree.json, crm-schedule.json, crm-subjects.json, prices.json,
 *        crm-tariffs.json, schedule-map.json, tariff-map.json, dossiers.json
 */
import type { CrmSlot } from "./crm-slots-core";
import type { SiteTree } from "./site-tree";
import { ROMASHKA_NAME, ROMASHKA_REV } from "./romashka";

/** Текущая точка восстановления архитектуры кабинета. */
export const ARCH_REV = ROMASHKA_NAME;
export const ARCH_REV_N = ROMASHKA_REV;

/** Филиалы AlfaCRM. Не переименовывать id. */
export const CRM_BRANCH: Record<number, { short: string; name: string }> = {
  1: { short: "Гражданская", name: "Коломна, ул. Гражданская, 2" },
  2: { short: "ЦМИТ", name: "Коломна, ЦМИТ, ул. Октябрьской революции, 340" },
  3: { short: "Луховицы", name: "Луховицы, ул. Пушкина, 202А" },
  4: { short: "Лето", name: "Летние программы" },
};

/**
 * Предмет CRM → courseId сайта (path = id курса в дереве).
 * Новые предметы добавлять сюда по subjectId, не по названию.
 * Живой оверрайд — storage/schedule-map.json (вкладка Соответствия).
 */
export const SUBJECT_TO_COURSE: Record<number, string> = {
  12: "/art-studio-3-4",
  116: "/art-studio-3-4",
  13: "/art-studio-5-6",
  14: "/art-studio-7-8",
  92: "/art-studio-9-13",
  115: "/art-studio-9-13",
  5: "/podgotovka-v-hudvuz",
  11: "/sculptural-studio",
  97: "/digitalartschool",
  36: "/robototehnika-5-7",
  37: "/robototehnika-7-9",
  35: "/robototehnika-10-14",
  114: "/roboticsinenglish",
  46: "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-python",
  48: "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-си",
  52: "/kursy-shkoly-programmirovaniya/it-школа-разработка-игр-на-unity",
  43: "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-5-7-лет",
  98: "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-7-9-лет",
  15: "/kursy-shkoly-programmirovaniya/it-лаборатория-dev-для-детей-9-10-лет",
  107: "/gamedesign",
  39: "/3d-modeling",
  27: "/science-course",
  89: "/teslaphysics",
  67: "/radioengineering",
  25: "/robototehnika-v-kolomne",
  16: "/preparation-for-school",
  108: "/happybricks",
  109: "/planet-steam",
  4: "/model-school-podium",
  110: "/englishlanguagesm",
  111: "/englishlanguagegg",
  112: "/vitaminkorean",
  113: "/japanese",
};

export type IdMapCourse = { subjectId: number; courseId?: string; siteHref?: string };

/** Ключ группы в tree.assign. Локальная группа без gid — её slot.id. */
export function groupAssignKey(s: { id?: string; groupId?: number; branchId?: number }) {
  if (Number(s.groupId) > 0) return `gid:${Number(s.branchId) || 0}:${s.groupId}`;
  return String(s.id || "");
}

function courseIdInTree(tree: SiteTree, id: string) {
  if (!id) return "";
  const hit = tree.courses.find((c) => c.id === id || c.href === id);
  return hit?.id || "";
}

/** courseId группы: сначала assign по gid, потом поле slot.courseId. Без угадывания по имени. */
export function courseIdOfGroup(s: Pick<CrmSlot, "id" | "groupId" | "branchId" | "courseId">, tree: SiteTree) {
  const key = groupAssignKey(s);
  const id = (key && tree.assign?.[key]) || s.courseId || "";
  return courseIdInTree(tree, id);
}

/** courseId по subjectId: таблица, затем дерево (id или href). */
export function courseIdOfSubject(subjectId: number, tree: SiteTree) {
  const path = SUBJECT_TO_COURSE[subjectId] || "";
  if (!path) return "";
  return courseIdInTree(tree, path) || path;
}

/**
 * Единая резолюция courseId группы. Порядок: assign → slot.courseId → карта subjectId (пустая = нет курса) → SUBJECT_TO_COURSE.
 * Имя курса / группы не участвует.
 */
export function resolveGroupCourseId(
  s: Pick<CrmSlot, "id" | "groupId" | "branchId" | "courseId" | "subjectId">,
  tree: SiteTree,
  mapCourses?: IdMapCourse[],
): string {
  const assigned = courseIdOfGroup(s, tree);
  if (assigned) return assigned;
  if (s.courseId) {
    const own = courseIdInTree(tree, s.courseId);
    if (own) return own;
  }
  if (s.subjectId && mapCourses?.length) {
    const link = mapCourses.find((c) => c.subjectId === s.subjectId);
    if (link) {
      const raw = String(link.courseId || link.siteHref || "").trim();
      if (!raw) return "";
      const fromMap = courseIdInTree(tree, raw);
      if (fromMap) return fromMap;
    }
  }
  if (s.subjectId) return courseIdOfSubject(s.subjectId, tree);
  return "";
}

/** Обратная связь: какие subjectId привязаны к этому courseId в статичной таблице. */
export function subjectIdsOfCourse(courseId: string): number[] {
  if (!courseId) return [];
  return Object.entries(SUBJECT_TO_COURSE)
    .filter(([, p]) => p === courseId)
    .map(([id]) => Number(id));
}

/** subjectId курса из живой карты Соответствия, иначе из SUBJECT_TO_COURSE (если ровно один). */
export function subjectIdOfCourse(courseId: string, mapCourses?: IdMapCourse[]): number {
  if (!courseId) return 0;
  if (mapCourses?.length) {
    const hit = mapCourses.find((c) => c.courseId === courseId || c.siteHref === courseId);
    if (hit?.subjectId) return hit.subjectId;
  }
  const ids = subjectIdsOfCourse(courseId);
  return ids.length === 1 ? ids[0] : 0;
}

/** Ключ строки цены = courseId сайта. */
export function priceRowKey(r: { courseId?: string; path?: string; id?: string }) {
  return String(r.courseId || r.path || r.id || "");
}

/** Кабинет администратора rastudio.org/admin */
export const CABINET_ID = "cabinet:admin";

/** Единая карточка клиента. Открывать только по customerId. */
export function clientCardId(customerId: number) {
  return `card:customer:${Number(customerId) || 0}`;
}

/** Единая карточка группы. Открывать только по groupId + branchId. */
export function groupCardId(branchId: number, groupId: number) {
  return `card:group:${Number(branchId) || 0}:${Number(groupId) || 0}`;
}

export const IDS_FOR_AGENT = `КАРТА ID (обязательно). Не ищи сущности по названию. Точка восстановления: ${ARCH_REV}.

филиал branchId: 1 Гражданская, 2 ЦМИТ, 3 Луховицы, 4 лето
группа groupId = gid AlfaCRM. Ключ связи: gid:{branchId}:{groupId}
предмет subjectId — Настройки→Предметы CRM
курс сайта courseId — папка в дереве школ. Группа лежит в курсе только если group.courseId или assign[ключ] = courseId
школа schoolId — course.schoolId
абонемент tariffId
  к курсу сайта: tariff-map.json tariffId → schoolId + courseId (вкладка Соответствия → Абонементы или колонка «Курс сайта»). Только сайт, в CRM не уходит.
  к группе: 1) slot.tariffId  2) courseId группы = courseId карты  3) subjectId ∈ tariff.subjectIds и branchId ∈ tariff.branchIds и минуты ±5
  имя абонемента не ключ
клиент customerId = dossier.crmId; группы клиента — groupLinks[].id (это groupId) + branchId + subjectId + courseId
карточка клиента clientCardId = card:customer:{customerId} — открывать только по customerId
карточка группы groupCardId = card:group:{branchId}:{groupId} — открывать только по groupId+branchId
не путать customerId и groupId (разные сущности, даже при равных числах)
клиенты: две оси status=учится|лид и view=дети|группы; архив тихий; автолиды каждые 5 мин только новые customerId
кабинет cabinetId = cabinet:admin
цена курса price.courseId = path курса. Колонка «Все» вкладки Цены курсов — сайт, расписание, абонементы. КБМ/ТМХ — формула от «Все».
соответствие subjectId → courseId в карте (вкладка Предметы, колонка «Курс сайта», файл schedule-map.json, не CRM). Справа на вкладке Предметы — группы/ученики по филиалам, не абонементы.
соответствие tariffId → schoolId + courseId (вкладка Соответствия → Абонементы, файл tariff-map.json, не CRM)

Создать группу: courseId + branchId + teacherId. Предмет: subjectId этого курса (карта или таблица).
Перенести группу: не переименовывать, сменить courseId / treeMove.
Привязать предмет к курсу: карта subjectId→courseId, не по названию.
Привязать абонемент к курсу сайта: карта tariffId→courseId, не по названию, не в CRM.
Клиента открывать по customerId, группу — по groupId.
Карточка клиента: clientCardId = card:customer:{customerId}. Одна форма везде (список, группа, ассистент). На десктопе — широкая правая панель (список ≤22rem), не popup.
Карточка группы: groupCardId = card:group:{branchId}:{groupId}. Из карточки клиента открывать группу по groupId, из группы — клиента по customerId.
Кабинет администратора: cabinetId = cabinet:admin. Вкладка клиентов data-pane=clients data-layout=list-card.
is_study: 0 лид · 1 клиент · 2 архив. studyStatusId — состояние обучения (1 Обучается …).
Занятие: customerLesson { lessonType, date, time, duration, groupId, subjectId, roomId, teacherId, topic, note } — popup data-op=lesson-dialog. Абонемент: кнопка data-op=add-tariff, customerTariff { tariffId, date } — popup data-op=tariff-dialog. Деньги: customerPay { payKind, sum }. Сохранить: customerSave, кнопка в шапке. Контакты — две колонки равной ширины: ребёнок|заказчик, телефон|заметка, почта. На десктопе карточка всегда открыта (первая в списке), без «Скрыть».
Календарь клиента: плитки LessonStrip как у группы (data-lesson-date, data-lesson-status). Сортировка клиентов: status учится|лид, затем branchId, затем ageBand. Архив и лиды из CRM — только по кнопке. «Загрузить лиды» ещё удаляет с сайта архивные лиды (is_study=2 и старые лиды не из активных).
Нет ID — спросить уточнение, не подбирать «похожий» курс.

CmsSession.courseId на сайте = subjectId (legacy). В кабинете courseId = id папки дерева.`;
