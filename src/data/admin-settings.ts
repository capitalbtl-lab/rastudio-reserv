import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type Settings = { salt: string; phraseHash: string; updatedAt: string };
type LogItem = { at: string; text: string };

const DEFAULT_WORD = "ромашка";

function fileOf(name: string) {
  return join(process.cwd(), "storage", name);
}

function writeJson(name: string, data: unknown) {
  const file = fileOf(name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function normalizeWord(word: string) {
  return word
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function hashWord(word: string, salt: string) {
  return createHmac("sha256", salt).update(normalizeWord(word)).digest("hex");
}

export function loadAdminSettings(): Settings {
  try {
    if (existsSync(fileOf("admin.json"))) {
      return JSON.parse(readFileSync(fileOf("admin.json"), "utf8")) as Settings;
    }
  } catch {
    /* seed */
  }
  const salt = randomBytes(16).toString("hex");
  const next: Settings = {
    salt,
    phraseHash: hashWord(process.env.ADMIN_CODEWORD?.trim() || DEFAULT_WORD, salt),
    updatedAt: new Date().toISOString(),
  };
  writeJson("admin.json", next);
  return next;
}

export function setCodeword(word: string) {
  const clean = word.trim();
  if (clean.length < 4) return { ok: false as const, error: "Слово короче 4 букв." };
  const salt = randomBytes(16).toString("hex");
  const next: Settings = { salt, phraseHash: hashWord(clean, salt), updatedAt: new Date().toISOString() };
  writeJson("admin.json", next);
  return { ok: true as const };
}

export function checkCodeword(word: string) {
  const settings = loadAdminSettings();
  const got = hashWord(word || "", settings.salt);
  const a = Buffer.from(got);
  const b = Buffer.from(settings.phraseHash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function logAdmin(text: string) {
  let prev: LogItem[] = [];
  try {
    if (existsSync(fileOf("admin-log.json"))) {
      prev = JSON.parse(readFileSync(fileOf("admin-log.json"), "utf8")) as LogItem[];
    }
  } catch {
    prev = [];
  }
  prev.unshift({ at: new Date().toISOString(), text });
  writeJson("admin-log.json", prev.slice(0, 40));
}

export function listAdminLog() {
  try {
    if (existsSync(fileOf("admin-log.json"))) {
      return JSON.parse(readFileSync(fileOf("admin-log.json"), "utf8")) as LogItem[];
    }
  } catch {
    /* empty */
  }
  return [] as LogItem[];
}
