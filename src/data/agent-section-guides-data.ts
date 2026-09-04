import { IDS_FOR_AGENT } from "./ids";

export type GuideRow = { entity: string; idField: string; link: string };
export type GuideTab = { id: string; title: string; body: string };
export type GuideOp = { id: string; title: string; body: string };

export type SectionGuide = {
  id: string;
  section: string;
  title: string;
  on: boolean;
  updatedAt: string;
  summary: string;
  graph: GuideRow[];
  cascade: string[];
  tabs: GuideTab[];
  ops: GuideOp[];
  never: string[];
  body: string;
};

/** Меняйте при правке протокола — оверлей storage без этой строки заменяется заводским. */
export const GUIDE_REV = "2026-09-04-site-book";

const SCHEDULE_GRAPH: GuideRow[] = [
  { entity: "Сайт", idField: "rastudio.org", link: "то, что видят родители. Админка = /admin + AlfaCRM" },
  { entity: "Филиал", idField: "branchId 1–4", link: "1 Гражданская · 2 ЦМИТ · 3 Луховицы · 4 лето" },
  { entity: "Кнопка пробного", idField: "trialOn", link: "Админка → Сайт. Форма rastudio.org, филиал = branchId группы" },
  { entity: "Кнопка в группу", idField: "groupOn", link: "Админка → Сайт. Тот же gid, kind=group" },
  { entity: "Пробное", idField: "kind=trial / lessonTypeId=3", link: "submit_trial + gid + date ближайшего занятия + timeFrom" },
  { entity: "Запись в группу", idField: "kind=group / lessonTypeId=2", link: "book_lesson lesson_type=group + gid. Не iframe AlfaCRM" },
  { entity: "Группа", idField: "groupId", link: "ключ gid:{branchId}:{groupId}" },
  { entity: "Карточка группы", idField: "groupCardId", link: "card:group:{branchId}:{groupId}" },
  { entity: "Предмет", idField: "subjectId", link: "карта → courseId" },
  { entity: "Курс сайта", idField: "courseId", link: "папка в дереве школ" },
  { entity: "Школа", idField: "schoolId", link: "course.schoolId" },
  { entity: "Абонемент", idField: "tariffId", link: "tariff-map → courseId/schoolId (сайт); fallback subjectIds + branchIds + минуты ±5" },
  { entity: "Клиент", idField: "customerId", link: "dossier.crmId; groupLinks[].id = groupId" },
  { entity: "Карточка клиента", idField: "clientCardId", link: "card:customer:{customerId}" },
  { entity: "Кабинет", idField: "cabinetId", link: "cabinet:admin" },
  { entity: "Статус учёбы", idField: "is_study", link: "0 лид · 1 клиент · 2 архив" },
  { entity: "Состояние", idField: "studyStatusId", link: "1 Обучается · 4 Ожидает старта · 8 Ждём · 7/10/11 пропуски · 5 должник · 2 завершил · 9 без статуса" },
  { entity: "Тип занятия", idField: "lessonTypeId / lessonType", link: "см. таблицу LESSON в протоколе" },
  { entity: "Платёж", idField: "payKind", link: "income · product · refund · correct" },
  { entity: "Цена", idField: "price.courseId", link: "= courseId курса" },
];

const SCHEDULE_CASCADE = [
  "tree.assign[gid:{branchId}:{groupId}]",
  "slot.courseId, если такой курс есть в дереве",
  "карта соответствий subjectId → courseId",
  "таблица SUBJECT_TO_COURSE[subjectId]",
  "иначе — «Без курса», без угадывания по тексту",
];

