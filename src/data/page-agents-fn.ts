import { createServerFn } from "@tanstack/react-start";
import { agentFor } from "./page-agents";

export const publicPageAgent = createServerFn({ method: "GET" })
  .validator((data: unknown) => ({ path: String((data as { path?: string } | undefined)?.path || "/") }))
  .handler(async ({ data }) => {
    const agent = agentFor(data.path);
    if (!agent?.on) return { ok: true as const, agent: null };
    return { ok: true as const, agent };
  });
