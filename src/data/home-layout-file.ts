import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { emptyHomeLayout, normalizeHomeLayout, type HomeLayoutDoc } from "./home-layout-core.ts";

function fileOf() {
  return join(process.cwd(), "storage", "home-layout.json");
}

export function loadHomeLayoutFile(): HomeLayoutDoc | null {
  try {
    if (!existsSync(fileOf())) return null;
    return normalizeHomeLayout(JSON.parse(readFileSync(fileOf(), "utf8")));
  } catch {
    return null;
  }
}

export function saveHomeLayoutFile(raw: unknown): HomeLayoutDoc {
  const next = normalizeHomeLayout(raw);
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function emptyOrFile(): HomeLayoutDoc {
  return loadHomeLayoutFile() || emptyHomeLayout();
}