const SCHEDULE_TABS: GuideTab[] = [
  {
    id: "groups",
    title: "Группы",
    body: "Ключ группы — пара groupId + branchId, не название. gid:{branchId}:{groupId}. Карточка groupCardId = card:group:{branchId}:{groupId}. DOM: data-card-id, data-group-id, data-branch-id. Два места: (1) вкладка pane=groups — расписание слотов CRM (создание, выгрузка, папки courseId). (2) внутри Клиенты переключатель view=группы — слева список групп выбранного status+филиал+возраст, справа карточка группы. Состав CrmGroupMembers всегда три списка: Ученики (is_study=1), Лиды (is_study=0), Архивные ученики (is_study=2 / archived). Клик по человеку — только customerId → CrmClientCard; закрытие на десктопе возвращает карточку группы. Новая группа: courseId + branchId + teacherId. Предмет из карты курса, не из названия. Перенос: treeMove { ids, courseId }.",
  },
  {
    id: "clients",
    title: "Клиенты",
    body: "cabinetId=cabinet:admin, pane=clients. Ключ человека — customerId (= dossier.crmId). Карточка clientCardId=card:customer:{customerId}. Две независимые сортировки: status Текущие|Лиды (is_study 1|0) и view Группы|Дети. Матрица: Текущие+Дети = список учеников + CrmClientCard; Текущие+Группы = список групп + карточка группы; Лиды+Дети = список лидов + карточка; Лиды+Группы = только группы, у которых есть лиды (leadKeys = groupLinks[].id лидов) + карточка группы. Архив is_study=2 — тихая кнопка. Desktop ≥1024: список 22rem + панель, overlay запрещён. Mobile: overlay. Поиск q по имени/телефону/customerId — открытие и запись только по ID. Филиал = primary branchId 0|1|2|3|4, не branchIds[]. Возраст ageBand. Лето branchId=4 — филиал, не архив. Автозагрузка диска: is_study=1. «Обновить» = is_study=1 removed=0. «Загрузить лиды» = полный is_study=0 removed=0 + удалить с сайта архивные лиды. Фон каждые 5 мин: только новые customerId, которых нет в dossiers.json. Не перечитывать всех лидов.",
  },
  {
    id: "client-card",
    title: "Карточка клиента",
    body: "CrmClientCard [data-card-id=card:customer:{id}] [data-customer-id={id}]. Открывать только по customerId. Поля: name, parent, phones[], emails[], dob, age, gender, note, status/isStudy, studyStatusId, balance, groups[] (все, не только active: id=groupId + branchId + subjectId + courseId), regular[], calendar[] LessonStrip, tariffs[], comms[]. Действующая группа data-op=active-group — фактические groupId. Добавить в группу: popup data-op=group-dialog, поля branchId*, school-фильтр, groupId* (значение {branchId}:{groupId}), bDate, eDate → customerGroup. Ученик может быть в нескольких группах. Абонемент ученика: data-op=add-tariff, popup tariff-dialog: groupId ученика*, tariffId*, date начала, periodCount+periodType (1 день/2 неделя/3 месяц, конец inclusive −1 день), calcType 0 базовый / 1 раздельный (is_separate_balance), school-фильтр, subjectIds[], lessonTypeIds[], note → customerTariff. Списки в попапах — RaSelect (скруглённое меню), не native <select>. Клиент↔Лид = isStudy 1↔0. Сохранить data-op=save-contacts. Назначить занятие lesson-dialog: date, time, duration, roomId, groupId, subjectId*, teacherId, topic, note, lessonType.",
  },
  {
    id: "subjects",
    title: "Предметы",
    body: "Колонка «Курс сайта» по courseId. Создание предмета из группы сразу пишет соответствие subjectId → courseId. Имя предмета — подпись. Если в филиале нет нужного subjectId — сначала предложить выбрать из списка филиала, иначе создать и включить.",
  },
  {
    id: "prices",
    title: "Цены курсов",
    body: "Строка цены ищется по courseId / path. Не по названию курса. Продолжительность и уроки в неделю подгружаются кнопкой из групп, без жёсткой привязки.",
  },
  {
    id: "tariffs",
    title: "Абонементы",
    body: "Карточка абонемента CRM (tariffId) живёт во вкладке Абонементы. Привязка к школе и курсу сайта — отдельная карта storage/tariff-map.json: tariffId → schoolId + courseId. Это соответствие только на сайте, в AlfaCRM не выгружается. Колонка «Курс сайта» в таблице абонементов и вкладка Соответствия → Абонементы правят одну карту. Первая привязка угадывается по subjectIds через карту предметов, дальше только вручную по ID курса. Группа подходит к абонементу если: филиал ∈ tariff.branchIds, минуты ±5, тип урока 2 (групповое), и (courseId группы = courseId карты ИЛИ subjectId группы ∈ tariff.subjectIds). Имя абонемента не участвует. Архив не загружать. slot.tariffId — явный выбор на карточке группы, важнее автоподбора.",
  },
  {
    id: "site",
    title: "Сайт · запись",
    body: "Сайт rastudio.org — родители. Админка — /admin и AlfaCRM. На странице курса расписание из админки: название группы, педагог, день и время, свободные места (limit−taken), уровень, ближайшая дата занятия этой группы. Справа две кнопки (если включены в Админка → Сайт): «Запись на пробное» и «Запись в группу». Обе открывают одно окно в стиле сайта: ФИО родителя, ФИО ребёнка, дата рождения, телефон+почта в ряд, филиал только для чтения = branchId группы. Пробное → sendTrial kind=trial. В группу → kind=group. gid, date, timeFrom, courseId/subjectId уходят в AlfaCRM. Родителю iframe CRM не показывать. Ссылка группы /common/{branchId}/lead/create?gid={groupId} — запасная, не основной путь. Форма пробного CRM id=20 настраивается по филиалу в Админка → Сайт (trialByBranch). Выкл trialOn/groupOn — кнопок на сайте нет.",
  },
  {
    id: "map",
    title: "Соответствия",
    body: "Две карты, обе только на сайте, CRM не меняют. 1) Предметы CRM: subjectId → courseId + schoolId (schedule-map.json), живой оверрайд SUBJECT_TO_COURSE. 2) Абонементы: tariffId → courseId + schoolId (tariff-map.json). Переключатель Предметы CRM / Абонементы. Слева школы сайта, сверху курсы дерева, справа список с select курса. Сохранить абонементы — action saveTariffs. Не склеивать по названию абонемента или курса.",
  },
];

