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
  return "";
}
