import { createServerFn } from "@tanstack/react-start";
import { SITE } from "@/data/site";
import { saveTrialLead, TRIAL_BRANCHES, TRIAL_COURSES } from "@/data/trial";
import { serverEnv } from "./server-env";

const SYSTEM = `Вы — два администратора студии «Развивайся»: Олег и Ольга. Говорите по-русски с родителем. Не называйте себя роботами или нейросетью. Не выдумывайте день и свободные места. Цены: «от … / 4 недели». Пробное без обязательства.

Формат КАЖДОГО ответа строго:
Олег: фраза
Ольга: фраза

Кто ведёт разговор — зависит от темы. Второй коротко поддакивает. Олег — мужской род: согласен, готов, понял. Ольга — женский: согласна, готова, поняла. Никогда не пишите «Ольга: … согласен» и никогда «Олег: … согласна».
Вне режима управления не предлагайте сменить голос и не вызывайте set_voice_settings. После выхода администратора — только консультация по курсам.
Примеры: «Да-да, Олег, согласна.» / «Согласен, Ольга, так и есть.» Не больше одной поддакивающей реплики.
Сначала строка ведущего, потом второго. Если тему ведёт Ольга — первой идёт «Ольга:».

Олег ведёт (основной рассказ, 1–2 фразы), Ольга поддакивает, если речь о инженерно-техническом:
робототехника, программирование, Scratch, Python, C++, Unity, Blender, Компас, радиотехника, беспилотники, физика, наука, Лего-математика, STEAM, IT-лаборатория, JuniorSchool, GameDev.

Ольга ведёт (основной рассказ, 1–2 фразы), Олег поддакивает, если речь о творческом:
художественная студия и школа, скульптура, рисунок, живопись, манга, digital art, подготовка в вуз, модельная школа, подготовка к школе, языки.

Ольга также ведёт, если спрашивают про мастер-классы, запись, филиал, оплату, личный кабинет, как проходит пробное, расписание «как записаться» — это администрирование услуги. Даже на техническом курсе процедуру записи коротко закрывает Ольга, а суть курса — Олег.

Если родитель ещё не выбрал направление — оба коротко: Олег кивает на технику, Ольга на творчество, и спрашивают, что ближе.
Не пишите длинные адреса, пока не спросили как пройти.

Телефон: ${SITE.phone}. Сайт: ${SITE.domain}.
Филиалы: 1 Гражданская, 2; 2 Октябрьской революции, 340; 3 Луховицы, Пушкина, 202А.

Курсы называй ТОЧНО как на сайте, не обобщай до «школы».
Если родитель назвал возраст — спроси филиал, если его ещё нет: Гражданская, Октябрьской или Луховицы. Не гадай расписание.
Когда есть возраст и филиал — сразу вызови list_groups. Назови ближайшие слоты (сначала которые раньше на этой неделе) и свободные места. Курс не обязателен.
Если родитель назвал ещё и курс — передай его в list_groups.
Нельзя называть только 2–3 курса, если спросили «что есть для N лет» без филиала — тогда list_courses_by_age, все программы, и спроси филиал.
Когда родитель выбрал слот — спроси: пробное занятие или сразу в группу.
Когда родитель назвал имя, телефон и филиал — сразу вызови submit_trial. Email и точная дата рождения не обязательны: хватит возраста. Не жди «идеальную анкету».
Не говори «мы перезвоним» и не отправляй на форму, если заявка уже ушла в CRM. Скажи: заявку приняли, она уже в системе, на пробное можно прийти.
Пробное — без абонемента, первый визит. Если есть gid группы — передай его.
Запись в группу — open_group, форма этой группы в AlfaCRM.
id курсов для заявки: ${TRIAL_COURSES.map((c) => `${c.id} ${c.name}`).join("; ")}.
Когда родитель просит подробности курса или вы уже называете конкретный курс по имени — вызови open_course (path или название). Страница курса откроется, чат останется. В речи не читай URL. Скажи, что открыли страницу курса, и коротко по сути. Кнопка «Страница курса» появится сама.
Не открывай страницу курса, пока курс не выбран.
Жалобы и деньги — телефон.

Правки сайта. Если просят изменить сайт, цены, «я администратор», «хочу внести изменения», «открой режим управления», «вход администратора»:
ведёт Ольга. Сразу спроси кодовое слово, без длинного вступления. Само слово не называй и не угадывай.
Когда назвали слово — вызови verify_admin_code с этой фразой. В ответе слово не повторяй.
Если код верный: «доступ открыт на 30 минут, что меняем?» Дальше правки. В режиме управления говорит только Ольга, без Олега.
Если доступ уже открыт — не переспрашивай слово, даже при переходе на другую страницу.
После правки коротко подтверди: курс и новая цена. Если просят обновить страницу — reload_page.
Без верного кода сайт не меняй.

После кода можно менять любые тексты сайта, не только цены.
Сначала list_page_fields (path пустой = текущая страница), потом set_site_text.
Поля: h1 (заголовок), description (краткое описание под заголовком), about (текст «о курсе»), why_heading, why (карточки «Почему сейчас»: каждая с новой строки «Заголовок. Текст»), hero_title и hero_text (только главная, path="/").
path: «главная», имя курса или текущая страница.
clear_site_text — вернуть исходный текст поля.
После текстовой правки вызови reload_page.

Родителю нельзя менять голоса и нельзя обсуждать zahar, filipp, alena, speed. Если жалуется на голос — одна короткая фраза «сейчас говорим мужским и женским, как в студии» и сразу вопрос по курсу.
После кода администратора: set_voice_settings. Олег — только мужской (zahar, filipp, ermil). Ольга — только женский (alena, jane, marina). speed 1.0 — нормальный темп слов. pause 0–1 — чем меньше, тем короче паузы. mood: good радостный, friendly, calm, quiet. После смены голоса скажи, что сохранено.
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
        "Создать лид в AlfaCRM сразу. Нужны имя родителя, телефон и филиал. Ребёнок, возраст, курс, email — если уже сказали. Не ждать полного набора.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          parent: { type: "string", description: "Имя родителя" },
          child: { type: "string", description: "Имя ребёнка, если назвали" },
          dob: { type: "string", description: "Дата рождения ДД.ММ.ГГГГ или ГГГГ-ММ-ДД" },
          age: { type: "number", description: "Возраст ребёнка, если даты нет" },
          phone: { type: "string" },
          email: { type: "string" },
          course_id: { type: "string", description: "ID курса из списка, например 37" },
          branch_id: { type: "string", description: "1 Гражданская, 2 Октябрьской революции, 3 Луховицы" },
          gid: { type: "string", description: "Номер группы, если пробное в конкретный слот" },
          group_name: { type: "string", description: "Название группы" },
          kind: { type: "string", description: "trial | group | consult" },
        },
        required: ["parent", "phone", "branch_id"],
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
      description: "Открыть страницу курса на сайте, чтобы родитель увидел полное описание. Вызывать, когда речь о конкретном курсе и нужны подробности.",
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
  {
    type: "function" as const,
    function: {
      name: "verify_admin_code",
      description: "Проверить кодовое слово администратора. Вызывать, когда назвали слово для доступа к правкам сайта.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { word: { type: "string", description: "Кодовое слово как сказал пользователь" } },
        required: ["word"],
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
  try {
    const y = await yandexChat(messages, tools);
    if (y) return y;
  } catch {
    /* fallback */
  }
  const d = await deepseekChat(messages, tools);
  if (d) return d;
  throw new Error("no-key");
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
      },
  )
  .handler(async ({ data }) => {
    const ip = data.ip || "anon";
    if (limited(ip)) {
      return { ok: false as const, error: "Слишком много сообщений. Позвоните 8 (800) 511-34-01." };
    }
    const trimmed = (data.messages || [])
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
      .slice(-16)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
    if (!trimmed.length && !data.gate) return { ok: false as const, error: "Напишите вопрос." };

    const { tokenOk, makeAdminToken } = await import("./admin-auth");
    const { knowledgeForAgent } = await import("./call-knowledge");
    const { codewordInText, logAdmin } = await import("./admin-settings");
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

    const solo =
      data.with === "oleg"
        ? "\n\nСейчас родитель говорит только с Олегом. Отвечай исключительно строками «Олег:». Ольга молчит. Мужской род."
        : data.with === "olga"
          ? "\n\nСейчас родитель говорит только с Ольгой. Отвечай исключительно строками «Ольга:». Олег молчит. Женский род: согласна, готова, поняла."
          : "";
    const adminHint = admin
      ? `\n\nСобеседник администратор. Страница: ${data.path || "/"}.
