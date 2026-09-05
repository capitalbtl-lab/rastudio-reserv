import { createServerFn } from "@tanstack/react-start";
import { SITE } from "@/data/site";
import { saveTrialLead } from "@/data/trial-save";
import { TRIAL_BRANCHES, TRIAL_COURSES } from "@/data/trial-public";
import { LESSON_TYPES } from "@/data/alfacrm";
import { serverEnv } from "./server-env";
import { type SessionFacts, nextStepOf } from "./agent-facts";
import { programPitch } from "./agent-playbook";

function fallbackTalk(who: "oleg" | "olga", facts: SessionFacts) {
  const n = who === "olga" ? "Ольга" : "Олег";
  if (facts.school) {
    const pitch = programPitch(facts.school);
    const short = pitch ? pitch.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ") : "В этом направлении дети идут от простого к сложному.";
    return `${n}: ${short} Рассказать подробнее или сразу на пробное?`;
  }
  if (!facts.mode || facts.mode === "fork") {
    return `${n}: Вы уже занимаетесь у нас или подбираете впервые?`;
  }
  if (facts.mode === "client" && !facts.identified) {
    return facts.phone
      ? `${n}: Проверяю карточку по телефону на сайте.`
      : `${n}: Напишите телефон, который указывали при записи.`;
  }
  if (facts.mode === "client") return `${n}: Чем помочь: расписание, отработка, пропуск или абонемент?`;
  if (!facts.age) return `${n}: Сколько лет ребёнку?`;
  if (!facts.city) return `${n}: ${facts.age} лет, хорошо. Вам удобнее Коломна или Луховицы?`;
  if (facts.city === "Коломна" && !facts.branchId) {
    return `${n}: В Коломне два адреса — ЦМИТ на Октябрьской или Гражданская. Какой ближе?`;
  }
  if (!facts.school) {
    const y = facts.age || 8;
    if (y <= 4) return `${n}: В этом возрасте ближе раннее развитие или рисовать?`;
    if (y <= 6) return `${n}: Что ближе — творчество, роботы или подготовка к школе?`;
    if (y <= 9) return `${n}: Рисовать, собирать роботов или программировать?`;
    return `${n}: Художка, робототехника, программирование или инженерия?`;
  }
  return `${n}: Пробное занятие или сразу в группу?`;
}

function clientSystem(who: "oleg" | "olga", facts?: SessionFacts, stepOverride?: string) {
  const name = who === "olga" ? "Ольга" : "Олег";
  const other = who === "olga" ? "Олег" : "Ольга";
  const gender =
    who === "olga"
      ? "женский род: согласна, готова, поняла. Никогда «согласен»."
      : "мужской род: согласен, готов, понял. Никогда «согласна».";
  const step = stepOverride || (facts ? nextStepOf(facts) : "спросить: уже занимаетесь или подбираете впервые.");
  return `Вы — ${name}, администратор студии «Развивайся». Говорите по-русски с родителем, как умная колонка Алиса: живо, коротко, по очереди. Не называйте себя роботом или нейросетью. Не выдумывайте день и свободные места. Цены: «от … / 4 недели». Пробное без обязательства.

КАК ГОВОРИТЬ (как Алиса):
— Одна реплика = короткое подтверждение услышанного (если уже ответили) + ОДИН вопрос. Потом молчи и жди.
— 1–2 коротких предложения. Третье — только если без него нельзя.
— Неясность не заполняй догадкой: одно уточнение («роботы или рисовать?»).
— Не читай меню. Не перечисляй все курсы, адреса и правила в одном ходе.
— Слышишь возраст, город, имя — сразу запомни и больше не спрашивай. В начале следующей фразы кивни («восемь лет, хорошо»).
— Кнопки под сообщением — подсказка, но вопрос должен звучать вслух, как у колонки.
— Если родитель сбился или ответил не на то — мягко верни к одному открытому вопросу, не читай нотацию.

Формат КАЖДОГО ответа строго:
${name}: фраза

${other} молчит. Не пишите строки «${other}:». Сейчас разговор только с ${name}. ${gender}
Вне режима управления не предлагайте сменить голос и не вызывайте set_voice_settings.

Не открывайте страницы сайта сами и не говорите «открыла страницу» / «открыли курс». Если нужны подробности курса — вызови open_course: родителю появится кнопка. В речи: «ниже кнопка — описание курса».

${who === "oleg" ? "Вы хорошо рассказываете про технику: робототехника, программирование, Scratch, Python, C++, Unity, Blender, Компас, радиотехника, беспилотники, физика, наука, Лего-математика, STEAM, IT-лаборатория, JuniorSchool, GameDev. Творческие курсы тоже можете коротко назвать." : "Вы хорошо рассказываете про творчество и запись: художественная студия и школа, скульптура, рисунок, живопись, манга, digital art, подготовка в вуз, модельная школа, подготовка к школе, языки, мастер-классы, филиал, оплата, личный кабинет, пробное, расписание. Технические курсы тоже можете коротко назвать."}

Не пишите длинные адреса, пока не спросили как пройти.

Телефон: ${SITE.phone}. Сайт: ${SITE.domain}.
Филиалы: 1 Гражданская; 2 ЦМИТ, Октябрьской революции, 340; 3 Луховицы, Пушкина, 202А; 4 лето (только апрель–август). Не путай 1 и 2.
Курсы называй как на сайте. Курс = courseId дерева, предмет = subjectId CRM. Это разные id.
Цены только из колонки «Все» по courseId. Не выдумывай и не бери сумму абонемента по названию.
ЭТА РЕПЛИКА — только текущий шаг: ${step}
Если в фактах уже есть город — ни слова «какой город», «Коломна или Луховицы».
Не возвращайся к закрытым шагам.
list_groups когда направление уже ясно и родитель хочет слот. Передай course_id или school_id, если знаешь. Назови ВСЕ подходящие, первой — приоритет 1. gid вслух не читай. Группу по имени CRM не ищи.
Пробное в свободный день: заявка без слота, в комментарии «дату согласуем по телефону». Не выдумывай время.
История сессии полная до сброса диалога. Прежде чем спросить — посмотри факты.
На запись нужны: ФИО ребёнка, ФИО родителя, телефон, филиал. Дата рождения целиком 01.01.2021; если нет — возраст.
Когда есть имя родителя, ФИО ребёнка, телефон и филиал — сразу book_lesson (или submit_trial для первого визита). Передай course_id дерева, gid, date и time ближайшего занятия, subject_id слота, branch_id группы. Не жди почту и не жди ответ Alfa: заявка пишется на сайт сразу, CRM догонит очередью.
Типы занятий AlfaCRM: ${LESSON_TYPES.map((t) => `${t.id} ${t.name} (${t.key})`).join("; ")}.
Первый визит — пробное (trial, submit_trial). Постоянная группа — групповое (book_lesson lesson_type=group). Не ставь пробное, если просят сразу в группу.
Не говори «мы перезвоним» и не открывай форму AlfaCRM. Скажи: заявку приняли, дата, время, педагог, филиал.
Запись в группу — book_lesson lesson_type=group, не open_group.
id курсов для заявки: ${TRIAL_COURSES.map((c) => `${c.id} ${c.name}`).join("; ")}.
Не открывай страницу курса в браузере. Только кнопка open_course.
Жалобы и деньги — телефон.
Если просят править сайт, статусы групп или CRM — это кабинет сотрудника, не этот чат. Не предлагай «войти в административный режим», пока человек сам не сказал, что он сотрудник.
Узнанный клиент: занятия, явка, пропуск, пауза, отработка, абонемент — только с диска (блок КАРТОЧКА). Не выдумывай дату. Пропуск — note_skip. Пауза — pause_classes. Отработка — book_lesson makeup на gid его группы. Абонемент — assign_tariff с tariffId, если галочка в настройках.
`;
}

