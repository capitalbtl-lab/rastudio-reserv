"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { X, Send, Mic, Volume2, RotateCcw } from "lucide-react";
import { chatAgent } from "@/data/agent-chat";
import { speakAgent } from "@/data/agent-voice";
import { saveChatLog } from "@/data/chat-logs";
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

function greeting(who: "oleg" | "olga", _voice = false) {
  const name = who === "olga" ? "Ольга" : "Олег";
  return `${name}: Подскажу программу, которая подойдёт именно вашему ребёнку. Сколько ему лет?`;
}
const DUAL_HELLO = /Олег: Подскажу программу[\s\S]*Ольга:/;
const ADMIN_ASK = "Ольга: Режим управления сайтом. Назовите кодовое слово.";
const ADMIN_HELLO = "Ольга: Доступ открыт на 30 минут. Цены, тексты страниц или голоса — что меняем?";

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

const CHAT_KEY = "ra_chat";
const ADMIN_CHAT_KEY = "ra_admin_chat";
const SID_KEY = "ra_chat_sid";
const PARTNER_KEY = "ra_chat_who";

function readPartner(): "oleg" | "olga" {
  try {
    const v = sessionStorage.getItem(PARTNER_KEY);
    if (v === "oleg" || v === "olga") return v;
  } catch {
    /* */
  }
  return "olga";
}

function writePartner(who: "oleg" | "olga") {
  try {
    sessionStorage.setItem(PARTNER_KEY, who);
  } catch {
    /* */
  }
}

function chatSid(reset = false) {
  try {
    if (!reset) {
      const cur = sessionStorage.getItem(SID_KEY);
      if (cur) return cur;
    }
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(SID_KEY, id);
    return id;
  } catch {
    return String(Date.now());
  }
}

function readChat(who: "oleg" | "olga"): Msg[] {
  try {
    const raw = sessionStorage.getItem(CHAT_KEY);
    if (!raw) return [{ role: "assistant", content: greeting(who) }];
    const parsed = JSON.parse(raw) as Msg[];
    if (!parsed?.length) return [{ role: "assistant", content: greeting(who) }];
    const onlyHello = parsed.length === 1 && parsed[0].role === "assistant" && !parsed.some((m) => m.role === "user");
    if (onlyHello && DUAL_HELLO.test(parsed[0].content)) return [{ role: "assistant", content: greeting(who) }];
    return parsed;
  } catch {
    return [{ role: "assistant", content: greeting(who) }];
  }
}

