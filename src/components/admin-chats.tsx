"use client";

import { useEffect, useState } from "react";
import { adminChatLogs } from "@/data/chat-logs";
import { parseTurns } from "@/data/agent-turns";
import { cn } from "@/lib/utils";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

type Row = {
  id: string;
  started: string;
  updated: string;
  path: string;
  partner: string;
  voice: boolean;
  admin: boolean;
  closed: boolean;
  turns: number;
  preview: string;
};

export function AdminChats() {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<string>("");
  const [full, setFull] = useState<{ role: string; content: string }[] | null>(null);
  const [q, setQ] = useState("");

  async function load() {
    const res = await adminChatLogs({ data: { token: token() } });
    if (res.ok && "sessions" in res && res.sessions) setRows(res.sessions as Row[]);
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(id);
  }, []);

  async function openOne(id: string) {
    setOpen(id);
    const res = await adminChatLogs({ data: { token: token(), id } });
    if (res.ok && "session" in res && res.session) setFull(res.session.messages);
  }

  const shown = rows.filter((r) => {
    const hay = `${r.path} ${r.preview} ${r.partner}`.toLowerCase();
    return !q || hay.includes(q.toLowerCase());
  });

  return (
    <section className="mt-10 space-y-5">
      <div>
        <h2 className="font-display text-3xl">Диалоги с сайта</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Все разговоры с Олегом и Ольгой: дата, страница, голосовой режим. Сброс в чате начинает новую сессию — старая остаётся здесь.
        </p>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Поиск по странице или фразе"
        className="h-11 w-full max-w-md rounded-xl bg-surface px-3 ring-1 ring-black/10"
      />
      <p className="text-sm text-muted">{shown.length} диалогов</p>
      <div className="space-y-3">
        {shown.length ? (
          shown.map((r) => (
            <article key={r.id} className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)]">
              <button type="button" className="w-full text-left" onClick={() => void openOne(open === r.id ? "" : r.id)}>
                <p className="text-xs text-muted">
                  {when(r.started)}
                  {r.updated !== r.started ? ` → ${when(r.updated)}` : ""} · {r.path} · {r.turns} реплик
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-black/5 px-2.5 py-1 text-[0.72rem] font-medium">
                    {r.partner === "oleg" ? "Олег" : r.partner === "olga" ? "Ольга" : "Олег и Ольга"}
                  </span>
                  {r.voice ? <span className="rounded-full bg-black/5 px-2.5 py-1 text-[0.72rem] font-medium">голос</span> : null}
                  {r.admin ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[0.72rem] font-medium text-amber-900">админ</span> : null}
                  {r.closed ? <span className="rounded-full bg-black/5 px-2.5 py-1 text-[0.72rem] font-medium">сброшен</span> : null}
                </div>
                <p className="mt-2 text-sm">{r.preview || "—"}</p>
              </button>
              {open === r.id && full ? (
                <div className="mt-4 space-y-2 border-t border-black/5 pt-4">
                  {full.map((m, i) =>
                    m.role === "user" ? (
                      <p key={i} className="rounded-2xl bg-ink px-3 py-2 text-sm text-white">
                        {m.content}
                      </p>
                    ) : (
                      <div key={i} className="space-y-1">
                        {parseTurns(m.content).map((t, j) => (
                          <p key={j} className={cn("rounded-2xl bg-white px-3 py-2 text-sm ring-1 ring-black/5", t.who === "oleg" ? "" : "")}>
                            <span className="text-xs font-semibold text-muted">{t.who === "olga" ? "Ольга" : "Олег"} · </span>
                            {t.text}
                          </p>
                        ))}
                      </div>
                    ),
                  )}
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <p className="text-sm text-muted">Пока пусто — как только родитель напишет в чат, диалог появится здесь.</p>
        )}
      </div>
    </section>
  );
}