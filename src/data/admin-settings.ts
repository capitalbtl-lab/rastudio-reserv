import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type Settings = { salt: string; phraseHash: string; passwordHash: string; updatedAt: string };
type LogItem = { at: string; text: string };

const DEFAULT_WORD = "ромашка";
const DEFAULT_PASS = "RastudioCeny2026";

function fileOf(name: string) {
  return join(process.cwd(), "storage", name);
}

function envPaths() {
  return [join(process.cwd(), ".env"), "/var/www/rastudio/.env"];
}

function readDotEnv(key: string) {
  const dyn = String((globalThis as { process?: { env?: Record<string, string> } }).process?.env?.[key] || "").trim();
  if (dyn) return dyn;
  for (const file of envPaths()) {
    try {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#") || !t.startsWith(`${key}=`)) continue;
        return t.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
      }
    } catch {
      /* next */
    }
  }
  return "";
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

function hashPass(pass: string, salt: string) {
  return createHmac("sha256", salt).update(pass).digest("hex");
}

export function loadAdminSettings(): Settings {
  let raw: Partial<Settings> = {};
  try {
    if (existsSync(fileOf("admin.json"))) {
      raw = JSON.parse(readFileSync(fileOf("admin.json"), "utf8")) as Settings;
    }
  } catch {
    raw = {};
  }
  const salt = raw.salt || randomBytes(16).toString("hex");
  const next: Settings = {
    salt,
    phraseHash: raw.phraseHash || hashWord(readDotEnv("ADMIN_CODEWORD") || DEFAULT_WORD, salt),
    passwordHash: raw.passwordHash || hashPass(readDotEnv("ADMIN_PASSWORD") || DEFAULT_PASS, salt),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
  if (!raw.salt || !raw.passwordHash || !raw.phraseHash) writeJson("admin.json", next);
  return next;
}

export function setCodeword(word: string) {
  const clean = word.trim();
  if (clean.length < 4) return { ok: false as const, error: "Слово короче 4 букв." };
  const cur = loadAdminSettings();
  const next: Settings = { ...cur, phraseHash: hashWord(clean, cur.salt), updatedAt: new Date().toISOString() };
  writeJson("admin.json", next);
  return { ok: true as const };
}

export function setAdminPassword(pass: string) {
  const clean = pass.trim();
  if (clean.length < 6) return { ok: false as const, error: "Пароль короче 6 символов." };
  const cur = loadAdminSettings();
  const next: Settings = { ...cur, passwordHash: hashPass(clean, cur.salt), updatedAt: new Date().toISOString() };
  writeJson("admin.json", next);
  return { ok: true as const };
}

export function checkCodeword(word: string) {
  const settings = loadAdminSettings();
  const got = Buffer.from(hashWord(word || "", settings.salt));
  const exp = Buffer.from(settings.phraseHash);
  if (got.length !== exp.length) return false;
  return timingSafeEqual(got, exp);
}

export function checkPassword(pass: string) {
  const settings = loadAdminSettings();
  const got = Buffer.from(hashPass(pass || "", settings.salt));
  const exp = Buffer.from(settings.passwordHash || "");
  if (!settings.passwordHash || got.length !== exp.length) return false;
  return timingSafeEqual(got, exp);
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