const SCHEDULE_OPS: GuideOp[] = [
  { id: "create-group", title: "Создать группу", body: "Нужны courseId + branchId + teacherId. subjectId — из карты этого курса. Нет subjectId в филиале — спросить / создать, не подставлять первый попавшийся." },
  { id: "move-group", title: "Перенести группу", body: "Сменить courseId / treeMove. Не склеивать по словам." },
  { id: "bind-subject", title: "Привязать предмет", body: "Карта subjectId → courseId на вкладке Соответствия → Предметы CRM." },
  { id: "bind-tariff", title: "Привязать абонемент к курсу сайта", body: "Карта tariffId → schoolId + courseId. Соответствия → Абонементы или колонка «Курс сайта» во вкладке Абонементы. saveTariffs. Файл tariff-map.json. В AlfaCRM не уходит. Не привязывать по имени." },
  { id: "open-group", title: "Открыть группу", body: "Только groupId + branchId. Карточка groupCardId = card:group:{branchId}:{groupId}. Состав: три списка Ученики / Лиды / Архивные ученики, клик = customerId. Голос: kind=openGroup. Из клиента: onOpenGroup(groupId, branchId)." },
  { id: "open-client", title: "Открыть клиента", body: "Только customerId. clientCardId = card:customer:{customerId}. Событие ra-open-client { customerId, branchId }. Несколько ФИО в поиске — вкладка clients + query, карточку открывать когда остался один customerId. Desktop = panel, не popup." },
  { id: "filter-clients", title: "Сортировка клиентов", body: "Две независимые оси. status: учится|лид (Текущие/Лиды), архив тихо. view: дети|группы. Событие ra-clients-filter { status, view, branchId, ageBand }. Матрица status×view обязательна. branchId 0 = все, 1–4 филиал. ageBand пусто = все." },
  { id: "pull-clients", title: "Загрузка текущих", body: "Кнопка «Обновить» = is_study=1 AND removed=0. Не читает лиды и архив." },
  { id: "pull-leads", title: "Загрузка лидов", body: "Кнопка «Загрузить лиды» = полный снимок is_study=0 removed=0, затем с сайта удалить архивные лиды (is_study=2 и лиды, которых нет среди активных). Текущих (is_study=1) не трогать. Авто каждые 5 минут: syncNewLeadsFromCrm — только customerId, которых ещё нет в dossiers.json. Старых лидов не перечитывать." },
  { id: "pull-archive", title: "Загрузка архива", body: "Только тихая кнопка. is_study=2. Не главная сортировка." },
  { id: "save-client", title: "Сохранить карточку", body: "adminSchedule action=customerSave { customerId, branchId, patch, isStudy?, studyStatusId? }. DOM data-op=save-contacts." },
  { id: "set-client-status", title: "Клиент ↔ Лид", body: "customerSave { isStudy: 1 } клиент. { isStudy: 0 } лид. Не путать с studyStatusId. Архив isStudy=2 только явно." },
  { id: "set-study-status", title: "Состояние обучения", body: "customerSave { studyStatusId }. 1 Обучается, 4 Ожидает старта, 8 Ждём, 7/10/11 пропуски, 5 должник, 2 завершил, 9 без статуса. RaSelect data-op=study-status." },
  { id: "assign-lesson", title: "Назначить занятие", body: "popup data-op=lesson-dialog. Поля: lessonType, date, time, duration, roomId, groupId, subjectId*, teacherId, topic, note. customerLesson. Нет subjectId — ошибка." },
  { id: "add-tariff", title: "Добавить абонемент ученика", body: "popup data-op=tariff-dialog. Поля: groupId ученика* (может быть в нескольких группах), tariffId*, b_date, periodCount+periodType (1 день / 2 неделя / 3 месяц, e_date = start+N единиц −1 день), calcType 0|1 (is_separate_balance), subjectIds[], lessonTypeIds[], note. customerTariff. Не угадывать tariffId по имени." },
  { id: "add-group", title: "Добавить в группу", body: "popup data-op=group-dialog. Поля: branchId*, фильтр школы, groupId* как {branchId}:{groupId}, bDate, eDate. customerGroup. Список групп = филиал+возраст слева. Не писать по названию группы." },
  { id: "list-live-groups", title: "Живые группы для записи", body: "list_groups { age, branch?, course? }. Вернёт gid, branchId, педагог, день, timeFrom, места, ближайшую дату. Назови 5–8 слотов. Не выдумывай gid и дату." },
  { id: "book-trial", title: "Записать на пробное", body: "submit_trial. Обязательно: parent, child, phone, branch_id (= branchId группы). Передай gid, date=ближайшее занятие этой группы ДД.ММ.ГГГГ, time=timeFrom, course_id=subjectId, group_name, dob если есть. kind=trial. Почта не обязательна. Филиал чужой группы не подставляй. Если мест нет — скажи и предложи другой слот." },
  { id: "book-group", title: "Записать в группу", body: "book_lesson lesson_type=group. Те же поля, gid обязателен. Не вызывай open_group и не отдавай родителю URL AlfaCRM. Это заявка в группу, не пробный урок. Если просят абонемент / «сразу ходить» — group, не trial." },
  { id: "site-signup-settings", title: "Настройки записи на сайте", body: "Админка → Сайт. trialOn / groupOn. trialByBranch[1..4] — URL формы CRM id=20 по филиалу. Сайт всегда рисует своё окно и шлёт лид через API, не iframe." },
  { id: "pull-push", title: "AlfaCRM расписание", body: "Загрузить — снимок групп на сайт. Выгрузить — только отмеченные чекбоксом. Сначала группа, потом регулярный урок с subjectId." },
];

