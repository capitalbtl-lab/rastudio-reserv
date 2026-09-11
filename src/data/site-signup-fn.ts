import { createServerFn } from "@tanstack/react-start";
import { loadSiteSignup } from "./site-signup";

export const loadPublicTrialSignup = createServerFn({ method: "GET" }).handler(async () => {
  const s = loadSiteSignup();
  return { trialOn: s.trialOn, trialByBranch: s.trialByBranch };
});
