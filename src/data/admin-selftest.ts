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
  ms: number;
};

export type SectionDef = {
  id: string;
  title: string;
  hint: string;
};

type Probe = {
  id: string;
  title: string;
  /** id раздела или `*` — общий контур для ещё не созданных разделов */
  sections: string[];
  run: () => Promise<{ ok: boolean; skip?: boolean; detail: string }>;
};

const extraSections: SectionDef[] = [];
const extraProbes: Probe[] = [];

export const ADMIN_SECTIONS: SectionDef[] = [
  { id: "prices", title: "Цены курсов", hint: "Прайс на диске, формулы КБМ/ТМХ. CRM абонементы только читаем." },
  { id: "schedule", title: "Расписание CRM", hint: "Снимок на сайте и живой group/index. Ничего не пишем в AlfaCRM." },
  { id: "agent", title: "Ассистент ИИ", hint: "Мозг, документы, каналы, модели. Пробный запрос в ИИ без сохранения." },
  { id: "agent-window", title: "Окно и кнопки", hint: "Флаги виджета из настроек мозга." },
  { id: "agent-dialog", title: "Как говорит", hint: "Скрипты воронки и стиль." },
  { id: "agent-voices", title: "Голоса", hint: "Настройки SpeechKit, без генерации ролика на сайт." },
  { id: "agent-edits", title: "Изменение сайта", hint: "Список правок. Файлы страниц не трогаем." },
  { id: "agent-chats", title: "Диалоги сайта", hint: "Журнал сессий, только чтение." },
  { id: "agent-train", title: "Обучение", hint: "Документы, каналы, примеры." },
  { id: "agent-access", title: "Голосовой доступ", hint: "Есть ли кодовое слово и пароль кабинета — без раскрытия." },
  { id: "agent-debug", title: "Отладка", hint: "Флаги режима отладки." },
  { id: "calls", title: "База звонков", hint: "Novofon balance/info и индекс записей. Файлы не качаем." },
  { id: "dossiers", title: "Личные дела", hint: "Файл дел и вход в AlfaCRM." },
  { id: "apis", title: "API и интеграции", hint: "Ключи на месте и короткий пинг сервисов." },
];

/** Для будущих разделов: вызовите из их модуля, кнопка подхватит проверки. */
export function registerAdminSection(def: SectionDef, probes: Probe[] = []) {
  extraSections.push(def);
  extraProbes.push(...probes);
}

function storage(...parts: string[]) {
  return join(process.cwd(), "storage", ...parts);
}

function fileOk(name: string) {
  const p = storage(name);
  if (!existsSync(p)) return { ok: false as const, detail: `нет файла ${name}` };
  try {
    const n = statSync(p).size;
    return { ok: true as const, detail: `${name}, ${n} байт` };
  } catch (e) {
    return { ok: false as const, detail: e instanceof Error ? e.message : "не читается" };
  }
}

function jsonCount(name: string, pick: (raw: unknown) => number) {
  const p = storage(name);
  if (!existsSync(p)) return { ok: false as const, detail: `нет ${name}` };
  try {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    const n = pick(raw);
    return { ok: true as const, detail: `${n} записей в ${name}` };
  } catch (e) {
    return { ok: false as const, detail: e instanceof Error ? e.message : "json" };
  }
}

async function pingYandex() {
  const key = serverEnv("YANDEX_API_KEY");
  const folder = serverEnv("YANDEX_FOLDER_ID");
  if (!key || !folder) return { ok: false, detail: "нет YANDEX_API_KEY или Folder ID" };
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
  if (res.ok) return { ok: true, detail: "YandexGPT ответил на пробный запрос, ничего не сохраняли" };
  return { ok: false, detail: `Yandex ${res.status} ${(await res.text()).slice(0, 140)}` };
}

async function pingDeepseek() {
  const key = serverEnv("DEEPSEEK_API_KEY");
  if (!key) return { ok: false, skip: true, detail: "ключ DeepSeek не задан — запасной контур выключен" };
  const res = await fetch("https://api.deepseek.com/models", {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(8000),
  });
  if (res.ok) return { ok: true, detail: "DeepSeek /models доступен" };
  return { ok: false, detail: `DeepSeek ${res.status} ${(await res.text()).slice(0, 140)}` };
}

