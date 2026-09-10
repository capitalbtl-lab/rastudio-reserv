/**
 * На Beget: раз в минуту смотрит origin/main и выкатывает, если появился новый коммит.
 * После первого запуска SSH больше не нужен.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INTERVAL_MS = 60_000;
const LOCK = "/tmp/rastudio-deploy.lock";
let busy = false;

async function git(args) {
  const { stdout } = await exec("git", args, { cwd: root, timeout: 60_000 });
  return String(stdout || "").trim();
}

async function liveRev() {
  for (const p of [path.join(root, ".output", ".deploy-rev"), path.join(root, ".deploy-rev")]) {
    try {
      const v = String(await readFile(p, "utf8")).trim();
      if (v) return v;
    } catch {
      /* */
    }
  }
  return "";
}

function lockHeld() {
  try {
    if (!existsSync(LOCK)) return false;
    return Date.now() - statSync(LOCK).mtimeMs < 25 * 60 * 1000;
  } catch {
    return false;
  }
}

function building() {
  return lockHeld();
}

async function tick() {
  if (busy) return;
  if (building()) {
    console.log("[deploy] сборка уже идёт, жду");
    return;
  }
  busy = true;
  try {
    await git(["fetch", "origin", "main"]);
    const local = await git(["rev-parse", "HEAD"]);
    const remote = await git(["rev-parse", "origin/main"]);
    const live = await liveRev();
    if (!remote) return;
    if (local === remote && live === remote) return;
    if (local !== remote) {
      console.log(`[deploy] ${local.slice(0, 7)} → ${remote.slice(0, 7)}`);
      await git(["reset", "--hard", "origin/main"]);
    } else {
      console.log(`[deploy] git ${remote.slice(0, 7)}, сайт ${live.slice(0, 7) || "без метки"} — пересобираю`);
    }
    await exec("bash", [path.join(root, "scripts/beget-deploy.sh"), "--force"], {
      cwd: root,
      env: { ...process.env, RA_DEPLOY_REEXEC: "1", RA_DEPLOY_BG: "1" },
      timeout: 20 * 60 * 1000,
    });
  } catch (e) {
    const err = e;
    const extra = err && typeof err === "object" && "stderr" in err ? String(err.stderr || "") : "";
    const msg = extra || (e instanceof Error ? e.message : String(e));
    if (/сборка уже идёт/.test(msg)) {
      console.log("[deploy] сборка уже идёт, жду");
      return;
    }
    console.error("[deploy]", msg);
  } finally {
    busy = false;
  }
}

console.log("[deploy] слежу за origin/main каждые 60 с");
void tick();
setInterval(() => void tick(), INTERVAL_MS);
