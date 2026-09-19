import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type EditorAuth = { seed: number; salt: string; loginHash: string; passwordHash: string; updatedAt: string };

const BOOT: EditorAuth = {
  seed: 1,
  salt: "9e559d1c595ebb35b3cb779d27f288e8",
  loginHash: "609fbcb4608a5c665926afc13c9e1ab3ce8caca4d6c12763412d31e8d7e7781f",
  passwordHash: "92b4aa8225b841041b53eed5d2a331c0e6d42e0f7348c674e72b12b61228174e",
  updatedAt: "2026-09-19T12:43:00.000Z",
};

function fileOf() {
  return join(process.cwd(), "storage", "editor-auth.json");
}

function readDotEnv(key: string) {
  const dyn = String((globalThis as { process?: { env?: Record<string, string> } }).process?.env?.[key] || "").trim();
  if (dyn) return dyn;
  for (const file of [join(process.cwd(), ".env"), "/var/www/rastudio/.env"]) {
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

function normLogin(login: string) {
  return String(login || "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е");
}

function hash(value: string, salt: string) {
  return createHmac("sha256", salt).update(value).digest("hex");
}

function equal(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function defaultEditorLogin() {
  return normLogin(readDotEnv("EDITOR_LOGIN") || "admin");
}

export function loadEditorAuth(): EditorAuth {
  let raw: Partial<EditorAuth> = {};
  try {
    if (existsSync(fileOf())) raw = JSON.parse(readFileSync(fileOf(), "utf8")) as EditorAuth;
  } catch {
    raw = {};
  }
  if (raw.seed !== BOOT.seed || !raw.passwordHash || !raw.loginHash || !raw.salt) {
    mkdirSync(join(process.cwd(), "storage"), { recursive: true });
    writeFileSync(fileOf(), JSON.stringify(BOOT, null, 2), "utf8");
    return BOOT;
  }
  return {
    seed: raw.seed,
    salt: raw.salt,
    loginHash: raw.loginHash,
    passwordHash: raw.passwordHash,
    updatedAt: raw.updatedAt || BOOT.updatedAt,
  };
}

export function checkEditorLogin(login: string, password: string) {
  const auth = loadEditorAuth();
  if (!normLogin(login) || !String(password || "")) return false;
  if (!equal(hash(normLogin(login), auth.salt), auth.loginHash)) return false;
  const envPass = readDotEnv("EDITOR_PASSWORD");
  if (envPass) return equal(hash(String(password), auth.salt), hash(envPass, auth.salt));
  return equal(hash(String(password), auth.salt), auth.passwordHash);
}
