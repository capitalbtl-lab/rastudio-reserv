/** Связь с AlfaCRM. Кабинет всегда читает диск. Режим и каналы решают, стучимся ли в Alfa. */

export type AlfaLinkMode = "linked" | "offline";

export const ALFA_LINK_MODES: {
  id: AlfaLinkMode;
  title: string;
  hint: string;
}[] = [
  {
    id: "linked",
    title: "Фон с AlfaCRM",
    hint: "Сайт пишет сразу на диск. Включённые каналы уходят в Alfa сами (рассылки, касса коллег). Полная воронка — кнопка «Обновить».",
  },
  {
    id: "offline",
    title: "Без AlfaCRM",
    hint: "Только сайт. Очередь копится и уйдёт, когда включите фон. Ольга всё равно пишет на диск.",
  },
];

export const ALFA_PULL_CH = [
  { id: "leads", title: "Лиды", hint: "Дельта воронки: новые и изменённые карточки." },
  { id: "customers", title: "Клиенты", hint: "Карточки is_study=1. Лид, которого в Alfa перевели в клиента, появится в кабинете даже без группы." },
  { id: "clients", title: "Ученики", hint: "Состав групп и живые абонементы пакетами." },
  { id: "lessons", title: "Журнал", hint: "Явка по группам, как состав." },
  { id: "pay", title: "Касса", hint: "Автоопрос платежей за окно дней. Все типы: доход, продажи, возвраты, корректировки." },
  { id: "groups", title: "Группы", hint: "Ночной diff каталога в 04:00. Не полная выгрузка каждый раз." },
  { id: "tariffs", title: "Абонементы", hint: "Входящие абонементы с карточки ученика, не всем списком." },
  { id: "subjects", title: "Предметы", hint: "Справочник предметов при прогреве и ночи." },
  { id: "teachers", title: "Педагоги", hint: "Справочник педагогов при группах и занятиях." },
] as const;

export const ALFA_PUSH_CH = [
  { id: "leads", title: "Лиды", hint: "Этап воронки и новая карточка, в том числе от Ольги." },
  { id: "trials", title: "Пробные", hint: "Запись с сайта и консультанта — customer.create + занятие." },
  { id: "clients", title: "Ученики", hint: "Имя, телефон, пауза." },
  { id: "lessons", title: "Занятия", hint: "Пробное, отработка, журнал." },
  { id: "groups", title: "Группы", hint: "Состав cgi и слот." },
  { id: "subjects", title: "Предметы", hint: "Новый предмет с сайта." },
  { id: "tariffs", title: "Абонементы", hint: "Назначение и снятие." },
  { id: "pay", title: "Касса", hint: "Платежи из админки в Alfa. Если включена «Касса сразу» — одним запросом после сохранения." },
] as const;

export const ALFA_PIPE_CH = [
  { id: "sharedLimiter", title: "Общий лимит запросов", hint: "Кабинет, касса и ночь делят одну паузу. Иначе Alfa режет 429." },
  { id: "keepToken", title: "Не логиниться зря", hint: "Токен живёт час. Опрос кассы не сбрасывает его." },
  { id: "verifyCreate", title: "Не создавать повторно", hint: "После сбоя сначала ищем запись в Alfa, потом create. Иначе двойные оплаты и карточки." },
  { id: "retry401", title: "Обновить токен при 401", hint: "Один повтор исходного запроса. Второй 401 — стоп, проверьте ключ API." },
  { id: "instantPay", title: "Касса сразу в Alfa", hint: "Платёж из админки после записи на диск уходит одним запросом. Без опроса кассы и без справочников." },
] as const;

export type AlfaPullCh = (typeof ALFA_PULL_CH)[number]["id"];
export type AlfaPushCh = (typeof ALFA_PUSH_CH)[number]["id"];
export type AlfaPipeCh = (typeof ALFA_PIPE_CH)[number]["id"];

export type AlfaSyncFlags = {
  pull: Record<AlfaPullCh, boolean>;
  push: Record<AlfaPushCh, boolean>;
  pipe: Record<AlfaPipeCh, boolean>;
  minutes: number;
  payDays: number;
};

