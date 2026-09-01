import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { serverEnv } from "./server-env";

export type CheckResult = {
  id: string;
  title: string;
  ok: boolean;
  skip?: boolean;
  detail: string;
  plain: string;
  fix: string;
  related: string[];
  raw: string;
  ms: number;
};

export type SectionDef = {
  id: string;
  title: string;
  hint: string;
};

type ProbeOut = { ok: boolean; skip?: boolean; detail: string; plain?: string; fix?: string; related?: string[]; raw?: string };
type Probe = {
  id: string;
  title: string;
  sections: string[];
  related?: string[];
  run: () => Promise<ProbeOut>;
};

const extraSections: SectionDef[] = [];
const extraProbes: Probe[] = [];

export const ADMIN_SECTIONS: SectionDef[] = [
  { id: "cabinet", title: "Весь кабинет", hint: "Все разделы, ключи API и связи между ними. Ничего не пишем." },
  { id: "prices", title: "Цены курсов", hint: "Прайс, формулы КБМ/ТМХ, связь с CRM и ассистентом." },
  { id: "schedule", title: "Расписание занятий", hint: "Снимок, предметы, соответствия, группы, уроки, ученики, поля, календарь, загрузка/выгрузка всех типов, /schedule. В AlfaCRM ничего не пишем." },
  { id: "agent", title: "Ассистент ИИ", hint: "Мозг, документы, каналы, модели. Пробный запрос без сохранения." },
  { id: "agent-window", title: "Окно и кнопки", hint: "Флаги виджета и связь с моделями." },
  { id: "agent-dialog", title: "Как говорит", hint: "Скрипты воронки и стиль." },
  { id: "agent-voices", title: "Голоса", hint: "SpeechKit и ключ Яндекса." },
  { id: "agent-edits", title: "Изменение сайта", hint: "Список правок. Файлы страниц не трогаем." },
  { id: "agent-chats", title: "Диалоги сайта", hint: "Журнал сессий и связь с личными делами." },
  { id: "agent-train", title: "Обучение", hint: "Документы, каналы, примеры." },
  { id: "agent-access", title: "Голосовой доступ", hint: "Кодовое слово и пароль кабинета — без раскрытия." },
  { id: "agent-debug", title: "Отладка", hint: "Флаги режима отладки." },
  { id: "calls", title: "База звонков", hint: "Novofon и стыковка с личными делами." },
  { id: "dossiers", title: "Личные дела", hint: "Файл дел и вход в AlfaCRM." },
  { id: "apis", title: "API и интеграции", hint: "Ключи и живой пинг Yandex, DeepSeek, Novofon, AlfaCRM." },
];

const LINKS: Record<string, string[]> = {
  cabinet: ["*"],
  prices: ["prices", "apis", "schedule", "agent"],
  schedule: ["schedule", "apis", "dossiers", "agent"],
  agent: ["agent", "agent-window", "agent-dialog", "agent-voices", "agent-edits", "agent-chats", "agent-train", "agent-access", "agent-debug", "apis", "prices"],
  "agent-window": ["agent-window", "agent", "apis"],
  "agent-dialog": ["agent-dialog", "agent", "agent-train"],
  "agent-voices": ["agent-voices", "agent", "apis"],
  "agent-edits": ["agent-edits", "agent"],
  "agent-chats": ["agent-chats", "agent", "dossiers"],
  "agent-train": ["agent-train", "agent", "apis"],
  "agent-access": ["agent-access", "agent"],
  "agent-debug": ["agent-debug", "agent"],
  calls: ["calls", "apis", "dossiers"],
  dossiers: ["dossiers", "apis", "calls", "agent-chats"],
  apis: ["apis", "agent", "calls", "schedule", "dossiers", "prices"],
};

export function registerAdminSection(def: SectionDef, probes: Probe[] = []) {
  extraSections.push(def);
  extraProbes.push(...probes);
}

function storage(...parts: string[]) {
  return join(process.cwd(), "storage", ...parts);
}

function titlesOf(ids: string[]) {
  const all = [...ADMIN_SECTIONS, ...extraSections];
  return ids.map((id) => all.find((s) => s.id === id)?.title || id);
}

function fail(detail: string, plain: string, fix: string, related: string[] = [], raw = ""): ProbeOut {
  return { ok: false, detail, plain, fix, related, raw };
}

function ok(detail: string, related: string[] = []): ProbeOut {
  return { ok: true, detail, plain: detail, fix: "", related, raw: "" };
}

function skip(detail: string, related: string[] = []): ProbeOut {
  return { ok: true, skip: true, detail, plain: detail, fix: "", related, raw: "" };
}

