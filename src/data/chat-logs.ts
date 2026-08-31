import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { buildSessionNote, type SessionNote } from "./session-note";
import { dossierFromNote } from "./dossiers";

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type ChatSession = {
  id: string;
  started: string;
  updated: string;
  path: string;
  partner: string;
  voice: boolean;
  admin: boolean;
  closed?: boolean;
  messages: ChatTurn[];
  note?: SessionNote;
};

const MAX = 400;
const MAX_MSG = 200;

function filePath() {
  return join(process.cwd(), "storage", "chat-logs.json");
}

function loadAll(): ChatSession[] {
  try {
    if (!existsSync(filePath())) return [];
    const raw = JSON.parse(readFileSync(filePath(), "utf8")) as { sessions?: ChatSession[] };
    return Array.isArray(raw.sessions) ? raw.sessions : [];
  } catch {
    return [];
  }
}

function saveAll(sessions: ChatSession[]) {
  mkdirSync(dirname(filePath()), { recursive: true });
  writeFileSync(filePath(), JSON.stringify({ sessions: sessions.slice(0, MAX) }, null, 0), "utf8");
}

function previewOf(messages: ChatTurn[]) {
  const last = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  return last.replace(/\s+/g, " ").trim().slice(0, 140);
}

export function upsertSession(patch: {
  id: string;
  path?: string;
  partner?: string;
  voice?: boolean;
  admin?: boolean;
  closed?: boolean;
  messages?: ChatTurn[];
}) {
  const id = String(patch.id || "").slice(0, 80);
  if (!id) return { ok: false as const };
  const now = new Date().toISOString();
  const all = loadAll();
  const idx = all.findIndex((s) => s.id === id);
  const prev = idx >= 0 ? all[idx] : null;
  const messages = (patch.messages || prev?.messages || []).slice(-MAX_MSG).map((m) => ({
    role: m.role === "user" ? ("user" as const) : ("assistant" as const),
    content: String(m.content || "").slice(0, 2500),
  }));
  if (messages.length < 2) return { ok: true as const };
  const next: ChatSession = {
    id,
    started: prev?.started || now,
    updated: now,
    path: String(patch.path || prev?.path || "/").slice(0, 180),
    partner: String(patch.partner || prev?.partner || "both").slice(0, 12),
    voice: Boolean(patch.voice ?? prev?.voice),
    admin: Boolean(patch.admin ?? prev?.admin),
    closed: Boolean(patch.closed ?? prev?.closed),
    messages,
    note: buildSessionNote(messages),
  };
  if (!next.admin && next.note && (next.note.phone || next.note.child || next.note.parent)) {
    try {
      dossierFromNote(next.note, { phone: next.note.phone, chatId: id, branchId: next.note.branchId });
    } catch {
      /* */
    }
  }
  if (idx >= 0) all[idx] = next;
  else all.unshift(next);
  all.sort((a, b) => (a.updated < b.updated ? 1 : -1));
  saveAll(all);
  return { ok: true as const };
}

export function recentChatsForTrain(limit = 40) {
  return loadAll()
    .filter((s) => !s.admin)
    .slice(0, limit)
    .map((s) => ({
      id: s.id,
      updated: s.updated,
      path: s.path,
      messages: s.messages.slice(-24),
    }));
}

export const saveChatLog = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        id: string;
        path?: string;
        partner?: string;
        voice?: boolean;
        admin?: boolean;
        closed?: boolean;
        messages: ChatTurn[];
      },
  )
  .handler(async ({ data }) => upsertSession(data));

export const adminChatLogs = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; id?: string })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const all = loadAll();
    if (data.id) {
      const one = all.find((s) => s.id === data.id);
      if (!one) return { ok: false as const, error: "Диалог не найден." };
      return { ok: true as const, session: one, total: all.length };
    }
    return {
      ok: true as const,
      total: all.length,
      sessions: all.slice(0, 120).map((s) => {
        const note = s.note || buildSessionNote(s.messages);
        return {
        id: s.id,
        started: s.started,
        updated: s.updated,
        path: s.path,
        partner: s.partner,
        voice: s.voice,
        admin: s.admin,
        closed: Boolean(s.closed),
        turns: s.messages.length,
        preview: previewOf(s.messages),
        essence: note.essence || "",
        details: note.details || [],
        next: note.next || "",
        age: note.age || null,
        city: note.city || "",
        branch: note.branch || "",
        school: note.school || "",
        course: note.course || "",
        service: note.service || "",
      };
      }),
    };
  });