const ADMIN_SYSTEM = `Вы — Ольга, консоль управления сайтом rastudio.org. Собеседник — сотрудник студии, не родитель.
Формат каждого ответа: только строка «Ольга: …». Олег молчит. Женский род.

Это не консультация. Запрещено: возраст ребёнка, подбор курса, пробное, филиалы «куда удобнее», лиды в CRM, «чем могу помочь» в смысле кружков.
Если просят подобрать курс — «это другой чат, нажмите выход администратора».

Только правки сайта:
— цены: set_price (path = courseId, не название)
— тексты: сначала list_page_fields, потом set_site_text / clear_site_text
  поля: заголовок, описание, о курсе, почему сейчас, главный заголовок (только главная)
— голоса: set_voice_settings
— reload_page если просят обновить
После команды сразу вызови инструмент и коротко подтверди страницу и поле по-русски.
Не пиши «режим управления уже открыт», не проси кодовое слово — доступ уже есть.
Не обсуждай курсы «для ребёнка». Не угадывай поле по смыслу — list_page_fields.
`;

const ADMIN_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "set_price",
      description: "Изменить цену одного курса. Только администратор. courseId дерева (path), сумма ₽ за 4 недели. Не по названию.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", description: "courseId / path курса, не название" },
          field: { type: "string", description: "all | kbm | tmx, по умолчанию all" },
          amount: { type: "number", description: "Новая цена в рублях" },
        },
        required: ["path", "amount"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_prices_group",
      description: "Изменить цены группы курсов: школа/направление или поиск. set — поставить, delta — прибавить (можно минус).",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          direction: { type: "string", description: "Например Художественная школа, Школа робототехники" },
          query: { type: "string", description: "Поиск по названию, если не школа" },
          field: { type: "string", description: "all | kbm | tmx | all-three" },
          set: { type: "number" },
          delta: { type: "number" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "reload_page",
      description: "Обновить страницу у администратора, чтобы увидеть внесённые изменения.",
      parameters: { type: "object", additionalProperties: false, properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_page_fields",
      description: "Показать, какие тексты сейчас на странице и что уже переопределено.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { path: { type: "string", description: "Путь, название курса или пусто для текущей страницы" } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_site_text",
      description: "Заменить текст на сайте: заголовок, описание, о курсе, почему сейчас, герой главной.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", description: "Путь, название курса, главная, или пусто = текущая страница" },
          field: {
            type: "string",
            description: "заголовок | описание | о курсе | почему сейчас | главный заголовок | текст под заголовком",
          },
          value: { type: "string", description: "Новый текст" },
        },
        required: ["field", "value"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "clear_site_text",
      description: "Вернуть исходный текст поля на сайте.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
          field: { type: "string" },
        },
        required: ["field"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "clear_site_page",
      description: "Вернуть все тексты одной страницы к каталогу.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { path: { type: "string", description: "Путь или пусто = текущая страница" } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_voice_settings",
      description: "Настроить голоса: Олег мужской, Ольга женский, темп, пауза, интонация.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          who: { type: "string", description: "oleg | olga | оба" },
          voice: { type: "string", description: "zahar, filipp, ermil, alena, jane, marina" },
          speed: { type: "number", description: "Темп слов 0.9–1.2, 1.0 нормальный" },
          pause: { type: "number", description: "Пауза 0–1, меньше — короче паузы" },
          faster: { type: "boolean" },
          slower: { type: "boolean" },
          mood: { type: "string", description: "good радостный | friendly | calm спокойный | quiet тихий" },
          role: { type: "string" },
        },
      },
    },
  },
];

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "submit_trial",
      description:
        "Создать лид в AlfaCRM и сразу поставить урок типа «пробное». Нужны ФИО родителя, ФИО ребёнка, телефон и филиал. Дата рождения 01.01.2021, курс, gid слота, дата и время — если уже сказали.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          parent: { type: "string", description: "ФИО заказчика, родителя" },
          child: { type: "string", description: "ФИО ребёнка как в карточке, не «ребёнок»" },
          dob: { type: "string", description: "Дата рождения ДД.ММ.ГГГГ, например 01.01.2021" },
          age: { type: "number", description: "Возраст ребёнка, если даты нет" },
          phone: { type: "string" },
          email: { type: "string" },
          course_id: { type: "string", description: "courseId дерева сайта, не subjectId" },
          subject_id: { type: "number", description: "subjectId предмета CRM из list_groups" },
          branch_id: { type: "string", description: "1 Гражданская, 2 ЦМИТ Октябрьской, 3 Луховицы, 4 лето" },
          gid: { type: "string", description: "Номер группы, если пробное в конкретный слот" },
          group_name: { type: "string", description: "Название группы" },
          date: { type: "string", description: "Дата пробного ДД.ММ.ГГГГ" },
          time: { type: "string", description: "Время начала ЧЧ:ММ" },
          duration: { type: "number", description: "Длительность минут, обычно 90" },
          kind: { type: "string", description: "trial по умолчанию. Или group, makeup, intro, extra, overtime, individual, master, open, excursion, camp, event, interview, aftercare, summer, consult" },
        },
        required: ["parent", "child", "phone", "branch_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "book_lesson",
      description:
        "Поставить занятие нужного типа в AlfaCRM (лид + урок). Для отработки, дополнительного, сверхурочного, вводного, индивидуального, группового, мастер-класса и остальных типов. Те же данные, что для пробного, плюс lesson_type.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          parent: { type: "string", description: "ФИО заказчика" },
          child: { type: "string", description: "ФИО ребёнка" },
          dob: { type: "string" },
          age: { type: "number" },
          phone: { type: "string" },
          email: { type: "string" },
          course_id: { type: "string", description: "courseId дерева сайта" },
          subject_id: { type: "number", description: "subjectId CRM из list_groups" },
          branch_id: { type: "string", description: "1 Гражданская, 2 ЦМИТ, 3 Луховицы, 4 лето" },
          gid: { type: "string" },
          group_name: { type: "string" },
          date: { type: "string", description: "ДД.ММ.ГГГГ" },
          time: { type: "string", description: "ЧЧ:ММ" },
          duration: { type: "number" },
          lesson_type: {
            type: "string",
            description:
              "trial | group | makeup отработка | intro вводное | extra дополнительное | overtime сверхурочное | individual индивидуальное | master | open | excursion | camp | event | interview | aftercare продленка | summer",
          },
        },
        required: ["parent", "child", "phone", "branch_id", "lesson_type"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_courses_by_age",
      description: "Полный список курсов студии для возраста ребёнка. Вызывать, когда назвали возраст. Вернёт ВСЕ программы, не выборку.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { age: { type: "number", description: "Возраст ребёнка, целое число лет" } },
        required: ["age"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_groups",
      description:
        "Живые группы по ID: courseId/schoolId дерева, branchId, возраст. Не ищи по имени группы. Вернёт gid, courseId, schoolId, subjectId, состав с диска, приоритет.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          age: { type: "number", description: "Возраст ребёнка" },
          branch: { type: "string", description: "1 Гражданская, 2 ЦМИТ, 3 Луховицы, или Коломна" },
          branch_id: { type: "number", description: "branchId 1|2|3|4" },
          course: { type: "string", description: "Речь родителя или courseId/schoolId дерева, не имя группы CRM" },
          course_id: { type: "string", description: "courseId дерева, например /art-studio-10-14" },
          school_id: { type: "string", description: "schoolId дерева, например /art-studio" },
          subject_id: { type: "number", description: "subjectId AlfaCRM" },
        },
        required: ["age"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "open_group",
      description:
        "Устарело. Запись в группу делай book_lesson lesson_type=group. Не открывай форму AlfaCRM родителю.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          gid: { type: "string", description: "Номер группы из list_groups" },
          branch: { type: "string", description: "1, 2 или 3" },
        },
        required: ["gid"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "open_course",
      description:
        "Показать кнопку на страницу курса. Страницу саму не открывать. Вызывать, когда курс выбран и нужны подробности.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", description: "Путь, например /teslaphysics, или точное название курса" },
        },
        required: ["path"],
      },
    },
  },
];

const CLIENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "client_card",
      description: "Перечитать карточку узнанного клиента с диска: группы, ближайшее занятие, явка, абонемент, пауза, остаток. Не по ФИО.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { customer_id: { type: "number", description: "customerId с диска" } },
        required: ["customer_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "note_skip",
      description: "Родитель не придёт. Пишет пропуск на диск и в ленту. Не меняет явку всей группы. Только customerId.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          customer_id: { type: "number" },
          date: { type: "string", description: "Дата пропуска ДД.ММ.ГГГГ или ГГГГ-ММ-ДД" },
          reason: { type: "string" },
        },
        required: ["customer_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "pause_classes",
      description: "Пауза занятий ребёнка до даты (extras.pause_until) и запись в ленту. Пустая дата — снять паузу. Не статус группы.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          customer_id: { type: "number" },
          until: { type: "string", description: "До какой даты пауза. Пусто — снять." },
          reason: { type: "string" },
        },
        required: ["customer_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "assign_tariff",
      description: "Повесить абонемент tariffId на узнанного клиента. Диск сразу, Alfa очередь. Не по имени шаблона.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          customer_id: { type: "number" },
          tariff_id: { type: "number", description: "tariffId шаблона CRM" },
          group_id: { type: "number" },
          branch_id: { type: "number" },
        },
        required: ["customer_id", "tariff_id"],
      },
    },
  },
];

