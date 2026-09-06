import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { defaultHomeOrder, normalizeHomeOrder, type HomeBlockId } from "./home-layout-core";

function fileOf() {
  return join(process.cwd(), "storage", "home-layout.json");
}

export function loadHomeLayout(): HomeBlockId[] {
  try {
    if (!existsSync(fileOf())) return defaultHomeOrder();
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as { order?: unknown };
    return normalizeHomeOrder(raw?.order);
  } catch {
    return defaultHomeOrder();
  }
}

export function saveHomeLayout(order: unknown): HomeBlockId[] {
  const next = normalizeHomeOrder(order);
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify({ order: next }, null, 2), "utf8");
  return next;
}
