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
 *   Хэштеги (custom_hashtagkursa) — чужое поле CRM, не ключ. Игнорировать
 *   для филиала, школы, курса, предмета, статуса. Филиал = branchId, не #Филиал*.
 *
 * ДВА ПРОСТРАНСТВА ID (не путать):
 *   AlfaCRM — числа: branchId, groupId, subjectId, tariffId, teacherId,
 *     customerId, lessonId, lessonTypeId.
 *   Сайт — строки: schoolId, courseId, priceId.
 *   CmsSession.courseId = courseId дерева. subjectId лежит в directionId.
 *
 * AlfaCRM:
 *   branchId     1 Гражданская · 2 ЦМИТ · 3 Луховицы · 4 лето
 *   groupId      gid группы (регулярное расписание)
 *   subjectId    предмет CRM (Настройки → Предметы)
 *   tariffId     абонемент CRM
 *   teacherId    педагог CRM
 *   customerId   клиент CRM = dossier.crmId
 *   lessonId     конкретный урок
 *   lessonTypeId 2 групповое, 3 пробное, 1 индивидуальное, …
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
 *   1. tree.assign[gid:{branchId}:{groupId}] — ручной перенос в карточке
 *   2. slot.courseId, если такой курс есть в дереве
 *   3. schedule-map.courses[subjectId].courseId (Админка → Соответствия)
 *      пустая запись карты не стирает assign
 *   иначе — «Без курса». Не угадывать по тексту.
 *   Заводская таблица SUBJECT_TO_COURSE — только посев пустого schedule-map.json.
 *
 * ЧТЕНИЕ: диск сайта. Alfa не спрашивать, если есть customerId/groupId на диске.
 * ЗАПИСЬ: диск сразу, Alfa очередью (customer.update, group.update,
 *   regular-lesson.update, cgi.apply, customer-tariff.create).
 * Живой абонемент: extras.live_tariff. Состав: groupLinks id+branchId.
 *
 * КАК РЕЗОЛВИТЬ subjectId ГРУППЫ:
 *   1. group.subject_id из CRM
 *   2. regular-lesson.subject_id
 *   иначе 0 — жёлтая плашка, выбрать предмет филиала. Не из имени, не из хэштега, не из заметки.
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
import { ROMASHKA_NAME, ROMASHKA_REV } from "./romashka";

export {
  groupAssignKey,
  canonCourseId,
  canonSchoolId,
  courseIdOfGroup,
  courseIdOfSubject,
  resolveGroupCourseId,
  joinCourseSubject,
  courseSubjectGapText,
  subjectIdsOfCourse,
  subjectIdOfCourse,
} from "./course-subject-core";
export type { IdMapCourse, CourseSubjectJoin, CourseSubjectSource, CourseSubjectGap } from "./course-subject-core";

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
 * Посев пустого schedule-map.json (админка → Соответствия → Предметы).
 * В рантайме не читается: живая карта — storage/schedule-map.json.
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

ПРАВДА НА ДИСКЕ САЙТА: слоты, dossiers, site-tree, schedule-map, tariff-map, group-cards.
AlfaCRM не источник ответа. Она догоняет очередью: customer.update · group.update · regular-lesson.update · cgi.apply · customer-tariff.create.
Читать API CRM нельзя, если на диске уже есть customerId или groupId.
Писать (админка): сначала диск, потом очередь. Не ждать ответ Alfa.
Актор записи: human · assistant · consultant · sync. Настройка CRM → Люди и роли.
Свой id < 0, пока Alfa не вернула номер. Перепись диска и очереди. 9000+ только у старых предметов.
Журнал уроков: calendar[].lessonId. Явка = customerIds, не cgi и не last_attend. status 1 план · 2 отмена · 3 проведено.
Деньги: pays[].id + customerId. Остаток = сумма строк диска. Alfa касса — pay.create и «Обновить», не F5. paid_till не касса.
Каналы: comms[].id + customerId + channel. Чат, заявка, ВК, MAX и SMS — на диск сразу. Alfa communication — «Обновить».
Связь Alfa: разъём, не склад. linked — очередь и «Обновить». offline — уход, кабинет тот же, очередь копит.

филиал branchId: 1 Гражданская, 2 ЦМИТ, 3 Луховицы, 4 лето
группа groupId = gid. Ключ: gid:{branchId}:{groupId}
предмет subjectId — Настройки→Предметы CRM
курс сайта courseId — папка в дереве. Группа в курсе: assign, иначе slot.courseId, иначе карта subjectId→courseId
школа schoolId — course.schoolId. Не склеивать по названию школы.
абонемент tariffId
  к курсу сайта: tariff-map.json tariffId → schoolId + courseId (вкладка Соответствия → Абонементы). Несколько курсов у одного tariffId. В CRM не уходит.
  к группе: 1) slot.tariffId  2) courseId группы = courseId карты  3) subjectId ∈ tariff.subjectIds и branchId ∈ tariff.branchIds и минуты ±5
  имя абонемента не ключ
  живой у ученика: extras.live_tariff=1 (диск). Не пакеты CGI.
клиент customerId = dossier.crmId; группы — groupLinks[].id (=groupId) + branchId + subjectId + courseId, active≠false
карточка клиента clientCardId = card:customer:{customerId}
карточка группы groupCardId = card:group:{branchId}:{groupId} — с диска/слота, fresh только «обновить»
соответствие subjectId → courseId (schedule-map.json, вкладка Соответствия). href сводится к id дерева. Непривязанные не копировать в каждую школу.
соответствие tariffId → courseId (tariff-map.json). Плюс — ещё один курс того же абонемента.
приоритет/статус группы: groupFlags диск + очередь group.update. Пустой приоритет = 0.
мастер абонементов: состав и счётчики с диска; назначение в очередь (до 400); CRM только если live_tariff не размечен.
list_groups консультанта = слоты сайта, не API. Первой группу с priority=1. gid вслух не читай.
CmsSession.courseId на сайте = courseId дерева. subjectId лежит в directionId. Число из CRM не курс сайта.
Нет ID — спросить уточнение, не подбирать «похожий».`;
