import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { serverEnv } from "./server-env";

export type AgentChannel = {
  id: string;
  label: string;
  locked?: boolean;
};

export const DEFAULT_CHANNELS: AgentChannel[] = [
  { id: "site", label: "Агент на сайте", locked: true },
  { id: "phone", label: "Агент на телефоне", locked: true },
  { id: "vk", label: "Агент в ВК", locked: true },
  { id: "max", label: "Агент в MAX", locked: true },
  { id: "common", label: "Общее для всех", locked: true },
];

function fileOf() {
  return join(process.cwd(), "storage", "agent-channels.json");
}

export function loadChannels(): AgentChannel[] {
  try {
    if (!existsSync(fileOf())) return DEFAULT_CHANNELS.map((c) => ({ ...c }));
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as { channels?: AgentChannel[] };
    const have = Array.isArray(raw.channels) ? raw.channels : [];
    const byId = new Map(have.map((c) => [c.id, c]));
    const out: AgentChannel[] = DEFAULT_CHANNELS.map((d) => ({
      ...d,
      label: byId.get(d.id)?.label || d.label,
      locked: true,
    }));
    for (const c of have) {
      if (out.some((x) => x.id === c.id)) continue;
      if (out.length >= 6) break;
      const id = String(c.id || "")
        .replace(/[^\w-]+/g, "")
        .slice(0, 24);
      if (!id) continue;
      out.push({ id, label: String(c.label || id).slice(0, 60), locked: false });
    }
    return out.slice(0, 6);
  } catch {
    return DEFAULT_CHANNELS.map((c) => ({ ...c }));
  }
}

export function saveChannels(list: AgentChannel[]) {
  const clean: AgentChannel[] = [];
  for (const c of list) {
    const id = String(c.id || "")
      .replace(/[^\w-]+/g, "")
      .slice(0, 24);
    if (!id || clean.some((x) => x.id === id)) continue;
    const locked = DEFAULT_CHANNELS.some((d) => d.id === id);
    clean.push({ id, label: String(c.label || id).slice(0, 60), locked });
    if (clean.length >= 6) break;
  }
  for (const d of DEFAULT_CHANNELS) {
    if (!clean.some((c) => c.id === d.id)) clean.push({ ...d });
  }
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify({ channels: clean.slice(0, 6) }, null, 2), "utf8");
  return loadChannels();
}

export function channelLabel(id: string) {
  return loadChannels().find((c) => c.id === id)?.label || id;
}

export function guessChannel(text: string, ids: string[]): string {
  const t = text.toLowerCase();
  if (ids.includes("vk") && /вконтакте|\bвк\b|vk\.com|сообществ|комментари\w+ вк/.test(t)) return "vk";
  if (ids.includes("max") && /\bmax\b|мессенджер макс|в макс/.test(t)) return "max";
  if (ids.includes("phone") && /телефон|звонк|входящ|исходящ|прозвон|sip|набрать/.test(t)) return "phone";
  if (ids.includes("site") && /на сайте|чат сайта|кнопк|rastudio|браузер|голосов\w+ режим/.test(t)) return "site";
  return ids.includes("common") ? "common" : ids[0] || "common";
}

export function driftOf(orig: string, next: string) {
  const a = orig.replace(/\s+/g, " ").trim();
  const b = next.replace(/\s+/g, " ").trim();
  if (!a && !b) return { accuracy: 100, drift: 0 };
  if (!a || !b) return { accuracy: 0, drift: 100 };
  if (a === b) return { accuracy: 100, drift: 0 };
  const aw = new Set(a.toLowerCase().split(/[^\p{L}\d]+/u).filter((w) => w.length > 2));
  const bw = b.toLowerCase().split(/[^\p{L}\d]+/u).filter((w) => w.length > 2);
  const hit = bw.filter((w) => aw.has(w)).length;
  const union = new Set([...aw, ...bw]).size || 1;
  const jaccard = hit / union;
  const len = Math.min(a.length, b.length) / Math.max(a.length, b.length);
  const accuracy = Math.max(0, Math.min(100, Math.round(jaccard * 0.65 * 100 + len * 35)));
  return { accuracy, drift: 100 - accuracy };
}

export async function yandexJson<T>(system: string, user: string, maxTokens = 5000): Promise<T | null> {
  const key = serverEnv("YANDEX_API_KEY");
  const folder = serverEnv("YANDEX_FOLDER_ID");
  if (!key || !folder) return null;
  const body = {
    modelUri: `gpt://${folder}/yandexgpt/latest`,
    completionOptions: { stream: false, temperature: 0.1, maxTokens },
    messages: [
      { role: "system", text: system },
      { role: "user", text: user },
    ],
  };
  for (const auth of [`Api-Key ${key}`, `Bearer ${key}`]) {
    try {
      const res = await fetch("https://llm.api.cloud.yandex.net/foundationModels/v1/completion", {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json", "x-folder-id": folder },
        body: JSON.stringify(body),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { result?: { alternatives?: { message?: { text?: string } }[] } };
      const raw = json.result?.alternatives?.[0]?.message?.text || "";
      const start = raw.indexOf("{") >= 0 ? raw.indexOf("{") : raw.indexOf("[");
      const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
      if (start < 0 || end <= start) continue;
      return JSON.parse(raw.slice(start, end + 1)) as T;
    } catch {
      /* next */
    }
  }
  return null;
}
