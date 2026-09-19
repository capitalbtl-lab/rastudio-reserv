import { createServerFn } from "@tanstack/react-start";
import { makeAdminToken } from "./admin-auth";
import { logAdmin } from "./admin-settings";
import { checkEditorLogin } from "./editor-auth.ts";

export const editorLogin = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { login?: string; password?: string })
  .handler(async ({ data }) => {
    try {
      if (!checkEditorLogin(String(data.login || ""), String(data.password || ""))) {
        return { ok: false as const, error: "Неверный логин или пароль." };
      }
      logAdmin("Вход в визуальный редактор");
      return { ok: true as const, token: makeAdminToken(7 * 24 * 60 * 60 * 1000) };
    } catch {
      return { ok: false as const, error: "Сервер перезапускается. Подождите несколько секунд." };
    }
  });
