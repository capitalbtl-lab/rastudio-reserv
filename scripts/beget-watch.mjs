/**
 * На Beget: раз в минуту смотрит origin/main и выкатывает, если появился новый коммит.
 * После первого запуска SSH больше не нужен.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
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

async function tick() {
  if (busy) return;
  busy = true;
  try {
    await git(["fetch", "origin", "main"]);
    const local = await git(["rev-parse", "HEAD"]);
    const remote = await git(["rev-parse", "origin/main"]);
    if (!remote || local === remote) return;
    console.log(`[deploy] ${local.slice(0, 7)} → ${remote.slice(0, 7)}`);
    await exec("bash", [path.join(root, "scripts/beget-deploy.sh")], {
      cwd: root,
      env: process.env,
      timeout: 8 * 60 * 1000,
    });
  } catch (e) {
    const err = e;
    const extra = err && typeof err === "object" && "stderr" in err ? String(err.stderr || "") : "";
    console.error("[deploy]", extra || (e instanceof Error ? e.message : e));
  } finally {
    busy = false;
  }
}

console.log("[deploy] слежу за origin/main каждые 60 с");
void tick();
setInterval(() => void tick(), INTERVAL_MS);