async function pingNovofon() {
  const { loadNovofonKeys, novofonGet } = await import("./novofon");
  const keys = loadNovofonKeys();
  if (!keys?.userKey || !keys.secret) return { ok: false, detail: "нет NOVOFON_USER_KEY / SECRET" };
  try {
    const json = await novofonGet<{ status?: string; balance?: number; data?: unknown }>("/v1/balance", {}, keys);
    return { ok: true, detail: `Novofon balance ок${json.balance != null ? `, ${json.balance}` : ""}` };
  } catch (e1) {
    try {
      await novofonGet("/v1/info", {}, keys);
      return { ok: true, detail: "Novofon /v1/info отвечает" };
    } catch (e2) {
      return { ok: false, detail: e2 instanceof Error ? e2.message.slice(0, 160) : String(e1).slice(0, 160) };
    }
  }
}

async function pingAlfa() {
  const { token, request } = await import("./alfacrm");
  const tok = await token();
  const json = await request<{ items?: unknown[]; count?: number; totalCount?: number }>("/v2api/group/index", { page: 0 }, tok);
  const n = Array.isArray(json.items) ? json.items.length : json.count ?? json.totalCount ?? 0;
  return { ok: true, detail: `AlfaCRM вошли, group/index отдал ${n} (ничего не писали)` };
}

