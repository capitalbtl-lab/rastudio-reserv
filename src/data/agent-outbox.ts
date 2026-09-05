import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { serverEnv } from "./server-env";
import { loadNovofonKeys, novofonGet } from "./novofon";
import { publicReply, vkKeyboard, maxKeyboard, type InboxChip, type HookChannel } from "./agent-inbox-core";
import { SITE } from "./site";

function connOn(id: string) {
  try {
    if (!existsSync(join(process.cwd(), "storage", "api-keys.json"))) return true;
    const raw = JSON.parse(readFileSync(join(process.cwd(), "storage", "api-keys.json"), "utf8")) as {
      conns?: { id?: string; enabled?: boolean }[];
    };
    const hit = (raw.conns || []).find((c) => c.id === id);
    return !hit || hit.enabled !== false;
  } catch {
    return true;
  }
}

export function channelConnId(channel: string) {
  if (channel === "vk") return "vk";
  if (channel === "max") return "max";
  if (channel === "phone") return "novofon";
  return channel;
}

export async function sendVk(peerId: string, text: string, chips: InboxChip[] = []) {
  if (!connOn("vk")) return { ok: false as const, error: "ВК выключен" };
  const token = serverEnv("VK_GROUP_TOKEN");
  if (!token) return { ok: false as const, error: "Нет VK_GROUP_TOKEN" };
  const body = publicReply(text).slice(0, 3900);
  if (!body) return { ok: false as const, error: "Пустой ответ" };
  const kb = vkKeyboard(chips);
  const params = new URLSearchParams({
    access_token: token,
    v: "5.199",
    peer_id: String(peerId),
    random_id: String(Math.floor(Math.random() * 1e9)),
    message: body,
  });
  if (kb) params.set("keyboard", JSON.stringify(kb));
  const res = await fetch("https://api.vk.com/method/messages.send", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
    signal: AbortSignal.timeout(12000),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { error_msg?: string }; response?: unknown };
  if (json.error?.error_msg) return { ok: false as const, error: json.error.error_msg };
  return { ok: true as const };
}

export async function sendMax(userId: string, text: string, chips: InboxChip[] = []) {
  if (!connOn("max")) return { ok: false as const, error: "MAX выключен" };
  const token = serverEnv("MAX_BOT_TOKEN");
  if (!token) return { ok: false as const, error: "Нет MAX_BOT_TOKEN" };
  const body = publicReply(text).slice(0, 3900);
  if (!body) return { ok: false as const, error: "Пустой ответ" };
  const attachments = maxKeyboard(chips);
  const res = await fetch(`https://platform-api2.max.ru/messages?user_id=${encodeURIComponent(userId)}`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify(attachments ? { text: body, attachments } : { text: body }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    return { ok: false as const, error: err.slice(0, 180) || `MAX ${res.status}` };
  }
  return { ok: true as const };
}

export async function sendPhone(phone: string, text: string) {
  if (!connOn("novofon")) return { ok: false as const, error: "Novofon выключен" };
  const keys = loadNovofonKeys();
  if (!keys) return { ok: false as const, error: "Нет ключей Novofon" };
  const number = String(phone || "").replace(/\D/g, "");
  if (number.length < 10) return { ok: false as const, error: "Нет номера" };
  const body = publicReply(text).slice(0, 660);
  if (!body) return { ok: false as const, error: "Пустой ответ" };
  await novofonGet("/v1/sms/send/", { number, message: body }, keys);
  return { ok: true as const };
}

export async function sendChannel(channel: string, peerId: string, text: string, chips: InboxChip[] = [], phone?: string) {
  if (channel === "vk") return sendVk(peerId, text, chips);
  if (channel === "max") return sendMax(peerId, text, chips);
  if (channel === "phone") return sendPhone(phone || peerId, text);
  return { ok: false as const, error: "Канал не шлёт ответ" };
}

export function hookUrlOf(channel: HookChannel | string) {
  const ch = String(channel || "").trim().toLowerCase();
  return `${SITE.domain}/api/agent/${ch}`;
}

export async function subscribeMax(url?: string) {
  if (!connOn("max")) return { ok: false as const, error: "MAX выключен" };
  const token = serverEnv("MAX_BOT_TOKEN");
  if (!token) return { ok: false as const, error: "Нет MAX_BOT_TOKEN" };
  const secret = serverEnv("MAX_SECRET");
  const hook = url || hookUrlOf("max");
  const res = await fetch("https://platform-api2.max.ru/subscriptions", {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({
      url: hook,
      update_types: ["message_created", "bot_started", "message_callback"],
      ...(secret ? { secret } : {}),
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    return { ok: false as const, error: err.slice(0, 180) || `MAX ${res.status}` };
  }
  return { ok: true as const, url: hook };
}

export async function probeMax() {
  const token = serverEnv("MAX_BOT_TOKEN");
  if (!token) return { ok: false as const, error: "Нет MAX_BOT_TOKEN" };
  const res = await fetch("https://platform-api2.max.ru/me", {
    headers: { Authorization: token },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return { ok: false as const, error: `MAX ${res.status}` };
  const json = (await res.json().catch(() => ({}))) as { name?: string; username?: string; user_id?: number };
  return { ok: true as const, name: String(json.name || json.username || "MAX") };
}

export { connOn };
