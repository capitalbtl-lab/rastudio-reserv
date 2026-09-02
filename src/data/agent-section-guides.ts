import { createServerFn } from "@tanstack/react-start";
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
export const GUIDE_REV = "2026-09-03-purge-leads";

const SCHEDULE_GRAPH: GuideRow[] = [
  { entity: "Филиал", idField: "branchId 1–4", link: "1 Гражданская · 2 ЦМИТ · 3 Луховицы · 4 лето" },
  { entity: "Группа", idField: "groupId", link: "ключ gid:{branchId}:{groupId}" },
  { entity: "Карточка группы", idField: "groupCardId", link: "card:group:{branchId}:{groupId}" },
  { entity: "Предмет", idField: "subjectId", link: "карта → courseId" },
  { entity: "Курс сайта", idField: "courseId", link: "папка в дереве школ" },
  { entity: "Школа", idField: "schoolId", link: "course.schoolId" },
  { entity: "Абонемент", idField: "tariffId", link: "subjectIds + branchIds + длительность ±5 мин" },
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
    body: "Папка курса только по courseId / assign. Новая группа: courseId + branchId + teacherId. Предмет — из карты курса, не из названия. Нет предмета в филиале — жёлтая плашка и «создать предмет». Перенос: treeMove { ids, courseId }. Карточка groupCardId = card:group:{branchId}:{groupId}. DOM: data-card-id, data-group-id, data-branch-id. Состав CrmGroupMembers: клик → CrmClientCard по customerId. Из клиента обратно в группу — groupId+branchId. Состав группы — overlay карточки клиента (из модалки группы), не дублировать панель списка.",
  },
  {
    id: "clients",
    title: "Клиенты",
    body: "cabinetId=cabinet:admin, вкладка clients. DOM корня: [data-cabinet-id=cabinet:admin] [data-pane=clients]. Ключ человека — customerId. Карточка одна: CrmClientCard, clientCardId=card:customer:{id}. На десктопе (≥1024px) ТОЛЬКО правая панель variant=panel, ШИРОКАЯ (grid 22rem список + 1fr карточка, data-layout=list-card). По умолчанию открыта первая карточка списка (items[0]). Кнопки «Скрыть» нет. Overlay (createPortal) — только мобильный список, кнопка «Закрыть». Две карточки сразу запрещены. Шапка: строка 1 — поиск-капсула max-w-md + сегмент Текущие|Лиды + действия; строка 2 — филиал и возраст. Поиск по имени / телефону / customerId / card:customer:{id}. Главные сортировки: Текущие (status=учится, is_study=1) и Лиды (status=лид, is_study=0). Второй уровень: branchId 0|1|2|3|4 (чип филиала = primary branchId, не branchIds[]). Третий: ageBand \"\"|3-4|5-6|7-9|10-12|13-17|18+. Архив (is_study=2) — тихая кнопка, не главная сортировка. Автозагрузка с диска и CRM — только is_study=1. Лиды и архив — только по кнопке «Загрузить лиды» / «Загрузить архив». Не выгружать три статуса сразу. Чип «Все» не показывать. Лето (branchId 4) — филиал, не архив. Телефон в name/child — не заголовок, писать «Без имени».",
  },
  {
    id: "client-card",
    title: "Карточка клиента",
    body: "Компонент CrmClientCard. DOM: [data-card-id=card:customer:{id}] [data-customer-id={id}]. Одна форма: список, группа, голос. Открывать только по customerId / clientCardId, не по ФИО. Поля: name (ребёнок, не телефон), parent (заказчик/legal_name), phones[], emails[], dob, age, gender, address, note, status/isStudy, studyStatusId, balance, lessonsLeft, paidTill, groups[] (groupId+branchId+subjectId+courseId), regular[] (день, from, to, teacher, subject, groupId — как в карточке группы), calendar[] (ближайшие занятия — плитки LessonStrip как в группе). tariffs[], comms[] с фильтром channel. Контакты — сетка 2 колонки равной ширины: ребёнок | заказчик; телефон | заметка; почта. Телефон=почта=ребёнок, заметка=заказчик. Сохранить — кнопка в шапке справа data-op=save-contacts, текст «Сохранить». Кнопки «Скрыть» на десктопе нет. Добавить абонемент: кнопка data-op=add-tariff в блоке Остаток, popup data-op=tariff-dialog (tariffId*, date). Назначить занятие: чип CARD_LESSON_TYPES открывает popup data-op=lesson-dialog как в AlfaCRM (заголовок «{тип} — запланировать»). Поля: тип, дата, время+мин, аудитория roomId, группа groupId, предмет subjectId*, педагог teacherId, тема, комментарий. Сохранение customerLesson. Статус Клиент↔Лид = is_study 1↔0. Состояние — select studyStatusId. Баланс — customerPay. Группа открывается по groupId+branchId. Ссылка url — карточка в AlfaCRM.",
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
    body: "Группа подходит к абонементу, если совпали subjectId, branchId и минуты (±5). Имя абонемента не участвует. Архивные абонементы не загружать.",
  },
  {
    id: "map",
    title: "Соответствия",
    body: "Перенос предмета пишет courseId + schoolId. После сохранения группы раскладываются по этим ID. Это живой оверрайд таблицы SUBJECT_TO_COURSE.",
  },
];