export const ALFA_SYNC_DEFAULT: AlfaSyncFlags = {
  pull: {
    leads: true,
    customers: true,
    clients: true,
    lessons: true,
    pay: true,
    groups: true,
    tariffs: true,
    subjects: true,
    teachers: true,
  },
  push: { leads: true, trials: true, clients: true, lessons: true, groups: true, subjects: true, tariffs: true, pay: true },
  pipe: { sharedLimiter: true, keepToken: true, verifyCreate: true, retry401: true, instantPay: true },
  minutes: 10,
  payDays: 3,
};

export function alfaLinked(mode?: string | null) {
  return mode !== "offline";
}

export function alfaLinkOf(raw?: string | null): AlfaLinkMode {
  return raw === "offline" ? "offline" : "linked";
}

function flagMap<T extends string>(src: unknown, keys: readonly T[], fallback: Record<T, boolean>): Record<T, boolean> {
  const raw = src && typeof src === "object" ? (src as Record<string, unknown>) : {};
  const out = { ...fallback };
  for (const k of keys) {
    if (k in raw) out[k] = raw[k] !== false;
  }
  return out;
}

export function alfaSyncOf(raw?: Partial<AlfaSyncFlags> | null, base: AlfaSyncFlags = ALFA_SYNC_DEFAULT): AlfaSyncFlags {
  const minutes = Number(raw?.minutes ?? base.minutes);
  const payDays = Number(raw?.payDays ?? base.payDays);
  return {
    pull: flagMap(raw?.pull, ALFA_PULL_CH.map((c) => c.id) as AlfaPullCh[], base.pull),
    push: flagMap(raw?.push, ALFA_PUSH_CH.map((c) => c.id) as AlfaPushCh[], base.push),
    pipe: flagMap(raw?.pipe, ALFA_PIPE_CH.map((c) => c.id) as AlfaPipeCh[], base.pipe),
    minutes: Number.isFinite(minutes) ? Math.max(2, Math.min(60, minutes)) : 10,
    payDays: Number.isFinite(payDays) ? Math.max(1, Math.min(14, Math.round(payDays))) : 3,
  };
}

export type AlfaGate = { mode?: string | null } & Partial<AlfaSyncFlags>;

export function pullAllowed(state: AlfaGate, ch: AlfaPullCh) {
  if (!alfaLinked(state.mode)) return false;
  return alfaSyncOf(state).pull[ch] !== false;
}

export function deltaAllowed(state: AlfaGate, delta?: unknown) {
  return Boolean(delta) && pullAllowed(state, "leads");
}

export function pullFreshAllowed(state: AlfaGate, fresh?: unknown) {
  return Boolean(fresh) && alfaLinked(state.mode);
}

export function pipeAllowed(state: AlfaGate, ch: AlfaPipeCh) {
  return alfaSyncOf(state).pipe[ch] !== false;
}

export function payDaysOf(state?: AlfaGate | null) {
  return alfaSyncOf(state).payDays;
}

export function pushAllowed(state: AlfaGate, op: string, body?: Record<string, unknown>) {
  if (!alfaLinked(state.mode)) return false;
  return alfaSyncOf(state).push[exportOpPushChannel(op, body)] !== false;
}

/** Канал выгрузки по операции очереди. Пробное — customer.create с is_study 0 или lesson.type trial. */
export function exportOpPushChannel(op: string, body?: Record<string, unknown>): AlfaPushCh {
  if (op.startsWith("lead-status")) return "leads";
  if (op === "pay.create" || op === "pay.update" || op === "pay.delete") return "pay";
  if (op.startsWith("customer-tariff")) return "tariffs";
  if (op === "cgi.apply" || op.startsWith("group")) return "groups";
  if (op === "subject.create") return "subjects";
  if (op.startsWith("lesson") || op.startsWith("regular-lesson")) {
    const lesson = body?.lesson && typeof body.lesson === "object" ? (body.lesson as { type?: string }) : null;
    const kind = String(body?.type || lesson?.type || body?.kind || "");
    if (kind === "trial" || Number(body?.lesson_type_id) === 3) return "trials";
    return "lessons";
  }
  if (op === "customer.create") {
    const study = Number(body?.is_study);
    const lesson = body?.lesson && typeof body.lesson === "object" ? (body.lesson as { type?: string }) : null;
    const kind = String(lesson?.type || body?.kind || "");
    if (study === 0 || kind === "trial") return "trials";
    return "leads";
  }
  if (op === "customer.update") return "clients";
  return "clients";
}
