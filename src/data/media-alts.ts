import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { hydrateMediaAlts, allMediaAlts } from "./media-alts-core";

function fileOf() {
  return join(process.cwd(), "storage", "media-alts.json");
}

export function loadMediaAlts() {
  try {
    if (!existsSync(fileOf())) {
      hydrateMediaAlts({});
      return {};
    }
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Record<string, string>;
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw || {})) {
      const src = String(k || "").trim();
      const alt = String(v || "").trim();
      if (src.startsWith("/media/") && alt) next[src] = alt.slice(0, 240);
    }
    hydrateMediaAlts(next);
    return next;
  } catch {
    hydrateMediaAlts({});
    return {};
  }
}

export function saveMediaAlt(src: string, text: string) {
  const map = loadMediaAlts();
  const key = String(src || "").split("?")[0];
  const alt = String(text || "").trim().slice(0, 240);
  if (!key.startsWith("/media/")) return map;
  if (alt) map[key] = alt;
  else delete map[key];
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify(map, null, 2), "utf8");
  hydrateMediaAlts(map);
  return map;
}

export { allMediaAlts, hydrateMediaAlts, mediaAlt } from "./media-alts-core";