function readAdminChat(): Msg[] {
  try {
    const raw = sessionStorage.getItem(ADMIN_CHAT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Msg[];
    return parsed?.length ? parsed : [];
  } catch {
    return [];
  }
}

function siteAdminToken() {
  try {
    return localStorage.getItem("ra_site_admin") || "";
  } catch {
    return "";
  }
}

function adminLeft() {
  try {
    const t = siteAdminToken();
    const exp = Number(t.split(".")[1] || 0);
    return Math.max(0, exp - Date.now());
  } catch {
    return 0;
  }
}

function setSiteAdmin(token: string) {
  localStorage.setItem("ra_site_admin", token);
}

function clearSiteAdmin() {
  try {
    localStorage.removeItem("ra_site_admin");
  } catch {
    /* */
  }
}

function olgaReply(text: string) {
  const clean = text.replace(/режим управления уже открыт[^.!?]*[.!?]?/gi, "").trim();
  const turns = parseTurns(clean).filter((t) => t.who === "olga");
  if (turns.length) return turns.map((t) => `Ольга: ${t.text}`).join("\n");
  const body = clean.replace(/^(олег|ольга):\s*/gim, "").trim();
  return body ? `Ольга: ${body}` : "Ольга: Готово. Что ещё меняем?";
}

function noisyAdmin(text: string) {
  return /режим управления уже открыт|не спрашивай кодовое слово/i.test(text);
}

export function AgentChat() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [partner, setPartner] = useState<"oleg" | "olga">("olga");
  const [voiceOn, setVoiceOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [clientMsgs, setClientMsgs] = useState<Msg[]>([{ role: "assistant", content: greeting("olga") }]);
  const [adminMsgs, setAdminMsgs] = useState<Msg[]>([]);
  const [adminMs, setAdminMs] = useState(0);
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [groupChips, setGroupChips] = useState<{ label: string; href?: string; send?: string; primary?: boolean }[]>([]);
  const [box, setBox] = useState({ w: 520, h: 740 });
  const dragRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastMsgRef = useRef<HTMLDivElement>(null);
  const voiceOnRef = useRef(false);
  const recRef = useRef<Rec | null>(null);
  const audioRef = useRef<{ stop: () => void } | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const genRef = useRef(0);
  const sendIdRef = useRef(0);
  const spokenRef = useRef("");
  const speakingRef = useRef(false);
  const busyRef = useRef(false);
  const listenWantedRef = useRef(false);
  const partnerRef = useRef(partner);
  const awaitingCodeRef = useRef(false);
  const inAdminUi = awaitingCode || adminMs > 0;
  const messages = inAdminUi ? (adminMsgs.length ? adminMsgs : [{ role: "assistant" as const, content: awaitingCode ? ADMIN_ASK : ADMIN_HELLO }]) : clientMsgs;
  const mood = moodOf(messages, busy);
  const offer =
    awaitingCode
      ? { hint: "Назовите кодовое слово", chips: [] as { label: string; send?: string; href?: string; primary?: boolean }[] }
      : adminMs > 0
      ? {
          hint: "Что меняем",
          chips: [
            { label: "Цены", send: "Покажи текущие цены" },
            { label: "Тексты страницы", send: "Покажи тексты этой страницы" },
            { label: "Голоса", send: "Какие сейчас настройки голосов" },
          ],
        }
      : groupChips.length
        ? { hint: "Пробное или в группу", chips: groupChips }
        : nextChips(messages);
  voiceOnRef.current = voiceOn;
  partnerRef.current = partner;

  useEffect(() => {
    const who = readPartner();
    setPartner(who);
    setClientMsgs(readChat(who));
    const savedAdmin = readAdminChat();
    const left = adminLeft();
    setAdminMs(left);
    if (left > 0) {
      setAdminMsgs(savedAdmin.length ? savedAdmin : [{ role: "assistant", content: ADMIN_HELLO }]);
      setPartner("olga");
    }
    const id = window.setInterval(() => setAdminMs(adminLeft()), 10000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (adminMs > 0 && partner !== "olga") setPartner("olga");
  }, [adminMs, partner]);

  useEffect(() => {
    try {
      sessionStorage.setItem(CHAT_KEY, JSON.stringify(clientMsgs.slice(-80)));
    } catch {
      /* */
    }
    const useful = clientMsgs.filter((m) => m.role === "user");
    if (!useful.length) return;
    void saveChatLog({
      data: {
        id: chatSid(),
        path: typeof window !== "undefined" ? window.location.pathname : "/",
        partner,
        voice: voiceOn,
        admin: false,
        messages: clientMsgs,
      },
    });
  }, [clientMsgs, partner, voiceOn]);

  useEffect(() => {
    try {
      sessionStorage.setItem(ADMIN_CHAT_KEY, JSON.stringify(adminMsgs.slice(-80)));
    } catch {
      /* */
    }
  }, [adminMsgs]);

  useEffect(() => {
    const node = lastMsgRef.current;
    if (!node) {
      endRef.current?.scrollIntoView({ block: "end" });
      return;
    }
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [messages, open, busy]);

  useEffect(() => {
    const apply = () => {
      const h = window.visualViewport?.height || window.innerHeight;
      document.documentElement.style.setProperty("--agent-vvh", `${Math.round(h)}px`);
    };
    apply();
    window.visualViewport?.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    return () => {
      window.visualViewport?.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("agent-open", open);
    return () => document.body.classList.remove("agent-open");
  }, [open]);

  useEffect(() => {
    return () => {
      recRef.current?.stop();
      audioRef.current?.stop();
      document.body.classList.remove("agent-open");
    };
  }, []);

  function cancelSpeech() {
    genRef.current += 1;
    audioRef.current?.stop();
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.removeAttribute("src");
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* no synth */
    }
    speakingRef.current = false;
    setSpeaking(false);
  }

  function pickVoice(who: Who, voices: SpeechSynthesisVoice[]) {
    const ru = voices.filter((v) => /ru(-|_|$)|русск|russian/i.test(`${v.lang} ${v.name}`));
    const pool = ru.length ? ru : voices;
    if (who === "olga") {
      return (
        pool.find((v) => /irina|alena|milena|oksana|jane|female|женск/i.test(v.name)) ||
        pool.find((v) => /google.*ru/i.test(v.name)) ||
        pool[0]
      );
    }
    return (
      pool.find((v) => /pavel|zahar|dmitri|filipp|ermil|yuri|male|мужск/i.test(v.name)) ||
      pool.find((v) => /microsoft/i.test(v.name) && !/irina/i.test(v.name)) ||
      pool[pool.length - 1] ||
      pool[0]
    );
  }

  async function speakBrowser(text: string, who: Who) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    await new Promise<void>((resolve) => {
      const start = () => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "ru-RU";
        u.rate = 1.05;
        u.pitch = who === "olga" ? 1.05 : 0.68;
        u.volume = 1;
        const voice = pickVoice(who, synth.getVoices());
        if (voice) u.voice = voice;
        const done = () => resolve();
        u.onend = done;
        u.onerror = done;
        audioRef.current = { stop: () => { synth.cancel(); done(); } };
        synth.cancel();
        synth.speak(u);
      };
      if (synth.getVoices().length) start();
      else {
        synth.onvoiceschanged = () => start();
        window.setTimeout(start, 400);
      }
    });
  }

  async function playClip(dataUrl: string, volume = 1) {
    const el = new Audio();
    el.preload = "auto";
    el.playsInline = true;
    let objectUrl = "";
    try {
      const b64 = dataUrl.split(",")[1] || "";
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
    } catch {
      objectUrl = dataUrl;
    }
    await new Promise<void>((resolve, reject) => {
      let finished = false;
      const done = (err?: boolean) => {
        if (finished) return;
        finished = true;
        el.onended = null;
        el.onerror = null;
        try {
          el.pause();
        } catch {
          /* */
        }
        if (objectUrl.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
        if (err) reject(new Error("audio"));
        else resolve();
      };
      el.volume = Math.min(1, Math.max(0.4, volume));
      el.muted = false;
      el.playbackRate = 1;
      el.onended = () => done(false);
      el.onerror = () => done(true);
      audioRef.current = {
        stop: () => {
          el.pause();
          el.removeAttribute("src");
          done(false);
        },
      };
      el.src = objectUrl;
      const play = el.play();
      if (play && typeof play.catch === "function") play.catch(() => done(true));
    });
  }

  async function yandexClip(text: string, who: Who) {
    for (let i = 0; i < 2; i += 1) {
      try {
        const res = await speakAgent({
          data: { text, who: who === "olga" ? "olga" : "oleg" },
        });
        if (!res.ok || !("audio" in res) || !res.audio) continue;
        const voice = "voice" in res ? String(res.voice || "") : "";
        if (who === "oleg" && /alena|jane|marina|oksana|omazh/i.test(voice)) continue;
        if (who === "olga" && /zahar|filipp|ermil|madirus/i.test(voice)) continue;
        return {
          audio: res.audio,
          volume: "volume" in res ? Number(res.volume) : 1,
          gap: "turnGap" in res ? Number(res.turnGap) : 0.18,
        };
      } catch {
        /* retry */
      }
    }
    return null;
  }

  async function speak(phrase: string) {
    cancelSpeech();
    const gen = genRef.current;
    speakingRef.current = true;
    spokenRef.current = parseTurns(phrase)
      .map((t) => t.text)
      .join(" ");
    setSpeaking(true);
    stopListen();
    await new Promise((r) => window.setTimeout(r, 40));
    try {
      const mode = adminLeft() > 0 ? "olga" : partnerRef.current;
      const turns = parseTurns(phrase).filter((t) => t.who === mode);
      for (let i = 0; i < turns.length; i += 1) {
        const turn = turns[i];
        if (gen !== genRef.current) return;
        const clip = await yandexClip(turn.text, turn.who);
        if (gen !== genRef.current) return;
        if (!clip) continue;
        if (i > 0) await new Promise((r) => window.setTimeout(r, Math.round((clip.gap || 0.18) * 1000)));
        if (gen !== genRef.current) return;
        spokenRef.current = turn.text;
        try {
          await playClip(clip.audio, clip.volume);
        } catch {
          /* never Windows TTS */
        }
      }
    } finally {
      if (gen === genRef.current) {
        speakingRef.current = false;
        setSpeaking(false);
      }
    }
  }

  function isEcho(said: string) {
    const a = said
      .toLowerCase()
      .replace(/[^\p{L}\d\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    const words = a.split(" ").filter((w) => w.length > 2);
    if (a.length < 8 || words.length < 2) return true;
    const b = spokenRef.current.toLowerCase();
    const hits = words.filter((w) => b.includes(w)).length;
    return hits / words.length >= 0.55;
  }

  function stopListen() {
    listenWantedRef.current = false;
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  }

  function startListen() {
    if (busyRef.current || speakingRef.current) return;
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
      if (busyRef.current || speakingRef.current) return;
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
    const next = (value ?? text)
      .trim()
      .replace(/\bкаломн\w*/gi, "Коломна")
      .replace(/\bколоменск\w*/gi, "Коломна")
      .replace(/\bколомен\w*/gi, "Коломна")
      .replace(/\bлуховец\w*/gi, "Луховицы")
      .replace(/\bлухавиц\w*/gi, "Луховицы")
      .replace(/\bлуховицк\w*/gi, "Луховицы");
    if (!next || busyRef.current) return;
    const sendId = ++sendIdRef.current;
    setText("");
    cancelSpeech();
    stopListen();
    const gate = awaitingCodeRef.current;
    const adminThread = gate || adminLeft() > 0;
    const shown = gate ? "••••" : next;
    const base = adminThread ? (adminMsgs.length ? adminMsgs : [{ role: "assistant" as const, content: gate ? ADMIN_ASK : ADMIN_HELLO }]) : clientMsgs;
    const history = [...base, { role: "user" as const, content: shown }].filter(
      (m) => m.role !== "user" || !noisyAdmin(m.content),
    );
    if (adminThread) setAdminMsgs(history);
    else setClientMsgs(history);
    setGroupChips([]);
    busyRef.current = true;
    setBusy(true);
    let reply = `Не отправилось. Позвоните ${SITE.phone}.`;
    let shouldReload = false;
    try {
      const res = await chatAgent({
        data: {
          messages: history,
          with: adminThread ? "olga" : partner,
          token: siteAdminToken() || undefined,
          path: typeof window !== "undefined" ? window.location.pathname : "/",
          gate,
          gateWord: gate ? next : undefined,
        },
      });
      if (sendId !== sendIdRef.current) return;
      if (res.ok) {
        reply = adminThread || res.token ? olgaReply(res.reply) : res.reply;
        if (res.token) {
          awaitingCodeRef.current = false;
          setAwaitingCode(false);
          setSiteAdmin(res.token);
          setAdminMs(adminLeft());
          setPartner("olga");
          setAdminMsgs([{ role: "assistant", content: ADMIN_HELLO }]);
          reply = ADMIN_HELLO;
        }
        shouldReload = Boolean(res.reload);
        if ("groups" in res && Array.isArray(res.groups) && res.groups.length) {
          setGroupChips((prev) => {
            const next = [...prev];
            for (const chip of res.groups as typeof prev) {
              const i = next.findIndex((c) => c.label === chip.label || (chip.href && c.href === chip.href));
              if (i >= 0) next[i] = chip;
              else next.push(chip);
            }
            return next;
          });
        }
        if ("signup" in res && res.signup) {
          window.open(String(res.signup), "_blank", "noopener,noreferrer");
        }
      } else reply = res.error;
    } catch {
      if (sendId !== sendIdRef.current) return;
    }
    if (sendId !== sendIdRef.current) return;
    if (!(gate && reply === ADMIN_HELLO)) {
      const nextMsgs = [...history, { role: "assistant" as const, content: reply }];
      if (adminThread) setAdminMsgs(nextMsgs);
      else setClientMsgs(nextMsgs);
    }
    busyRef.current = false;
    setBusy(false);
    if (voiceOnRef.current) {
      await speak(reply);
      if (sendId !== sendIdRef.current) return;
      if (voiceOnRef.current && !speakingRef.current) startListen();
    }
    if (shouldReload) window.setTimeout(() => window.location.reload(), voiceOnRef.current ? 600 : 200);
  }

  function leaveAdmin() {
    const wasIn = adminLeft() > 0;
    sendIdRef.current += 1;
    busyRef.current = false;
    setBusy(false);
    cancelSpeech();
    stopListen();
    awaitingCodeRef.current = false;
    setAwaitingCode(false);
    clearSiteAdmin();
    setAdminMs(0);
    setPartner("olga");
    writePartner("olga");
    setAdminMsgs([]);
    setGroupChips([]);
    setText("");
    if (wasIn && voiceOnRef.current) {
      const back = "Ольга: Вернулись к консультации для родителей.";
      void speak(back).then(() => {
        if (voiceOnRef.current && !busyRef.current && !speakingRef.current) startListen();
      });
    } else if (voiceOnRef.current) {
      window.setTimeout(() => {
        if (voiceOnRef.current && !busyRef.current && !speakingRef.current) startListen();
      }, 200);
    }
  }

  function enterAdmin() {
    sendIdRef.current += 1;
    busyRef.current = false;
    setBusy(false);
    cancelSpeech();
    stopListen();
    awaitingCodeRef.current = true;
    setAwaitingCode(true);
    setPartner("olga");
    setAdminMsgs([{ role: "assistant", content: ADMIN_ASK }]);
    setGroupChips([]);
    setText("");
    if (voiceOnRef.current) {
      void speak(ADMIN_ASK).then(() => {
        if (voiceOnRef.current && !busyRef.current && !speakingRef.current) startListen();
      });
    }
  }

  async function toggleVoice() {
    if (voiceOn) {
      setVoiceOn(false);
      voiceOnRef.current = false;
      stopListen();
      cancelSpeech();
      return;
    }
    voiceOnRef.current = true;
    setVoiceOn(true);
    try {
      window.speechSynthesis?.getVoices();
    } catch {
      /* */
    }
    const onlyHello =
      !inAdminUi &&
      clientMsgs.length === 1 &&
      clientMsgs[0].role === "assistant" &&
      /Подскажу программу, которая подойдёт/.test(clientMsgs[0].content);
    const spoken = onlyHello ? greeting(partner, true) : [...messages].reverse().find((m) => m.role === "assistant")?.content;
    if (onlyHello) setClientMsgs([{ role: "assistant", content: spoken || greeting(partner, true) }]);
    if (spoken) await speak(spoken);
    if (voiceOnRef.current) startListen();
  }

  function pickPartner(next: "oleg" | "olga") {
    if (inAdminUi) return;
    cancelSpeech();
    writePartner(next);
    setPartner(next);
    setClientMsgs((prev) => {
      const onlyHello = prev.length <= 1 && !prev.some((m) => m.role === "user");
      if (onlyHello) return [{ role: "assistant", content: greeting(next, voiceOnRef.current) }];
      return prev;
    });
  }

  function onResizeStart(e: PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, w: box.w, h: box.h };
  }

  function onResizeMove(e: PointerEvent<HTMLButtonElement>) {
    const start = dragRef.current;
    if (!start) return;
    const maxW = Math.min(760, window.innerWidth - 32);
    const maxH = Math.min(860, window.innerHeight - 32);
    setBox({
      w: Math.max(340, Math.min(maxW, start.w + (start.x - e.clientX))),
      h: Math.max(460, Math.min(maxH, start.h + (start.y - e.clientY))),
    });
  }

  function onResizeEnd() {
    dragRef.current = null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] md:inset-auto md:bottom-6 md:right-6">
      {open ? (
        <div
          className="agent-panel pointer-events-auto relative flex w-auto flex-col overflow-hidden rounded-[1.6rem] bg-white ring-[3px] ring-white shadow-[0_28px_70px_-18px_rgba(9,12,18,0.55)] md:h-[var(--agent-h)] md:w-[var(--agent-w)]"
          style={{ ["--agent-w" as string]: `${box.w}px`, ["--agent-h" as string]: `${box.h}px` }}
        >
          <audio ref={audioElRef} className="hidden" playsInline preload="auto" />
          <button
            type="button"
            className="absolute left-1.5 top-1.5 z-10 hidden h-4 w-4 cursor-nwse-resize rounded-sm md:block"
            aria-label="Изменить размер окна"
            onPointerDown={onResizeStart}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeEnd}
            onPointerCancel={onResizeEnd}
          >
            <span className="absolute left-0.5 top-0.5 h-2.5 w-2.5 rounded-[2px] border-l-2 border-t-2 border-white/70" />
          </button>
          <div className={cn("relative shrink-0 px-3 pb-2.5 pt-2.5 text-primary-foreground sm:px-4 sm:pb-3.5 sm:pt-3.5", inAdminUi ? "bg-ink" : "bg-primary")}>
            <div className="absolute right-2 top-2 flex items-center gap-1 sm:right-3 sm:top-3 sm:gap-1.5">
              <button
                type="button"
                className="grid size-8 place-items-center rounded-full bg-black/15 hover:bg-black/25 sm:size-9"
                title="Сбросить диалог"
                aria-label="Сбросить диалог"
                onClick={() => {
                  cancelSpeech();
                  stopListen();
                  sendIdRef.current += 1;
                  busyRef.current = false;
                  setBusy(false);
                  const useful = messages.some((m) => m.role === "user" && !noisyAdmin(m.content));
                  if (useful) {
                    void saveChatLog({
                      data: {
                        id: chatSid(),
                        path: window.location.pathname,
                        partner,
                        voice: voiceOn,
                        admin: adminLeft() > 0,
                        closed: true,
                        messages: messages.filter((m) => m.role !== "user" || !noisyAdmin(m.content)),
                      },
                    });
                  }
                  chatSid(true);
                  awaitingCodeRef.current = false;
                  setAwaitingCode(false);
                  if (adminLeft() > 0) setAdminMsgs([{ role: "assistant", content: ADMIN_HELLO }]);
                  else setClientMsgs([{ role: "assistant", content: greeting(partner, voiceOnRef.current) }]);
                  setGroupChips([]);
                  setText("");
                }}
              >
                <RotateCcw className="size-4" />
              </button>
              <button
                type="button"
                className="grid size-8 place-items-center rounded-full bg-black/15 hover:bg-black/25 sm:size-9"
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
            <div className="flex items-end gap-2 pr-16 sm:gap-3 sm:pr-20">
              <div className="shrink-0">
                {inAdminUi ? <Face who="olga" mood={mood} size={48} /> : <Face who={partner} mood={mood} size={48} />}
              </div>
              <div className="min-w-0 pb-0.5">
                <p className="font-display text-[1.02rem] leading-tight sm:text-[1.15rem]">
                  {inAdminUi ? "Ольга · управление" : partner === "oleg" ? "Олег" : "Ольга"}
                </p>
                <p className="truncate text-[0.72rem] text-white/85 sm:text-[0.78rem]">
                  {inAdminUi
                    ? awaitingCode
                      ? "Назовите кодовое слово"
                      : "Правки сайта · 30 минут"
                    : speaking
                      ? "Говорит"
                      : listening && voiceOn
                        ? "Слушает вас"
                        : "Администратор студии · онлайн"}
                </p>
              </div>
            </div>
            {inAdminUi ? null : (
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  className={cn(
                    "h-8 rounded-full text-[0.72rem] font-semibold sm:h-9 sm:text-[0.78rem]",
                    partner === "olga" ? "bg-white text-primary" : "bg-white/15 text-white hover:bg-white/25",
                  )}
                  onClick={() => pickPartner("olga")}
                >
                  <span className="hidden min-[400px]:inline">Говорить с </span>Ольгой
                </button>
                <button
                  type="button"
                  className={cn(
                    "h-8 rounded-full text-[0.72rem] font-semibold sm:h-9 sm:text-[0.78rem]",
                    partner === "oleg" ? "bg-white text-primary" : "bg-white/15 text-white hover:bg-white/25",
                  )}
                  onClick={() => pickPartner("oleg")}
                >
                  <span className="hidden min-[400px]:inline">Говорить с </span>Олегом
                </button>
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-[#eef1f7] px-3 py-2.5 sm:px-3.5 sm:py-3">
            {messages.filter((m) => m.role !== "user" || !noisyAdmin(m.content)).map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[78%] rounded-2xl rounded-br-md bg-header px-3.5 py-2.5 text-[0.92rem] leading-relaxed text-header-fg">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} ref={i === messages.length - 1 ? lastMsgRef : undefined} className="space-y-3">
                  {(adminMs > 0 || inAdminUi
                    ? parseTurns(m.content).filter((t) => t.who === "olga")
                    : parseTurns(m.content).filter((t) => t.who === partner)
                  ).map((turn, t) => (
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
                  ))}
                </div>
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
            {busy ? <p className="pl-11 text-xs font-medium text-muted">{partner === "oleg" ? "Олег подбирает…" : "Ольга подбирает…"}</p> : null}
            <div ref={endRef} />
          </div>
          <form
            className="shrink-0 border-t border-black/5 bg-white px-3 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <button
              type="button"
              onClick={() => void toggleVoice()}
              className={cn(
                "flex h-11 w-full items-center justify-center gap-2 rounded-full text-[0.92rem] font-semibold",
                voiceOn ? "mb-0 bg-[#e8f0ff] text-primary ring-1 ring-primary/20" : "mb-2 bg-primary text-primary-foreground",
              )}
            >
              {voiceOn ? <Mic className="size-4" /> : <Volume2 className="size-4" />}
              {voiceOn ? (listening ? "Слушаю… нажмите, чтобы выключить" : speaking ? "Говорю… нажмите, чтобы выключить" : "Выключить голосовой режим") : "Включить голосовой режим"}
            </button>
            {voiceOn ? null : (
            <div className="flex items-center gap-2 rounded-full bg-[#eef1f7] p-1 ring-1 ring-black/8 focus-within:ring-2 focus-within:ring-primary/40">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Возраст и город — подберём курс"
                className="h-10 flex-1 bg-transparent px-3.5 text-base outline-none md:text-sm"
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
            )}
            <div className="flex items-center justify-between gap-2 px-3 pt-1.5">
              <p className="min-w-0 truncate text-[0.65rem] text-muted">
                {voiceOn ? (speaking ? "Сейчас говорят" : "Голосовой режим включён") : `Пробное · ${SITE.phone}`}
              </p>
              <button
                type="button"
                className="shrink-0 text-[0.62rem] font-semibold text-primary underline-offset-2 hover:underline"
                onClick={() => (inAdminUi ? leaveAdmin() : enterAdmin())}
              >
                {inAdminUi ? "вернуться в клиентский режим" : "войти в административный режим"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {open ? null : (
        <div className="agent-fab-wrap pointer-events-auto absolute bottom-[4.85rem] right-3 md:static">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="agent-fab relative inline-flex h-[3.15rem] max-w-[calc(100vw-1.25rem)] items-center gap-1.5 overflow-visible rounded-full bg-white py-1 pl-1 pr-3 text-fg ring-[3px] ring-white shadow-[0_16px_40px_-12px_rgba(32,94,220,0.55)] md:h-[4.1rem] md:pr-5"
            aria-label="Написать администраторам студии"
          >
            <span className="agent-fab-ring pointer-events-none absolute inset-0 rounded-full bg-primary/25" aria-hidden />
            <span className="relative pl-0.5">
              <Duo size={40} mood="hello" />
            </span>
            <span className="relative min-w-0 pr-1 text-left leading-tight">
              <span className="block font-display text-[0.88rem] font-semibold md:text-[1.05rem]">Подобрать курс</span>
              <span className="agent-fab-sub block text-[0.68rem] font-medium text-muted">Олег и Ольга онлайн</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
