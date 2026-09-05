/** Разбор входящих ВК / MAX / Novofon. Без сети. */

export type HookChannel = "vk" | "max" | "phone";

export type HookEvent = {
  channel: HookChannel;
  peerId: string;
  text: string;
  phone?: string;
  kind: "message" | "confirm" | "start" | "ignore";
};

export type InboxChip = { label: string; send?: string; href?: string; primary?: boolean };

export type InboxThread = {
  id: string;
  channel: HookChannel;
  peerId: string;
  phone?: string;
  customerId?: number;
  messages: { role: "user" | "assistant"; content: string }[];
  at: string;
};

export type InboxEvent = {
  at: string;
  channel: HookChannel;
  kind: string;
  peerId: string;
  text: string;
  ok: boolean;
  error?: string;
};

export function asHookChannel(raw?: string | null): HookChannel | "" {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "vk" || s === "vkontakte" || s === "вк") return "vk";
  if (s === "max") return "max";
  if (s === "phone" || s === "novofon" || s === "call" || s === "sms") return "phone";
  return "";
}

export function publicReply(reply: string) {
  return String(reply || "")
    .replace(/^(олег|ольга):\s*/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function threadId(channel: string, peerId: string) {
  return `${channel}:${String(peerId || "").slice(0, 80)}`;
}

export function phoneOf(raw?: string) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 11 && (d.startsWith("7") || d.startsWith("8"))) return `7${d.slice(1)}`;
  if (d.length === 10 && d.startsWith("9")) return `7${d}`;
  return d.length >= 10 ? d : "";
}

function str(v: unknown) {
  return v == null ? "" : String(v);
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function payloadText(raw: unknown) {
  const s = str(raw).trim();
  if (!s) return "";
  if (s.startsWith("{") || s.startsWith("[")) {
    try {
      const j = JSON.parse(s) as { send?: string; text?: string; label?: string; command?: string };
      return str(j.send || j.text || j.label || j.command);
    } catch {
      return s;
    }
  }
  return s;
}

export function parseHook(channel: string, body: unknown, query: Record<string, string> = {}): HookEvent | null {
  const ch = asHookChannel(channel);
  if (!ch) return null;
  const q = query;
  const b = obj(body);
  const nested = obj(b.update);
  const pack = Object.keys(nested).length ? { ...b, ...nested } : b;
  if (ch === "vk") {
    const type = str(pack.type || q.type);
    if (type === "confirmation") return { channel: "vk", peerId: "0", text: "", kind: "confirm" };
    const msg = obj(obj(pack.object).message || obj(pack.object).object || pack.message);
    const text = str(msg.text || pack.text) || payloadText(msg.payload);
    const peer = str(msg.from_id || msg.peer_id || pack.from_id || q.user_id);
    if (type === "message_new" || type === "message_reply" || text) {
      if (!peer) return { channel: "vk", peerId: "0", text: "", kind: "ignore" };
      return { channel: "vk", peerId: peer, text, kind: text ? "message" : "ignore" };
    }
    return { channel: "vk", peerId: peer || "0", text: "", kind: "ignore" };
  }
  if (ch === "max") {
    const type = str(pack.update_type || pack.updateType || q.update_type);
    const message = obj(pack.message);
    const sender = obj(message.sender || pack.user || pack.sender);
    const bodyMsg = obj(message.body);
    const cb = obj(pack.callback);
    const text = str(bodyMsg.text || message.text || cb.payload || pack.text);
    const peer = str(
      sender.user_id ||
        message.user_id ||
        obj(message.recipient).user_id ||
        obj(message.recipient).chat_id ||
        pack.user_id ||
        pack.chat_id,
    );
    if (type === "bot_started" || type === "bot_added") {
      return { channel: "max", peerId: peer || "0", text: text || "Подбираем курс впервые", kind: "start" };
    }
    if (type === "message_created" || type === "message_callback" || text) {
      if (!peer) return { channel: "max", peerId: "0", text: "", kind: "ignore" };
      return { channel: "max", peerId: peer, text, kind: text ? "message" : "ignore" };
    }
    return { channel: "max", peerId: peer || "0", text: "", kind: "ignore" };
  }
  const event = str(pack.event || pack.type || q.event || q.type).toUpperCase();
  const text = str(pack.text || pack.message || pack.recognized || pack.speech_text || q.text || q.message);
  const clid = str(pack.clid || pack.caller_id || pack.caller || pack.number || q.clid || q.caller_id || q.number);
  const peer = phoneOf(clid) || str(pack.pbx_call_id || q.pbx_call_id || clid);
  const phone = phoneOf(clid);
  if (/SMS|MESSAGE|NOTIFY_IVR|RECOGNIZE/.test(event) || (text && !/^NOTIFY_/.test(event))) {
    return { channel: "phone", peerId: peer || phone || "0", text, phone, kind: text ? "message" : "ignore" };
  }
  if (/NOTIFY_START|NOTIFY_OUT_START|INCOMING/.test(event)) {
    return {
      channel: "phone",
      peerId: peer || phone || "0",
      text: phone ? `Телефон ${phone}` : "",
      phone,
      kind: phone ? "start" : "ignore",
    };
  }
  return { channel: "phone", peerId: peer || "0", text: "", phone, kind: "ignore" };
}

export function appendTurn(thread: InboxThread, user: string, assistant: string): InboxThread {
  const messages = thread.messages.slice();
  if (user) messages.push({ role: "user", content: user.slice(0, 2500) });
  if (assistant) messages.push({ role: "assistant", content: assistant.slice(0, 2500) });
  return { ...thread, messages: messages.slice(-40), at: new Date().toISOString() };
}

export function greetingFor(channel: HookChannel, who: "oleg" | "olga" = "olga") {
  const name = who === "olga" ? "Ольга" : "Олег";
  if (channel === "phone") {
    return `${name}: Здравствуйте, студия «Развивайся». Вы уже занимаетесь у нас или подбираете впервые?`;
  }
  return `${name}: Здравствуйте. Я ${name}, студия «Развивайся». Вы уже занимаетесь у нас или подбираете впервые?`;
}

export function vkKeyboard(chips: InboxChip[]) {
  const rows: { action: { type: string; label: string; payload?: string; link?: string } }[][] = [];
  const live = chips.filter((c) => c.send || c.label || c.href).slice(0, 8);
  for (let i = 0; i < live.length; i += 2) {
    rows.push(
      live.slice(i, i + 2).map((c) =>
        c.href
          ? { action: { type: "open_link", label: String(c.label).slice(0, 40), link: c.href } }
          : { action: { type: "text", label: String(c.label).slice(0, 40), payload: String(c.send || c.label).slice(0, 250) } },
      ),
    );
  }
  return rows.length ? { one_time: true, buttons: rows } : null;
}

export function maxKeyboard(chips: InboxChip[]) {
  const live = chips.filter((c) => c.send || c.label).slice(0, 6);
  if (!live.length) return null;
  return [
    {
      type: "inline_keyboard",
      payload: {
        buttons: live.map((c) => [
          c.href
            ? { type: "link", text: String(c.label).slice(0, 40), url: c.href }
            : {
                type: "callback",
                text: String(c.label).slice(0, 40),
                payload: String(c.send || c.label).slice(0, 250),
              },
        ]),
      },
    },
  ];
}

export function duplicateTurn(thread: InboxThread | undefined, text: string, windowMs = 12000) {
  if (!thread || !text) return false;
  const last = [...thread.messages].reverse().find((m) => m.role === "user");
  if (!last || last.content !== text) return false;
  const at = Date.parse(thread.at || "");
  return Number.isFinite(at) && Date.now() - at < windowMs;
}
