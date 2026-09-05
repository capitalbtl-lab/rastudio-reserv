import { createServerFn } from "@tanstack/react-start";
import { loadBrain, uiFlagsOf } from "./agent-config";

export const publicAgentUi = createServerFn({ method: "GET" }).handler(async () => {
  const s = loadBrain().settings;
  return { ok: true as const, ui: uiFlagsOf(s) };
});
