import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { serverEnv } from "./server-env";
import { loadBrain } from "./agent-config";
import { chipsForReply } from "./agent-chips";
import {
  appendTurn,
  asHookChannel,
  duplicateTurn,
  greetingFor,
  parseHook,
  threadId,
  type HookChannel,
  type HookEvent,
  type InboxEvent,
  type InboxThread,
} from "./agent-inbox-core";
import { connOn, hookUrlOf, sendChannel } from "./agent-outbox";

type InboxStore = { threads: InboxThread[]; events: InboxEvent[] };

function fileOf() {
  return join(process.cwd(), "storage", "agent-inbox.json");
}

function loadStore(): InboxStore {
  try {
    if (!existsSync(fileOf())) return { threads: [], events: [] };
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<InboxStore>;
    return {
      threads: Array.isArray(raw.threads) ? raw.threads : [],
      events: Array.isArray(raw.events) ? raw.events : [],
    };
  } catch {
    return { threads: [], events: [] };
  }
}

function saveStore(store: InboxStore) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(
    fileOf(),
    JSON.stringify({ threads: store.threads.slice(0, 80), events: store.events.slice(0, 40) }, null, 0),
    "utf8",
  );
}

function eqSecret(got: string, want: string) {
  const a = Buffer.from(String(got || ""));
  const b = Buffer.from(String(want || ""));
  if (!a.length || !b.length || a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function headerOf(headers: Record<string, string>, name: string) {
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers || {})) {
    if (k.toLowerCase() === want) return String(v || "");
  }
  return "";
}

function novofonSign(body: Record<string, unknown>, query: Record<string, string>) {
  const event = String(body.event || body.type || query.event || query.type || "").toUpperCase();
  const g = (k: string) => String(body[k] ?? query[k] ?? "");
  if (event === "NOTIFY_ANSWER") return g("caller_id") + g("destination") + g("call_start");
  if (event === "NOTIFY_OUT_START" || event === "NOTIFY_OUT_END") return g("internal") + g("destination") + g("call_start");
  if (event === "NOTIFY_RECORD") return g("pbx_call_id") + g("call_id_with_rec");
  return g("caller_id") + g("called_did") + g("call_start");
}

export function hookAuthorized(channel: HookChannel, body: unknown, query: Record<string, string>, headers: Record<string, string>) {
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  if (channel === "vk") {
    const want = serverEnv("VK_SECRET");
    if (!want) return true;
    return eqSecret(String(b.secret || query.secret || ""), want);
  }
  if (channel === "max") {
    const want = serverEnv("MAX_SECRET");
    if (!want) return true;
    const got = headerOf(headers, "x-max-bot-api-secret") || String(query.secret || b.secret || "");
    return eqSecret(got, want);
  }
  const hookKey = serverEnv("AGENT_HOOK_KEY") || serverEnv("NOVOFON_NOTIFY_SECRET");
  if (hookKey && eqSecret(String(query.key || query.secret || b.key || ""), hookKey)) return true;
  const secret = serverEnv("NOVOFON_SECRET");
  if (!secret && !hookKey) return true;
  if (!secret) return false;
  const sig = headerOf(headers, "signature") || headerOf(headers, "x-hub-signature") || String(query.signature || b.signature || "");
  if (!sig) return !hookKey;
  const raw = novofonSign(b, query);
  const calc = createHmac("sha1", secret).update(raw).digest("base64");
  return eqSecret(sig, calc);
}

function whoOf(): "oleg" | "olga" {
  try {
    return loadBrain().settings.defaultPartner === "oleg" ? "oleg" : "olga";
  } catch {
    return "olga";
  }
}

function rememberEvent(ev: InboxEvent) {
  const store = loadStore();
  store.events.unshift(ev);
  saveStore({ ...store, events: store.events.slice(0, 40) });
}