function fileOk(name: string, related: string[] = []): ProbeOut {
  const p = storage(name);
  if (!existsSync(p)) return fail(`нет файла ${name}`, `На диске нет ${name}. Раздел не сможет прочитать свои данные.`, `Проверьте папку storage на сервере или сохраните раздел ещё раз — файл должен появиться.`, related);
  try {
    const n = statSync(p).size;
    return ok(`${name}, ${n} байт`, related);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "не читается", `Файл ${name} есть, но сервер его не прочитал.`, `Права на storage и свободное место на диске.`, related, e instanceof Error ? e.stack || e.message : "");
  }
}

function jsonCount(name: string, pick: (raw: unknown) => number, related: string[] = []): ProbeOut {
  const p = storage(name);
  if (!existsSync(p)) return fail(`нет ${name}`, `Нет ${name} — раздел ещё ни разу не сохранял данные.`, `Откройте раздел и нажмите сохранение или загрузку из CRM.`, related);
  try {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    const n = pick(raw);
    return ok(`${n} записей в ${name}`, related);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "json", `Файл ${name} повреждён или это не JSON.`, `Не правьте файл вручную. Скопируйте ошибку в Grok — восстановим из бэкапа или пересоберём.`, related, e instanceof Error ? e.message : "");
  }
}

async function pingYandex(): Promise<ProbeOut> {
  const related = ["apis", "agent", "agent-voices"];
  const key = serverEnv("YANDEX_API_KEY");
  const folder = serverEnv("YANDEX_FOLDER_ID");
  if (!key) return fail("нет YANDEX_API_KEY", "Ключ YandexGPT пустой. Ассистент не сможет отвечать, когда в диалоге есть ФИО или телефон.", "Кабинет → API и интеграции → YandexGPT: вставьте API-ключ из console.yandex.cloud.", related);
  if (!folder) return fail("нет YANDEX_FOLDER_ID", "Ключ Яндекса есть, Folder ID пустой. Без каталога облако отклоняет запрос.", "В той же карточке YandexGPT заполните Folder ID каталога.", related);
  try {
    const res = await fetch("https://ai.api.cloud.yandex.net/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Api-Key ${key}`, "Content-Type": "application/json", "x-folder-id": folder },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        model: `gpt://${folder}/yandexgpt/latest`,
        temperature: 0,
        max_tokens: 1,
        messages: [{ role: "user", content: "пинг" }],
      }),
    });
    const raw = await res.text();
    if (res.ok) return ok("YandexGPT ответил на пробный запрос, ничего не сохраняли", related);
    const plain =
      res.status === 401
        ? "Яндекс не принял ключ (401). Ключ неверный или отозван."
        : res.status === 403
          ? "Яндекс запретил доступ (403). Нет роли на каталог или биллинг."
          : res.status === 429
            ? "Яндекс ограничил частоту (429). Подождите минуту и проверьте баланс."
            : `Яндекс ответил кодом ${res.status}.`;
    return fail(`Yandex ${res.status}`, plain, "Кабинет → API → YandexGPT. Сверьте ключ и Folder ID. Баланс: console.yandex.cloud.", related, raw.slice(0, 1200));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "yandex", "До YandexGPT не достучались (сеть, таймаут 8с или блокировка).", "Сервер должен ходить в llm.api.cloud.yandex.net. Если VPN/firewall — откройте.", related, e instanceof Error ? e.stack || e.message : "");
  }
}

