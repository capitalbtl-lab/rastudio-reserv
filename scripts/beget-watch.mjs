/**
 * На Beget: сразу после пуша в origin/main выкатывает. Без минутного ожидания.
 * После первого запуска SSH больше не нужен.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, statSync, readFileSync, unlinkSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INTERVAL_MS = 8_000;
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
    return Date.now() - statSync(LOCK).mtimeMs < 45 * 60 * 1000;
  } catch {
    return false;
  }
}

function building() {
  return lockHeld();
}

function pidAlive(pid) {
  const n = Number(pid) || 0;
  if (!n) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch {
    return false;
  }
}

function historyJobBusy() {
  let job = {};
  try {
    job = JSON.parse(readFileSync(path.join(root, "storage/crm-journal-job.json"), "utf8"));
  } catch {
    job = {};
  }
  let lockAlive = false;
  try {
    const lock = JSON.parse(readFileSync(path.join(root, "storage/crm-history-tick.lock"), "utf8"));
    lockAlive = pidAlive(lock.pid);
  } catch {
    lockAlive = false;
  }
  let workerAlive = false;
  try {
    const beat = JSON.parse(readFileSync(path.join(root, "storage/crm-history-worker.json"), "utf8"));
    const beatAt = Date.parse(String(beat.at || ""));
    const beatFresh = Number.isFinite(beatAt) && Date.now() - beatAt < 120_000; // PLAN_WORKER_SILENT_MS
    workerAlive = beatFresh && pidAlive(beat.pid);
  } catch {
    workerAlive = false;
  }
  if (lockAlive) return true;
  if (job.running && !job.stop && workerAlive) return true;
  return false;
}

async function maybeRestartHistory() {
  const flag = path.join(root, "storage/crm-history-restart.wanted");
  if (!existsSync(flag)) return;
  if (historyJobBusy()) return;
  try {
    await exec("pm2", ["restart", "rastudio-history", "--update-env"], { cwd: root, timeout: 30_000 });
  } catch {
    try {
      await exec("pm2", ["start", path.join(root, "ecosystem.config.cjs"), "--only", "rastudio-history"], {
        cwd: root,
        timeout: 30_000,
      });
    } catch (e) {
      console.error("[deploy] рестарт истории", e instanceof Error ? e.message : e);
      return;
    }
  }
  try {
    unlinkSync(flag);
  } catch {
    /* */
  }
  console.log("[deploy] история перезапущена после прогона пульта");
}

async function tick() {
  if (busy) return;
  if (building()) {
    console.log("[deploy] сборка уже идёт, жду");
    return;
  }
  busy = true;
  try {
    await maybeRestartHistory();
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
      timeout: 45 * 60 * 1000,
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

console.log("[deploy] слежу за origin/main каждые 8 с — пуш сразу в сборку");
void tick();
setInterval(() => void tick(), INTERVAL_MS);