function threadOf(channel: HookChannel, peerId: string, phone?: string): InboxThread {
  const store = loadStore();
  const id = threadId(channel, peerId);
  const hit = store.threads.find((t) => t.id === id);
  if (hit) {
    if (phone && !hit.phone) hit.phone = phone;
    return hit;
  }
  return { id, channel, peerId, phone, messages: [], at: new Date().toISOString() };
}

function putThread(next: InboxThread) {
  const store = loadStore();
  const i = store.threads.findIndex((t) => t.id === next.id);
  if (i >= 0) store.threads[i] = next;
  else store.threads.unshift(next);
  store.threads.sort((a, b) => (a.at < b.at ? 1 : -1));
  saveStore({ ...store, threads: store.threads.slice(0, 80) });
}

function stampComms(opts: { channel: string; phone?: string; customerId?: number; incoming?: string; reply?: string }) {
  if (!opts.incoming && !opts.reply) return;
  void import("./crm-comms").then((m) =>
    m.rememberConsultantTurn({
      customerId: opts.customerId,
      channel: opts.channel,
      phone: opts.phone,
      incoming: opts.incoming,
      reply: opts.reply,
    }),
  );
}

async function runReply(ev: HookEvent) {
  const who = whoOf();
  let thread = threadOf(ev.channel, ev.peerId, ev.phone);
  if (ev.kind === "start" && thread.messages.length > 0) return { ok: true as const, reply: "", skipped: true };
  if (duplicateTurn(thread, ev.text)) return { ok: true as const, reply: "", skipped: true };

  const startEmpty = ev.kind === "start" && thread.messages.length === 0;
  if (startEmpty) {
    const greet = greetingFor(ev.channel, who);
    const seed = ev.text && ev.channel === "phone" ? appendTurn({ ...thread, messages: [] }, ev.text, "") : thread;
    const withGreet = appendTurn(seed, "", greet);
    const chips = chipsForReply(greet, withGreet.messages);
    const sent = await sendChannel(ev.channel, ev.peerId, greet, chips.chips, ev.phone || thread.phone);
    putThread(withGreet);
    try {
      const { upsertSession } = await import("./chat-logs");
      upsertSession({ id: withGreet.id, path: `/${ev.channel}`, partner: who, messages: withGreet.messages });
    } catch {
      /* лог */
    }
    rememberEvent({
      at: new Date().toISOString(),
      channel: ev.channel,
      kind: ev.kind,
      peerId: ev.peerId,
      text: ev.text.slice(0, 140),
      ok: sent.ok,
      error: sent.ok ? undefined : sent.error,
    });
    return sent;
  }

  const { chatAgent } = await import("./agent-chat");
  const incoming = ev.text || (ev.kind === "start" ? "Здравствуйте" : "");
  const history = appendTurn(thread, incoming, "");
  const res = await chatAgent({
    data: {
      messages: history.messages,
      ip: `${ev.channel}:${ev.peerId}`,
      with: who,
      channel: ev.channel,
      voice: ev.channel === "phone",
      path: `/${ev.channel}`,
      phone: ev.phone || thread.phone,
    },
  });
  const reply = res.ok && "reply" in res ? String(res.reply || "") : "";
  const fromAgent = res.ok && "groups" in res && Array.isArray(res.groups) ? res.groups : [];
  const chips = fromAgent.length
    ? fromAgent
    : chipsForReply(reply, [...history.messages, { role: "assistant" as const, content: reply }]).chips;
  const next = appendTurn(history, "", reply);
  putThread(next);
  stampComms({
    channel: ev.channel,
    phone: ev.phone || thread.phone,
    customerId: thread.customerId,
    incoming,
    reply,
  });
  try {
    const { upsertSession } = await import("./chat-logs");
    upsertSession({ id: next.id, path: `/${ev.channel}`, partner: who, messages: next.messages });
  } catch {
    /* лог */
  }
  if (!reply) {
    rememberEvent({
      at: new Date().toISOString(),
      channel: ev.channel,
      kind: ev.kind,
      peerId: ev.peerId,
      text: incoming.slice(0, 140),
      ok: false,
      error: res.ok ? "Пустой ответ" : ("error" in res ? res.error : "Нет ответа"),
    });
    return { ok: false as const, error: "Пустой ответ" };
  }
  const sent = await sendChannel(ev.channel, ev.peerId, reply, chips, ev.phone || thread.phone);
  rememberEvent({
    at: new Date().toISOString(),
    channel: ev.channel,
    kind: ev.kind,
    peerId: ev.peerId,
    text: incoming.slice(0, 140),
    ok: sent.ok,
    error: sent.ok ? undefined : sent.error,
  });
  return sent;
}

