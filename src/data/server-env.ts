import { readFileSync } from "node:fs";
import { join } from "node:path";

export type ApiConnSnap = {
  id?: string;
  enabled?: boolean;
  fields?: { key?: string; value?: string }[];
};

/** Кабинет API: поле с ключом. Выключенный контур — пусто, не .env. */
export function valueFromApiConns(conns: ApiConnSnap[] | undefined, key: string): { owned: boolean; disabled: boolean; value: string } {
  let owned = false;
  let disabled = false;
  let value = "";
  for (const c of conns || []) {
    const field = (c.fields || []).find((f) => f.key === key);
    if (!field) continue;
    owned = true;
    if (c.enabled === false) {
      disabled = true;
      continue;
    }
    disabled = false;
    const v = String(field.value || "").trim();
    if (v) return { owned: true, disabled: false, value: v };
  }
  return { owned, disabled, value };
}

function fromAdmin(key: string) {
  try {
    const raw = JSON.parse(readFileSync(join(process.cwd(), "storage", "api-keys.json"), "utf8")) as {
      conns?: ApiConnSnap[];
    };
    return valueFromApiConns(raw.conns, key);
  } catch {
    return { owned: false, disabled: false, value: "" };
  }
}

function fromEnvFile(key: string) {
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

/** Правда — кабинет API. .env и process.env только если в админке нет значения. */
export function serverEnv(key: string) {
  const admin = fromAdmin(key);
  if (admin.owned && admin.disabled) return "";
  if (admin.value) return admin.value;
  const dyn = String((globalThis as { process?: { env?: Record<string, string> } }).process?.env?.[key] || "").trim();
  if (dyn) return dyn;
  return fromEnvFile(key);
}