const SCHEDULE_OPS: GuideOp[] = [
  { id: "create-group", title: "Создать группу", body: "Нужны courseId + branchId + teacherId. subjectId — из карты этого курса. Нет subjectId в филиале — спросить / создать, не подставлять первый попавшийся." },
  { id: "move-group", title: "Перенести группу", body: "Сменить courseId / treeMove. Не склеивать по словам." },
  { id: "bind-subject", title: "Привязать предмет", body: "Карта subjectId → courseId на вкладке Соответствия." },
  { id: "open-group", title: "Открыть группу", body: "Только по groupId + branchId. Карточка groupCardId = card:group:{branchId}:{groupId}. Состав кликабелен: customerId → CrmClientCard. Голос: kind=openGroup. Из клиента: onOpenGroup(groupId, branchId)." },
  { id: "open-client", title: "Открыть клиента", body: "Только по customerId. Карточка clientCardId = card:customer:{customerId}. Событие окна ra-open-client { customerId, branchId }. «найди Иванова» — один человек → открыть карточку; несколько → вкладка clients + query. На десктопе карточка в правой панели, не popup." },
  { id: "filter-clients", title: "Сортировка клиентов", body: "Событие ra-clients-filter { status, branchId, ageBand }. status: учится | лид | архив. Главные: учится и лид. branchId 0 = все филиалы, 1–4 = филиал. ageBand пусто = все возраста. Архив не автозагружать. Голос: «покажи лиды» / «текущих» / «архив» = openTab pane=clients + status." },
  { id: "pull-clients", title: "Загрузка текущих", body: "По умолчанию и автоматически только is_study=1 AND removed=0. Кнопка «Обновить» не читает лиды и не читает архив (is_study=2)." },
  { id: "pull-leads", title: "Загрузка лидов", body: "Только по кнопке «Загрузить лиды». Пишет на сайт только is_study=0 AND removed=0. После загрузки с сайта удаляются архивные лиды: status=архив / is_study=2 и старые лиды, которых нет среди активных в CRM. Текущих (is_study=1) не трогать. Архив не подмешивать." },
  { id: "pull-archive", title: "Загрузка архива", body: "Только по тихой кнопке «Загрузить архив». is_study=2. Не главная сортировка." },
  { id: "save-client", title: "Сохранить карточку", body: "adminSchedule action=customerSave. Поля: customerId, branchId, patch { name, parent, phone, email, note, dob, address }, isStudy 0|1|2, studyStatusId. Пишет AlfaCRM customer/update, затем customerGet. DOM: data-op=save-contacts, data-is-study." },
  { id: "set-client-status", title: "Клиент ↔ Лид", body: "customerSave { isStudy: 1 } = клиент (учится). customerSave { isStudy: 0 } = лид. Не путать с studyStatusId (состояние обучения). Архив isStudy=2 — только явно." },
  { id: "set-study-status", title: "Состояние обучения", body: "customerSave { studyStatusId }. 1 Обучается, 4 Ожидает старта, 8 Ждём на занятиях, 7 Пропустил 1, 10 Пропустил 2, 11 Пропустил 3, 5 Должник, 2 Завершил, 9 Без статуса. DOM: select data-op=study-status." },
  { id: "assign-lesson", title: "Назначить занятие", body: "Чип data-op=assign-lesson data-lesson-type={key} открывает popup data-op=lesson-dialog. Поля: lessonType, date (ISO или ДД.ММ.ГГГГ), time ЧЧ:ММ, duration мин, roomId, groupId, subjectId (обязателен), teacherId, topic, note. adminSchedule action=customerLesson. Нет subjectId — ошибка, не угадывать. createAlfaLesson. Отмена закрывает popup без записи." },
  { id: "add-tariff", title: "Добавить абонемент", body: "Кнопка data-op=add-tariff открывает popup data-op=tariff-dialog. Поля: tariffId (обязателен, из catalog.tariffs филиала), date начала. adminSchedule action=customerTariff → AlfaCRM customer-tariff/create. Не угадывать абонемент по имени. Нет списка — сначала вкладка Абонементы." },
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
  "Не загружать архив кнопками «Обновить» и «Загрузить лиды». Обновить = is_study=1 removed=0. Лиды = is_study=0 removed=0, после загрузки архивные лиды удалить с сайта. Архив — только тихая кнопка is_study=2.",
  "Не открывать карточку клиента по ФИО. Только customerId / clientCardId.",
  "Не показывать overlay и правую панель одновременно. Overlay только mobile. Desktop = panel.",
  "Не прятать карточку на десктопе. Кнопки «Скрыть» нет. Если нет выбранного — открыть items[0] списка.",
  "Не делать «Все» главной сортировкой клиентов. Главные: Текущие и Лиды. Архив — тихий.",
  "Не назначать занятие без subjectId группы. Не проводить платёж без суммы и customerId.",
  "Не удалять тестовые группы CRM автоматически (остаток gid 694 — оператору).",
];

