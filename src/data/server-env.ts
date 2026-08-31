import { readFileSync } from "node:fs";
import { join } from "node:path";

export function serverEnv(key: string) {
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
  try {
    const raw = JSON.parse(readFileSync(join(process.cwd(), "storage", "api-keys.json"), "utf8")) as {
      conns?: { enabled?: boolean; fields?: { key?: string; value?: string }[] }[];
    };
    for (const c of raw.conns || []) {
      if (c.enabled === false) continue;
      for (const f of c.fields || []) {
        if (f.key === key && String(f.value || "").trim()) return String(f.value).trim();
      }
    }
  } catch {
    /* none */
  }
  return "";
}