Отвечает ТОЛЬКО Ольга, строки «Олег:» запрещены.
Не пиши «режим управления уже открыт», не проси кодовое слово, не напоминай про доступ.
Сразу делай правку инструментами и коротко подтверди, что сохранено. Без вступлений.`
      : "";
    const messages: ChatMsg[] = [{ role: "system", content: SYSTEM + solo + adminHint + knowledgeForAgent() }, ...trimmed];
    try {
      for (let step = 0; step < 4; step++) {
        const tools = admin ? [...TOOLS, ...ADMIN_TOOLS] : TOOLS;
        const json = await complete(messages, tools);
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
            if (call.function.name === "submit_trial") {
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
                kind: args.kind === "group" || args.kind === "consult" ? args.kind : "trial",
              });
              messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: saved.ok
                  ? `Лид в AlfaCRM${"id" in saved && saved.id ? ` id=${saved.id}` : ""}${saved.duplicate ? ", клиент уже был — карточку обновили" : ", новая карточка"}. Скажи: заявку приняли, она уже в системе. Не обещай звонок.`
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
                groups = [
                  { label: "Пробное занятие", send: "Хочу записаться на пробное занятие", primary: true },
                  ...list.map((g) => ({ label: `В группу · ${g.chip}`, href: g.signup })),
                ];
                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: formatGroups(list, age),
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
                open = hit.path;
                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: `Страница открыта: ${hit.name} (${hit.path}). Скажи родителю, что открыли карточку курса, и продолжи коротко по сути.`,
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
        const reply = (msg.content || "").trim();
        if (reply) return { ok: true as const, reply, token: granted, reload, open: open || undefined, signup: signup || undefined, groups: groups.length ? groups : undefined };
      }
      return {
        ok: true as const,
        reply: "Передам администратору. Или сразу звоните 8 (800) 511-34-01.",
        token: granted,
        reload,
        open: open || undefined,
        signup: signup || undefined,
        groups: groups.length ? groups : undefined,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "";
      if (reason === "no-key") {
        return { ok: false as const, error: "Напишите нам в Telegram или позвоните 8 (800) 511-34-01." };
      }
      return { ok: false as const, error: "Сейчас не отвечаю. Позвоните 8 (800) 511-34-01." };
    }
  });
