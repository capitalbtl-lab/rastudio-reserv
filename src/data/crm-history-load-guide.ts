/** Справка «что грузим» по шагам История из Alfa. Не список людей. */

export type HistLoadTab = "roster" | "students" | "groups" | "money" | "audit";

export type LoadGuide = {
  title: string;
  goal: string;
  plain: string[];
  alfa: { api: string; fields: string[] }[];
  disk: { file: string; fields: string[] }[];
  readers: string[];
  skip: string[];
  law: string[];
};

export const STEP_LOAD: Record<HistLoadTab, LoadGuide> = {
  roster: {
    title: "Шаг 1 · Группы и состав",
    goal: "Кто числится в группе (cgi). Карточка человека и связь branchId+groupId+customerId. Журнал и касса не трогаются.",
    plain: [
      "Это список «кто ходит в группу», не расписание и не деньги.",
      "Alfa отдаёт номера учеников группы. Если карточки у нас ещё нет — забираем ФИО ребёнка, родителя, телефон, дату рождения, лид это или клиент.",
      "Пишем на диск: номер человека, номер группы, филиал, живой он в группе или уже выбыл.",
      "Выбыл — карточку не удаляем, только помечаем «не в этой группе».",
      "Занятия, оплаты, домашку этот шаг не трогает. Без него шаги 2–5 не знают, кого качать.",
    ],
    alfa: [
      {
        api: "POST /v2api/{branchId}/cgi/index  { group_id }",
        fields: [
          "customer_id — ключ ученика",
          "признак живой записи cgi (выбывшие не в live)",
        ],
      },
      {
        api: "POST /v2api/{branchId}/customer/index  { id, is_study 0|1|2 }  — только если нет карточки, нет ФИО или диск ещё «лид»",
        fields: [
          "id → customerId",
          "name → ФИО ребёнка (не телефон)",
          "legal_name → заказчик / родитель",
          "phone, email, dob, gender",
          "адрес из custom-полей",
          "is_study 0 лид / 1 клиент / 2 архив",
          "removed, paid_till, paid_count",
          "balance шапки (снимок, не журнал)",
          "teacher_ids, группы в карточке Alfa",
        ],
      },
    ],
    disk: [
      {
        file: "storage/dossiers.json",
        fields: [
          "crmId, branchId",
          "child.fio, parent.fio, phone, dob, gender, address",
          "extras.is_study, extras.crm_current, extras.paid_till",
          "groupLinks[]: groupId, branchId, name, active, school, subjectId, courseId",
        ],
      },
      {
        file: "storage/crm-journal-job.json + fill группы",
        fields: ["штамп roster ISO — состав этой группы уже читали"],
      },
    ],
    readers: [
      "Шаг 2 — очередь учеников и лидов из живых groupLinks",
      "Шаг 3 — список групп",
      "Шаг 4–5 — клиенты is_study=1, лидов в кассу не берут",
      "Кабинет D, карточка клиента, «Сейчас ходят»",
    ],
    skip: [
      "уроки lesson/index",
      "платежи pay/index",
      "абонементы customer-tariff",
      "тема / ДЗ / комментарий",
      "regular-lesson",
      "лиды отдельно от cgi — только те, кого Alfa вернула в составе группы",
    ],
    law: [
      "Ключи: branchId, groupId, customerId. Не имя.",
      "Одна группа, пауза 5 с. В Alfa не пишем.",
      "Выбыл из cgi → groupLink.active=false, карточку не удаляем.",
      "Нет ФИО на диске — не подставляем «похожее».",
    ],
  },
  students: {
    title: "Шаг 2 · Календарь ученика",
    goal: "Личные занятия customerId: все типы (группа, индивид, пробный, летняя). Диск догоняет Alfa. Счёт — уникальные lessonId.",
    plain: [
      "Это дневник одного ребёнка: все его уроки, не только группа.",
      "Спрашиваем Alfa: сколько занятий с уникальным номером. Пишем на диск каждое: дата, время, был/не был, сколько списали с абонемента.",
      "Жёлтая «в Alfa больше» — у них в журнале есть номера, которых у нас нет. «Добрать» дописывает пачку. Если номера Alfa не отдаёт — галка, не долбить кнопку.",
      "«С нуля» стирает его занятия у нас и обнуляет счётчик Alfa. Потом качаем заново.",
      "Оплаты и состав группы этот шаг не меняет.",
    ],
    alfa: [
      {
        api: "POST /v2api/{1..4}/lesson/index  { customer_id, status 1|2|3, date_from, date_to, page, pageSize 100 }",
        fields: [
          "id → lessonId",
          "date, time_from, time_to, status (1 план / 2 отмена / 3 проведён)",
          "lesson_type_id, lesson_type_name",
          "group_ids, customer_ids, teacher_ids, subject_id, room_id",
          "topic, note, homework",
          "details[]: customer_id, is_attend, commission/cost, ctt_id, grade, name",
          "duration, ctt_id урока",
        ],
      },
      {
        api: "тот же lesson/index по одному id, если перепись знает номер, а строки нет  { customer_id, id }",
        fields: ["тот же объект урока; без даты на диск уходит 2015-01-01; пустые pupils — сажаем, если id с переписи"],
      },
    ],
    disk: [
      {
        file: "календарь ученика (group-cards / customer calendar)",
        fields: [
          "lessonId, date, from, to, status, type, typeId",
          "group, groupIds, teacher, teacherIds, subject, subjectId, room, roomId",
          "topic, homework, note, attend, total, pupils[]",
          "amount списание, cttId, customerIds, duration",
        ],
      },
      {
        file: "storage/crm-customer-sync.json  byId.{customerId}",
        fields: [
          "lessonsDisk — уникальные lessonId",
          "lessonsAlfa — keep переписи (не занижаем)",
          "lessonsAlfaAt, lessonsFull, lessonsRecheckAt",
          "lessonsSeenIds, lessonFill курсор",
          "journalHoleApprovedAt — галка дыры, журнал не закрывает",
        ],
      },
    ],
    readers: [
      "Карточка клиента — лента занятий",
      "Шаг 4 — списания writeoff с календаря",
      "Шаг 5 — сверка числа уроков и списаний",
      "Очередь lesson.update — pending не затираем",
    ],
    skip: [
      "regular-lesson (другая сущность)",
      "платежи и абонементы",
      "тема группы сверх того, что пришло в этом уроке",
      "чужой урок: в customer_ids/pupils есть люди, нас нет — не сажаем",
      "тексты главной, SEO, курс сайта по названию группы",
    ],
    law: [
      "Ключ строки: customerId + lessonId.",
      "«Добрать» — пачка 8 + missing до 50 id. «С нуля» — календарь и lessonsAlfa=0, проба в том же клике не пишется.",
      "Галка дыры: Фон и красная без force skip. Журнал не закрывается.",
      "По умолчанию date_from 2015-01-01. Синяя после зелёного — окно ~месяц.",
    ],
  },
  groups: {
    title: "Шаг 3 · Занятия в группах",
    goal: "Журнал группы: явки порцией (квартал / полугодие / год), потом тема и ДЗ. Не личный календарь целиком.",
    plain: [
      "Это журнал группы: кто был на уроке в этой группе за квартал (или полугодие/год).",
      "Сначала явки. Потом отдельно — тема, домашнее задание, комментарий педагога.",
      "Списания с абонемента с урока группы дописываются ученикам состава. Это не вся личная история человека — она на шаге 2.",
      "Архивные группы и «срок жизни курса» — другие кнопки, красная «по одному» их сама не ищет.",
    ],
    alfa: [
      {
        api: "POST /v2api/{branchId}/lesson/index  { group_id, status, date_from, date_to, page }",
        fields: [
          "id, date, time_from/to, status",
          "group_ids (тип 2 без group_ids пропускаем)",
          "teacher_ids, subject_id, room_id, lesson_type_*",
          "details[] явки и списания состава",
        ],
      },
      {
        api: "lesson/index по id урока — тема, ДЗ, комментарий, таблица учеников (после зелёных явок, пачка до 16)",
        fields: ["topic, homework, note, details[] (явка, имя, commission, ctt_id, оценки)"],
      },
    ],
    disk: [
      {
        file: "карточка группы storage/group-cards  {branchId, groupId}",
        fields: [
          "calendar[] те же поля урока",
          "journalAt",
          "срок жизни группы (b_date/e_date), если жали «Определить сроки»",
        ],
      },
      {
        file: "календари учеников состава",
        fields: ["fanOut списаний group-урока на customerId из details — не полная история человека"],
      },
    ],
    readers: [
      "Карточка группы в кабинете",
      "Шаг 2 prune: id с group-card её групп не снимаем как «лишние»",
      "Витрина сайта — только если слот уже в crm-schedule и галочка публикации (этот шаг витрину не включает)",
    ],
    skip: [
      "личный журнал ученика с 2015",
      "касса и абонементы",
      "архивные группы сами (нужны отдельные кнопки архива)",
      "проведение / отмена урока в Alfa",
    ],
    law: [
      "Ключи: branchId + groupId + lessonId.",
      "Одна группа / одна порция, пауза 5 с. Фон сам журнал не качает.",
      "Сначала явки, потом details. Без явок «Сначала явки».",
      "Архив и сроки — отдельные кнопки, не красная «по одному».",
    ],
  },
  money: {
    title: "Шаг 4 · Деньги на карточке",
    goal: "Строки кассы и абонементы клиента. Сверка суммы с шапкой — шаг 5, не здесь. Направо: касса просканирована (есть строки или честная пустая).",
    plain: [
      "Это касса: платежи, возвраты, корректировки и абонементы человека.",
      "Забираем каждую строку: сумма, дата, номер платежа, абонемент. Пустая касса — тоже ответ, не ошибка.",
      "«Касса загружена» значит: все страницы дочитали. Совпадает ли сумма с шапкой в Alfa — смотрит шаг 5, не этот.",
      "Лидов массово не берём. Журнал занятий тут не качаем, только если его совсем нет — чтобы было к чему списание привязать.",
    ],
    alfa: [
      {
        api: "POST /v2api/{1..4}/pay/index  { customer_id, pay_type_id 1|2|3|5|6|9, page }",
        fields: [
          "id платежа",
          "document_date / date, income, value / sum",
          "customer_id, branch_id, group_id",
          "ctt_id, tariff_id, pay_item_id, pay_account_id",
          "location_id, manager_id, pay_method / is_fiscal",
          "note, payer name если есть",
        ],
      },
      {
        api: "POST /v2api/{branch}/customer-tariff/index?customer_id=",
        fields: ["id абонемента в карточке, tariff_id, balance, b_date, e_date, subject_ids, lesson_type_ids, is_separate_balance, dead"],
      },
    ],
    disk: [
      {
        file: "storage/crm-pays.json",
        fields: [
          "items[]: id, customerId, branchId, date, amount, kind",
          "cttId, tariffId, payItemId, payAccountId, locationId, managerId, payMethod, groupId, deleted",
          "payFill курсор {bid, page, done, empty}",
          "complete[] — совпадение остатка, шаг 5; очередь шага 4 по scanned/empty",
        ],
      },
      {
        file: "storage/crm-customer-sync.json",
        fields: ["paysAt, paysRecheckAt только если fill дочитан и Alfa ответила"],
      },
    ],
    readers: [
      "Карточка клиента — касса",
      "Шаг 5 — sum(платежи) и шапка",
      "Очередь pay.create / pay.delete — pending не затираем inbound",
    ],
    skip: [
      "invoice / счета v2api (отдельная постановка)",
      "сверку «сумма − списания = шапка» как условие «касса загружена»",
      "зарплату педагогов, кассу филиала без customer_id",
      "лидов в массовой очереди (is_study=0); точечно карточкой — да",
    ],
    law: [
      "Ключи: customerId, id платежа, cttId, tariffId, branchId.",
      "Пустая касса лида — валидно (paysEmpty). Не крутить вечно.",
      "Пачка страниц, курсор жив, клиент в конец очереди. page≥40 не успех.",
      "В Alfa оплаты не создаём этим шагом.",
    ],
  },
  audit: {
    title: "Шаг 5 · Сверка остатка",
    goal: "Сравнить шапку Alfa (деньги) с кассой и списаниями календаря. Не второй журнал и не вторая касса.",
    plain: [
      "Это проверка: то, что лежит у нас, совпадает ли с цифрой в шапке карточки Alfa.",
      "Сравниваем рубли с рублями. Число уроков — отдельно, не с деньгами в одну кучу.",
      "Совпало — человек вправо. Не совпало — слева, с причиной: дырка в журнале, нет кассы, формула, абонемент.",
      "Новых занятий и платежей этот шаг сам не выдумывает. В Alfa ничего не пишет и шапку не подгоняет.",
    ],
    alfa: [
      {
        api: "customer/index { id } — шапка",
        fields: [
          "balance → {customer.balance.m} деньги (alfaHeader)",
          "не {customer.balance.c} уроки абонемента — это не число строк журнала",
        ],
      },
    ],
    disk: [
      {
        file: "читает, не заводит второго файла",
        fields: [
          "календарь ученика — writeoffSum проведённых",
          "crm-pays.json — сумма строк",
          "dossiers extras.balance — снимок, не подгоняем",
          "абонементы liveCtt",
        ],
      },
    ],
    readers: ["Этот экран: коды ctt / formula / src / lessons / pays / snap", "Карточка — остаток для человека"],
    skip: [
      "полная качка 2015, если календарь уже сходился — сначала окно",
      "запись в Alfa",
      "подгонка extras.balance под формулу",
    ],
    law: [
      "Деньги и число уроков — разные оси. Не сравнивать рубли с 244 занятиями.",
      "Один клиент, пауза 5 с. Только is_study=1 из состава шага 1.",
      "Совпало ±1 ₽ и календарь не дырявый — вправо.",
      "Alfa — правда. Диск догоняет.",
    ],
  },
};
