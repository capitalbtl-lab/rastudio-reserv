import { createServerFn } from "@tanstack/react-start";
import { checkPassword, logAdmin } from "./admin-settings";
import { isAdminRequest, makeAdminToken, tokenOk } from "./admin-auth";
import { WINDOW_FLAGS } from "./agent-config";
import { DEBUG_TOOLS } from "./debug-client";
import { loadDebug, saveDebug } from "./debug-mode";

export const adminDebugMode = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; action: "get" | "save"; tools?: Record<string, boolean>; widget?: Record<string, boolean> })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    if (data.action === "save") {
      const cur = loadDebug();
      const tools = { ...cur.tools };
      for (const t of DEBUG_TOOLS) {
        if (data.tools && t.id in data.tools) tools[t.id] = Boolean(data.tools[t.id]);
      }
      const widget = { ...cur.widget };
      for (const f of WINDOW_FLAGS) {
        if (data.widget && f.id in data.widget) widget[f.id] = Boolean(data.widget[f.id]);
      }
      saveDebug({ tools, widget });
      logAdmin("Режим отладки: набор инструментов обновлён");
      return { ok: true as const, tools, widget };
    }
    const s = loadDebug();
    return { ok: true as const, tools: s.tools, widget: s.widget };
  });

export const unlockDebug = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { password?: string })
  .handler(async ({ data }) => {
    if (!checkPassword(String(data.password || ""))) {
      return { ok: false as const, error: "Пароль не подошёл." };
    }
    const s = loadDebug();
    return { ok: true as const, token: makeAdminToken(2 * 60 * 60 * 1000), tools: s.tools, widget: s.widget };
  });

export const debugSession = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string })
  .handler(async ({ data }) => {
    if (!tokenOk(data.token)) return { ok: false as const };
    const s = loadDebug();
    return { ok: true as const, tools: s.tools, widget: s.widget };
  });