async function pingDeepseek(): Promise<ProbeOut> {
  const related = ["apis", "agent"];
  const key = serverEnv("DEEPSEEK_API_KEY");
  if (!key) return skip("ключ DeepSeek не задан — запасной контур выключен", related);
  try {
    const res = await fetch("https://api.deepseek.com/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    const raw = await res.text();
    if (res.ok) return ok("DeepSeek /models доступен", related);
    return fail(
      `DeepSeek ${res.status}`,
      res.status === 401 ? "DeepSeek не принял ключ (401)." : `DeepSeek ответил ${res.status}.`,
      "Кабинет → API → DeepSeek. Ключ с platform.deepseek.com. Если ключ верный — запасной путь для вопросов без персональных данных.",
      related,
      raw.slice(0, 1200),
    );
  } catch (e) {
    return fail(e instanceof Error ? e.message : "deepseek", "DeepSeek не ответил за 8 секунд.", "Проверьте сеть сервера до api.deepseek.com.", related, e instanceof Error ? e.stack || e.message : "");
  }
}

async function pingNovofon(): Promise<ProbeOut> {
  const related = ["apis", "calls"];
  const { loadNovofonKeys, novofonGet, NovofonNetError } = await import("./novofon");
  const keys = loadNovofonKeys();
  if (!keys?.userKey || !keys.secret) return fail("нет NOVOFON_USER_KEY / SECRET", "Ключей Novofon нет. База звонков и голосовой код входа не заработают.", "Кабинет → API → Novofon: User key (appid_…) и Secret из кабинета АТС. При перевыпуске ключа нужны оба, не только секрет.", related);
  try {
    const json = await novofonGet<{ status?: string; balance?: number }>("/v1/info/balance/", {}, keys);
    return ok(`Novofon balance ок${json.balance != null ? `, ${json.balance}` : ""}`, related);
  } catch (e1) {
    if (e1 instanceof NovofonNetError || /SSL|timeout|fetch failed|handshake/i.test(e1 instanceof Error ? e1.message : "")) {
      const raw = e1 instanceof Error ? `${e1.message}\n${"causeText" in e1 ? (e1 as { causeText?: string }).causeText : ""}` : String(e1);
      return fail(
        "api.novofon.com SSL timeout",
        "С сервера сайта (83.222.25.109) Novofon API не открывает HTTPS: TCP есть, рукопожатие SSL не завершается. Так бывает после многочасовой выгрузки записей — режут IP, а не ключ. Новый Secret уже в кабинете; без ответа хоста он не проверится. Если ключ перевыпускали, нужен и новый User key (appid_…).",
        "1) Novofon → поддержка: разблокируйте API для IP 83.222.25.109. 2) Кабинет Novofon → API: пришлите пару User key + Secret. 3) Не гоняйте выгрузку пачками больше 3 запросов статистики в минуту.",
        related,
        raw.slice(0, 1200),
      );
    }
    try {
      await novofonGet("/v1/tariff/", {}, keys);
      return ok("Novofon /v1/tariff отвечает (balance закрыт в тарифе)", related);
    } catch (e2) {
      const raw = e2 instanceof Error ? e2.message : String(e1);
      const unauthorized = /not authorized|401/i.test(raw);
      return fail(
        raw.slice(0, 200),
        unauthorized
          ? "Novofon ответил «Not authorized». Секрет не совпадает с User key. Если ключ перевыпускали — старый appid_ больше не действует, нужна новая пара целиком."
          : "Novofon отклонил запрос.",
        "Кабинет Novofon → Настройки → API: скопируйте User key (appid_…) и Secret заново, сохраните оба в API сайта.",
        related,
        raw,
      );
    }
  }
}

async function pingAlfa(): Promise<ProbeOut> {
  const related = ["apis", "schedule", "dossiers", "agent", "prices"];
  try {
    const { token, request } = await import("./alfacrm");
    const tok = await token();
    const json = await request<{ items?: unknown[]; count?: number; totalCount?: number }>("/v2api/group/index", { page: 0 }, tok);
    const n = Array.isArray(json.items) ? json.items.length : json.count ?? json.totalCount ?? 0;
    return ok(`AlfaCRM вошли, group/index отдал ${n} (ничего не писали)`, related);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const plain = /no-alfacrm/.test(raw)
      ? "Нет почты или ключа AlfaCRM. Расписание, личные дела и запись из чата не подтянутся."
      : /401|403|token/.test(raw)
        ? "AlfaCRM не выдала токен. Почта роли API или ключ v2api неверны."
        : `Не удалось спросить группы в AlfaCRM: ${raw.slice(0, 180)}`;
    return fail(raw.slice(0, 220), plain, "Кабинет → API → AlfaCRM: хост s20.online, почта роли, ключ v2api, X-APP-KEY. Роль должна видеть группы.", related, e instanceof Error ? e.stack || e.message : raw);
  }
}

const PROBES: Probe[] = [
  {
    id: "storage",
    title: "Диск storage",
    sections: ["*"],
    run: async () => {
      const dir = storage();
      if (!existsSync(dir)) return fail("нет папки storage", "Нет каталога storage на сервере. Кабинет некуда писать цены, мозг, звонки.", "Создайте /var/www/rastudio/storage и отдайте права процессу сайта.", ["cabinet"]);
      return ok(`каталог на месте, ${readdirSync(dir).length} файлов/папок`);
    },
  },
  {
    id: "prices-file",
    title: "Файл цен",
    sections: ["prices", "*"],
    run: async () => jsonCount("prices.json", (raw) => (Array.isArray(raw) ? raw.length : Array.isArray((raw as { rows?: unknown[] }).rows) ? (raw as { rows: unknown[] }).rows.length : 0), ["prices", "agent"]),
  },
  {
    id: "prices-formulas",
    title: "Формулы КБМ/ТМХ",
    sections: ["prices"],
    run: async () => {
      const { loadFormulas } = await import("./price-formulas");
      const f = loadFormulas();
      return ok(`КБМ ${f.kbm.mode} ${f.kbm.value}, ТМХ ${f.tmx.mode} ${f.tmx.value}`, ["prices"]);
    },
  },
  {
    id: "schedule-file",
    title: "Снимок расписания",
    sections: ["schedule", "*"],
    run: async () => {
      const { crmScheduleMeta } = await import("./alfacrm-schedule");
      const m = crmScheduleMeta();
      if (!m.count) return fail("снимок пуст", "На сайте нет слотов расписания. Ассистент не назовёт живые группы, страница /schedule пустая.", "Раздел «Расписание занятий» → Загрузить из AlfaCRM.", ["schedule", "agent"]);
      return ok(`${m.count} слотов, обновлено ${m.at || "—"}`, ["schedule", "agent"]);
    },
  },
  {
    id: "schedule-subjects",
    title: "Справочник предметов",
    sections: ["schedule"],
    run: async () => {
      const { loadSubjects } = await import("./crm-subjects");
      const list = loadSubjects();
      if (!list.length) return fail("нет предметов", "Вкладка «Предметы» пустая. Нельзя привязать группу и выгрузить урок в CRM.", "Расписание → Предметы → Загрузить из AlfaCRM.", ["schedule"]);
      return ok(`${list.length} предметов (id ${list.slice(0, 3).map((s) => s.id).join(", ")}…)`, ["schedule"]);
    },
  },
  {
    id: "schedule-map",
    title: "Соответствия школ и курсов",
    sections: ["schedule"],
    run: async () => {
      const { loadScheduleMap } = await import("./schedule-map");
      const map = loadScheduleMap();
      const unbound = (map.courses || []).filter((c) => !c.siteHref).length;
      if (!map.courses.length) return fail("нет соответствий", "Вкладка «Соответствия» пустая. Группы не разложатся по школам сайта.", "Расписание → Соответствия → сохранить.", ["schedule"]);
      return ok(`школ ${map.schools.length}, предметов ${map.courses.length}, без страницы курса ${unbound}`, ["schedule"]);
    },
  },
  {
    id: "schedule-fields",
    title: "Поля карточки группы на сайте",
    sections: ["schedule"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const slots = listAdminSlots();
      if (!slots.length) return fail("нет групп", "Снимок расписания пуст — проверять поля нечего.", "Загрузить из AlfaCRM.", ["schedule"]);
      const withGid = slots.filter((s) => s.groupId).length;
      const withSub = slots.filter((s) => s.subjectId).length;
      const withHash = slots.filter((s) => s.hashtags).length;
      const withDesc = slots.filter((s) => s.description || s.groupNote).length;
      const withDates = slots.filter((s) => s.bDate || s.eDate).length;
      const withStatus = slots.filter((s) => s.statusId).length;
      const withTime = slots.filter((s) => s.timeFrom).length;
      return ok(
        `gid ${withGid}/${slots.length}, предмет ${withSub}, хэштеги ${withHash}, описание ${withDesc}, период ${withDates}, статус ${withStatus}, время ${withTime}`,
        ["schedule"],
      );
    },
  },
  {
    id: "schedule-crm-group",
    title: "Карточка группы: сайт ↔ AlfaCRM",
    sections: ["schedule"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const slots = listAdminSlots().filter((s) => s.groupId && s.branchId);
      if (!slots.length) return fail("нет gid", "На сайте нет групп с номером CRM. Подробности и запись не откроются.", "Загрузить из AlfaCRM.", ["schedule", "apis"]);
      const s = slots[0];
      try {
        const { token, request } = await import("./alfacrm");
        const t = await token();
        const json = await request<{ items?: Record<string, unknown>[] }>(`/v2api/${s.branchId}/group/index`, { page: 0, pageSize: 100 }, t);
        const g = (json.items || []).find((x) => Number(x.id) === s.groupId);
        if (!g) return fail(`gid ${s.groupId} нет в CRM`, `Группа ${s.groupName} (gid ${s.groupId}) есть на сайте, в AlfaCRM филиала ${s.branchId} её нет. Подробности не подгрузятся.`, "Загрузить из AlfaCRM ещё раз. Если группу удалили в CRM — удалите её и на сайте.", ["schedule", "apis"], JSON.stringify({ gid: s.groupId, branch: s.branchId }).slice(0, 400));
        const miss: string[] = [];
        if (String(g.name || "") && String(g.name) !== s.groupName) miss.push(`имя CRM «${g.name}» / сайт «${s.groupName}»`);
        const fields = ["note", "status_id", "b_date", "e_date", "level_id", "custom_hashtagkursa", "custom_workingout", "limit"];
        const present = fields.filter((k) => g[k] != null && g[k] !== "");
        return ok(
          `gid ${s.groupId} найдена. Поля CRM: ${present.join(", ") || "пустые"}.${miss.length ? ` Расхождение: ${miss.join("; ")}` : " Имя совпадает."} Чтение, без записи.`,
          ["schedule", "apis"],
        );
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        return fail(raw.slice(0, 200), "Не удалось прочитать карточку группы в AlfaCRM. Панель «Подробно» не заполнится.", "API → AlfaCRM: ключ и роль с правом group/index.", ["schedule", "apis"], raw);
      }
    },
  },
  {
    id: "schedule-lessons",
    title: "Регулярные уроки AlfaCRM",
    sections: ["schedule"],
    run: async () => {
      try {
        const { token, request } = await import("./alfacrm");
        const t = await token();
        const json = await request<{ items?: unknown[]; total?: number }>(`/v2api/2/regular-lesson/index`, { page: 0, pageSize: 20 }, t);
        const n = Array.isArray(json.items) ? json.items.length : 0;
        if (!n) return fail("нет уроков", "regular-lesson/index филиала ЦМИТ пустой. Время занятий на сайте не из чего брать.", "Проверьте регулярное расписание групп в AlfaCRM.", ["schedule", "apis"]);
        return ok(`уроков на странице ${n}, всего ${json.total ?? "—"}. Чтение, без записи.`, ["schedule", "apis"]);
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        return fail(raw.slice(0, 200), "Не прочитались регулярные уроки. День и время в расписании не обновятся.", "Роль API должна видеть regular-lesson/index.", ["schedule", "apis"], raw);
      }
    },
  },
  {
    id: "schedule-students",
    title: "Кто учится (ученики группы)",
    sections: ["schedule", "dossiers"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const s = listAdminSlots().find((x) => x.groupId && x.taken);
      if (!s) return skip("нет группы с учениками в снимке — проверку учеников пропускаем", ["schedule", "dossiers"]);
      try {
        const { token, request } = await import("./alfacrm");
        const t = await token();
        const json = await request<{ items?: { name?: string }[] }>(`/v2api/${s.branchId}/customer/index`, { page: 0, pageSize: 20, group_id: s.groupId, is_study: 1 }, t);
        const n = (json.items || []).length;
        return ok(`gid ${s.groupId}: в CRM ${n} учеников (подсказка «Кто учится»). Чтение, без записи.`, ["schedule", "dossiers", "apis"]);
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        return fail(raw.slice(0, 200), "customer/index по группе не ответил. Кнопка «Кто учится» останется пустой.", "Роль API: клиенты / список.", ["schedule", "dossiers", "apis"], raw);
      }
    },
  },
  {
    id: "schedule-public",
    title: "Публичное расписание /schedule",
    sections: ["schedule"],
    run: async () => {
      const { listAdminSlots, sessionsFromSlots } = await import("./alfacrm-schedule");
      const slots = listAdminSlots();
      const sessions = sessionsFromSlots(slots);
      if (!slots.length) return fail("нет слотов", "Кабинет пуст, посетитель /schedule ничего не увидит.", "Загрузить из AlfaCRM.", ["schedule"]);
      if (!sessions.length) return fail("публичных сессий 0", `В кабинете ${slots.length} групп, на сайт не попала ни одна (нет времени или школа «Прочее»).`, "Проверьте время у групп и соответствия школ.", ["schedule"]);
      return ok(`кабинет ${slots.length} групп → сайт ${sessions.length} занятий с временем`, ["schedule", "agent"]);
    },
  },
  {
    id: "schedule-signup",
    title: "Ссылки записи gid",
    sections: ["schedule"],
    run: async () => {
      const { listAdminSlots } = await import("./alfacrm-schedule");
      const slots = listAdminSlots().filter((s) => s.groupId);
      const bad = slots.filter((s) => !/lead\/create\?gid=/.test(s.signup || "")).length;
      if (!slots.length) return fail("нет gid", "Нет ссылок записи в группу.", "Загрузить из AlfaCRM.", ["schedule"]);
      if (bad) return fail(`${bad} без ссылки`, `${bad} групп с номером, но без формы lead/create?gid=. Кнопка записи на сайте сломается.`, "Выгрузить отмеченные группы в AlfaCRM или загрузить заново.", ["schedule"]);
      return ok(`${slots.length} ссылок записи вида lead/create?gid=`, ["schedule", "agent"]);
    },
  },
  {
    id: "schedule-versions",
    title: "История версий расписания",
    sections: ["schedule"],
    run: async () => {
      const { loadVersions } = await import("./crm-slots");
      const v = loadVersions();
      if (!v.length) return skip("снимков отката ещё нет — после первой загрузки появятся", ["schedule"]);
      return ok(`версий ${v.length}, последняя: ${v[0]?.reason || "—"}`, ["schedule"]);
    },
  },
  {
    id: "schedule-io",
    title: "Загрузка и выгрузка всех типов расписания",
    sections: ["schedule"],
    run: async () => {
      const related = ["schedule", "apis"];
      const got: string[] = [];
      const bad: string[] = [];
      try {
        const { token, request } = await import("./alfacrm");
        const t = await token();
        async function ping(name: string, path: string, body: Record<string, unknown> = { page: 0, pageSize: 5 }) {
          try {
            const json = await request<{ items?: unknown[]; total?: number }>(path, body, t);
            const n = Array.isArray(json.items) ? json.items.length : json.total ?? 0;
            got.push(`${name} ${n}`);
          } catch (e) {
            bad.push(`${name}: ${e instanceof Error ? e.message.slice(0, 90) : String(e)}`);
          }
        }
        for (const b of [1, 2, 3]) {
          await ping(`группы ф${b}`, `/v2api/${b}/group/index`);
          await ping(`регулярные ф${b}`, `/v2api/${b}/regular-lesson/index`);
        }
        await ping("предметы", "/v2api/2/subject/index");
        await ping("педагоги", "/v2api/2/teacher/index");
        await ping("аудитории", "/v2api/2/room/index");
        await ping("уровни", "/v2api/2/level/index");
        await ping("клиенты", "/v2api/2/customer/index");
        await ping("занятия", "/v2api/2/lesson/index");
        const { listAdminSlots } = await import("./alfacrm-schedule");
        const { loadSubjects } = await import("./crm-subjects");
        const { loadScheduleMap } = await import("./schedule-map");
        const { loadVersions, slotsToCsv, parseSlotsCsv } = await import("./crm-slots");
        const { slotMismatch } = await import("./slot-mismatch");
        const slots = listAdminSlots();
        got.push(`сайт ${slots.length}`);
        got.push(`предметы сайта ${loadSubjects().length}`);
        got.push(`соответствия ${loadScheduleMap().courses.length}`);
        got.push(`версии ${loadVersions().length}`);
        const csv = slotsToCsv(slots);
        const back = parseSlotsCsv(csv, slots);
        if (!csv || back.length < Math.min(1, slots.length)) bad.push("CSV туда-обратно пустой");
        else got.push(`CSV ${csv.split("\n").length - 1} строк`);
        const mm = slots.filter((s) => slotMismatch(s).level).length;
        got.push(`несоответствий ${mm}`);
        const withCal = slots.filter((s) => s.day && s.timeFrom).length;
        got.push(`с днём/временем ${withCal}`);
        const { existsSync, accessSync, constants } = await import("node:fs");
        const { join } = await import("node:path");
        const file = join(process.cwd(), "storage", "crm-schedule.json");
        if (!existsSync(file)) bad.push("нет storage/crm-schedule.json");
        else {
          try {
            accessSync(file, constants.R_OK | constants.W_OK);
            got.push("снимок читается и пишется");
          } catch {
            bad.push("снимок нельзя записать");
          }
        }
        const text = `чтение CRM: ${got.join(", ")}. Выгрузка в AlfaCRM не выполнялась — только проверка, что данные читаются и локальный CSV/снимок живые.`;
        if (bad.length) {
          return fail(
            bad.join("; ").slice(0, 220),
            `Часть типов не загрузилась: ${bad.join("; ")}. ${text}`,
            "Проверьте права роли API: группы, уроки, предметы, педагоги, аудитории, клиенты, уровни. Снимок storage/crm-schedule.json должен быть доступен на запись.",
            related,
            JSON.stringify({ got, bad }).slice(0, 800),
          );
        }
        return ok(text, related);
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        return fail(raw.slice(0, 200), "Не собралась проверка загрузки типов расписания.", "API AlfaCRM и файл storage/crm-schedule.json.", related, raw);
      }
    },
  },
  { id: "crm-live", title: "AlfaCRM живой", sections: ["schedule", "dossiers", "apis", "agent", "prices"], run: pingAlfa },
  {
    id: "brain",
    title: "Мозг ассистента",
    sections: ["agent", "agent-window", "agent-dialog", "agent-train"],
    run: async () => {
      const { loadBrain } = await import("./agent-config");
      const b = loadBrain();
      return ok(`скриптов ${b.scripts.length}, примеров ${b.examples.length}, чат ${b.settings.showChat ? "вкл" : "выкл"}`, ["agent"]);
    },
  },
  {
    id: "docs",
    title: "Документы обучения",
    sections: ["agent", "agent-train"],
    run: async () => jsonCount("agent-docs.json", (raw) => (Array.isArray((raw as { docs?: unknown[] }).docs) ? (raw as { docs: unknown[] }).docs.length : 0), ["agent-train"]),
  },
  {
    id: "channels",
    title: "Каналы коммуникации",
    sections: ["agent", "agent-train"],
    run: async () => {
      const { loadChannels } = await import("./agent-channels");
      const list = loadChannels();
      if (list.length < 4) return fail("мало каналов", `Каналов ${list.length}, нужны site, phone, vk, max и «общее». Преобразование документов сломается.`, "Обучение → Документы → каналы. Не удаляйте «Общее».", ["agent-train"]);
      return ok(list.map((c) => c.id).join(", "), ["agent-train"]);
    },
  },
  {
    id: "voices",
    title: "Настройки голосов",
    sections: ["agent", "agent-voices"],
    run: async () => {
      const { loadVoiceSettings } = await import("./voice-settings");
      const v = loadVoiceSettings();
      return ok(`Олег ${v.oleg}, Ольга ${v.olga}, скорость ${v.speed}`, ["agent-voices", "apis"]);
    },
  },
  { id: "yandex", title: "YandexGPT", sections: ["apis", "agent", "agent-voices"], run: pingYandex },
  { id: "deepseek", title: "DeepSeek", sections: ["apis", "agent"], run: pingDeepseek },
  { id: "novofon", title: "Novofon", sections: ["calls", "apis"], run: pingNovofon },
  {
    id: "calls-index",
    title: "Индекс звонков",
    sections: ["calls"],
    run: async () => {
      const { loadCallStore } = await import("./call-knowledge");
      const s = loadCallStore();
      const n = Array.isArray((s as { calls?: unknown[] }).calls) ? (s as { calls: unknown[] }).calls.length : 0;
      return ok(`в базе ${n} звонков, знаний ${s.knowledge ? "есть" : "ещё нет"}`, ["calls", "dossiers"]);
    },
  },
  {
    id: "dossiers-file",
    title: "Личные дела на диске",
    sections: ["dossiers"],
    run: async () =>
      jsonCount(
        "dossiers.json",
        (raw) => {
          if (Array.isArray(raw)) return raw.length;
          const d = raw as { items?: unknown[]; dossiers?: unknown[] };
          return (d.items || d.dossiers || []).length;
        },
        ["dossiers", "calls"],
      ),
  },
  {
    id: "chats",
    title: "Журнал чатов",
    sections: ["agent-chats", "agent"],
    run: async () =>
      jsonCount(
        "chat-logs.json",
        (raw) => {
          const d = raw as { sessions?: unknown[] };
          return Array.isArray(d.sessions) ? d.sessions.length : Array.isArray(raw) ? (raw as unknown[]).length : 0;
        },
        ["agent-chats"],
      ),
  },
  {
    id: "edits",
    title: "Правки сайта",
    sections: ["agent-edits"],
    run: async () => {
      const p = storage("site-edits.json");
      if (!existsSync(p)) return skip("правок ещё не было — это нормально", ["agent-edits"]);
      return fileOk("site-edits.json", ["agent-edits"]);
    },
  },
  {
    id: "access",
    title: "Доступ кабинета",
    sections: ["agent-access", "agent"],
    run: async () => {
      const p = storage("admin.json");
      if (!existsSync(p)) return skip("admin.json ещё нет — используются значения по умолчанию", ["agent-access"]);
      const raw = JSON.parse(readFileSync(p, "utf8")) as { passwordHash?: string; phraseHash?: string };
      if (!raw.passwordHash) return fail("нет пароля", "В admin.json нет хеша пароля. Вход в кабинет может сброситься к заводскому.", "Голосовой доступ → сохраните новый пароль кабинета.", ["agent-access"]);
      return ok(`пароль кабинета задан, кодовое слово ${raw.phraseHash ? "задано" : "не задано"}`, ["agent-access"]);
    },
  },
  {
    id: "debug",
    title: "Режим отладки",
    sections: ["agent-debug"],
    run: async () => {
      const p = storage("debug-mode.json");
      if (!existsSync(p)) return skip("настроек отладки ещё нет", ["agent-debug"]);
      return fileOk("debug-mode.json", ["agent-debug"]);
    },
  },
  {
    id: "api-keys",
    title: "Слот ключей API",
    sections: ["apis", "*"],
    run: async () => {
      const { loadApiConns } = await import("./api-keys");
      const list = loadApiConns();
      const on = list.filter((c) => c.enabled);
      const filled = on.filter((c) => c.fields.some((f) => f.value) || ["yandex", "deepseek", "novofon", "alfacrm"].includes(c.id));
      const names = on.map((c) => `${c.name}${c.enabled ? "" : " выкл"}`).join(", ");
      if (!on.length) return fail("нет включённых API", "Все карточки API выключены. Ассистент, CRM и звонки останутся без ключей.", "API и интеграции: включите Yandex, AlfaCRM, Novofon.", ["apis"]);
      return ok(`включено ${on.length}: ${names}`, ["apis", "agent", "calls", "dossiers"]);
    },
  },
];

function allSections() {
  const map = new Map<string, SectionDef>();
  for (const s of [...ADMIN_SECTIONS, ...extraSections]) map.set(s.id, s);
  return [...map.values()];
}

function probesFor(section: string) {
  const bag = [...PROBES, ...extraProbes];
  if (section === "cabinet" || section === "*") {
    const seen = new Set<string>();
    return bag.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }
  const tags = new Set(LINKS[section] || [section, "*"]);
  tags.add("*");
  tags.add(section);
  const seen = new Set<string>();
  return bag.filter((p) => {
    if (seen.has(p.id)) return false;
    const hit = p.sections.some((s) => tags.has(s) || s === "*");
    if (hit) seen.add(p.id);
    return hit;
  });
}

async function runOne(p: Probe): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    const r = await p.run();
    return {
      id: p.id,
      title: p.title,
      ok: r.ok,
      skip: r.skip,
      detail: r.detail,
      plain: r.plain || r.detail,
      fix: r.fix || "",
      related: titlesOf(r.related || p.sections.filter((s) => s !== "*")),
      raw: r.raw || "",
      ms: Date.now() - t0,
    };
  } catch (e) {
    const raw = e instanceof Error ? e.stack || e.message : String(e);
    return {
      id: p.id,
      title: p.title,
      ok: false,
      detail: e instanceof Error ? e.message.slice(0, 220) : "ошибка",
      plain: `Проверка «${p.title}» упала исключением. Это баг кода, не настройка кабинета.`,
      fix: "Скопируйте весь отчёт кнопкой ниже и вставьте в Grok — по стеку видно файл и строку.",
      related: titlesOf(p.sections.filter((s) => s !== "*")),
      raw,
      ms: Date.now() - t0,
    };
  }
}

