import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { logAdmin } from "./admin-settings";
import { crmScheduleMeta, refreshCrmSchedule, sessionsFromCrm } from "./alfacrm-schedule";

export const adminSchedule = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; action: "get" | "pull" })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    if (data.action === "pull") {
      try {
        const res = await refreshCrmSchedule();
        logAdmin(`Расписание из AlfaCRM: ${res.count} слотов`);
        return { ok: true as const, ...res };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "AlfaCRM не ответила." };
      }
    }
    const meta = crmScheduleMeta();
    let sessions = [] as Awaited<ReturnType<typeof sessionsFromCrm>>;
    try {
      sessions = await sessionsFromCrm();
    } catch {
      /* */
    }
    return { ok: true as const, at: meta.at, count: sessions.length || meta.count, sessions };
  });