const PROBES: Probe[] = [
  {
    id: "storage",
    title: "Диск storage",
    sections: ["*"],
    run: async () => {
      const dir = storage();
      if (!existsSync(dir)) return { ok: false, detail: "нет папки storage" };
      const n = readdirSync(dir).length;
      return { ok: true, detail: `каталог на месте, ${n} файлов/папок` };
    },
  },
  {
    id: "prices-file",
    title: "Файл цен",
    sections: ["prices", "*"],
    run: async () => jsonCount("prices.json", (raw) => (Array.isArray(raw) ? raw.length : Array.isArray((raw as { rows?: unknown[] }).rows) ? (raw as { rows: unknown[] }).rows.length : 0)),
  },
  {
    id: "prices-formulas",
    title: "Формулы КБМ/ТМХ",
    sections: ["prices"],
    run: async () => {
      const { loadFormulas } = await import("./price-formulas");
      const f = loadFormulas();
      return { ok: true, detail: `КБМ ${f.kbm.mode} ${f.kbm.value}, ТМХ ${f.tmx.mode} ${f.tmx.value}` };
    },
  },
  {
    id: "schedule-file",
    title: "Снимок расписания",
    sections: ["schedule", "*"],
    run: async () => {
      const { crmScheduleMeta } = await import("./alfacrm-schedule");
      const m = crmScheduleMeta();
      return m.count ? { ok: true, detail: `${m.count} слотов, обновлено ${m.at || "—"}` } : { ok: false, detail: "снимок пуст — загрузите из CRM" };
    },
  },
  {
    id: "crm-live",
    title: "AlfaCRM живой",
    sections: ["schedule", "dossiers", "apis", "agent"],
    run: pingAlfa,
  },
  {
    id: "brain",
    title: "Мозг ассистента",
    sections: ["agent", "agent-window", "agent-dialog", "agent-train"],
    run: async () => {
      const { loadBrain } = await import("./agent-config");
      const b = loadBrain();
      return {
        ok: true,
        detail: `скриптов ${b.scripts.length}, примеров ${b.examples.length}, чат ${b.settings.showChat ? "вкл" : "выкл"}`,
      };
    },
  },
  {
    id: "docs",
    title: "Документы обучения",
    sections: ["agent", "agent-train"],
    run: async () => jsonCount("agent-docs.json", (raw) => (Array.isArray((raw as { docs?: unknown[] }).docs) ? (raw as { docs: unknown[] }).docs.length : 0)),
  },
  {
    id: "channels",
    title: "Каналы коммуникации",
    sections: ["agent", "agent-train"],
    run: async () => {
      const { loadChannels } = await import("./agent-channels");
      const list = loadChannels();
      return { ok: list.length >= 4, detail: list.map((c) => c.id).join(", ") || "каналов нет" };
    },
  },
  {
    id: "voices",
    title: "Настройки голосов",
    sections: ["agent", "agent-voices"],
    run: async () => {
      const { loadVoiceSettings } = await import("./voice-settings");
      const v = loadVoiceSettings();
      return { ok: true, detail: `Олег ${v.oleg}, Ольга ${v.olga}, скорость ${v.speed}` };
    },
  },
  {
    id: "yandex",
    title: "YandexGPT",
    sections: ["apis", "agent", "agent-voices"],
    run: pingYandex,
  },
  {
    id: "deepseek",
    title: "DeepSeek",
    sections: ["apis", "agent"],
    run: pingDeepseek,
  },
  {
    id: "novofon",
    title: "Novofon",
    sections: ["calls", "apis"],
    run: pingNovofon,
  },
  {
    id: "calls-index",
    title: "Индекс звонков",
    sections: ["calls"],
    run: async () => {
      const { loadCallStore } = await import("./call-knowledge");
      const s = loadCallStore();
      const n = Array.isArray((s as { calls?: unknown[] }).calls) ? (s as { calls: unknown[] }).calls.length : 0;
      return { ok: true, detail: `в базе ${n} звонков, знаний ${s.knowledge ? "есть" : "ещё нет"}` };
    },
  },
  {
    id: "dossiers-file",
    title: "Личные дела на диске",
    sections: ["dossiers"],
    run: async () => jsonCount("dossiers.json", (raw) => {
      if (Array.isArray(raw)) return raw.length;
      const d = raw as { items?: unknown[]; dossiers?: unknown[] };
      return (d.items || d.dossiers || []).length;
    }),
  },
  {
    id: "chats",
    title: "Журнал чатов",
    sections: ["agent-chats", "agent"],
    run: async () => jsonCount("chat-logs.json", (raw) => {
      const d = raw as { sessions?: unknown[] };
      return Array.isArray(d.sessions) ? d.sessions.length : Array.isArray(raw) ? (raw as unknown[]).length : 0;
    }),
  },
  {
    id: "edits",
    title: "Правки сайта",
    sections: ["agent-edits"],
    run: async () => {
      const p = storage("site-edits.json");
      if (!existsSync(p)) return { ok: true, skip: true, detail: "правок ещё не было — это нормально" };
      return fileOk("site-edits.json");
    },
  },
  {
    id: "access",
    title: "Доступ кабинета",
    sections: ["agent-access", "agent"],
    run: async () => {
      const p = storage("admin.json");
      if (!existsSync(p)) return { ok: true, skip: true, detail: "admin.json ещё нет — используются значения по умолчанию" };
      const raw = JSON.parse(readFileSync(p, "utf8")) as { passwordHash?: string; phraseHash?: string };
      return {
        ok: Boolean(raw.passwordHash),
        detail: `пароль кабинета ${raw.passwordHash ? "задан" : "нет"}, кодовое слово ${raw.phraseHash ? "задано" : "не задано"}`,
      };
    },
  },
  {
    id: "debug",
    title: "Режим отладки",
    sections: ["agent-debug"],
    run: async () => {
      const p = storage("debug-mode.json");
      if (!existsSync(p)) return { ok: true, skip: true, detail: "настроек отладки ещё нет" };
      return fileOk("debug-mode.json");
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
      const filled = on.filter((c) => c.fields.some((f) => f.value));
      return { ok: filled.length > 0, detail: `включено ${on.length}, с ключом ${filled.length}` };
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
  const want = new Set(
    bag
      .filter((p) => p.sections.includes(section) || p.sections.includes("*") || p.sections.some((s) => section.startsWith(`${s}:`) || s.startsWith(`${section}:`)))
      .map((p) => p.id),
  );
  const known = allSections().some((s) => s.id === section);
  if (!known) {
    for (const p of bag.filter((x) => x.sections.includes("*"))) want.add(p.id);
  }
  return bag.filter((p) => want.has(p.id));
}

async function runOne(p: Probe): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    const r = await p.run();
    return { id: p.id, title: p.title, ok: r.ok, skip: r.skip, detail: r.detail, ms: Date.now() - t0 };
  } catch (e) {
    return {
      id: p.id,
      title: p.title,
      ok: false,
      detail: e instanceof Error ? e.message.slice(0, 180) : "ошибка",
      ms: Date.now() - t0,
    };
  }
}

export const adminSelfTest = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; section?: string })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const section = String(data.section || "*").slice(0, 60);
    const meta = allSections().find((s) => s.id === section);
    const list = probesFor(section);
    const checks: CheckResult[] = [];
    for (const p of list) checks.push(await runOne(p));
    const fail = checks.filter((c) => !c.ok && !c.skip).length;
    const pass = checks.filter((c) => c.ok).length;
    return {
      ok: true as const,
      section,
      title: meta?.title || `Раздел «${section}»`,
      hint: meta?.hint || "Раздел ещё не описан в каталоге — прогнали общий контур (диск, ключи). Добавьте registerAdminSection, когда появится.",
      dry: true,
      pass,
      fail,
      checks,
      future: !meta,
    };
  });
