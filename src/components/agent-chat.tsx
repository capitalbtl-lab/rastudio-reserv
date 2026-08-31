"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { chatAgent } from "@/data/agent-chat";
import { SITE } from "@/data/site";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const HELLO =
  "Здравствуйте! Я администратор студии. Подберу курс по возрасту и филиалу и запишу на пробное.";

const CHIPS = ["5 лет, Коломна", "8 лет, робототехника", "Художка 7–9", "Луховицы"];

export function AgentChat() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: HELLO }]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function send(value?: string) {
    const next = (value ?? text).trim();
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
        <div className="pointer-events-auto mx-3 mb-[4.75rem] flex h-[min(36rem,74dvh)] flex-col overflow-hidden rounded-[1.75rem] bg-[#f7f8fb] shadow-[0_24px_60px_-24px_rgba(9,12,18,0.55)] md:mx-0 md:mb-0 md:h-[36rem] md:w-[24.5rem]">
          <div className="relative overflow-hidden bg-header px-4 py-3.5 text-header-fg">
            <span className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-primary/35 blur-2xl" />
            <span className="pointer-events-none absolute -bottom-12 left-10 size-24 rounded-full bg-white/10 blur-xl" />
            <div className="relative flex items-center gap-3">
              <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-sm font-bold">
                Р
                <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-[#6BDB03] ring-2 ring-header" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[1.08rem] leading-tight">Администратор</p>
                <p className="text-[0.72rem] text-header-fg/65">Студия «Развивайся» · онлайн</p>
              </div>
              <button
                type="button"
                className="grid size-9 place-items-center rounded-full bg-white/8 hover:bg-white/14"
                onClick={() => setOpen(false)}
                aria-label="Закрыть чат"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-3.5 py-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[88%] px-3.5 py-2.5 text-[0.92rem] leading-relaxed",
                  m.role === "assistant"
                    ? "rounded-2xl rounded-tl-md bg-white text-fg shadow-[0_1px_0_rgba(18,20,26,0.04),0_8px_24px_-16px_rgba(18,20,26,0.35)]"
                    : "ml-auto rounded-2xl rounded-tr-md bg-primary text-primary-foreground",
                )}
              >
                {m.content}
              </div>
            ))}
            {messages.length === 1 && !busy ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => void send(chip)}
                    className="rounded-full bg-white px-3 py-1.5 text-[0.78rem] font-semibold text-fg shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            ) : null}
            {busy ? (
              <p className="text-xs font-medium text-muted">
                <span className="inline-flex gap-1">
                  <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                  <span className="size-1.5 animate-pulse rounded-full bg-primary delay-100" />
                  <span className="size-1.5 animate-pulse rounded-full bg-primary delay-200" />
                </span>
                <span className="ml-2">Печатает</span>
              </p>
            ) : null}
            <div ref={endRef} />
          </div>
          <form
            className="bg-white/80 px-3 pb-3 pt-2 backdrop-blur-sm"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <div className="flex items-center gap-2 rounded-full bg-white p-1 shadow-[var(--shadow-border)] focus-within:shadow-[var(--shadow-border-hover)]">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Возраст и город — подберём курс"
                className="h-10 flex-1 bg-transparent px-3.5 text-sm outline-none"
                maxLength={1000}
              />
              <button
                type="submit"
                disabled={busy || !text.trim()}
                className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
                aria-label="Отправить"
              >
                <Send className="size-4" />
              </button>
            </div>
            <p className="px-3 pt-1.5 text-[0.65rem] text-muted">Пробное без обязательств · {SITE.phone}</p>
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
