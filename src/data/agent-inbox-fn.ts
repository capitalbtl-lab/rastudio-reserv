import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { inboxStatus } from "./agent-inbox";
import { probeMax, subscribeMax } from "./agent-outbox";

export const adminAgentInbox = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; action: "list" | "subscribeMax" | "probeMax" })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    if (data.action === "subscribeMax") {
      const sent = await subscribeMax();
      return sent.ok ? { ok: true as const, ...inboxStatus(), subscribed: sent.url } : { ok: false as const, error: sent.error };
    }
    if (data.action === "probeMax") {
      const probe = await probeMax();
      return probe.ok ? { ok: true as const, ...inboxStatus(), bot: probe.name } : { ok: false as const, error: probe.error };
    }
    return { ok: true as const, ...inboxStatus() };
  });
