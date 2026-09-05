/**
 * После паузы в правках коммитит и пушит main.
 * Beget (rastudio-deploy) забирает коммит сам.
 */
import { watch } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IGNORE = /(^|\/)(\.git|node_modules|storage|\.output|\.nitro|\.tanstack|screenshots|artifacts|__pycache__|\.grok)(\/|$)/;
const DEBOUNCE_MS = 20_000;
let timer = null;
let running = false;
let again = false;

function relevant(name) {
  if (!name) return false;
  return !IGNORE.test(String(name).replaceAll("\\", "/"));
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => run(), DEBOUNCE_MS);
}

function run() {
  if (running) {
    again = true;
    return;
  }
  running = true;
  const child = spawn("bash", [path.join(root, "scripts/push-main.sh")], {
    cwd: root,
    stdio: "inherit",
  });
  child.on("close", (code) => {
    running = false;
    if (again) {
      again = false;
      schedule();
    }
    if (code) console.error("[push] код", code);
  });
}

watch(root, { recursive: true }, (_ev, fn) => {
  if (relevant(fn)) schedule();
});

console.log("[push] 20 с без правок → main");