const SCHEDULE_NEVER = [
  "Не искать сущности по названию. «Бальные танцы» и «2026 Бальные танцы 5-7 лет» сами не склеиваются.",
  "Нет ID — спросить уточнение, не подбирать «похожий» курс / клиента / группу.",
  "Группы в «Без курса» сами не переедут. Нужен courseId в карточке или соответствие предмета.",
  "CmsSession.courseId на публичном сайте = subjectId (legacy). В кабинете courseId = id папки дерева.",
  "Не консультировать родителей из агента расписания. Это не Олег и не Ольга.",
  "Не ставить телефон в заголовок «ребёнок». Телефон — отдельное поле. Нет имени — «Без имени».",
  "Не считать клиента в каждом филиале из branchIds[]. Только primary branchId.",
  "Не загружать архив кнопками «Обновить» и «Загрузить лиды». Обновить = is_study=1 removed=0. Лиды кнопка = полный is_study=0. Авто каждые 5 мин = только новые customerId. Архив — тихая кнопка is_study=2.",
  "Не открывать карточку клиента по ФИО. Только customerId / clientCardId.",
  "Не открывать группу по названию. Только groupId + branchId / groupCardId.",
  "Не путать customerId и groupId — разные пространства AlfaCRM. Карточки: card:customer:{id} vs card:group:{branchId}:{groupId}.",
  "Не писать в группу только groupId без branchId.",
  "Не показывать overlay и правую панель одновременно. Overlay только mobile. Desktop = panel.",
  "Не прятать карточку на десктопе. Кнопки «Скрыть» нет. Если нет выбранного — открыть items[0] списка.",
  "Не делать «Все» главной сортировкой клиентов. Главные: Текущие и Лиды. Группы|Дети — вторая ось, не вместо них.",
  "Не скроллить всю страницу внутри блока клиентов. Дальше крутятся список и карточка.",
  "Не перечитывать всех лидов каждые 5 минут. Только customerId, которых нет на сайте.",
  "Не смешивать native <select> в попапах — только RaSelect с RA_POP.",
  "Не выгружать карту абонемент→курс в AlfaCRM. tariff-map.json только сайт.",
  "Не искать абонемент для группы по названию. Сначала slot.tariffId, затем tariff-map.courseId, затем subjectId+филиал+минуты.",
  "Не открывать родителю форму AlfaCRM (/lead/create, iframe id=20). Записывать самому: submit_trial или book_lesson.",
  "Не выдумывать gid, дату и время. Дата пробного = ближайшее занятие выбранной группы, время = timeFrom слота.",
  "Не путать филиалы Коломны: 1 Гражданская, 2 ЦМИТ Октябрьской. Филиал заявки = branchId группы.",
  "Не ставить пробное, если просят сразу в группу / абонемент. kind=group, lessonTypeId=2.",
  "Не записывать молча в группу без мест. Сказать «мест нет» и предложить другой слот или свободный день.",
  "Не ждать почту, чтобы отправить заявку. Хватает parent + child + phone + branch_id.",
  "Не говорить «мы перезвоним», если заявка уже в CRM. Сказать: приняли, занятие на дату и время, педагог.",
];