export function formatGrokReport(opts: { title: string; section: string; pass: number; fail: number; checks: CheckResult[] }) {
  const lines = [
    `ОТЧЁТ ПРОВЕРКИ rastudio.org/admin`,
    `Раздел: ${opts.title} (${opts.section})`,
    `Итог: ок ${opts.pass}, сбоев ${opts.fail}, проверок ${opts.checks.length}`,
    `Время: ${new Date().toISOString()}`,
    `Ничего не записывали в CRM и на сайт.`,
    ``,
  ];
  for (const c of opts.checks) {
    const mark = c.ok ? (c.skip ? "ПРОПУСК" : "ОК") : "СБОЙ";
    lines.push(`[${mark}] ${c.title} · id=${c.id} · ${c.ms}мс`);
    lines.push(`что: ${c.plain || c.detail}`);
    if (!c.ok && c.fix) lines.push(`как чинить: ${c.fix}`);
    if (c.related.length) lines.push(`связано: ${c.related.join(", ")}`);
    if (c.raw) lines.push(`сырой ответ:\n${c.raw}`);
    lines.push("");
  }
  lines.push("Задача для Grok: разбери каждый СБОЙ, укажи файл и правку. Сайт rastudio.org, кабинет администратора, стек TanStack Start.");
  return lines.join("\n");
}

export const adminSelfTest = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; section?: string })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const section = String(data.section || "cabinet").slice(0, 60);
    const meta = allSections().find((s) => s.id === section);
    const list = probesFor(section);
    const checks: CheckResult[] = [];
    for (const p of list) checks.push(await runOne(p));
    const failN = checks.filter((c) => !c.ok && !c.skip).length;
    const pass = checks.filter((c) => c.ok).length;
    const title = meta?.title || `Раздел «${section}»`;
    const grok = formatGrokReport({ title, section, pass, fail: failN, checks });
    return {
      ok: true as const,
      section,
      title,
      hint: meta?.hint || "Раздел ещё не в каталоге — прогнали общий контур и связанные API.",
      dry: true,
      pass,
      fail: failN,
      checks,
      grok,
      future: !meta,
    };
  });
