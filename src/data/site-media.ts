import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { logAdmin } from "./admin-settings";
import { mediaFolder, mediaSchoolId, mediaUploadRel, schoolSlug } from "./media-context";
import { loadSiteTree } from "./site-tree";

export type SiteMediaItem = {
  src: string;
  name: string;
  kind: "image" | "video";
  bytes: number;
  at: number;
  folder: string;
  schoolId?: string;
};

const ROOT = () => join(process.cwd(), "public");

const IMAGE = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const VIDEO = new Set([".mp4", ".webm"]);

let cache: { at: number; items: SiteMediaItem[] } | null = null;

function treePack() {
  try {
    const tree = loadSiteTree();
    return { schools: tree.schools, courses: tree.courses };
  } catch {
    return { schools: [] as { id: string }[], courses: [] as { id: string; schoolId: string }[] };
  }
}

function walk(dir: string, acc: SiteMediaItem[], depth = 0) {
  if (depth > 6 || acc.length >= 400) return;
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  const pack = treePack();
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
      schoolId: mediaSchoolId(src, pack.schools, pack.courses),
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

export function saveSiteMedia(name: string, buf: Buffer, folder = "") {
  const ext = extname(name).toLowerCase();
  if (!IMAGE.has(ext) && !VIDEO.has(ext)) return { ok: false as const, error: "Нужно фото (jpg, png, webp) или видео mp4." };
  if (buf.length > 12 * 1024 * 1024) return { ok: false as const, error: "Файл больше 12 МБ." };
  const relDir = mediaUploadRel(folder);
  const dir = join(ROOT(), relDir);
  mkdirSync(dir, { recursive: true });
  const safe =
    name
      .replace(/[^a-zA-Z0-9._-а-яА-ЯёЁ]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "file";
  const file = `${Date.now().toString(36)}-${safe.toLowerCase()}`;
  writeFileSync(join(dir, file), buf);
  invalidateSiteMedia();
  logAdmin(`Медиа: загружен ${relDir}/${file}`);
  const src = `/${relDir}/${file}`;
  const pack = treePack();
  return {
    ok: true as const,
    item: {
      src,
      name: file,
      kind: (IMAGE.has(ext) ? "image" : "video") as "image" | "video",
      bytes: buf.length,
      at: Date.now(),
      folder: mediaFolder(src),
      schoolId: mediaSchoolId(src, pack.schools, pack.courses) || (schoolSlug(folder) ? `/${schoolSlug(folder)}` : ""),
    },
  };
}

export function deleteSiteUpload(src: string) {
  const rel = String(src || "").replace(/^\/+/, "");
  const okDir = rel.startsWith("media/uploads/") || rel.startsWith("media/schools/");
  if (!okDir) return { ok: false as const, error: "Удалять можно загрузки в медиатеке и папках школ." };
  const full = join(ROOT(), rel);
  if (!existsSync(full)) return { ok: false as const, error: "Файла нет." };
  unlinkSync(full);
  invalidateSiteMedia();
  logAdmin(`Медиа: удалён ${rel}`);
  return { ok: true as const };
}