function scheduleBody() {
  const graph = SCHEDULE_GRAPH.map((r) => `${r.entity}\t${r.idField}\t${r.link}`).join("\n");
  const tabs = SCHEDULE_TABS.map((t) => `### ${t.title} [${t.id}]\n${t.body}`).join("\n\n");
  const ops = SCHEDULE_OPS.map((o) => `- ${o.id} · ${o.title}: ${o.body}`).join("\n");
  const never = SCHEDULE_NEVER.map((n) => `- ${n}`).join("\n");
  return `ИНСТРУКЦИЯ РАЗДЕЛА «Расписание занятий» для ИИ. Метод: Карта ID. REV ${GUIDE_REV}. Точка восстановления: ромашка 3.
Где лежит: Ассистент ИИ → База знаний ИИ. Источник правил раздела. Агент читает этот текст при каждом запросе.

Правило: сущность ищется, открывается, пишется и связывается ТОЛЬКО по ID. Имя — подпись на экране, не ключ.
Конфликт ID: customerId и groupId — разные сущности CRM, даже если числа совпали. Всегда пространство имён: card:customer:{customerId} vs card:group:{branchId}:{groupId}. Группу всегда адресовать парой groupId+branchId (gid:{branchId}:{groupId}). Клиента — только customerId.

${IDS_FOR_AGENT}

Граф:
${graph}

Каскад courseId группы:
${SCHEDULE_CASCADE.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Единые карточки:
- Кабинет: cabinetId = cabinet:admin. Вкладки pane: groups | clients | subjects | prices | tariffs | map | public | crm. Полноэкранный режим скрывает неактивный pane через display:none, не lg:flex поверх hidden.
- Клиент: clientCardId = card:customer:{customerId}. Компонент CrmClientCard.
- Группа: groupCardId = card:group:{branchId}:{groupId}. Состав — три списка CrmGroupMembers.
- Ассистент: kind=openClient + customerId; kind=openGroup + groupId+branchId; kind=openTab pane=clients|groups [+status] [+view]; события ra-open-client, ra-clients-query, ra-clients-filter.

ПРОТОКОЛ UI · вкладка Клиенты
layout.desktop ≥1024 = список слева 22rem + ОДНА панель справа. data-layout=list-card. Overlay ЗАПРЕЩЁН.
layout.mobile = overlay только если !desktop.
sort.status = учится | лид     (Текущие / Лиды, data-sort=status)
sort.view   = дети | группы    (вторая ось, data-sort=entity) — независима от status
sort.branchId = 0|1|2|3|4
sort.ageBand = ""|3-4|5-6|7-9|10-12|13-17|18+
Матрица:
  учится+дети   → список customerId is_study=1 + CrmClientCard
  учится+группы → список групп (statusId∉{3,4}) + карточка группы
  лид+дети      → список customerId is_study=0 + CrmClientCard
  лид+группы    → группы с лидами (leadKeys из groupLinks лидов) + карточка группы
autoload.disk = is_study=1. Обновить CRM = is_study=1 removed=0.
лиды.кнопка = полный is_study=0 + purge архивных лидов с сайта.
лиды.авто = каждые 5 мин только новые customerId (нет в dossiers.json).
chip филиала = primary branchId.

ПРОТОКОЛ КАРТОЧКИ ГРУППЫ card:group:{branchId}:{groupId}
DOM data-card-id data-group-id data-branch-id
состав: Ученики (status=учится) · Лиды (status=лид) · Архивные ученики (archived)
клик по человеку = customerGet { customerId, branchId группы }. Закрытие карточки клиента на desktop при view=группы возвращает карточку группы.
календарь = LessonStrip groupInfo.calendar
абонементы группы = slot.tariffId, иначе match: филиал+минуты и (tariff-map.courseId = group.courseId ИЛИ subjectId ∈ tariff.subjectIds). Карта tariff-map только сайт.

ПРОТОКОЛ КАРТОЧКИ card:customer:{id}
DOM: [data-card-id="card:customer:{id}"] [data-customer-id="{id}"]
поля: name, parent, phones[], emails[], dob, age, gender, note, status, isStudy, studyStatusId, balance, groups[{id,branchId,subjectId,courseId,name,active}], regular[], calendar[], tariffs[], comms[]
группы ученика — все card.groups, не только active. Добавление: group-dialog branchId + {branchId}:{groupId} + период → customerGroup.
абонемент ученика: tariff-dialog groupId + tariffId + период (count/type) + calcType 0|1 + subjectIds[] + lessonTypeIds[] → customerTariff
попапы: RaSelect (rounded RA_POP), не OS-select.
клиент/лид: data-is-study 1|0. Состояние: studyStatusId.
календарь: LessonStrip.
деньги: customerPay payKind.

СЕРВЕР adminSchedule POST (token обязателен)
customerGet    { customerId, branchId } → { customer }
customerSave   { customerId, branchId, isStudy?, studyStatusId?, patch? } → { customer }
customerLesson { customerId, branchId, lessonType, date, time, duration?, groupId?, subjectId?, roomId?, teacherId?, topic?, note? }
customerTariff { customerId, branchId, tariffId, date, groupId?, periodCount?, periodType?, calcType?, subjectIds?, lessonTypeIds?, note? }
customerGroup  { customerId, branchId, groupId, bDate?, eDate? }
groupGet       { groupId, branchId }
groupMembers   { groupId, branchId } → { active[], archive[] } active делить по status учится|лид
voiceAsk       { prompt, ids[] } → kind openClient|openGroup|openTab|edit|question|refuse

LESSON (lessonType key = type AlfaCRM)
2 group Групповое · 3 trial Пробное · 4 makeup Отработка · 5 intro Вводное · 10 extra Дополнительное · 11 overtime Сверхурочное · 1 individual Индивидуальное · 15 summer Летняя программа · 13 interview Собеседование · 7 open Открытый урок · 6 master Мастер-класс · 8 excursion Экскурсия · 12 event Мероприятие · 9 camp Летний лагерь · 14 aftercare Продлёнка

PAY payKind
income Доход · product Продажа товара · refund Возврат средств · correct Корректировка

is_study: 0 лид · 1 клиент (учится) · 2 архив
studyStatusId: 1 Обучается · 4 Ожидает старта · 8 Ждём на занятиях · 7 Пропустил 1 · 10 Пропустил 2 · 11 Пропустил 3 · 5 Должник · 2 Завершил · 9 Без статуса
periodType: 1 день · 2 неделя · 3 месяц · 4 год. e_date inclusive = start + N − 1 день.
calcType: 0 базовый (общий счёт) · 1 раздельный (is_separate_balance=1)

СОБЫТИЯ ОКНА
ra-open-client { customerId, branchId, q? }
ra-clients-query { q }
ra-clients-filter { status?, view?, branchId?, ageBand? }

ПРОТОКОЛ ЗАПИСИ НА САЙТЕ (родители, Олег/Ольга)
Сайт = rastudio.org. Админка = /admin + AlfaCRM. Данные групп на сайте берутся из админки, не из «названия на странице».
Строка расписания: group, teacher, when (день+timeFrom–timeTo), freePlaces=limit−taken, level, nextLessonDate (ближайший день недели этой группы), branchId, groupId, age.
Кнопки (Админка → Сайт, trialOn/groupOn): «Запись на пробное» / «Запись в группу». Одно окно rastudio.org, филиал locked = branchId группы.
Поля окна: parent*, child*, dob*, phone*, email, branch readonly.
Пробное: submit_trial kind=trial lessonTypeId=3. gid, date=nextLesson ДД.ММ.ГГГГ, time=timeFrom, course_id=subjectId, branch_id=branchId.
В группу: book_lesson lesson_type=group lessonTypeId=2. gid обязателен. Не open_group, не URL /lead/create родителю.
Свободный день: заявка без gid, в note «дату согласуем». Не выдумывать время.
Обязательный минимум: parent + child + phone + branch_id. Почту не ждать. dob если сказали, иначе возраст → 01.09 года рождения.
Филиалы: 1 Гражданская · 2 ЦМИТ Октябрьской 340 · 3 Луховицы Пушкина 202А · 4 лето (апрель–август).
После успеха: «заявку приняли, {пробное|групповое} на {дата} {время}, {педагог}, {филиал}». URL не читать. «Перезвоним» — запрещено.
Мест нет: не записывать молча. Предложить другой слот / свободный день / другой филиал.
list_groups {age, branch?, course?} → живые слоты. Назвать 5–8: день, время, педагог, филиал, места, ближайшая дата. gid не произносить вслух родителю, но передать в инструмент.
Настройки: storage/site-signup.json trialOn groupOn trialByBranch. CRM форма id=20 — запас, сайт шлёт API.

Вкладки раздела:
${tabs}

Операции (id операции — ключ для ИИ):
${ops}

Запреты:
${never}
`;
}

