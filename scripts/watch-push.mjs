/**
 * Если дерево грязное и 20 с не менялось — коммит и push main.
 * Без fs.watch: в песочнице кончаются inotify.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POLL_MS = 15_000;
const STABLE = 2;
let last = "";
let hits = 0;
let running = false;

async function dirty() {
  const { stdout } = await exec("git", ["status", "--porcelain"], { cwd: root });
  return String(stdout || "").trim();
}

function run() {
  if (running) return;
  running = true;
  const child = spawn("bash", [path.join(root, "scripts/push-main.sh")], {
    cwd: root,
    stdio: "inherit",
  });
  child.on("close", (code) => {
    running = false;
    last = "";
    hits = 0;
    if (code) console.error("[push] код", code);
  });
}

async function tick() {
  try {
    const now = await dirty();
    if (!now) {
      last = "";
      hits = 0;
      return;
    }
    if (now === last) {
      hits += 1;
      if (hits >= STABLE) run();
    } else {
      last = now;
      hits = 1;
    }
  } catch (e) {
    console.error("[push]", e instanceof Error ? e.message : e);
  }
}

console.log("[push] грязное дерево 20 с без изменений → main");
void tick();
setInterval(() => void tick(), POLL_MS);
