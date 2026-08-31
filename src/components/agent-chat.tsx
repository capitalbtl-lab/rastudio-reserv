"use client";

import { useEffect, useRef, useState } from "react";
import { X, Send, Mic, Volume2 } from "lucide-react";
import { chatAgent } from "@/data/agent-chat";
import { speakAgent } from "@/data/agent-voice";
import { nextChips } from "@/data/agent-chips";
import { parseTurns, faceOf, type Who } from "@/data/agent-turns";
import { PageLink } from "@/components/page-link";
import { SITE } from "@/data/site";
import { cn } from "@/lib/utils";

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: { length: number; [i: number]: { isFinal?: boolean; 0: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function speechCtor() {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}
type Msg = { role: "user" | "assistant"; content: string };
type Mood = "hello" | "think" | "happy" | "sorry";

const HELLO = `Олег: Подберём курс за минуту. Сначала возраст — так не предложим слишком сложное.
Ольга: Я рядом. Нажмите, сколько лет ребёнку — сразу скажу, что зайдёт именно ему.`;

function moodOf(messages: Msg[], busy: boolean): Mood {
  if (busy) return "think";
  const last = [...messages].reverse().find((m) => m.role === "assistant")?.content || "";
  if (/заявк|записал|принял|готово|свяжется/i.test(last)) return "happy";
  if (/позвоните|ошиб|не удалось|не отвеч|сеть/i.test(last)) return "sorry";
  return "hello";
}

function Face({ who, mood, size }: { who: Who; mood: Mood; size: number }) {
  return (
    <img
      src={faceOf(who, mood)}
      alt={who === "olga" ? "Ольга" : "Олег"}
      width={size}
      height={size}
      className={cn("robot-face overflow-hidden rounded-full bg-[#f3efe6] object-cover shadow-[0_8px_20px_-8px_rgba(18,20,26,0.45)]", `robot-${mood}`)}
      style={{ width: size, height: size }}
    />
  );
}

function Duo({ size, mood }: { size: number; mood: Mood }) {
  return (
    <div className="relative shrink-0" style={{ width: size * 1.62, height: size }}>
      <div className="absolute left-0 top-0">
        <Face who="oleg" mood={mood} size={size} />
      </div>
      <div className="absolute top-0" style={{ left: size * 0.58 }}>
        <Face who="olga" mood={mood === "sorry" ? "hello" : mood} size={size} />
      </div>
    </div>
  );
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
  const audioRef = useRef<{ stop: () => void } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const genRef = useRef(0);
  const spokenRef = useRef("");
  const speakingRef = useRef(false);
  const busyRef = useRef(false);
  const listenWantedRef = useRef(false);
  const mood = moodOf(messages, busy);
  const offer = nextChips(messages);
  voiceOnRef.current = voiceOn;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, mood, listening]);

  useEffect(() => {
    return () => {
      recRef.current?.stop();
      audioRef.current?.stop();
    };
  }, []);

  function cancelSpeech() {
    genRef.current += 1;
    audioRef.current?.stop();
    speakingRef.current = false;
    setSpeaking(false);
  }

  function stopListen() {
    listenWantedRef.current = false;
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  }

  async function playClip(dataUrl: string) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = audioCtxRef.current || new Ctx();
    audioCtxRef.current = ctx;
    if (ctx.state === "suspended") await ctx.resume();
    const raw = await fetch(dataUrl).then((r) => r.arrayBuffer());
    const buf = await ctx.decodeAudioData(raw);
    const data = buf.getChannelData(0);
    const thr = 0.016;
    let a = 0;
    let b = data.length - 1;
    while (a < b && Math.abs(data[a]) < thr) a += 1;
    while (b > a && Math.abs(data[b]) < thr) b -= 1;
    a = Math.max(0, a - 80);
    b = Math.min(data.length - 1, b + 160);
    const len = Math.max(1, b - a);
    const sliced = ctx.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
    for (let ch = 0; ch < buf.numberOfChannels; ch += 1) {
      sliced.copyToChannel(buf.getChannelData(ch).subarray(a, a + len), ch);
    }
    await new Promise<void>((resolve) => {
      const src = ctx.createBufferSource();
      src.buffer = sliced;
      src.connect(ctx.destination);
      const stop = () => {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
        resolve();
      };
      audioRef.current = { stop };
      src.onended = () => resolve();
      src.start();
    });
  }

  async function speak(phrase: string) {
    const gen = ++genRef.current;
    speakingRef.current = true;
    spokenRef.current = parseTurns(phrase)
      .map((t) => t.text)
      .join(" ");
    setSpeaking(true);
    stopListen();
    try {
      const turns = parseTurns(phrase);
      const clips = await Promise.all(
        turns.map(async (turn) => {
          const res = await speakAgent({
            data: { text: turn.text, voice: turn.who === "olga" ? "alena" : "filipp" },
          });
          return res.ok && "audio" in res ? { audio: res.audio, text: turn.text } : null;
        }),
      );
      for (const clip of clips) {
        if (!clip || gen !== genRef.current || !voiceOnRef.current) return;
        spokenRef.current = clip.text;
        await playClip(clip.audio);
      }
    } finally {
      if (gen === genRef.current) {
        speakingRef.current = false;
        setSpeaking(false);
      }
    }
  }

  function startListen() {
    if (speakingRef.current || busyRef.current) return;
    const SR = speechCtor();
    if (!SR) return;
    listenWantedRef.current = true;
    try {
      recRef.current?.stop();
    } catch {
      /* not running */
    }
    const rec = new SR();
    rec.lang = "ru-RU";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      if (speakingRef.current || busyRef.current) return;
      const last = e.results[e.results.length - 1];
      const said = last?.[0]?.transcript?.trim();
      if (said) void send(said);
    };
    rec.onend = () => {
      if (recRef.current && recRef.current !== rec) return;
      recRef.current = null;
      setListening(false);
      if (listenWantedRef.current && voiceOnRef.current && !busyRef.current && !speakingRef.current) {
        startListen();
      }
    };
    rec.onerror = () => {
      recRef.current = null;
      setListening(false);
    };
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      /* already started */
    }
  }

  async function send(value?: string) {
    const next = (value ?? text).trim();
    if (!next || busyRef.current) return;
    setText("");
    cancelSpeech();
    stopListen();
    const history = [...messages, { role: "user" as const, content: next }];
    setMessages(history);
    busyRef.current = true;
    setBusy(true);
    let reply = `Не отправилось. Позвоните ${SITE.phone}.`;
    try {
      const res = await chatAgent({ data: { messages: history } });
      reply = res.ok ? res.reply : res.error;
    } catch {
      /* keep */
    }
    setMessages([...history, { role: "assistant", content: reply }]);
    busyRef.current = false;
    setBusy(false);
    if (voiceOnRef.current) {
      await speak(reply);
      if (voiceOnRef.current && genRef.current) startListen();
    }
  }

  async function toggleVoice() {
    if (voiceOn) {
      setVoiceOn(false);
      stopListen();
      audioRef.current?.stop();
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
            <div className="absolute right-3 top-3">
              <button
                type="button"
                className="grid size-9 place-items-center rounded-full bg-black/15 hover:bg-black/25"
                onClick={() => {
                  setOpen(false);
                  setVoiceOn(false);
                  stopListen();
                  audioRef.current?.stop();
                }}
                aria-label="Закрыть чат"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex items-end gap-3 pr-12">
              <div className="-mb-10 shrink-0">
                <Duo size={78} mood={mood} />
              </div>
              <div className="min-w-0 pb-1">
                <p className="font-display text-[1.15rem] leading-tight">Олег и Ольга</p>
                <p className="text-[0.78rem] text-white/85">
                  {speaking ? "Говорят" : listening ? "Слушают вас" : "Администраторы студии · онлайн"}
                </p>
              </div>
            </div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto bg-[#eef1f7] px-3.5 pb-4 pt-12">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[78%] rounded-2xl rounded-br-md bg-header px-3.5 py-2.5 text-[0.92rem] leading-relaxed text-header-fg">
                    {m.content}
                  </div>
                </div>
              ) : (
                parseTurns(m.content).map((turn, t) => (
                  <div key={`${i}-${t}`} className="flex items-end gap-2">
                    <Face who={turn.who} mood={i === messages.length - 1 ? mood : "hello"} size={36} />
                    <div className="max-w-[78%]">
                      <p className="mb-0.5 pl-1 text-[0.65rem] font-semibold text-muted">
                        {turn.who === "olga" ? "Ольга" : "Олег"}
                      </p>
                      <div className="rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[0.92rem] leading-relaxed text-fg shadow-[0_8px_24px_-16px_rgba(18,20,26,0.4)]">
                        {turn.text}
                      </div>
                    </div>
                  </div>
                ))
              ),
            )}
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
            {busy ? <p className="pl-11 text-xs font-medium text-muted">Олег и Ольга подбирают…</p> : null}
            <div ref={endRef} />
          </div>
          <form
            className="border-t border-black/5 bg-white px-3 pb-3 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <button
              type="button"
              onClick={() => void toggleVoice()}
              className={cn(
                "mb-2 flex h-11 w-full items-center justify-center gap-2 rounded-full text-[0.92rem] font-semibold",
                voiceOn ? "bg-[#e8f0ff] text-primary ring-1 ring-primary/20" : "bg-primary text-primary-foreground",
              )}
            >
              {voiceOn ? <Mic className="size-4" /> : <Volume2 className="size-4" />}
              {voiceOn ? (listening ? "Слушаю… нажмите, чтобы выключить" : speaking ? "Говорю… нажмите, чтобы выключить" : "Выключить голосовой режим") : "Включить голосовой режим"}
            </button>
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
              {voiceOn ? (speaking ? "Сейчас говорят" : "Голосовой режим включён") : `Пробное без обязательств · ${SITE.phone}`}
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
            aria-label="Написать администраторам студии"
          >
            <span className="agent-fab-ring pointer-events-none absolute inset-0 rounded-full bg-primary/25" aria-hidden />
            <span className="relative pl-1">
              <Duo size={48} mood="hello" />
            </span>
            <span className="relative pr-1 text-left leading-tight">
              <span className="block font-display text-[0.95rem] font-semibold md:text-[1.05rem]">Подобрать курс</span>
              <span className="block text-[0.7rem] font-medium text-muted">Олег и Ольга онлайн</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