export const FACTORY_GUIDES: SectionGuide[] = [
  {
    id: "schedule",
    section: "schedule",
    title: "Расписание занятий",
    on: true,
    updatedAt: "",
    summary:
      "Карта ID: группы, клиенты, занятия, абонементы→курс сайта (tariff-map, не CRM), вкладки pane.",
    graph: SCHEDULE_GRAPH,
    cascade: SCHEDULE_CASCADE,
    tabs: SCHEDULE_TABS,
    ops: SCHEDULE_OPS,
    never: SCHEDULE_NEVER,
    body: scheduleBody(),
  },
  {
    id: "site",
    section: "site",
    title: "Сайт · запись",
    on: true,
    updatedAt: "",
    summary:
      "Пробное и запись в группу с сайта: живое расписание, филиал группы, педагог, ближайшая дата. ИИ записывает сам, без формы AlfaCRM.",
    graph: SCHEDULE_GRAPH.filter((r) => /Сайт|Филиал|Группа|Пробное|Запись|Кнопка|Предмет|Курс/.test(r.entity)),
    cascade: [],
    tabs: SCHEDULE_TABS.filter((t) => t.id === "site" || t.id === "groups"),
    ops: SCHEDULE_OPS.filter((o) => /list-live|book-trial|book-group|site-signup/.test(o.id)),
    never: SCHEDULE_NEVER.filter((n) => /AlfaCRM|gid|филиал|пробн|мест нет|почт|перезвон/i.test(n)),
    body: siteBookBody(),
  },
  {
    id: "clients",
    section: "clients",
    title: "Клиенты",
    on: true,
    updatedAt: "",
    summary: "customerId, матрица Текущие/Лиды × Группы/Дети, карточка ученика, абонемент и группа только по ID.",
    graph: SCHEDULE_GRAPH.filter((r) => /Клиент|Группа|Статус|Абонемент|Кабинет|Филиал/.test(r.entity)),
    cascade: [],
    tabs: SCHEDULE_TABS.filter((t) => t.id === "clients" || t.id === "client-card"),
    ops: SCHEDULE_OPS.filter((o) => /client|lead|tariff|lesson|filter|save|study|add-group|pull-/.test(o.id)),
    never: SCHEDULE_NEVER.filter((n) => /клиент|лид|ФИО|customerId|абонемент|5 мин|select/i.test(n)),
    body: clientsBody(),
  },
  {
    id: "groups",
    section: "groups",
    title: "Группы",
    on: true,
    updatedAt: "",
    summary: "groupId+branchId, карточка группы, три списка состава, без склейки по названию.",
    graph: SCHEDULE_GRAPH.filter((r) => /Группа|Филиал|Предмет|Курс|Школа|Клиент|Абонемент/.test(r.entity)),
    cascade: SCHEDULE_CASCADE,
    tabs: SCHEDULE_TABS.filter((t) => t.id === "groups" || t.id === "map" || t.id === "tariffs"),
    ops: SCHEDULE_OPS.filter((o) => /group|subject|tariff|pull-push/.test(o.id)),
    never: SCHEDULE_NEVER.filter((n) => /групп|groupId|курс|названи/i.test(n)),
    body: groupsBody(),
  },
];