export type HookResult = { status: number; text: string };

export async function handleWebhook(opts: {
  channel: string;
  method?: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}): Promise<HookResult> {
  const channel = asHookChannel(opts.channel);
  const query = opts.query || {};
  if (query.zd_echo) return { status: 200, text: String(query.zd_echo) };
  if (!channel) return { status: 404, text: "unknown channel" };
  const ev = parseHook(channel, opts.body, query);
  if (!ev) return { status: 404, text: "unknown channel" };
  if (ev.kind === "confirm") {
    const code = serverEnv("VK_CONFIRMATION");
    return { status: 200, text: code || "ok" };
  }
  if (!connOn(channel === "phone" ? "novofon" : channel)) return { status: 200, text: "ok" };
  if (!hookAuthorized(channel, opts.body, query, opts.headers || {})) {
    rememberEvent({
      at: new Date().toISOString(),
      channel,
      kind: "auth",
      peerId: ev.peerId,
      text: "",
      ok: false,
      error: "Секрет не подошёл",
    });
    return { status: 403, text: "forbidden" };
  }
  if (ev.kind === "ignore") return { status: 200, text: "ok" };
  try {
    if (channel === "phone" && ev.kind === "start") {
      void runReply(ev).catch(() => null);
      return { status: 200, text: "ok" };
    }
    await runReply(ev);
  } catch (e) {
    rememberEvent({
      at: new Date().toISOString(),
      channel,
      kind: ev.kind,
      peerId: ev.peerId,
      text: ev.text.slice(0, 140),
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 180) : "ошибка",
    });
  }
  return { status: 200, text: "ok" };
}

export function inboxStatus() {
  const store = loadStore();
  const vkOn = connOn("vk") && Boolean(serverEnv("VK_GROUP_TOKEN"));
  const maxOn = connOn("max") && Boolean(serverEnv("MAX_BOT_TOKEN"));
  const phoneOn = connOn("novofon") && Boolean(serverEnv("NOVOFON_USER_KEY") && serverEnv("NOVOFON_SECRET"));
  return {
    hooks: {
      vk: hookUrlOf("vk"),
      max: hookUrlOf("max"),
      phone: hookUrlOf("phone"),
    },
    keys: {
      vk: { token: Boolean(serverEnv("VK_GROUP_TOKEN")), secret: Boolean(serverEnv("VK_SECRET")), confirmation: Boolean(serverEnv("VK_CONFIRMATION")), groupId: serverEnv("VK_GROUP_ID") },
      max: { token: Boolean(serverEnv("MAX_BOT_TOKEN")), secret: Boolean(serverEnv("MAX_SECRET")) },
      phone: { user: Boolean(serverEnv("NOVOFON_USER_KEY")), secret: Boolean(serverEnv("NOVOFON_SECRET")), notify: Boolean(serverEnv("NOVOFON_NOTIFY_SECRET") || serverEnv("AGENT_HOOK_KEY")) },
    },
    enabled: { vk: vkOn, max: maxOn, phone: phoneOn, site: true },
    last: store.events.slice(0, 12),
    threads: store.threads.slice(0, 12).map((t) => ({
      id: t.id,
      channel: t.channel,
      peerId: t.peerId,
      phone: t.phone || "",
      turns: t.messages.length,
      at: t.at,
      preview: [...t.messages].reverse().find((m) => m.role === "user")?.content.slice(0, 120) || "",
    })),
  };
}