import { createHmac, timingSafeEqual } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "data/build.json");

export type BuildStamp = { sha: string; at: string; deploying?: boolean };

function hookSecret() {
  return createHmac("sha256", "rastudio-admin-token").update("deploy-hook").digest("hex").slice(0, 32);
}

export function deployHookOk(got?: string | null) {
  const expect = hookSecret();
  const token = String(got || "").trim();
  if (token.length !== expect.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expect));
  } catch {
    return false;
  }
}

export function readBuildStamp(): BuildStamp {
  try {
    const raw = JSON.parse(readFileSync(FILE, "utf8")) as BuildStamp;
    if (raw && typeof raw.sha === "string" && raw.sha) {
      const at = String(raw.at || "");
      const age = at ? Date.now() - new Date(at).getTime() : 0;
      const deploying = Boolean(raw.deploying) && age > 0 && age < 8 * 60 * 1000;
      return { sha: raw.sha, at, deploying };
    }
  } catch {
    /* fall through */
  }
  try {
    const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }).trim();
    return { sha, at: "" };
  } catch {
    return { sha: "", at: "" };
  }
}

export function writeBuildStamp(stamp: BuildStamp) {
  mkdirSync(path.dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(stamp));
}

export function kickDeploy() {
  const sh = path.join(process.cwd(), "scripts/beget-deploy.sh");
  if (!existsSync(sh)) return false;
  writeBuildStamp({ ...readBuildStamp(), deploying: true });
  spawn("bash", [sh, "--force"], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: process.env,
  }).unref();
  return true;
}
