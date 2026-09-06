"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { X, Send, Mic, Volume2, RotateCcw, Repeat2, AudioLines } from "lucide-react";
import { chatAgent } from "@/data/agent-chat";
import { publicAgentUi } from "@/data/agent-config-fn";
import type { AgentUiFlags } from "@/data/agent-config";
import { debugSession } from "@/data/debug-fn";
import { speakAgent } from "@/data/agent-voice";
import { saveChatLog } from "@/data/chat-logs-fn";
import { factsFromMessages, talkFallback } from "@/data/agent-facts";
import { nextChips, needTypedText, typedPrompt } from "@/data/agent-chips";
import { debugEmit } from "@/data/debug-client";
import { readBehavior, tickBehavior } from "@/data/page-behavior";
import { parseTurns, faceOf, type Who } from "@/data/agent-turns";
import { PageLink } from "@/components/page-link";
import { SITE } from "@/data/site";
import { cn } from "@/lib/utils";
import { publicPageAgent } from "@/data/page-agents-fn";
import type { PageAgent } from "@/data/page-agents-core";
import { useRouterState } from "@tanstack/react-router";
import {
  bargeInterimReady,
  emptyVad,
  ignoreAfterSpeakMs,
  ignoreWhileSpeakStartMs,
  isSocialHello,
  isVoiceEcho,
  listenGapAfterSpeakMs,
  srFatal,
  srShouldRestart,
  vadTick,
  type VadState,
} from "@/data/agent-voice-loop";

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: { length: number; [i: number]: { isFinal?: boolean; 0: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e?: { error?: string }) => void) | null;
};

function speechCtor() {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}
type Msg = { role: "user" | "assistant"; content: string };
type Mood = "hello" | "think" | "happy" | "sorry";
const SILENCE = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

function greeting(who: "oleg" | "olga", page?: PageAgent | null) {
  const name = who === "olga" ? "Ольга" : "Олег";
  const custom = String(page?.greeting || "").replace(/^(Олег|Ольга):\s*/i, "").trim();
  if (page?.on && custom) return `${name}: ${custom}`;
  return `${name}: Здравствуйте. Я ${name}, студия «Развивайся». Вы уже занимаетесь у нас или подбираете впервые?`;
}