function siteTools(canBook: boolean, identified = false, canJournal = true, canTariff = false) {
  type Tool = (typeof TOOLS)[number] | (typeof CLIENT_TOOLS)[number];
  let list: Tool[] = canBook ? [...TOOLS] : TOOLS.filter((t) => t.function.name !== "submit_trial" && t.function.name !== "book_lesson");
  if (!identified) return list;
  list = [...list, CLIENT_TOOLS[0]];
  if (canJournal) list = [...list, CLIENT_TOOLS[1], CLIENT_TOOLS[2]];
  if (canTariff) list = [...list, CLIENT_TOOLS[3]];
  return list;
}

type ChatMsg = { role: "user" | "assistant" | "system" | "tool"; content: string; tool_call_id?: string; tool_calls?: unknown };

const buckets = new Map<string, number[]>();

function limited(ip: string) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const prev = (buckets.get(ip) || []).filter((t) => now - t < windowMs);
  if (prev.length >= 40) {
    buckets.set(ip, prev);
    return true;
  }
  prev.push(now);
  buckets.set(ip, prev);
  return false;
}

function resolveCourse(id?: string) {
  if (!id) return "";
  const raw = String(id).trim();
  if (!raw) return "";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const hit = TRIAL_COURSES.find((c) => c.id === raw || c.id === withSlash);
  if (hit) return hit.id;
  return raw.startsWith("/") ? raw : "";
}

function resolveBranch(id?: string) {
  if (!id) return "";
  const raw = String(id);
  const hit = TRIAL_BRANCHES.find(
    (b) => b.id === raw || b.name.toLowerCase().includes(raw.toLowerCase()) || raw.includes(b.id),
  );
  if (hit) return hit.id;
  if (/луховиц/i.test(raw)) return "3";
  if (/граждан/i.test(raw) || /олимп/i.test(raw)) return "1";
  if (/октябрь|цмит|340/i.test(raw)) return "2";
  if (/летн/i.test(raw)) return "4";
  if (/коломн/i.test(raw)) return "2";
  return raw;
}

function normalizeDob(dob: string) {
  const s = dob.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return s;
  const ru = s.match(/^(\d{1,2})[.](\d{1,2})[.](\d{4})$/);
  if (ru) return `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}`;
  const year = s.match(/^(19|20)\d{2}$/);
  if (year) return `${s}-09-01`;
  return s;
}

async function yandexChat(messages: ChatMsg[], tools: unknown) {
  const key = serverEnv("YANDEX_API_KEY");
  const folder = serverEnv("YANDEX_FOLDER_ID");
  if (!key || !folder) return null;
  const model = `gpt://${folder}/yandexgpt/latest`;
  const auths = [`Bearer ${key}`, `Api-Key ${key}`];
  let last = "";
  for (const auth of auths) {
    const res = await fetch("https://ai.api.cloud.yandex.net/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        "x-folder-id": folder,
      },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 700,
        messages,
        tools,
        tool_choice: "auto",
      }),
    });
    if (res.ok) {
      return (await res.json()) as {
        choices: { message: { role: string; content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[];
      };
    }
    last = await res.text();
  }
  throw new Error(`yandex ${last.slice(0, 200)}`);
}

