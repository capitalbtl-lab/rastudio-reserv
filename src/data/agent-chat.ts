import { createServerFn } from "@tanstack/react-start";
import { SITE } from "@/data/site";
import { saveTrialLead, TRIAL_BRANCHES, TRIAL_COURSES } from "@/data/trial";
import { LESSON_TYPES } from "@/data/alfacrm";
import { serverEnv } from "./server-env";
import { type SessionFacts, nextStepOf } from "./agent-facts";
import { programPitch } from "./agent-playbook";

function fallbackTalk(who: "oleg" | "olga", facts: SessionFacts) {
  const n = who === "olga" ? "Ольга" : "Олег";
  if (facts.school) {
    const pitch = programPitch(facts.school);
    if (pitch) return `${n}: ${pitch}\nОбучение идёт от младших к старшим. Пробное занятие или сразу в группу?`;
  }
  if (!facts.age) return `${n}: Напишите, сколько лет ребёнку — подберу программу.`;
  if (!facts.city) return `${n}: Вам удобнее Коломна или Луховицы?`;
  if (facts.city === "Коломна" && !facts.branchId) {
    return `${n}: В Коломне два адреса: ЦМИТ на Октябрьской революции, 340 и Гражданская, 2. Какой ближе?`;
  }
  if (!facts.school) {
    return `${n}: Какое направление ближе — художественная школа, робототехника, программирование, науки и инженерия, раннее развитие, модельная школа или иностранные языки?`;
  }
  return `${n}: Могу записать на пробное или сразу в группу. Что удобнее?`;
}

function clientSystem(who: "oleg" | "olga", facts?: SessionFacts, stepOverride?: string) {
  const name = who === "olga" ? "Ольга" : "Олег";
  const other = who === "olga" ? "Олег" : "Ольга";
  const gender =
    who === "olga"
      ? "женский род: согласна, готова, поняла. Никогда «согласен»."
      : "мужской род: согласен, готов, понял. Никогда «согласна».";
  const step = stepOverride || (facts ? nextStepOf(facts) : "не спрашивай возраст и город — работают кнопки.");
  return `Вы — ${name}, администратор студии «Развивайся». Говорите по-русски с родителем. Не называйте себя роботом или нейросетью. Не выдумывайте день и свободные места. Цены: «от … / 4 недели». Пробное без обязательства.

Формат КАЖДОГО ответа строго:
${name}: фраза

${other} молчит. Не пишите строки «${other}:». Сейчас разговор только с ${name}. ${gender}
Вне режима управления не предлагайте сменить голос и не вызывайте set_voice_settings.

Не открывайте страницы сайта сами и не говорите «открыла страницу» / «открыли курс». Если нужны подробности курса — вызови open_course: родителю появится кнопка. В речи: «ниже кнопка — описание курса».

${who === "oleg" ? "Вы хорошо рассказываете про технику: робототехника, программирование, Scratch, Python, C++, Unity, Blender, Компас, радиотехника, беспилотники, физика, наука, Лего-математика, STEAM, IT-лаборатория, JuniorSchool, GameDev. Творческие курсы тоже можете коротко назвать." : "Вы хорошо рассказываете про творчество и запись: художественная студия и школа, скульптура, рисунок, живопись, манга, digital art, подготовка в вуз, модельная школа, подготовка к школе, языки, мастер-классы, филиал, оплата, личный кабинет, пробное, расписание. Технические курсы тоже можете коротко назвать."}

Не пишите длинные адреса, пока не спросили как пройти.

Телефон: ${SITE.phone}. Сайт: ${SITE.domain}.
Филиалы AlfaCRM: 1 Гражданская, 2 Коломна; 2 ЦМИТ Октябрьской революции, 340; 3 Луховицы, Пушкина, 202А; 4 летние программы (только апрель–август).
Курсы называй ТОЧНО как на сайте, не обобщай до «школы», когда уже внутри направления.
ЭТА РЕПЛИКА — только текущий шаг: ${step}
Город и филиал спрашивает система, не ты. Если в фактах уже есть город — ни слова «какой город», «Коломна или Луховицы».
Не возвращайся к закрытым шагам.
list_groups вызывай только когда направление уже рассказано и родитель хочет пробное в группе или сразу в группу.
Пробное в свободный день: заявка без слота, в комментарии «дату согласуем по телефону». Не выдумывай время.
История сессии полная до сброса диалога.
На запись нужны: ФИО ребёнка, ФИО родителя (заказчика), телефон, филиал. Дата рождения — целиком, как 01.01.2021. Возраст подойдёт, если даты нет: подставим 01.09 года рождения.
Когда есть имя родителя, ФИО ребёнка, телефон и филиал — сразу вызови book_lesson (или submit_trial для первого визита). Передай course_id, gid слота, дату и время если уже выбрали. Не жди почту.
Типы занятий AlfaCRM: ${LESSON_TYPES.map((t) => `${t.id} ${t.name} (${t.key})`).join("; ")}.
Первый визит — пробное (trial). Постоянная группа — групповое (group). Пропуск — отработка (makeup). Ещё бывают: вводное, дополнительное, сверхурочное, индивидуальное, собеседование, открытый урок, мастер-класс, экскурсия, мероприятие, летний лагерь, продленка, летняя программа. Не ставь пробное, если родитель явно просит другой тип.
Не говори «мы перезвоним» и не отправляй на форму, если заявка уже ушла в CRM. Скажи: заявку приняли, занятие поставили на дату и время. Не читай URL.
Если есть gid группы — передай его, чтобы взять день, время и предмет из расписания.
Запись в группу без урока — open_group, форма этой группы в AlfaCRM.
id курсов для заявки: ${TRIAL_COURSES.map((c) => `${c.id} ${c.name}`).join("; ")}.
Не открывай страницу курса в браузере. Только кнопка через open_course, когда курс выбран и нужны подробности.
Жалобы и деньги — телефон.
Если просят править сайт, цены, голоса или говорят «я администратор» — не спрашивай код в этом чате и не путай с подбором курса. Скажи нажать ссылку «войти в административный режим» внизу окна.
`;
}

