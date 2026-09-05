import { createServerFn } from "@tanstack/react-start";
import type { TrialPayload } from "./trial-public";
import { saveTrialLead } from "./trial-save";

export const sendTrial = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as TrialPayload)
  .handler(async ({ data }) => saveTrialLead(data));
