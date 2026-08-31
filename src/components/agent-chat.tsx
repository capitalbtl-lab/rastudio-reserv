"use client";

import { useEffect, useRef, useState } from "react";
import { X, Send, Mic, Volume2 } from "lucide-react";
import { chatAgent } from "@/data/agent-chat";
import { speakAgent } from "@/data/agent-voice";
import { nextChips } from "@/data/agent-chips";
import { PageLink } from "@/components/page-link";
import { SITE } from "@/data/site";
import { cn } from "@/lib/utils";

type Rec = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function speechCtor() {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}
type Msg = { role: "user" | "assistant"; content: string };
type Mood = "hello" | "think" | "happy" | "sorry";

const HELLO =
  "Подберу курс за минуту. Сначала возраст — так не предложим слишком сложное и не обидим младших.";

const ROBOT: Record<Mood, { src: string; alt: string }> = {
  hello: { src: "/brand/agent/hello.webp", alt: "Робот-администратор улыбается" },
  think: { src: "/brand/agent/think.webp", alt: "Робот-администратор думает" },
  happy: { src: "/brand/agent/happy.webp", alt: "Робот-администратор радуется" },
  sorry: { src: "/brand/agent/sorry.webp", alt: "Робот-администратор извиняется" },
};

function moodOf(messages: Msg[], busy: boolean): Mood {
  if (busy) return "think";
  const last = [...messages].reverse().find((m) => m.role === "assistant")?.content || "";
  if (/заявк|записал|принял|готово|свяжется/i.test(last)) return "happy";
  if (/позвоните|ошиб|не удалось|не отвеч|сеть/i.test(last)) return "sorry";
  return "hello";
}

function Robot({ mood, size, live }: { mood: Mood; size: number; live?: boolean }) {
  const r = ROBOT[mood];
  const cls = cn(
    "robot-face overflow-hidden rounded-full bg-[#f3efe6] object-cover shadow-[0_8px_20px_-8px_rgba(18,20,26,0.45)]",
    !(live && mood === "hello") && `robot-${mood}`,
  );
  const style = { width: size, height: size };
  if (live && mood === "hello") {
    return (
      <video
        src="/brand/agent/idle.mp4"
        autoPlay
        loop
        muted
        playsInline
        poster={r.src}
        width={size}
        height={size}
        className={cls}
        style={style}
        aria-label={r.alt}
      />
    );
  }
  return <img src={r.src} alt={r.alt} width={size} height={size} className={cls} style={style} />;
}

