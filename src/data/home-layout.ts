import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { emptyHomeLayout, normalizeHomeLayout, type HomeLayoutDoc } from "./home-layout-core";

function fileOf() {
  return join(process.cwd(), "storage", "home-layout.json");
}

export function loadHomeLayout(): HomeLayoutDoc {
  try {
    if (!existsSync(fileOf())) return emptyHomeLayout();
    return normalizeHomeLayout(JSON.parse(readFileSync(fileOf(), "utf8")));
  } catch {
    return emptyHomeLayout();
  }
}

export function saveHomeLayout(raw: unknown): HomeLayoutDoc {
  const next = normalizeHomeLayout(raw);
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify(next, null, 2), "utf8");
  return next;
}
