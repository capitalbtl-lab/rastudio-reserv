/**
 * На Beget: раз в минуту смотрит origin/main и выкатывает, если появился новый коммит.
 * После первого запуска SSH больше не нужен.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INTERVAL_MS = 60_000;
let busy = false;

async function git(args) {
  const { stdout } = await exec("git", args, { cwd: root });
  return String(stdout || "").trim();
}

async function liveRev() {
  try {
    return String(await readFile(path.join(root, ".output", ".deploy-rev"), "utf8")).trim();
  } catch {
    return "";
  }
}

async function tick() {
  if (busy) return;
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
      env: process.env,
      timeout: 20 * 60 * 1000,
    });
  } catch (e) {
    const err = e;
    const extra = err && typeof err === "object" && "stderr" in err ? String(err.stderr || "") : "";
    console.error("[deploy]", extra || (e instanceof Error ? e.message : e));
    try {
      await exec("pm2", ["start", "ecosystem.config.cjs", "--only", "rastudio"], { cwd: root });
    } catch {
      try {
        await exec("pm2", ["restart", "rastudio"], { cwd: root });
      } catch {
        /* */
      }
    }
  } finally {
    busy = false;
  }
}

console.log("[deploy] слежу за origin/main каждые 60 с");
void tick();
setInterval(() => void tick(), INTERVAL_MS);