export function AgentChat() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: HELLO }]);
  const endRef = useRef<HTMLDivElement>(null);
  const voiceOnRef = useRef(false);
  const recRef = useRef<Rec | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mood = moodOf(messages, busy);
  const offer = nextChips(messages);
  voiceOnRef.current = voiceOn;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, mood, listening]);

  useEffect(() => {
    return () => {
      recRef.current?.stop();
      audioRef.current?.pause();
    };
  }, []);

  function stopListen() {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  }

  async function speak(phrase: string) {
    stopListen();
    setSpeaking(true);
    try {
      const res = await speakAgent({ data: { text: phrase } });
      if (!res.ok || !("audio" in res) || !res.audio) return;
      await new Promise<void>((resolve) => {
        const audio = new Audio(res.audio);
        audioRef.current = audio;
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        void audio.play().catch(() => resolve());
      });
    } finally {
      setSpeaking(false);
      audioRef.current = null;
    }
  }

  function startListen() {
    const SR = speechCtor();
    if (!SR) return;
    stopListen();
    const rec = new SR();
    rec.lang = "ru-RU";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const said = e.results[0]?.[0]?.transcript?.trim();
      if (said) void send(said);
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };
    rec.onerror = () => {
      setListening(false);
      recRef.current = null;
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function send(value?: string) {
    const next = (value ?? text).trim();
    if (!next || busy) return;
    setText("");
    stopListen();
    const history = [...messages, { role: "user" as const, content: next }];
    setMessages(history);
    setBusy(true);
    let reply = `Не отправилось. Позвоните ${SITE.phone}.`;
    try {
      const res = await chatAgent({ data: { messages: history } });
      reply = res.ok ? res.reply : res.error;
    } catch {
      /* keep */
    }
    setMessages([...history, { role: "assistant", content: reply }]);
    setBusy(false);
    if (voiceOnRef.current) {
      await speak(reply);
      if (voiceOnRef.current) startListen();
    }
  }

  async function toggleVoice() {
    if (voiceOn) {
      setVoiceOn(false);
      stopListen();
      audioRef.current?.pause();
      return;
    }
    setVoiceOn(true);
    const last = [...messages].reverse().find((m) => m.role === "assistant")?.content;
    if (last) await speak(last);
    if (voiceOnRef.current || true) {
      voiceOnRef.current = true;
      startListen();
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] md:inset-auto md:bottom-6 md:right-6">
      {open ? (
        <div className="pointer-events-auto mx-3 mb-[4.75rem] flex h-[min(38rem,76dvh)] flex-col overflow-hidden rounded-[1.85rem] bg-white ring-[3px] ring-white shadow-[0_28px_70px_-18px_rgba(9,12,18,0.55)] md:mx-0 md:mb-0 md:h-[38rem] md:w-[25rem]">
          <div className="relative bg-primary px-4 pb-5 pt-3.5 text-primary-foreground">
            <div className="absolute right-3 top-3 flex gap-1">
              <button
                type="button"
                className={cn(
                  "grid size-9 place-items-center rounded-full",
                  voiceOn ? "bg-white text-primary" : "bg-black/15 hover:bg-black/25",
                )}
                onClick={() => void toggleVoice()}
                aria-label={voiceOn ? "Выключить голос Алисы" : "Включить голос Алисы"}
              >
                <Volume2 className="size-4" />
              </button>
              <button
                type="button"
                className="grid size-9 place-items-center rounded-full bg-black/15 hover:bg-black/25"
                onClick={() => {
                  setOpen(false);
                  setVoiceOn(false);
                  stopListen();
                  audioRef.current?.pause();
                }}
                aria-label="Закрыть чат"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex items-end gap-3 pr-20">
              <div className="-mb-10 shrink-0">
                <Robot mood={mood} size={88} live />
              </div>
              <div className="min-w-0 pb-1">
                <p className="font-display text-[1.15rem] leading-tight">Олег</p>
                <p className="text-[0.78rem] text-white/85">
                  {speaking ? "Говорит голосом Алисы" : listening ? "Слушает вас" : "Администратор студии · онлайн"}
                </p>
              </div>
            </div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto bg-[#eef1f7] px-3.5 pb-4 pt-12">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex items-end gap-2", m.role === "user" && "justify-end")}>
                {m.role === "assistant" ? <Robot mood={i === messages.length - 1 ? mood : "hello"} size={36} /> : null}
                <div
                  className={cn(
                    "max-w-[78%] px-3.5 py-2.5 text-[0.92rem] leading-relaxed",
                    m.role === "assistant"
                      ? "rounded-2xl rounded-bl-md bg-white text-fg shadow-[0_8px_24px_-16px_rgba(18,20,26,0.4)]"
                      : "rounded-2xl rounded-br-md bg-header text-header-fg",
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {messages.length && !busy ? (
              <div className="pl-11">
                <p className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">{offer.hint}</p>
                <div className="flex flex-wrap gap-1.5">
                  {offer.chips.map((chip) =>
                    chip.href ? (
                      chip.href.startsWith("/") ? (
                        <PageLink
                          key={chip.label}
                          to={chip.href}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-[0.78rem] font-semibold",
                            chip.primary
                              ? "bg-primary text-primary-foreground"
                              : "bg-white text-fg shadow-[var(--shadow-border)] hover:bg-primary hover:text-primary-foreground",
                          )}
                        >
                          {chip.label}
                        </PageLink>
                      ) : (
                        <a
                          key={chip.label}
                          href={chip.href}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-[0.78rem] font-semibold",
                            chip.primary
                              ? "bg-primary text-primary-foreground"
                              : "bg-white text-fg shadow-[var(--shadow-border)] hover:bg-primary hover:text-primary-foreground",
                          )}
                        >
                          {chip.label}
                        </a>
                      )
                    ) : (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => void send(chip.send || chip.label)}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-[0.78rem] font-semibold",
                          chip.primary
                            ? "bg-primary text-primary-foreground"
                            : "bg-white text-fg shadow-[var(--shadow-border)] hover:bg-primary hover:text-primary-foreground",
                        )}
                      >
                        {chip.label}
                      </button>
                    ),
                  )}
                </div>
              </div>
            ) : null}
            {busy ? <p className="pl-11 text-xs font-medium text-muted">Олег думает…</p> : null}
            <div ref={endRef} />
          </div>
          <form
            className="border-t border-black/5 bg-white px-3 pb-3 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <div className="flex items-center gap-2 rounded-full bg-[#eef1f7] p-1 ring-1 ring-black/8 focus-within:ring-2 focus-within:ring-primary/40">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Возраст и город — подберём курс"
                className="h-10 flex-1 bg-transparent px-3.5 text-sm outline-none"
                maxLength={1000}
              />
              <button
                type="button"
                className={cn(
                  "grid size-10 place-items-center rounded-full",
                  listening ? "bg-primary text-primary-foreground" : "text-muted hover:bg-black/5",
                )}
                onClick={() => (listening ? stopListen() : startListen())}
                aria-label="Голосовой ввод"
              >
                <Mic className="size-4" />
              </button>
              <button
                type="submit"
                disabled={busy || !text.trim()}
                className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
                aria-label="Отправить"
              >
                <Send className="size-4" />
              </button>
            </div>
            <p className="px-3 pt-1.5 text-[0.65rem] text-muted">
              {voiceOn ? "Голосовой режим · Алиса" : `Пробное без обязательств · ${SITE.phone}`}
            </p>
          </form>
        </div>
      ) : null}
      {open ? null : (
        <div className="pointer-events-auto absolute bottom-[4.85rem] right-3 md:static">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="agent-fab relative inline-flex h-[3.65rem] items-center gap-2 overflow-visible rounded-full bg-white py-1 pl-1 pr-4 text-fg ring-[3px] ring-white shadow-[0_16px_40px_-12px_rgba(32,94,220,0.55)] md:h-[4.1rem] md:pr-5"
            aria-label="Написать роботу-администратору"
          >
            <span className="agent-fab-ring pointer-events-none absolute inset-0 rounded-full bg-primary/25" aria-hidden />
            <span className="relative">
              <Robot mood="hello" size={52} live />
              <span className="absolute bottom-0.5 right-0.5 size-2.5 rounded-full bg-[#6BDB03] ring-2 ring-white" />
            </span>
            <span className="relative pr-1 text-left leading-tight">
              <span className="block font-display text-[0.95rem] font-semibold md:text-[1.05rem]">Подобрать курс</span>
              <span className="block text-[0.7rem] font-medium text-muted">Администратор онлайн</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
