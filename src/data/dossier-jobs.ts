import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { logAdmin } from "./admin-settings";
import { loadApiConns } from "./api-keys";

export const JOB_ACTIONS = [
  {
    id: "max",
    label: "Рассылка в MAX",
    channel: "max",
    hint: "Когда подключится агент MAX — отправит текст выбранным клиентам.",
  },
  {
    id: "vk",
    label: "Сообщение во ВКонтакте",
    channel: "vk",
    hint: "Личка сообщества тем, у кого есть диалог ВК.",
  },
  {
    id: "telegram",
    label: "Сообщение в Telegram",
    channel: "telegram",
    hint: "Когда подключится Telegram-бот студии.",
  },
  {
    id: "call",
    label: "Массовый обзвон",
    channel: "phone",
    hint: "Исходящие через Novofon, когда телефония в работе.",
  },
  {
    id: "custom",
    label: "Своя инструкция агенту",
    channel: "agent",
    hint: "Текст задания: что сказать или сделать выбранным карточкам.",
  },
] as const;

export type JobActionId = (typeof JOB_ACTIONS)[number]["id"];

export type DossierJob = {
  id: string;
  at: string;
  action: JobActionId;
  instruction: string;
  status: "queued" | "blocked" | "done";
  reason: string;
  dossierIds: string[];
  count: number;
  filters?: Record<string, string>;
};

type Store = { jobs: DossierJob[] };

function fileOf() {
  return join(process.cwd(), "storage", "dossier-jobs.json");
}

function load(): Store {
  try {
    if (!existsSync(fileOf())) return { jobs: [] };
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Store;
    return { jobs: Array.isArray(raw.jobs) ? raw.jobs : [] };
  } catch {
    return { jobs: [] };
  }
}

function save(s: Store) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify({ jobs: s.jobs.slice(0, 400) }, null, 0), "utf8");
}

function nid() {
  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function channelsReady() {
  const apis = loadApiConns();
  const on = (id: string) => {
    const c = apis.find((x) => x.id === id);
    return Boolean(c?.enabled && c.fields.some((f) => f.secret && f.value));
  };
  return {
    phone: on("novofon"),
    vk: apis.some((x) => x.enabled && /vk|вконтакте/i.test(x.name + x.id)),
    max: apis.some((x) => x.enabled && /\bmax\b/i.test(x.name + x.id)),
    telegram: apis.some((x) => x.enabled && /telegram/i.test(x.name + x.id)),
    agent: true,
  };
}

function runStatus(action: JobActionId, ready: ReturnType<typeof channelsReady>) {
  if (action === "custom") return { status: "queued" as const, reason: "Инструкция записана. Агент выполнит её, когда канал диалога с этими клиентами будет открыт." };
  if (action === "call") {
    return ready.phone
      ? { status: "queued" as const, reason: "Обзвон в очереди Novofon." }
      : { status: "blocked" as const, reason: "Телефония Novofon ещё не подключена. Задание сохранено — нажмите «Выполнить», когда API появится." };
  }
  if (action === "vk") {
    return ready.vk
      ? { status: "queued" as const, reason: "Рассылка ВК в очереди." }
      : { status: "blocked" as const, reason: "Агент ВК ещё не подключён. Задание сохранено." };
  }
  if (action === "max") {
    return ready.max
      ? { status: "queued" as const, reason: "Рассылка MAX в очереди." }
      : { status: "blocked" as const, reason: "Агент MAX ещё не подключён. Задание сохранено." };
  }
  if (action === "telegram") {
    return ready.telegram
      ? { status: "queued" as const, reason: "Рассылка Telegram в очереди." }
      : { status: "blocked" as const, reason: "Telegram-бот ещё не подключён. Задание сохранено." };
  }
  return { status: "queued" as const, reason: "В очереди." };
}

export const adminDossierJobs = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        action: "list" | "create" | "retry";
        job?: { action: JobActionId; instruction?: string; dossierIds: string[]; filters?: Record<string, string> };
        id?: string;
      },
  )
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const store = load();
    const ready = channelsReady();
    if (data.action === "create" && data.job) {
      const ids = Array.from(new Set((data.job.dossierIds || []).filter(Boolean))).slice(0, 5000);
      if (!ids.length) return { ok: false as const, error: "Никого не выбрали." };
      const instruction = String(data.job.instruction || "").trim().slice(0, 4000);
      if (data.job.action === "custom" && instruction.length < 4) {
        return { ok: false as const, error: "Напишите инструкцию — что агент должен сделать." };
      }
      const run = runStatus(data.job.action, ready);
      const job: DossierJob = {
        id: nid(),
        at: new Date().toISOString(),
        action: data.job.action,
        instruction,
        status: run.status,
        reason: run.reason,
        dossierIds: ids,
        count: ids.length,
        filters: data.job.filters || {},
      };
      store.jobs.unshift(job);
      save(store);
      logAdmin(`Задание агенту: ${job.action}, ${job.count} дел, ${job.status}`);
      return { ok: true as const, job, jobs: store.jobs.slice(0, 40), channels: ready };
    }
    if (data.action === "retry" && data.id) {
      const job = store.jobs.find((j) => j.id === data.id);
      if (!job) return { ok: false as const, error: "Задание не найдено." };
      const run = runStatus(job.action, ready);
      job.status = run.status;
      job.reason = run.reason;
      job.at = new Date().toISOString();
      save(store);
      return { ok: true as const, job, jobs: store.jobs.slice(0, 40), channels: ready };
    }
    return { ok: true as const, jobs: store.jobs.slice(0, 40), channels: ready };
  });