async function deepseekChat(messages: ChatMsg[], tools: unknown) {
  const key = serverEnv("DEEPSEEK_API_KEY");
  if (!key) return null;
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.3,
      messages,
      tools,
      tool_choice: "auto",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`deepseek ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as {
    choices: { message: { role: string; content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[];
  };
}

async function complete(messages: ChatMsg[], tools: unknown) {
  const blob = messages
    .filter((m) => m.role !== "system")
    .map((m) => String(m.content || ""))
    .join("\n");
  const personal =
    /(?:\+7|8)[\s(.-]*\d{3}|фамилия|отчество|\bфио\b|\d{2}[./]\d{2}[./]\d{4}|паспорт|снилс|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?:меня зовут|ребёнк\w+)\s+[А-ЯЁ][а-яё]{2,}/i.test(
      blob,
    );
  const order = personal ? [yandexChat, deepseekChat] : [deepseekChat, yandexChat];
  for (const fn of order) {
    try {
      const hit = await fn(messages, tools);
      if (hit) return hit;
    } catch {
      /* next */
    }
  }
  return null;
}

export const chatAgent = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        messages: { role: "user" | "assistant"; content: string }[];
        ip?: string;
        with?: "oleg" | "olga" | "both";
        token?: string;
        path?: string;
        gate?: boolean;
        gateWord?: string;
        voice?: boolean;
        channel?: string;
        phone?: string;
      },
  )
  .handler(async ({ data }) => {
    const ip = data.ip || "anon";
    if (limited(ip)) {
      return { ok: false as const, error: "Слишком много сообщений. Позвоните 8 (800) 511-34-01." };
    }
    const all = (data.messages || [])
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2500) }));
    if (!all.length && !data.gate) return { ok: false as const, error: "Напишите вопрос." };
    const trimmed = all.slice(-40);

    const { tokenOk, makeAdminToken } = await import("./admin-auth");
    const { knowledgeForAgent } = await import("./call-knowledge");
    const { lessonFactsForAgent } = await import("./crm-lessons");
    const { codewordInText, logAdmin } = await import("./admin-settings");
    const { factsFromMessages, factsPrompt } = await import("./agent-facts");
    const { buildSessionNote, notePrompt, guardReply } = await import("./session-note");
    const { findDossier, dossierPrompt, upsertDossier, dossierFromNote } = await import("./dossiers");
    const { agentPromptAddons, loadBrain } = await import("./agent-config");
    const { lockedFunnelReply } = await import("./agent-funnel");
    const channelId = String(data.channel || "site");
    const fromMessenger = channelId === "vk" || channelId === "max" || channelId === "phone";
    let admin = tokenOk(data.token) && !fromMessenger;
    let granted: string | undefined;
    let reload = false;
    let open = "";
    let signup = "";
    let groups: { label: string; href?: string; send?: string; primary?: boolean }[] = [];

    const lastUser = String(data.gateWord || [...trimmed].reverse().find((m) => m.role === "user")?.content || "");
    const askedCode = trimmed.some((m) => m.role === "assistant" && /кодовое слово/i.test(m.content));
    const wantAdmin =
      Boolean(data.gate) ||
      askedCode ||
      /вход администратора|я администратор|хочу внести изменения|открой режим управления/i.test(
        trimmed.map((m) => m.content).join(" "),
      );
    if (!admin && !fromMessenger && wantAdmin && lastUser && codewordInText(lastUser)) {
      admin = true;
      granted = makeAdminToken(30 * 60 * 1000);
      logAdmin("Вход по кодовому слову");
      return {
        ok: true as const,
        reply: "Ольга: Доступ открыт на 30 минут. Что меняем — цены, тексты страниц или голоса?",
        token: granted,
        reload: false,
      };
    }
    if (!admin && data.gate && !fromMessenger) {
      return {
        ok: true as const,
        reply: "Ольга: Слово не подошло. Назовите кодовое слово ещё раз, одним словом.",
      };
    }

    const soloWho = admin ? "olga" : data.with === "oleg" ? "oleg" : "olga";
    const adminHint = admin
      ? `\nСтраница сейчас: ${data.path || "/"}.`
      : "";
    const facts = factsFromMessages(all);
    if (data.phone) facts.phone = facts.phone || String(data.phone);
    const note = buildSessionNote(all);
    if (!admin && facts.mode === "client") {
      const { dossiersByPhone } = await import("./dossiers");
      const { asIdentifyHits, confirmedHit, identifyLocked } = await import("./agent-identify");
      const lastAsst = [...trimmed].reverse().find((m) => m.role === "assistant")?.content || "";
      const hits = facts.phone ? asIdentifyHits(dossiersByPhone(facts.phone)) : [];
      const known = confirmedHit(hits, lastUser, lastAsst);
      if (known) {
        facts.identified = true;
        facts.customerId = known.customerId;
        facts.child = facts.child || known.child;
      }
      const lockedId = identifyLocked(soloWho, {
        phone: facts.phone,
        hits,
        identified: facts.identified,
        lastUser,
        lastAssistant: lastAsst,
      });
      if (lockedId) {
        return { ok: true as const, reply: lockedId.reply, token: granted, reload: false, groups: lockedId.chips };
      }
    }
    if (!admin && facts.mode !== "client") {
      const locked = lockedFunnelReply(soloWho, all, Boolean(data.voice) || channelId === "phone");
      if (locked?.reply) {
        return { ok: true as const, reply: locked.reply, token: granted, reload: false };
      }
      if (facts.mode === "new" && facts.school && !facts.briefed) {
        const pitch = programPitch(facts.school, loadBrain().scripts);
        const name = soloWho === "olga" ? "Ольга" : "Олег";
        return {
          ok: true as const,
          reply: `${name}: ${pitch}\nОбучение выстроено последовательно: от младших к старшим. Записать на пробное или сразу в группу?`,
          token: granted,
          reload: false,
          groups: [
            { label: "Пробное занятие", send: "Хочу пробное занятие", primary: true },
            { label: "В действующую группу", send: "Записать в действующую группу" },
          ],
        };
      }
    }
    if (!admin && facts.mode !== "client" && (facts.phone || facts.child || facts.parent)) {
      try {
        dossierFromNote(note, { phone: facts.phone, chatId: String(data.path || "") });
      } catch {
        /* */
      }
    }
    const file =
      !admin && facts.identified && facts.customerId
        ? findDossier({ crmId: facts.customerId })
        : !admin && facts.mode === "new"
          ? findDossier({ phone: facts.phone })
          : null;
    let deskBlock = "";
    if (!admin && facts.identified && facts.customerId) {
      try {
        const { clientDigest, digestPrompt } = await import("./agent-client-desk");
        deskBlock = digestPrompt(clientDigest(facts.customerId));
      } catch {
        /* диск */
      }
    }
    const factsLessons = admin ? lessonFactsForAgent(12) : [];
    const lessonBlock = factsLessons.length
      ? `\nТемы недавних занятий (с диска, без ФИО учеников):\n${factsLessons.map((x) => `— ${x}`).join("\n")}\n`
      : "";
    let commsBlock = "";
    if (!admin && file?.crmId) {
      try {
        const { commsOf, commsPrompt } = await import("./crm-comms");
        commsBlock = commsPrompt(commsOf(Number(file.crmId)));
      } catch {
        /* лента */
      }
    }
    const system = admin
      ? ADMIN_SYSTEM + adminHint
      : clientSystem(soloWho, facts, facts.mode === "new" ? note.next : nextStepOf(facts)) +
        agentPromptAddons(facts, data.channel || channelId || "site") +
        knowledgeForAgent() +
        factsPrompt(facts) +
        notePrompt(note) +
        dossierPrompt(file) +
        deskBlock +
        commsBlock +
        lessonBlock;
    const messages: ChatMsg[] = [{ role: "system", content: system }, ...trimmed];
    const t0 = Date.now();
    try {
      for (let step = 0; step < 4; step++) {
        const settings = loadBrain().settings;
        const tools = admin
          ? ADMIN_TOOLS
          : siteTools(
              settings.consultantCanBook !== false,
              Boolean(facts.identified && facts.customerId),
              settings.consultantCanJournal !== false,
              settings.consultantCanTariff === true,
            );
        const json = await complete(messages, tools);
        if (!json) break;
        const msg = json.choices?.[0]?.message;
        if (!msg) break;
        if (msg.tool_calls?.length) {
          messages.push({
            role: "assistant",
            content: msg.content || "",
            tool_calls: msg.tool_calls,
          } as ChatMsg);
          for (const call of msg.tool_calls) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(call.function.arguments || "{}");
            } catch {
              args = {};
            }
            if (call.function.name === "submit_trial" || call.function.name === "book_lesson") {
              if (loadBrain().settings.consultantCanBook === false) {
                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: "Запись консультантом выключена в настройках. Назови слоты и телефон 8 (800) 511-34-01. Заявку не создавай.",
                });
                continue;
              }
              const kind = String(args.lesson_type || args.kind || "trial");
              const gid = String(args.gid || "").replace(/\D/g, "");
              if (gid && (kind === "group" || kind === "trial")) {
                try {
                  const { listAdminSlots } = await import("./alfacrm-schedule");
                  const { readPriority } = await import("./group-status");
                  const bid = Number(resolveBranch(String(args.branch_id || ""))) || 0;
                  const hit = listAdminSlots().find(
                    (s) => String(s.groupId) === gid && (!bid || Number(s.branchId) === bid),
                  );
                  if (hit && readPriority(hit.priority) === 0) {
                    messages.push({
                      role: "tool",
                      tool_call_id: call.id,
                      content:
                        "Приоритет 0 — с сайта не записывать. Предложи группу с приоритетом 1 или запись через администратора 8 (800) 511-34-01.",
                    });
                    continue;
                  }
                } catch {
                  /* слоты */
                }
              }
              const saved = await saveTrialLead({
                parent: String(args.parent || ""),
                child: String(args.child || ""),
                dob: normalizeDob(String(args.dob || "")),
                phone: String(args.phone || ""),
                email: String(args.email || ""),
                course: resolveCourse(String(args.course_id || "")),
                branch: resolveBranch(String(args.branch_id || "")),
                gid: args.gid ? String(args.gid) : "",
                groupName: args.group_name ? String(args.group_name) : "",
                age: args.age != null ? Number(args.age) : undefined,
                kind: String(args.lesson_type || args.kind || "trial"),
                date: args.date ? String(args.date) : "",
                time: args.time ? String(args.time) : "",
                duration: args.duration != null ? Number(args.duration) : undefined,
                subjectId: Number(args.subject_id) || undefined,
              });
              const lessonName = saved.ok && saved.lesson?.type ? saved.lesson.type : "занятие";
              if (saved.ok && "id" in saved && saved.id) {
                try {
                  upsertDossier({
                    crmId: Number(saved.id) > 0 ? Number(saved.id) : undefined,
                    branchId: Number(saved.branch) || undefined,
                    phone: String(args.phone || ""),
                    child: String(args.child || ""),
                    parent: String(args.parent || ""),
                    dob: String(args.dob || ""),
                    course: String(args.course_id || ""),
                    source: "site",
                    note: `Запись: ${lessonName}`,
                  });
                } catch {
                  /* */
                }
              }
              messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: saved.ok
                  ? `Заявку приняли на сайте${saved.pending ? ", AlfaCRM в очереди" : saved.duplicate ? ", карточка уже была — обновили" : ""}. Филиал=${saved.branch}${saved.lesson ? `, ${lessonName} на ${saved.lesson.date} ${saved.lesson.time}` : ""}. Родителю URL не читай. Скажи: заявку приняли, ${lessonName.toLowerCase()} поставили. Не жди ответ Alfa.`
                  : `Ошибка: ${saved.error}`,
              });
            } else if (call.function.name === "list_courses_by_age") {
              const { formatCoursesForAge } = await import("./ages");
              const age = Number(args.age);
              messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: formatCoursesForAge(age),
              });
            } else if (call.function.name === "list_groups") {
              try {
                const { groupsForQuery, formatGroups } = await import("./alfacrm-schedule");
                const age = Number(args.age);
                const list = await groupsForQuery({
                  age: Number.isFinite(age) ? age : undefined,
                  branch: String(args.branch || ""),
                  branchId: Number(args.branch_id) || undefined,
                  course: String(args.course || ""),
                  courseId: String(args.course_id || ""),
                  schoolId: String(args.school_id || ""),
                  subjectId: Number(args.subject_id) || undefined,
                });
                const shownRaw = list;
                const seeAll = loadBrain().settings.consultantCanSeeAllGroups !== false;
                let shown = shownRaw;
                if (!seeAll) {
                  const { slotOnPublicSchedule } = await import("./group-status");
                  const { loadSiteSignup } = await import("./site-signup");
                  const pub = loadSiteSignup().statusPublish;
                  shown = shownRaw.filter((g) => slotOnPublicSchedule(g, pub));
                }
                groups = [
                  { label: "Пробное занятие", send: "Хочу записаться на пробное занятие", primary: true },
                  { label: "Сразу в группу", send: "Запишите сразу в группу" },
                  ...shown.slice(0, 6).map((g) => ({
                    label: `Пробное · ${g.chip}`,
                    send: `Запишите на пробное gid=${g.gid} филиал=${g.branchId} дата=${g.nextDate || ""} время=${g.timeFrom || ""} курс=${g.courseId || ""} subject_id=${g.subjectId || ""}`,
                  })),
                ];
                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: formatGroups(shown, age),
                });
              } catch {
                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: "Расписание сейчас с сайта недоступно. Предложи позвонить 8 (800) 511-34-01 или заявку на пробное.",
                });
              }
            } else if (call.function.name === "open_group") {
              messages.push({
                role: "tool",
                tool_call_id: call.id,
                content:
                  "open_group запрещён. Запись: book_lesson lesson_type=group или submit_trial. Форму AlfaCRM родителю не открывать.",
              });
            } else if (call.function.name === "open_course") {
              const { findCoursePage } = await import("./agent-courses");
              const { loadSiteTree } = await import("./site-tree");
              const hit = findCoursePage(String(args.path || args.name || ""), loadSiteTree());
              if (hit) {
                groups = [
                  ...groups.filter((g) => g.href !== hit.path),
                  { label: `Подробнее: ${hit.name}`, href: hit.path, primary: true },
                ];
                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: `Кнопка на курс «${hit.name}» (${hit.path}) уже под сообщением. Страницу не открывай. Скажи: подробности — по кнопке ниже.`,
                });
              } else {
                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: "Курс не найден. Уточни название.",
                });
              }
            } else if (call.function.name === "client_card" || call.function.name === "note_skip" || call.function.name === "pause_classes" || call.function.name === "assign_tariff") {
              const cid = Number(args.customer_id) || Number(facts.customerId) || 0;
              if (!facts.identified || !cid || cid !== Number(facts.customerId)) {
                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: "Сначала узнать клиента по телефону и имени. Чужую карточку не открывать.",
                });
              } else {
                const desk = await import("./agent-client-desk");
                if (call.function.name === "client_card") {
                  const d = desk.clientDigest(cid);
                  messages.push({
                    role: "tool",
                    tool_call_id: call.id,
                    content: d ? desk.digestPrompt(d) : "Карточки на диске нет.",
                  });
                } else if (call.function.name === "note_skip") {
                  if (loadBrain().settings.consultantCanJournal === false) {
                    messages.push({ role: "tool", tool_call_id: call.id, content: "Пропуск консультантом выключен. Телефон 8 (800) 511-34-01." });
                  } else {
                    const res = desk.applySkip(cid, String(args.date || ""), String(args.reason || ""));
                    messages.push({ role: "tool", tool_call_id: call.id, content: res.ok ? res.text : res.error });
                  }
                } else if (call.function.name === "pause_classes") {
                  if (loadBrain().settings.consultantCanJournal === false) {
                    messages.push({ role: "tool", tool_call_id: call.id, content: "Пауза консультантом выключена. Телефон 8 (800) 511-34-01." });
                  } else {
                    const res = desk.applyPause(cid, String(args.until || ""), String(args.reason || ""));
                    messages.push({ role: "tool", tool_call_id: call.id, content: res.ok ? res.text : res.error });
                  }
                } else if (loadBrain().settings.consultantCanTariff !== true) {
                  messages.push({ role: "tool", tool_call_id: call.id, content: "Назначение абонемента консультантом выключено. Это кабинет сотрудника." });
                } else {
                  const res = desk.applyClientTariff({
                    customerId: cid,
                    tariffId: Number(args.tariff_id) || 0,
                    groupId: Number(args.group_id) || 0,
                    branchId: Number(args.branch_id) || 0,
                  });
                  messages.push({
                    role: "tool",
                    tool_call_id: call.id,
                    content: res.ok ? `Абонемент tariffId=${res.tariffId} на сайте, Alfa в очереди.` : res.error,
                  });
                }
              }
            } else if (call.function.name === "verify_admin_code") {
              const { checkCodeword, logAdmin } = await import("./admin-settings");
              const ok = checkCodeword(String(args.word || ""));
              if (ok) {
                admin = true;
                granted = makeAdminToken(30 * 60 * 1000);
                logAdmin("Вход по кодовому слову");
                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: "Код верный. Доступ к изменению сайта открыт.",
                });
              } else {
                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: "Код неверный. Доступ закрыт.",
                });
              }
            } else if (admin && call.function.name === "set_price") {
              const { updateOnePrice } = await import("./prices");
              const field = args.field === "kbm" || args.field === "tmx" ? args.field : "all";
              const amount = Number(args.amount);
              const saved = updateOnePrice(String(args.path || ""), { [field]: amount });
              if (saved.ok) {
                const { logAdmin } = await import("./admin-settings");
                logAdmin(`Цена: ${saved.row.name} → ${saved.row[field]} ₽`);
              }
              messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: saved.ok
                  ? `Цена обновлена: ${saved.row.name} — ${field} ${saved.row[field]} ₽ / 4 нед.`
                  : saved.error,
              });
            } else if (admin && call.function.name === "set_prices_group") {
              const { updateGroupPrice } = await import("./prices");
              const field =
                args.field === "kbm" || args.field === "tmx" || args.field === "all-three" ? args.field : "all";
              const saved = updateGroupPrice({
                direction: args.direction ? String(args.direction) : undefined,
                query: args.query ? String(args.query) : undefined,
                field,
                set: args.set != null ? Number(args.set) : undefined,
                delta: args.delta != null ? Number(args.delta) : undefined,
              });
              if (saved.ok) {
                const { logAdmin } = await import("./admin-settings");
                logAdmin(`Группа: ${args.direction || args.query} · ${saved.count}`);
              }
              messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: saved.ok ? `Обновлено курсов: ${saved.count}. ${saved.names.slice(0, 6).join("; ")}` : saved.error,
              });
            } else if (admin && call.function.name === "reload_page") {
              reload = true;
              messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: "Страница сейчас обновится. Изменения будут на сайте.",
              });
            } else if (admin && call.function.name === "list_page_fields") {
              const { previewPage, listPageEdits } = await import("./edits");
              const { fieldLabel } = await import("./edits-core");
              const shown = previewPage(String(args.path || ""), String(data.path || ""));
              const all = listPageEdits();
              messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: JSON.stringify({
                  page: shown.path,
                  title: shown.title,
                  overrides: Object.fromEntries(
                    Object.entries(shown.fields).map(([k, v]) => [fieldLabel(k), v]),
                  ),
                  edited_pages: all.map((x) => ({ path: x.path, title: x.title })),
                }),
              });
            } else if (admin && call.function.name === "set_site_text") {
              const { setPageField } = await import("./edits");
              const { fieldLabel } = await import("./edits-core");
              const saved = setPageField(String(args.path || ""), String(args.field || ""), String(args.value || ""), String(data.path || ""));
              if (saved.ok) {
                reload = true;
                const { logAdmin } = await import("./admin-settings");
                logAdmin(`Текст: ${saved.path} · ${saved.field}`);
                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: `Сохранено: ${saved.title || saved.path} — ${fieldLabel(saved.field)}. Страница обновится.`,
                });
              } else {
                messages.push({ role: "tool", tool_call_id: call.id, content: saved.error });
              }
            } else if (admin && call.function.name === "clear_site_text") {
              const { clearPageField } = await import("./edits");
              const { fieldLabel } = await import("./edits-core");
              const saved = clearPageField(String(args.path || ""), String(args.field || ""), String(data.path || ""));
              if (saved.ok) {
                reload = true;
                const { logAdmin } = await import("./admin-settings");
                logAdmin(`Сброс текста: ${saved.path} · ${saved.field}`);
                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: `Вернули исходный текст: ${saved.title || saved.path} — ${fieldLabel(saved.field)}.`,
                });
              } else {
                messages.push({ role: "tool", tool_call_id: call.id, content: saved.error });
              }
            } else if (admin && call.function.name === "clear_site_page") {
              const { clearPage } = await import("./edits");
              const saved = clearPage(String(args.path || ""), String(data.path || ""));
              if (saved.ok) {
                reload = true;
                const { logAdmin } = await import("./admin-settings");
                logAdmin(`Сброс страницы: ${saved.path}`);
                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: `Вернули исходные тексты: ${saved.title || saved.path}. Страница обновится.`,
                });
              } else {
                messages.push({ role: "tool", tool_call_id: call.id, content: saved.error });
              }
            } else if (admin && call.function.name === "set_voice_settings") {
              const { parseVoiceCommand, saveVoiceSettings, loadVoiceSettings } = await import("./voice-settings");
              const { logAdmin } = await import("./admin-settings");
              let settings = loadVoiceSettings();
              if (args.faster || args.slower || args.voice || args.who) {
                settings = parseVoiceCommand(
                  String(args.who || ""),
                  String(args.voice || ""),
                  args.speed != null ? Number(args.speed) : undefined,
                  Boolean(args.faster),
                  Boolean(args.slower),
                  args.mood ? String(args.mood) : args.role ? String(args.role) : undefined,
                  args.pause != null ? Number(args.pause) : undefined,
                );
              }
              if (args.speed != null && !args.faster && !args.slower) {
                settings = saveVoiceSettings({ speed: Number(args.speed) });
              }
              if (args.role || args.mood) settings = saveVoiceSettings({ mood: String(args.mood || args.role) });
              logAdmin(`Голоса: Олег ${settings.oleg}, Ольга ${settings.olga}, ${settings.speed}`);
              messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: `Сохранено. Олег: ${settings.oleg}, Ольга: ${settings.olga}, скорость ${settings.speed}, характер ${settings.role}. Следующая реплика уже новым голосом.`,
              });
            } else {
              messages.push({ role: "tool", tool_call_id: call.id, content: "Неизвестное действие." });
            }
          }
          continue;
        }
        const reply = guardReply((msg.content || "").trim(), facts);
        if (reply) {
          if (!admin) {
            void import("./crm-comms").then((m) =>
              m.rememberConsultantTurn({
                customerId: Number(file?.crmId) || undefined,
                branchId: Number(file?.branchId) || undefined,
                channel: data.channel || "site",
                phone: facts.phone,
                parent: facts.parent,
                incoming: lastUser,
                reply,
              }),
            );
          }
          void import("./debug-mode").then((m) =>
            m.stampDebugNet({
              ok: true,
              ms: Date.now() - t0,
              channel: String(data.channel || "site"),
              chars: reply.length,
            }),
          );
          return { ok: true as const, reply, token: granted, reload, open: open || undefined, signup: signup || undefined, groups: groups.length ? groups : undefined };
        }
      }
      void import("./debug-mode").then((m) =>
        m.stampDebugNet({
          ok: true,
          ms: Date.now() - t0,
          channel: String(data.channel || "site"),
          error: "fallback",
        }),
      );
      return {
        ok: true as const,
        reply: fallbackTalk(soloWho, facts),
        token: granted,
        reload,
        open: open || undefined,
        signup: signup || undefined,
        groups: groups.length ? groups : undefined,
      };
    } catch {
      void import("./debug-mode").then((m) =>
        m.stampDebugNet({
          ok: false,
          ms: 0,
          channel: String(data.channel || "site"),
          error: "llm",
        }),
      );
      return {
        ok: true as const,
        reply: fallbackTalk(soloWho, facts),
        token: granted,
        reload,
      };
    }
  });