function clientsBody() {
  const clients = SCHEDULE_TABS.find((t) => t.id === "clients")?.body || "";
  const card = SCHEDULE_TABS.find((t) => t.id === "client-card")?.body || "";
  return `ИНСТРУКЦИЯ РАЗДЕЛА «Клиенты» для ИИ. Карта ID. REV ${GUIDE_REV}.
Где лежит: Ассистент ИИ → База знаний ИИ → Клиенты.

Ключ человека — customerId (= dossier.crmId). Карточка clientCardId = card:customer:{customerId}.
Не открывать и не писать по ФИО. customerId и groupId — разные пространства; группу всегда пара groupId+branchId.

${clients}

${card}

Матрица status×view:
учится+дети → список учеников + CrmClientCard
учится+группы → список групп + карточка группы (состав: ученики/лиды/архив)
лид+дети → список лидов + CrmClientCard
лид+группы → группы с лидами + карточка группы

Загрузка: Обновить = is_study=1 removed=0. Загрузить лиды = полный is_study=0 + purge архивных. Авто 5 мин = только новые customerId.
Добавить в группу: {branchId}:{groupId} + период. Абонемент: tariffId + groupId ученика + periodCount/type + calcType + subjectIds + lessonTypeIds.
`;
}

function groupsBody() {
  const groups = SCHEDULE_TABS.find((t) => t.id === "groups")?.body || "";
  return `ИНСТРУКЦИЯ РАЗДЕЛА «Группы» для ИИ. Карта ID. REV ${GUIDE_REV}.
Где лежит: Ассистент ИИ → База знаний ИИ → Группы.

Ключ группы — groupId + branchId. gid:{branchId}:{groupId}. Карточка groupCardId = card:group:{branchId}:{groupId}.
Не склеивать по названию. courseId — папка дерева, не subjectId.

${groups}

Состав (groupMembers): Ученики is_study=1, Лиды is_study=0, Архивные is_study=2.
Клик по человеку — customerId. Закрытие карточки клиента при view=группы возвращает карточку группы.
Создать группу: courseId + branchId + teacherId. Предмет из карты курса.
Перенос: treeMove { ids, courseId }.
Абонемент группы: карта tariffId → courseId (Соответствия → Абонементы), не имя. CRM не меняется.
`;
}