const ADMIN_SYSTEM = `Вы — Ольга, консоль управления сайтом rastudio.org. Собеседник — сотрудник студии, не родитель.
Формат каждого ответа: только строка «Ольга: …». Олег молчит. Женский род.

Это не консультация. Запрещено: возраст ребёнка, подбор курса, пробное, филиалы «куда удобнее», лиды в CRM, «чем могу помочь» в смысле кружков.
Если просят подобрать курс — «это другой чат, нажмите выход администратора».

Только правки сайта:
— цены: set_price
— тексты страницы: list_page_fields, set_site_text, clear_site_text
— голоса Олега и Ольги: set_voice_settings (Олег: zahar, filipp, ermil; Ольга: alena, jane, marina)
— reload_page если просят обновить
После команды сразу вызови инструмент и коротко подтверди, что сохранено.
Не пиши «режим управления уже открыт», не проси кодовое слово — доступ уже есть.
Не обсуждай курсы «для ребёнка». Голос меняй инструментом, не вопросами про обучение.
`;

const ADMIN_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "set_price",
      description: "Изменить цену одного курса. Только администратор. path или точное имя, сумма в рублях за 4 недели.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", description: "Путь или название курса" },
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
            description: "h1 | description | about | why_heading | why | hero_title | hero_text",
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
          course_id: { type: "string", description: "ID курса/предмета, например 37" },
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
          course_id: { type: "string" },
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
      description: "Живое расписание AlfaCRM: ближайшие группы, день, время, свободные места. Вызывать, когда известен возраст. Филиал желателен.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          age: { type: "number", description: "Возраст ребёнка" },
          branch: { type: "string", description: "1 Гражданская, 2 Октябрьской, 3 Луховицы, или Коломна" },
          course: { type: "string", description: "Название курса или путь страницы" },
        },
        required: ["age"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "open_group",
      description: "Открыть форму записи в конкретную группу AlfaCRM по gid.",
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
  const hit = TRIAL_COURSES.find((c) => c.id === String(id) || c.name.toLowerCase() === String(id).toLowerCase());
  return hit?.id || "";
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
    let admin = tokenOk(data.token);
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
    if (!admin && wantAdmin && lastUser && codewordInText(lastUser)) {
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
    if (!admin && data.gate) {
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
    const note = buildSessionNote(all);
    if (!admin) {
      const locked = lockedFunnelReply(soloWho, all, Boolean(data.voice));
      if (locked?.reply) {
        return { ok: true as const, reply: locked.reply, token: granted, reload: false };
      }
      if (facts.school && !facts.briefed) {
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
    if (!admin && (facts.phone || facts.child || facts.parent)) {
      try {
        dossierFromNote(note, { phone: facts.phone, chatId: String(data.path || "") });
      } catch {
        /* */
      }
    }
    const file = !admin ? findDossier({ phone: facts.phone }) : null;
    const factsLessons = lessonFactsForAgent(12);
    const lessonBlock = factsLessons.length
      ? `\nТемы недавних занятий (из AlfaCRM, без ФИО учеников):\n${factsLessons.map((x) => `— ${x}`).join("\n")}\n`
      : "";
    const system = admin
      ? ADMIN_SYSTEM + adminHint
      : clientSystem(soloWho, facts, note.next) +
        agentPromptAddons(facts, data.channel || "site") +
        knowledgeForAgent() +
        factsPrompt(facts) +
        notePrompt(note) +
        dossierPrompt(file) +
        lessonBlock;
    const messages: ChatMsg[] = [{ role: "system", content: system }, ...trimmed];
    try {
      for (let step = 0; step < 4; step++) {
        const tools = admin ? ADMIN_TOOLS : TOOLS;
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
              });
              const lessonName = saved.ok && saved.lesson?.type ? saved.lesson.type : "занятие";
              if (saved.ok && "id" in saved && saved.id) {
                try {
                  upsertDossier({
                    crmId: Number(saved.id),
                    branchId: Number(saved.branch) || undefined,
                    phone: String(args.phone || ""),
                    child: String(args.child || ""),
                    parent: String(args.parent || ""),
                    dob: String(args.dob || ""),
                    course: String(args.group_name || args.course_id || ""),
                    source: "alfacrm",
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
                  ? `Лид в AlfaCRM id=${"id" in saved ? saved.id : ""} филиал=${saved.branch}${saved.duplicate ? ", карточка уже была — обновили" : ", новая карточка"}${saved.lesson ? `, ${lessonName} id=${saved.lesson.id} на ${saved.lesson.date} ${saved.lesson.time}` : ", урок не создался — лид есть"}. Ссылка для администратора: ${"url" in saved ? saved.url : ""}. Родителю URL не читай. Скажи: заявку приняли, ${lessonName.toLowerCase()} поставили.`
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
                  course: String(args.course || ""),
                });
                const fallback =
                  !list.length && args.course
                    ? await groupsForQuery({
                        age: Number.isFinite(age) ? age : undefined,
                        branch: String(args.branch || ""),
                      })
                    : [];
                const shown = list.length ? list : fallback;
                groups = [
                  { label: "Пробное занятие", send: "Хочу записаться на пробное занятие", primary: true },
                  ...shown.map((g) => ({ label: `В группу · ${g.chip}`, href: g.signup })),
                ];
                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content:
                    (!list.length && fallback.length ? "По точному названию не нашли, ниже группы на этот возраст.\n" : "") +
                    formatGroups(shown, age),
                });
              } catch {
                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: "Расписание CRM сейчас недоступно. Предложи позвонить 8 (800) 511-34-01 или заявку на пробное.",
                });
              }
            } else if (call.function.name === "open_group") {
              const { groupSignup, groupsForQuery } = await import("./alfacrm-schedule");
              const gid = String(args.gid || "");
              let hit = groupSignup(gid, String(args.branch || ""));
              if (!hit) {
                const list = await groupsForQuery({}).catch(() => []);
                const found = list.find((g) => g.gid === gid.replace(/\D/g, ""));
                if (found) hit = { gid: found.gid, branchId: found.branchId, signup: found.signup };
              }
              if (hit) {
                signup = hit.signup;
                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: `Открыли форму записи в группу ${hit.gid}, филиал ${hit.branchId}. Скажи родителю заполнить форму на экране. URL не читай.`,
                });
              } else {
                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: "Группа не найдена. Вызови list_groups ещё раз.",
                });
              }
            } else if (call.function.name === "open_course") {
              const { findCoursePage } = await import("./agent-courses");
              const hit = findCoursePage(String(args.path || args.name || ""));
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
                  fields: Object.fromEntries(
                    Object.entries(shown.fields).map(([k, v]) => [fieldLabel(k), v]),
                  ),
                  edited_pages: all.map((x) => x.path),
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
                  content: `Сохранено: ${saved.path} — ${fieldLabel(saved.field)}. Страница обновится.`,
                });
              } else {
                messages.push({ role: "tool", tool_call_id: call.id, content: saved.error });
              }
            } else if (admin && call.function.name === "clear_site_text") {
              const { clearPageField } = await import("./edits");
              const saved = clearPageField(String(args.path || ""), String(args.field || ""), String(data.path || ""));
              if (saved.ok) {
                reload = true;
                const { logAdmin } = await import("./admin-settings");
                logAdmin(`Сброс текста: ${saved.path} · ${saved.field}`);
                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: `Вернули исходный текст: ${saved.path} / ${saved.field}.`,
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
        if (reply) return { ok: true as const, reply, token: granted, reload, open: open || undefined, signup: signup || undefined, groups: groups.length ? groups : undefined };
      }
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
      return {
        ok: true as const,
        reply: fallbackTalk(soloWho, facts),
        token: granted,
        reload,
      };
    }
  });
