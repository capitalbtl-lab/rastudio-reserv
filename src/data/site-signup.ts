import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SITE_SIGNUP_DEFAULT, trialFormUrl, type SiteSignup } from "./site-signup-core";

export { SITE_SIGNUP_DEFAULT, trialFormUrl, groupSignupUrl, trialUrlFor, resolveGroupSignup, SITE_BRANCHES, type SiteSignup } from "./site-signup-core";

function fileOf() {
  return join(process.cwd(), "storage", "site-signup.json");
}

export function loadSiteSignup(): SiteSignup {
  try {
    if (!existsSync(fileOf())) return { ...SITE_SIGNUP_DEFAULT, trialByBranch: { ...SITE_SIGNUP_DEFAULT.trialByBranch } };
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<SiteSignup>;
    const trialByBranch = { ...SITE_SIGNUP_DEFAULT.trialByBranch, ...(raw.trialByBranch || {}) };
    for (const id of ["1", "2", "3", "4"]) {
      if (!String(trialByBranch[id] || "").trim()) trialByBranch[id] = trialFormUrl(Number(id));
    }
    return {
      trialOn: raw.trialOn !== false,
      groupOn: raw.groupOn !== false,
      trialByBranch,
    };
  } catch {
    return { ...SITE_SIGNUP_DEFAULT, trialByBranch: { ...SITE_SIGNUP_DEFAULT.trialByBranch } };
  }
}

export function saveSiteSignup(next: Partial<SiteSignup>) {
  const cur = loadSiteSignup();
  const trialByBranch = { ...cur.trialByBranch };
  if (next.trialByBranch && typeof next.trialByBranch === "object") {
    for (const [k, v] of Object.entries(next.trialByBranch)) {
      if (/^[1-4]$/.test(k)) trialByBranch[k] = String(v || "").trim() || trialFormUrl(Number(k));
    }
  }
  const saved: SiteSignup = {
    trialOn: next.trialOn ?? cur.trialOn,
    groupOn: next.groupOn ?? cur.groupOn,
    trialByBranch,
  };
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify(saved, null, 2));
  return saved;
}