function siteBookBody() {
  return `ИНСТРУКЦИЯ РАЗДЕЛА «Сайт · запись» для ИИ. Карта ID. REV ${GUIDE_REV}.
Где лежит: Ассистент ИИ → База знаний ИИ → Сайт · запись.
Точка восстановления: ромашка 3.

Это инструкция, по которой ИИ САМ записывает ребёнка на пробное или в группу, без администратора и без формы AlfaCRM на экране родителя.

ТЕРМИНЫ
Сайт — rastudio.org, родители выбирают курс и группу.
Админка — /admin (дерево школ, группы, соответствия) + AlfaCRM.
Данные на сайте (педагог, день, время, места, уровень, ближайшая дата, филиал) берутся из админки. Названия на витрине — подпись.

ФИЛИАЛЫ (branchId)
1 Коломна, Гражданская, 2
2 Коломна, ЦМИТ, Октябрьской революции, 340
3 Луховицы, Пушкина, 202А
4 летние программы (только апрель–август)
Заявка всегда в branchId выбранной группы. Гражданскую и ЦМИТ не путать.

ЧТО ВИДИТ РОДИТЕЛЬ НА СТРАНИЦЕ КУРСА
Слева список групп: возраст, имя группы, день timeFrom–timeTo, педагог, уровень, свободные места, ближайшая дата пробного.
Справа две кнопки, если включены в Админка → Сайт:
  trialOn — «Запись на пробное»
  groupOn — «Запись в группу»
Окно в стиле сайта (не iframe CRM): родитель, ребёнок, дата рождения, телефон и почта в один ряд, филиал только чтение.
Пробное шлёт kind=trial. В группу — kind=group. gid, date ближайшего занятия, timeFrom, subjectId.

ИНСТРУМЕНТЫ
1) list_groups { age, branch?, course? }
   Живые слоты. Поля: gid, branchId, name, teacher, when, timeFrom, seats, nextDate, wait.
   Назови родителю 5–8: день, время, педагог, филиал, места, ближайшая дата. gid вслух не читай.
2) submit_trial — первое посещение, пробное (lessonTypeId=3).
   Обязательно: parent, child, phone, branch_id.
   Передай: gid, date ДД.ММ.ГГГГ (= nextDate слота), time=timeFrom, course_id=subjectId, group_name, dob если есть, kind=trial.
3) book_lesson lesson_type=group — сразу в группу (lessonTypeId=2). gid обязателен. Те же поля.
4) open_group — НЕ использовать. Форму AlfaCRM /common/{branch}/lead/create?gid= родителю не открывать.
Свободный день: submit_trial без gid, в комментарии «дату согласуем». Время не выдумывать.

ПОРЯДОК БЕЗ АДМИНИСТРАТОРА
Возраст → направление (2–3 варианта) → list_groups.
Родитель выбрал слот → собрать parent, child, phone (dob если сказал).
Сразу вызвать инструмент. Почту не ждать.
Если данных не хватает — один короткий вопрос, не анкета.
Мест нет (seats=«мест нет») — не записывать. Другой слот / свободный день / другой филиал.
После ok: «Заявку приняли. {Пробное|Групповое} на {дата} в {время}, педагог {имя}, {филиал}.» Не «перезвоним». URL не читать.

НАСТРОЙКИ АДМИНКИ → Сайт
storage/site-signup.json: trialOn, groupOn, trialByBranch[1..4] (URL формы CRM id=20).
Сайт всегда своё окно + API. iframe id=20 — только запас в настройках.

СВЯЗИ ID
Группа: gid:{branchId}:{groupId}
Курс сайта: courseId дерева (path). На публичном слоте CmsSession.courseId иногда = subjectId — для заявки бери subjectId/directionId.
Педагог: teacher / teacherId слота.
Абонемент к курсу сайта: tariff-map, в CRM не уходит. Для записи на пробное/в группу абонемент не нужен.

ЗАПРЕТЫ
- Не открывать родителю AlfaCRM.
- Не выдумывать gid, дату, время.
- Не ставить пробное, если просят сразу в группу.
- Не менять филиал группы.
- Не ждать почту.
- Не склеивать группу по названию.
`;
}

export function factoryGuide(id: string) {
  return FACTORY_GUIDES.find((g) => g.id === id);
}
