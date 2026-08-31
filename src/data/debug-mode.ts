import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { checkPassword, logAdmin } from "./admin-settings";
import { isAdminRequest, makeAdminToken, tokenOk } from "./admin-auth";

export const DEBUG_TOOLS = [
  { id: "chat", label: "Лента чата", hint: "Сырые сообщения Олега и Ольги, как уходят в историю." },
  { id: "funnel", label: "Воронка", hint: "Возраст, город, филиал — что агент уже запомнил." },
  { id: "voice", label: "Голос и микрофон", hint: "TTS, SpeechRecognition, не просит ли телефон микрофон снова." },
  { id: "net", label: "Ответ агента", hint: "Последний chatAgent: длина, ошибка, канал." },
] as const;

export type DebugToolId = (typeof DEBUG_TOOLS)[number]["id"];

type DebugSettings = { tools: Record<string, boolean> };

const DEFAULT: DebugSettings = {
  tools: { chat: true, funnel: true, voice: true, net: true },
};

function fileOf() {
  return join(process.cwd(), "storage", "debug-mode.json");
}

export function loadDebug(): DebugSettings {
  try {
    if (!existsSync(fileOf())) return { ...DEFAULT, tools: { ...DEFAULT.tools } };
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<DebugSettings>;
    return { tools: { ...DEFAULT.tools, ...(raw.tools || {}) } };
  } catch {
    return { ...DEFAULT, tools: { ...DEFAULT.tools } };
  }
}

function saveDebug(s: DebugSettings) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify(s, null, 2), "utf8");
}

export const adminDebugMode = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; action: "get" | "save"; tools?: Record<string, boolean> })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    if (data.action === "save") {
      const cur = loadDebug();
      const tools = { ...cur.tools };
      for (const t of DEBUG_TOOLS) {
        if (data.tools && t.id in data.tools) tools[t.id] = Boolean(data.tools[t.id]);
      }
      saveDebug({ tools });
      logAdmin("Режим отладки: набор инструментов обновлён");
      return { ok: true as const, tools };
    }
    return { ok: true as const, tools: loadDebug().tools };
  });

export const unlockDebug = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { password?: string })
  .handler(async ({ data }) => {
    if (!checkPassword(String(data.password || ""))) {
      return { ok: false as const, error: "Пароль не подошёл." };
    }
    return { ok: true as const, token: makeAdminToken(2 * 60 * 60 * 1000), tools: loadDebug().tools };
  });

export const debugSession = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string })
  .handler(async ({ data }) => {
    if (!tokenOk(data.token)) return { ok: false as const };
    return { ok: true as const, tools: loadDebug().tools };
  });

export function debugEmit(kind: string, payload: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("ra-debug", { detail: { kind, payload, at: Date.now() } }));
  } catch {
    /* */
  }
}