function goSitePath(path: string) {
  if (!path) return;
  if (path === "#trial" || path.endsWith("#trial")) {
    const el = document.getElementById("trial") || document.querySelector("#trial");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.location.assign("/#trial");
    return;
  }
  if (path === window.location.pathname) return;
  window.location.assign(path);
}
const DUAL_HELLO = /Олег: Здравствуйте[\s\S]*Ольга:/;
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
    if (onlyHello) return [{ role: "assistant", content: greeting(who) }];
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
  const path = useRouterState({ select: (s) => s.location.pathname || "/" });
  const [pageAgent, setPageAgent] = useState<PageAgent | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [partner, setPartner] = useState<"oleg" | "olga">("olga");
  const [voiceOn, setVoiceOn] = useState(false);
  const [bargeOn, setBargeOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [clientMsgs, setClientMsgs] = useState<Msg[]>([{ role: "assistant", content: greeting("olga") }]);
  const [adminMsgs, setAdminMsgs] = useState<Msg[]>([]);
  const [adminMs, setAdminMs] = useState(0);
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [groupChips, setGroupChips] = useState<{ label: string; href?: string; send?: string; primary?: boolean; note?: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [box, setBox] = useState({ w: 520, h: 740 });
  const [ui, setUi] = useState<AgentUiFlags>({
    showChat: true,
    allowVoice: true,
    allowAdminMode: true,
    showChips: true,
    allowOlga: true,
    allowOleg: true,
    allowReset: true,
    allowBarge: true,
    defaultPartner: "olga",
    matchChipsToMessage: true,
    keepAssistantReplies: true,
    speakEveryReply: true,
  });
  const [debugOn, setDebugOn] = useState(false);
  const [debugWidget, setDebugWidget] = useState<Record<string, boolean>>({});
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
  const bargeRef = useRef(false);
  const ignoreUntilRef = useRef(0);
  const partnerRef = useRef(partner);
  const awaitingCodeRef = useRef(false);
  const clientMsgsRef = useRef(clientMsgs);
  const adminMsgsRef = useRef(adminMsgs);
  const micStreamRef = useRef<MediaStream | null>(null);
  const chatGenRef = useRef(0);
  const uiRef = useRef(ui);
  const debugOnRef = useRef(debugOn);
  const debugWidgetRef = useRef(debugWidget);
  const vadRafRef = useRef(0);
  const vadStopRef = useRef<(() => void) | null>(null);
  const vadStateRef = useRef<VadState>(emptyVad());
  const spokenAtRef = useRef(0);
  clientMsgsRef.current = clientMsgs;
  adminMsgsRef.current = adminMsgs;
  uiRef.current = ui;
  debugOnRef.current = debugOn;
  debugWidgetRef.current = debugWidget;
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
      : nextChips(messages, groupChips);
  const lastAsk = [...messages].reverse().find((m) => m.role === "assistant")?.content || "";
  const needText = needTypedText(lastAsk, offer.chips);
  const typeHint = needText ? typedPrompt(lastAsk) : "Напишите или нажмите кнопку";
  voiceOnRef.current = voiceOn;
  bargeRef.current = bargeOn;
  partnerRef.current = partner;

  useEffect(() => {
    const who = readPartner();
    setPartner(who);
    setClientMsgs(readChat(who));
    try {
      const saved = localStorage.getItem("ra_barge");
      setBargeOn(saved == null ? true : saved === "1");
    } catch {
      setBargeOn(true);
    }
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
    tickBehavior();
    void publicPageAgent({ data: { path } }).then((res) => {
      if (res.ok) setPageAgent(res.agent || null);
    });
  }, [path]);

  useEffect(() => {
    if (!pageAgent?.on) return;
    setClientMsgs((prev) => {
      if (prev.some((m) => m.role === "user")) return prev;
      const who = partnerRef.current;
      return [{ role: "assistant", content: greeting(who, pageAgent) }];
    });
    if (pageAgent.who === "oleg" || pageAgent.who === "olga") {
      setPartner(pageAgent.who);
      writePartner(pageAgent.who);
    }
  }, [pageAgent]);

  useEffect(() => {
    if (!pageAgent?.on || !pageAgent.autoOpenSec || open) return;
    const key = `ra_agent_auto:${pageAgent.path}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      /* */
    }
    const t = window.setTimeout(() => {
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        /* */
      }
      setOpen(true);
    }, pageAgent.autoOpenSec * 1000);
    return () => window.clearTimeout(t);
  }, [pageAgent, open]);

  useEffect(() => {
    void publicAgentUi().then((res) => {
      if (!res.ok || !("ui" in res)) return;
      const next = res.ui;
      setUi(next);
      if (!next.allowOlga && next.allowOleg) setPartner("oleg");
      else if (!next.allowOleg && next.allowOlga) setPartner("olga");
      else setPartner(next.defaultPartner);
      if (!next.allowVoice) {
        setVoiceOn(false);
        voiceOnRef.current = false;
      }
      if (!next.allowBarge) {
        setBargeOn(false);
        bargeRef.current = false;
      }
    });
  }, []);

  useEffect(() => {
    function read() {
      try {
        const t = sessionStorage.getItem("ra_debug");
        if (!t) {
          setDebugOn(false);
          setDebugWidget({});
          return;
        }
        void debugSession({ data: { token: t } }).then((res) => {
          if (res.ok && "widget" in res) {
            setDebugOn(true);
            setDebugWidget(res.widget || {});
          } else {
            setDebugOn(false);
            setDebugWidget({});
          }
        });
      } catch {
        setDebugOn(false);
        setDebugWidget({});
      }
    }
    read();
    window.addEventListener("ra-debug-session", read);
    return () => window.removeEventListener("ra-debug-session", read);
  }, []);

  function uiOn(key: keyof AgentUiFlags) {
    if (key === "defaultPartner") return true;
    const cur = uiRef.current;
    if (cur[key]) return true;
    return debugOnRef.current && debugWidgetRef.current[key] === true;
  }

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
    debugEmit("chat", messages);
  }, [messages]);

  useEffect(() => {
    debugEmit("voice", { voiceOn, listening, speaking, busy });
  }, [voiceOn, listening, speaking, busy]);

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

  useEffect(() => {
    if (!open || !needText || busy) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(id);
  }, [open, needText, busy, lastAsk]);

  function cancelSpeech() {
    genRef.current += 1;
    audioRef.current?.stop();
    const stopVad = vadStopRef.current;
    vadStopRef.current = null;
    stopVad?.();
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
    spokenAtRef.current = Date.now();
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
    let el = audioElRef.current;
    if (!el) {
      el = new Audio();
      el.preload = "auto";
      el.playsInline = true;
      audioElRef.current = el;
    }
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
          done(false);
        },
      };
      el.src = objectUrl;
      const play = el.play();
      if (play && typeof play.catch === "function") play.catch(() => done(true));
    });
  }

  async function unlockAudio() {
    try {
      let el = audioElRef.current;
      if (!el) {
        el = new Audio();
        el.playsInline = true;
        audioElRef.current = el;
      }
      el.src = SILENCE;
      el.volume = 0.01;
      await el.play();
      el.pause();
    } catch {
      /* iOS may still unlock after click */
    }
  }

  async function ensureMic() {
    if (micStreamRef.current?.active) return true;
    if (!navigator.mediaDevices?.getUserMedia) return true;
    try {
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      return true;
    } catch (e) {
      debugEmit("voice", { voiceOn: true, error: e instanceof Error ? e.message : "микрофон" });
      return false;
    }
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

  function startVad() {
    vadStopRef.current?.();
    vadStopRef.current = null;
    if (vadRafRef.current) {
      cancelAnimationFrame(vadRafRef.current);
      vadRafRef.current = 0;
    }
    const stream = micStreamRef.current;
    if (!stream || !bargeRef.current) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      if (ctx.state === "suspended") void ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      vadStateRef.current = emptyVad();
      const stop = () => {
        vadStopRef.current = null;
        if (vadRafRef.current) {
          cancelAnimationFrame(vadRafRef.current);
          vadRafRef.current = 0;
        }
        try {
          src.disconnect();
          void ctx.close();
        } catch {
          /* */
        }
      };
      vadStopRef.current = stop;
      const tick = () => {
        if (!speakingRef.current || !bargeRef.current) {
          stop();
          return;
        }
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const n = (data[i] - 128) / 128;
          sum += n * n;
        }
        const rms = Math.sqrt(sum / data.length);
        if (Date.now() < ignoreUntilRef.current) {
          vadStateRef.current = emptyVad();
          vadRafRef.current = requestAnimationFrame(tick);
          return;
        }
        const next = vadTick(vadStateRef.current, rms, true);
        vadStateRef.current = next.state;
        if (next.fire) {
          vadStateRef.current = emptyVad();
        }
        vadRafRef.current = requestAnimationFrame(tick);
      };
      vadRafRef.current = requestAnimationFrame(tick);
    } catch {
      /* AudioContext */
    }
  }

  async function speak(phrase: string) {
    cancelSpeech();
    const gen = genRef.current;
    speakingRef.current = true;
    spokenRef.current = parseTurns(phrase)
      .map((t) => t.text)
      .join(" ");
    spokenAtRef.current = Date.now();
    setSpeaking(true);
    ignoreUntilRef.current = Date.now() + ignoreWhileSpeakStartMs(bargeRef.current);
    if (voiceOnRef.current) {
      startListen();
      if (bargeRef.current) startVad();
    }
    try {
      const mode = adminLeft() > 0 ? "olga" : partnerRef.current;
      const turns = parseTurns(phrase, mode);
      const mine = turns.filter((t) => t.who === mode);
      const play = mine.length ? mine : turns.map((t) => ({ ...t, who: mode }));
      for (let i = 0; i < play.length; i += 1) {
        const turn = play[i];
        if (gen !== genRef.current) return;
        const clip = await yandexClip(turn.text, turn.who);
        if (gen !== genRef.current) return;
        if (i > 0) await new Promise((r) => window.setTimeout(r, Math.round((clip?.gap || 0.18) * 1000)));
        if (gen !== genRef.current) return;
        spokenRef.current = turn.text;
        spokenAtRef.current = Date.now();
        try {
          if (clip) await playClip(clip.audio, clip.volume);
          else await speakBrowser(turn.text, turn.who);
        } catch {
          try {
            await speakBrowser(turn.text, turn.who);
          } catch {
            /* */
          }
        }
      }
    } finally {
      vadStopRef.current?.();
      vadStopRef.current = null;
      if (gen === genRef.current) {
        speakingRef.current = false;
        setSpeaking(false);
        spokenAtRef.current = Date.now();
        ignoreUntilRef.current = Date.now() + ignoreAfterSpeakMs(bargeRef.current);
        if (voiceOnRef.current && !busyRef.current) {
          window.setTimeout(() => {
            if (gen === genRef.current && voiceOnRef.current && !busyRef.current && !speakingRef.current) startListen();
          }, listenGapAfterSpeakMs(bargeRef.current));
        }
      }
    }
  }

  async function maybeSpeak(phrase: string) {
    if (!voiceOnRef.current || !phrase.trim()) return;
    if (!uiOn("speakEveryReply")) return;
    await speak(phrase);
  }

  function isEcho(said: string, loose = false) {
    return isVoiceEcho(said, spokenRef.current, {
      loose: loose || speakingRef.current,
      speaking: speakingRef.current,
      spokenAgoMs: speakingRef.current ? 0 : Date.now() - spokenAtRef.current,
    });
  }

  function stopListen(keepMic = true) {
    listenWantedRef.current = false;
    try {
      recRef.current?.stop();
    } catch {
      /* */
    }
    recRef.current = null;
    setListening(false);
    if (!keepMic && micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  }

  function startListen() {
    if (busyRef.current) return;
    const SR = speechCtor();
    if (!SR) return;
    listenWantedRef.current = true;
    if (recRef.current) {
      if (recRef.current.interimResults !== !!bargeRef.current) {
        try {
          recRef.current.stop();
        } catch {
          /* */
        }
        recRef.current = null;
      } else {
        try {
          recRef.current.start();
          setListening(true);
        } catch {
          /* already started */
        }
        return;
      }
    }
    const rec = new SR();
    rec.lang = "ru-RU";
    rec.continuous = true;
    rec.interimResults = !!bargeRef.current;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      if (busyRef.current) return;
      const last = e.results[e.results.length - 1];
      const said = last?.[0]?.transcript?.trim();
      if (!said) return;
      if (Date.now() < ignoreUntilRef.current) return;
      if (isEcho(said, speakingRef.current)) return;
      const isFinal = !("isFinal" in last) || last.isFinal !== false;
      if (speakingRef.current) {
        if (!bargeRef.current) return;
        if (isSocialHello(said) && isFinal) {
          cancelSpeech();
          void send(said);
          return;
        }
        if (!bargeInterimReady(said, isFinal)) return;
        if (!isFinal) return;
        cancelSpeech();
      }
      if (!isFinal) return;
      void send(said);
    };
    rec.onend = () => {
      if (recRef.current && recRef.current !== rec) return;
      recRef.current = null;
      setListening(false);
      if (listenWantedRef.current && voiceOnRef.current && !busyRef.current) {
        window.setTimeout(() => {
          if (listenWantedRef.current && voiceOnRef.current && !busyRef.current) startListen();
        }, 80);
      }
    };
    rec.onerror = (ev?: { error?: string }) => {
      const err = String(ev?.error || "");
      if (srFatal(err)) {
        listenWantedRef.current = false;
        debugEmit("voice", { error: "микрофон запрещён" });
        recRef.current = null;
        setListening(false);
        return;
      }
      recRef.current = null;
      setListening(false);
      if (srShouldRestart(err) && listenWantedRef.current && voiceOnRef.current && !busyRef.current) {
        window.setTimeout(() => {
          if (listenWantedRef.current && voiceOnRef.current && !busyRef.current) startListen();
        }, err === "no-speech" ? 40 : 160);
      }
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
    const gen = chatGenRef.current;
    setText("");
    cancelSpeech();
    stopListen(true);
    const gate = awaitingCodeRef.current;
    const adminThread = gate || adminLeft() > 0;
    const shown = gate ? "••••" : next;
    const userMsg: Msg = { role: "user", content: shown };
    if (adminThread) {
      const base = adminMsgsRef.current.length ? adminMsgsRef.current : [{ role: "assistant" as const, content: gate ? ADMIN_ASK : ADMIN_HELLO }];
      adminMsgsRef.current = [...base, userMsg];
      setAdminMsgs(adminMsgsRef.current);
    } else {
      clientMsgsRef.current = [...clientMsgsRef.current, userMsg];
      setClientMsgs(clientMsgsRef.current);
    }
    setGroupChips([]);
    busyRef.current = true;
    setBusy(true);
    let reply = "";
    let shouldReload = false;
    let speakTail = "";
    const t0 = Date.now();
    try {
      const history = adminThread ? adminMsgsRef.current : clientMsgsRef.current;
      const payload = {
        messages: history,
        with: adminThread ? "olga" : partnerRef.current,
        token: siteAdminToken() || undefined,
        path: typeof window !== "undefined" ? window.location.pathname : "/",
        gate,
        gateWord: gate ? next : undefined,
        voice: voiceOnRef.current,
        channel: "site",
        behavior: readBehavior(),
      };
      let res = await chatAgent({ data: payload });
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 400));
        res = await chatAgent({ data: payload });
      }
      debugEmit("net", { ok: res.ok, ms: Date.now() - t0, error: res.ok ? "" : (res as { error?: string }).error });
      if (gen !== chatGenRef.current) return;
      if (res.ok) {
        reply = adminThread || res.token ? olgaReply(res.reply) : res.reply;
        if (res.token) {
          awaitingCodeRef.current = false;
          setAwaitingCode(false);
          setSiteAdmin(res.token);
          setAdminMs(adminLeft());
          setPartner("olga");
          adminMsgsRef.current = [{ role: "assistant", content: ADMIN_HELLO }];
          setAdminMsgs(adminMsgsRef.current);
          reply = ADMIN_HELLO;
        }
        shouldReload = Boolean(res.reload);
        if ("groups" in res && Array.isArray(res.groups) && res.groups.length) {
          const incoming = res.groups as typeof groupChips;
          setGroupChips(incoming);
          if (incoming.some((c) => /gid=/i.test(c.send || ""))) {
            speakTail = incoming.some((c) => /отработк/i.test(c.send || ""))
              ? " Выберите слот — поставлю отработку."
              : " Выберите удобное время, и я запишу вас в группу.";
          }
        }
        if ("signup" in res && res.signup) {
          window.open(String(res.signup), "_blank", "noopener,noreferrer");
        }
        if ("open" in res && res.open) {
          const nextPath = String(res.open);
          window.setTimeout(() => goSitePath(nextPath), voiceOnRef.current ? 1400 : 700);
        }
      } else {
        const facts = factsFromMessages(history);
        reply = talkFallback(partnerRef.current === "oleg" ? "oleg" : "olga", facts);
      }
    } catch (e) {
      debugEmit("net", { ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : "сеть" });
      if (gen !== chatGenRef.current) return;
      const history = adminThread ? adminMsgsRef.current : clientMsgsRef.current;
      const facts = factsFromMessages(history);
      reply = talkFallback(partnerRef.current === "oleg" ? "oleg" : "olga", facts);
    }
    if (gen !== chatGenRef.current) return;
    if (reply.trim() && !(gate && reply === ADMIN_HELLO && adminMsgsRef.current.some((m) => m.content === ADMIN_HELLO))) {
      const live = adminThread ? adminMsgsRef.current : clientMsgsRef.current;
      const keep = uiOn("keepAssistantReplies");
      const assistantMsg: Msg = { role: "assistant", content: reply };
      const nextMsgs =
        !keep && live.length && live[live.length - 1].role === "assistant"
          ? [...live.slice(0, -1), assistantMsg]
          : [...live, assistantMsg];
      if (adminThread) {
        adminMsgsRef.current = nextMsgs;
        setAdminMsgs(nextMsgs);
      } else {
        clientMsgsRef.current = nextMsgs;
        setClientMsgs(nextMsgs);
      }
    }
    busyRef.current = false;
    setBusy(false);
    if (voiceOnRef.current && reply.trim()) {
      await maybeSpeak(`${reply}${speakTail}`);
      if (gen !== chatGenRef.current) return;
    }
    if (voiceOnRef.current && !speakingRef.current) startListen();
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
      void maybeSpeak(back).then(() => {
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
      void maybeSpeak(ADMIN_ASK).then(() => {
        if (voiceOnRef.current && !busyRef.current && !speakingRef.current) startListen();
      });
    }
  }

  async function toggleVoice() {
    if (voiceOn) {
      setVoiceOn(false);
      voiceOnRef.current = false;
      stopListen(false);
      cancelSpeech();
      return;
    }
    voiceOnRef.current = true;
    setVoiceOn(true);
    await unlockAudio();
    await ensureMic();
    try {
      window.speechSynthesis?.getVoices();
    } catch {
      /* */
    }
    const spoken = [...(inAdminUi ? adminMsgsRef.current : clientMsgsRef.current)].reverse().find((m) => m.role === "assistant")?.content;
    if (spoken) await maybeSpeak(spoken);
    if (voiceOnRef.current && !busyRef.current && !speakingRef.current) startListen();
  }

  async function replayLast(phrase?: string) {
    if (busyRef.current) return;
    if (!uiOn("allowVoice")) return;
    const live = inAdminUi ? adminMsgsRef.current : clientMsgsRef.current;
    const last = phrase?.trim() || [...live].reverse().find((m) => m.role === "assistant")?.content || "";
    if (!last.trim()) return;
    if (!voiceOnRef.current) {
      voiceOnRef.current = true;
      setVoiceOn(true);
      await unlockAudio();
      await ensureMic();
    }
    await speak(last);
  }

  function pickPartner(next: "oleg" | "olga") {
    if (inAdminUi) return;
    cancelSpeech();
    writePartner(next);
    setPartner(next);
    const onlyHello = clientMsgsRef.current.length <= 1 && !clientMsgsRef.current.some((m) => m.role === "user");
    if (onlyHello) {
      const hello = greeting(next, pageAgent);
      clientMsgsRef.current = [{ role: "assistant", content: hello }];
      setClientMsgs(clientMsgsRef.current);
      if (voiceOnRef.current) {
        void maybeSpeak(hello).then(() => {
          if (voiceOnRef.current && !busyRef.current && !speakingRef.current) startListen();
        });
        return;
      }
    }
    if (voiceOnRef.current) {
      window.setTimeout(() => {
        if (voiceOnRef.current && !busyRef.current && !speakingRef.current) startListen();
      }, 80);
    }
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

  if (!uiOn("showChat")) return null;

  return (
    <div className="agent-shell pointer-events-none fixed inset-x-0 bottom-0 z-[60] md:inset-auto md:bottom-6 md:right-6">
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
              {voiceOn && uiOn("allowBarge") ? (
                <button
                  type="button"
                  className={cn(
                    "grid h-8 shrink-0 place-items-center rounded-full px-2 sm:h-9 sm:px-2.5",
                    bargeOn ? "bg-white text-primary" : "bg-black/15 text-white hover:bg-black/25",
                  )}
                  title={bargeOn ? "Перебивать можно — говорите поверх" : "Включить перебивание"}
                  aria-label={bargeOn ? "Перебивание включено" : "Включить перебивание"}
                  aria-pressed={bargeOn}
                  onClick={() => {
                    const next = !bargeOn;
                    setBargeOn(next);
                    bargeRef.current = next;
                    try {
                      localStorage.setItem("ra_barge", next ? "1" : "0");
                    } catch {
                      /* */
                    }
                    if (voiceOnRef.current && !busyRef.current) {
                      stopListen(true);
                      startListen();
                    }
                  }}
                >
                  <AudioLines className="size-4" />
                </button>
              ) : null}
              {uiOn("allowReset") ? (
              <button
                type="button"
                className="grid size-8 place-items-center rounded-full bg-black/15 hover:bg-black/25 sm:size-9"
                title="Сбросить диалог"
                aria-label="Сбросить диалог"
                onClick={() => {
                  cancelSpeech();
                  stopListen();
                  sendIdRef.current += 1;
                  chatGenRef.current += 1;
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
                  if (adminLeft() > 0) {
                    adminMsgsRef.current = [{ role: "assistant", content: ADMIN_HELLO }];
                    setAdminMsgs(adminMsgsRef.current);
                  } else {
                    clientMsgsRef.current = [{ role: "assistant", content: greeting(partner, pageAgent) }];
                    setClientMsgs(clientMsgsRef.current);
                  }
                  setGroupChips([]);
                  setText("");
                  if (voiceOnRef.current) {
                    const hello = adminLeft() > 0 ? ADMIN_HELLO : greeting(partner, pageAgent);
                    void maybeSpeak(hello).then(() => {
                      if (voiceOnRef.current && !busyRef.current && !speakingRef.current) startListen();
                    });
                  }
                }}
              >
                <RotateCcw className="size-4" />
              </button>
              ) : null}
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
            <div className="flex items-end gap-2 pr-[7.25rem] sm:gap-3 sm:pr-[8.5rem]">
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
            {inAdminUi ? null : uiOn("allowOlga") || uiOn("allowOleg") ? (
              <div className={cn("mt-2 grid gap-1.5", uiOn("allowOlga") && uiOn("allowOleg") ? "grid-cols-2" : "grid-cols-1")}>
                {uiOn("allowOlga") ? (
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
                ) : null}
                {uiOn("allowOleg") ? (
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
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-[#eef1f7] px-3 py-2.5 sm:px-3.5 sm:py-3">
            {messages.filter((m) => m.role !== "user" || !noisyAdmin(m.content)).map((m, i, list) => {
              const lastAs = [...list].map((x, idx) => (x.role === "assistant" ? idx : -1)).filter((n) => n >= 0).pop();
              const mode = inAdminUi ? "olga" : partner;
              const turnsRaw = parseTurns(m.content, mode);
              const turns = (inAdminUi ? turnsRaw.filter((t) => t.who === "olga") : turnsRaw.filter((t) => t.who === partner));
              const view = turns.length ? turns : [{ who: mode as Who, text: m.content.replace(/^(Олег|Ольга):\s*/i, "") }];
              const chipBar =
                i === lastAs && !busy && uiOn("showChips") && offer.chips.length ? (
                  <div className="pl-11">
                    {offer.hint ? (
                      <p className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">{offer.hint}</p>
                    ) : null}
                    <div className={cn("flex flex-wrap gap-1.5", offer.chips.some((c) => c.note) ? "flex-col" : "")}>
                      {offer.chips.map((chip) => {
                        const body = chip.note ? (
                          <>
                            <span className="block text-[0.82rem] font-semibold leading-snug">{chip.label}</span>
                            <span className="mt-0.5 block text-[0.72rem] font-medium leading-snug opacity-80">{chip.note}</span>
                          </>
                        ) : (
                          chip.label
                        );
                        const cls = cn(
                          chip.note
                            ? "w-full max-w-[22rem] rounded-2xl px-3 py-2 text-left"
                            : "rounded-full px-3 py-1.5 text-[0.78rem] font-semibold",
                          chip.primary ? "bg-primary text-primary-foreground" : "bg-white text-fg shadow-[var(--shadow-border)] hover:bg-primary hover:text-primary-foreground",
                        );
                        if (chip.href) {
                          return chip.href.startsWith("/") ? (
                            <PageLink key={chip.label} to={chip.href} className={cls}>
                              {body}
                            </PageLink>
                          ) : (
                            <a key={chip.label} href={chip.href} className={cls}>
                              {body}
                            </a>
                          );
                        }
                        return (
                          <button key={chip.label} type="button" onClick={() => void send(chip.send || chip.label)} className={cls}>
                            {body}
                          </button>
                        );
                      })}
                    </div>
                    {offer.after ? (
                      <p className="mt-2 text-[0.86rem] leading-relaxed text-fg">{offer.after}</p>
                    ) : null}
                  </div>
                ) : null;
              return m.role === "user" ? (
                <div key={`u-${i}`} className="flex justify-end">
                  <div className="max-w-[78%] rounded-2xl rounded-br-md bg-header px-3.5 py-2.5 text-[0.92rem] leading-relaxed text-header-fg">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={`a-${i}`} ref={i === list.length - 1 ? lastMsgRef : undefined} className="space-y-3">
                  {view.map((turn, t) => (
                    <div key={`${i}-${t}`} className="flex items-end gap-2">
                      <Face who={turn.who} mood={i === list.length - 1 ? mood : "hello"} size={36} />
                      <div className="max-w-[78%]">
                        <p className="mb-0.5 pl-1 text-[0.65rem] font-semibold text-muted">{turn.who === "olga" ? "Ольга" : "Олег"}</p>
                        <div className="rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[0.92rem] leading-relaxed text-fg shadow-[0_8px_24px_-16px_rgba(18,20,26,0.4)]">
                          {turn.text}
                        </div>
                      </div>
                      {uiOn("allowVoice") && i === lastAs && t === view.length - 1 && !busy ? (
                        <button
                          type="button"
                          className="mb-1 grid size-8 shrink-0 place-items-center rounded-full bg-white text-muted shadow-[var(--shadow-border)] hover:bg-primary hover:text-primary-foreground"
                          title="Повторить ответ"
                          aria-label="Повторить ответ"
                          onClick={() => void replayLast(`${turn.who === "olga" ? "Ольга" : "Олег"}: ${turn.text}`)}
                        >
                          <Repeat2 className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {chipBar}
                </div>
              );
            })}
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
            {uiOn("allowVoice") ? (
            <div className="mb-2 space-y-1.5">
            <button
              type="button"
              onClick={() => void toggleVoice()}
              className={cn(
                "flex h-11 w-full items-center justify-center gap-2 rounded-full text-[0.92rem] font-semibold",
                voiceOn ? "bg-[#e8f0ff] text-primary ring-1 ring-primary/20" : "bg-primary text-primary-foreground",
              )}
            >
              {voiceOn ? <Mic className="size-4" /> : <Volume2 className="size-4" />}
              {voiceOn ? (listening ? "Слушаю… нажмите, чтобы выключить" : speaking ? "Говорю… нажмите, чтобы выключить" : "Выключить голосовой режим") : "Включить голосовой режим"}
            </button>
            {voiceOn && uiOn("allowBarge") ? (
              <button
                type="button"
                onClick={() => {
                  const next = !bargeOn;
                  setBargeOn(next);
                  bargeRef.current = next;
                  try {
                    localStorage.setItem("ra_barge", next ? "1" : "0");
                  } catch {
                    /* */
                  }
                  if (voiceOnRef.current && !busyRef.current) {
                    stopListen(true);
                    startListen();
                  }
                }}
                className={cn(
                  "flex h-8 w-full items-center justify-center rounded-full text-[0.72rem] font-semibold",
                  bargeOn ? "bg-primary/10 text-primary" : "bg-[#eef1f7] text-muted",
                )}
              >
                {bargeOn ? "Перебивать можно — говорите поверх" : "Включить перебивание"}
              </button>
            ) : null}
            {voiceOn ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void replayLast()}
                className="flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-[#eef1f7] text-[0.72rem] font-semibold text-fg disabled:opacity-40"
              >
                <Repeat2 className="size-3.5" />
                Повторить ответ
              </button>
            ) : null}
            </div>
            ) : null}
            {voiceOn && uiOn("allowVoice") ? null : (
            <div className="flex items-center gap-2 rounded-full bg-[#eef1f7] p-1 ring-1 ring-black/8 focus-within:ring-2 focus-within:ring-primary/40">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Напишите или нажмите кнопку"
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
              {uiOn("allowAdminMode") ? (
              <button
                type="button"
                className="shrink-0 text-[0.62rem] font-semibold text-primary underline-offset-2 hover:underline"
                onClick={() => (inAdminUi ? leaveAdmin() : enterAdmin())}
              >
                {inAdminUi ? "вернуться в клиентский режим" : "войти в административный режим"}
              </button>
              ) : (
                <span />
              )}
            </div>
          </form>
        </div>
      ) : null}
      {open ? null : (
        <div className="agent-fab-wrap pointer-events-auto absolute bottom-[4.85rem] right-3 md:static">
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              void unlockAudio();
            }}
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
