import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkPassword } from "./admin-settings.ts";

type EditorAuth = { salt: string; loginHash: string; passwordHash?: string; updatedAt: string };

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
  const salt = raw.salt || randomBytes(16).toString("hex");
  const loginHash = raw.loginHash || hash(defaultEditorLogin(), salt);
  const envPass = readDotEnv("EDITOR_PASSWORD");
  const next: EditorAuth = {
    salt,
    loginHash,
    passwordHash: raw.passwordHash || (envPass ? hash(envPass, salt) : undefined),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
  if (!raw.salt || !raw.loginHash) {
    mkdirSync(join(process.cwd(), "storage"), { recursive: true });
    writeFileSync(fileOf(), JSON.stringify(next, null, 2), "utf8");
  }
  return next;
}

export function checkEditorLogin(login: string, password: string) {
  const auth = loadEditorAuth();
  if (!normLogin(login) || !String(password || "")) return false;
  if (!equal(hash(normLogin(login), auth.salt), auth.loginHash)) return false;
  if (auth.passwordHash) return equal(hash(String(password), auth.salt), auth.passwordHash);
  return checkPassword(password);
}
