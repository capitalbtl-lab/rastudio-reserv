"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { chatAgent } from "@/data/agent-chat";
import { SITE } from "@/data/site";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const HELLO =
  "Здравствуйте! Подберу курс и запишу на пробное. Сколько лет ребёнку и какой филиал удобнее — Коломна или Луховицы?";

export function AgentChat() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: HELLO }]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function send() {
    const next = text.trim();
    if (!next || busy) return;
    setText("");
    const history = [...messages, { role: "user" as const, content: next }];
    setMessages(history);
    setBusy(true);
    try {
      const res = await chatAgent({ data: { messages: history } });
      setMessages([
        ...history,
        {
          role: "assistant",
          content: res.ok ? res.reply : res.error,
        },
      ]);
    } catch {
      setMessages([
        ...history,
        { role: "assistant", content: `Не отправилось. Позвоните ${SITE.phone}.` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] md:inset-auto md:bottom-6 md:right-6">
      {open ? (
        <div className="pointer-events-auto mx-3 mb-[4.75rem] flex h-[min(34rem,72dvh)] flex-col overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-border-hover)] md:mx-0 md:mb-0 md:h-[34rem] md:w-[24rem]">
          <div className="flex items-center justify-between bg-header px-4 py-3 text-header-fg">
            <div>
              <p className="text-[0.72rem] uppercase tracking-[0.12em] text-header-fg/55">Студия «Развивайся»</p>
              <p className="font-display text-[1.05rem]">Администратор</p>
            </div>
            <button
              type="button"
              className="grid size-9 place-items-center rounded-full hover:bg-white/10"
              onClick={() => setOpen(false)}
              aria-label="Закрыть чат"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[0.92rem] leading-relaxed",
                  m.role === "assistant" ? "bg-surface-2 text-fg" : "ml-auto bg-header text-header-fg",
                )}
              >
                {m.content}
              </div>
            ))}
            {busy ? <p className="text-xs text-muted">Печатает…</p> : null}
            <div ref={endRef} />
          </div>
          <form
            className="flex gap-2 border-t border-border px-3 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Напишите возраст и город"
              className="h-11 flex-1 rounded-full bg-bg px-4 text-sm outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/40"
              maxLength={1000}
            />
            <button
              type="submit"
              disabled={busy || !text.trim()}
              className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
              aria-label="Отправить"
            >
              <Send className="size-4" />
            </button>
          </form>
        </div>
      ) : null}
      {open ? null : (
        <div className="pointer-events-auto absolute bottom-[4.85rem] right-3 md:static">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="agent-fab relative inline-flex h-14 items-center gap-2.5 overflow-visible rounded-full bg-primary px-4 text-primary-foreground shadow-[0_12px_32px_-8px_rgba(32,94,220,0.7)] md:h-16 md:px-5"
            aria-label="Написать администратору — подберём курс"
          >
            <span className="agent-fab-ring pointer-events-none absolute inset-0 rounded-full bg-primary/35" aria-hidden />
            <span className="relative grid size-10 place-items-center rounded-full bg-white/20 md:size-11">
              <span className="absolute right-0.5 top-0.5 size-2.5 rounded-full bg-[#6BDB03] ring-2 ring-primary" />
              <MessageCircle className="size-5 md:size-6" />
            </span>
            <span className="relative pr-1 text-left leading-tight">
              <span className="block font-display text-[0.95rem] font-semibold md:text-[1.05rem]">Подобрать курс</span>
              <span className="block text-[0.7rem] font-medium text-white/80">Ответим сейчас</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
