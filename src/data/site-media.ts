import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { logAdmin } from "./admin-settings";
import { mediaFolder } from "./media-context";

export type SiteMediaItem = {
  src: string;
  name: string;
  kind: "image" | "video";
  bytes: number;
  at: number;
  folder: string;
};

const ROOT = () => join(process.cwd(), "public");
const UPLOADS = () => join(ROOT(), "media", "uploads");

const IMAGE = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const VIDEO = new Set([".mp4", ".webm"]);

let cache: { at: number; items: SiteMediaItem[] } | null = null;

function walk(dir: string, acc: SiteMediaItem[], depth = 0) {
  if (depth > 6 || acc.length >= 400) return;
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, acc, depth + 1);
      continue;
    }
    const ext = extname(name).toLowerCase();
    const kind = IMAGE.has(ext) ? "image" : VIDEO.has(ext) ? "video" : null;
    if (!kind) continue;
    const rel = relative(ROOT(), full).replace(/\\/g, "/");
    const src = `/${rel}`;
    acc.push({
      src,
      name,
      kind,
      bytes: st.size,
      at: st.mtimeMs,
      folder: mediaFolder(src),
    });
  }
}

export function invalidateSiteMedia() {
  cache = null;
}

export function listSiteMedia(): SiteMediaItem[] {
  if (cache && Date.now() - cache.at < 30_000) return cache.items;
  const acc: SiteMediaItem[] = [];
  walk(join(ROOT(), "media"), acc);
  acc.sort((a, b) => b.at - a.at);
  cache = { at: Date.now(), items: acc };
  return acc;
}

export function saveSiteMedia(name: string, buf: Buffer) {
  const ext = extname(name).toLowerCase();
  if (!IMAGE.has(ext) && !VIDEO.has(ext)) return { ok: false as const, error: "Нужно фото (jpg, png, webp) или видео mp4." };
  if (buf.length > 12 * 1024 * 1024) return { ok: false as const, error: "Файл больше 12 МБ." };
  mkdirSync(UPLOADS(), { recursive: true });
  const safe = name
    .replace(/[^a-zA-Z0-9._-а-яА-ЯёЁ]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "file";
  const file = `${Date.now().toString(36)}-${safe.toLowerCase()}`;
  const full = join(UPLOADS(), file);
  writeFileSync(full, buf);
  invalidateSiteMedia();
  logAdmin(`Медиа: загружен ${file}`);
  const src = `/media/uploads/${file}`;
  return {
    ok: true as const,
    item: {
      src,
      name: file,
      kind: (IMAGE.has(ext) ? "image" : "video") as "image" | "video",
      bytes: buf.length,
      at: Date.now(),
      folder: "uploads",
    },
  };
}

export function deleteSiteUpload(src: string) {
  const rel = String(src || "").replace(/^\/+/, "");
  if (!rel.startsWith("media/uploads/")) return { ok: false as const, error: "Удалять можно только загрузки в медиатеке." };
  const full = join(ROOT(), rel);
  if (!existsSync(full)) return { ok: false as const, error: "Файла нет." };
  unlinkSync(full);
  invalidateSiteMedia();
  logAdmin(`Медиа: удалён ${rel}`);
  return { ok: true as const };
}
