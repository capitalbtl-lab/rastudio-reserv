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
        <div className="pointer-events-auto mx-3 mb-[4.75rem] flex h-[min(32rem,70dvh)] flex-col overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-border-hover)] md:mx-0 md:mb-0 md:h-[32rem] md:w-[22.5rem]">
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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto absolute bottom-[4.6rem] right-3 grid size-14 place-items-center rounded-full bg-header text-header-fg shadow-[var(--shadow-border-hover)] md:static md:size-14"
        aria-label={open ? "Закрыть чат администратора" : "Написать администратору"}
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      </button>
    </div>
  );
}