function scheduleBody() {
  const graph = SCHEDULE_GRAPH.map((r) => `${r.entity}\t${r.idField}\t${r.link}`).join("\n");
  const tabs = SCHEDULE_TABS.map((t) => `### ${t.title} [${t.id}]\n${t.body}`).join("\n\n");
  const ops = SCHEDULE_OPS.map((o) => `- ${o.id} · ${o.title}: ${o.body}`).join("\n");
  const never = SCHEDULE_NEVER.map((n) => `- ${n}`).join("\n");
  return `ИНСТРУКЦИЯ РАЗДЕЛА «Расписание занятий» для ИИ. Метод: Карта ID. REV ${GUIDE_REV}. Точка восстановления: ромашка 3.
Где лежит: Ассистент ИИ → Разделы сайта → Расписание занятий. Это единственный источник правил раздела. Агент читает этот текст при каждом запросе.

Правило: сущность ищется, открывается, пишется и связывается ТОЛЬКО по ID. Имя — подпись на экране, не ключ.

${IDS_FOR_AGENT}

Граф:
${graph}

Каскад courseId группы:
${SCHEDULE_CASCADE.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Единые карточки:
- Кабинет: cabinetId = cabinet:admin. Вкладка clients: data-pane=clients.
- Клиент: clientCardId = card:customer:{customerId}. Компонент CrmClientCard. Открывать только по customerId. Из карточки — группа по groupId+branchId.
- Группа: groupCardId = card:group:{branchId}:{groupId}. Состав — CrmGroupMembers, клик открывает CrmClientCard.
- Следующая загрузка карточки клиента — по тому же customerId / clientCardId.
- Ассистент: kind=openClient + customerId; kind=openGroup + groupId+branchId; kind=openTab pane=clients|groups [+status]; события окна ra-open-client, ra-clients-query, ra-clients-filter.

ПРОТОКОЛ UI · вкладка Клиенты
layout.desktop(min-width:1024px) = список слева max 22rem + ОДНА широкая панель справа variant=panel 1fr. data-layout=list-card. Overlay ЗАПРЕЩЁН.
layout.mobile = overlay CrmClientCard (createPortal z-220) только если !desktop. Overlay max-w-4xl.
header = две строки. 1: поиск-капсула max-w-md + сегмент Текущие|Лиды + Обновить/Загрузить лиды/архив. 2: филиал, возраст, время синка.
sort.1 status = учится | лид     (сегмент, data-sort=status data-id=…)
sort.2 branchId = 0|1|2|3|4      (data-sort=branch data-id=…)
sort.3 ageBand = ""|3-4|5-6|7-9|10-12|13-17|18+   (data-sort=age data-id=…)
sort.archive = тихая ссылка, status=архив. Не чип первого ряда.
autoload = только is_study=1. Лиды/архив — кнопки pull-leads / pull-archive.
chip филиала считает primary branchId, сумма чипов = числу людей выбранного status.
Лето branchId=4 — филиал, не архив.

ПРОТОКОЛ КАРТОЧКИ card:customer:{id}
DOM: [data-card-id="card:customer:{id}"] [data-customer-id="{id}"]
поля чтения: name, parent, phones[], emails[], dob, age, gender, address, note, status, isStudy, studyStatus, studyStatusId, balance, lessonsLeft, paidTill, groups[{id,branchId,subjectId,courseId,name,active}], regular[{groupId,day,from,to,teacher,subject,branch,subjectId}], calendar[{id,date,from,to,type,typeId,group,status}], tariffs[{id,name,rest,lessons}], comms[{id,at,who,channel,text,incoming}]
календарь UI = LessonStrip (те же плитки, что в карточке группы). data-op=lesson-strip; плитка data-op=lesson-tile data-lesson-date YYYY-MM-DD data-lesson-status 1|2|3. Нет calendar — плитки из regular по дню недели.
фильтр коммуникаций: channel или все.
кнопки статуса: data-is-study=1 Клиент · data-is-study=0 Лид
состояние: select data-op=study-status value=studyStatusId
контакты: ребёнок | заказчик (равная ширина). Телефон|почта вместе = ширина ребёнка. Заметка = ширина заказчика. data-op=save-contacts в шапке.
autoload.card = первая строка списка на desktop. Нет кнопки Скрыть.
кнопка Сохранить в шапке карточки справа, data-op=save-contacts.
занятия: чип data-lesson-type → popup data-op=lesson-dialog. Поля: тип, дата, время, duration, roomId, groupId, subjectId, teacherId, topic, note → customerLesson
деньги: data-pay-kind={income|product|refund|correct} + сумма → customerPay
группы: клик data-group-id открывает card:group:{branchId}:{groupId}

СЕРВЕР adminSchedule POST (token обязателен)
customerGet    { customerId, branchId } → { customer }
customerSave   { customerId, branchId, isStudy?, studyStatusId?, patch?{name,parent,phone,email,note,dob,address} } → { customer }
customerLesson { customerId, branchId, lessonType, date, time, duration?, groupId?, subjectId?, roomId?, teacherId?, topic?, note? } → { customer, lesson }
customerTariff { customerId, branchId, tariffId, date } → { customer }
groupGet       { groupId, branchId } → карточка группы
voiceAsk       { prompt, ids[] } → kind openClient|openGroup|openTab|edit|question|refuse

LESSON (lessonType key = type AlfaCRM)
2 group Групповое · 3 trial Пробное · 4 makeup Отработка · 5 intro Вводное · 10 extra Дополнительное · 11 overtime Сверхурочное · 1 individual Индивидуальное · 15 summer Летняя программа · 13 interview Собеседование · 7 open Открытый урок · 6 master Мастер-класс · 8 excursion Экскурсия · 12 event Мероприятие · 9 camp Летний лагерь · 14 aftercare Продлёнка

PAY payKind
income Доход · product Продажа товара · refund Возврат средств · correct Корректировка

is_study: 0 лид · 1 клиент (учится) · 2 архив
studyStatusId: 1 Обучается · 4 Ожидает старта · 8 Ждём на занятиях · 7 Пропустил 1 занятие · 10 Пропустил 2 · 11 Пропустил 3 · 5 Должник · 2 Завершил · 9 Без статуса

СОБЫТИЯ ОКНА
ra-open-client { customerId, branchId, q? } — открыть карточку
ra-clients-query { q } — поиск в списке
ra-clients-filter { status?, branchId?, ageBand? } — сортировки, без выгрузки CRM

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
      "Карта ID + протокол карточки клиента. Группы, клиенты, занятия, деньги, сортировки — только по ID. Источник правил: Ассистент ИИ → Разделы сайта → Расписание занятий.",
    graph: SCHEDULE_GRAPH,
    cascade: SCHEDULE_CASCADE,
    tabs: SCHEDULE_TABS,
    ops: SCHEDULE_OPS,
    never: SCHEDULE_NEVER,
    body: scheduleBody(),
  },
];

export function factoryGuide(id: string) {
  return FACTORY_GUIDES.find((g) => g.id === id);
}

export const adminSectionGuides = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        action: "get" | "save" | "reset";
        id?: string;
        on?: boolean;
        body?: string;
      },
  )
  .handler(async ({ data }) => {
    const { handleAdminSectionGuides } = await import("./agent-section-guides-run");
    return handleAdminSectionGuides(data);
  });
