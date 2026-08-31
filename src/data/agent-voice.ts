import { createServerFn } from "@tanstack/react-start";
import { serverEnv } from "./server-env";
import { loadVoiceSettings, type VoiceSettings } from "./voice-settings";

const MALE = ["zahar", "filipp", "ermil", "madirus"];
const FEMALE = ["alena", "jane", "marina", "oksana"];

function speakRu(text: string) {
  return text
    .replace(/IT-лаборатория Create/gi, "айти-лаборатория криэйт")
    .replace(/IT-лаборатория/gi, "айти-лаборатория")
    .replace(/\bCreate\b/g, "криэйт")
    .replace(/StartSchool/gi, "старт скул")
    .replace(/JuniorSchool/gi, "джуниор скул")
    .replace(/Super Minds/gi, "супер майндс")
    .replace(/Go Getter/gi, "гоу геттер")
    .replace(/GameDev/gi, "геймдев")
    .replace(/\bScratch\b/g, "скретч")
    .replace(/\bPython\b/g, "пайтон")
    .replace(/C\+\+/g, "си плюс плюс")
    .replace(/\bUnity\b/g, "юнити")
    .replace(/\bBlender\b/g, "блендер")
    .replace(/\bSTEAM\b/g, "стим");
}

function clean(text: string) {
  return speakRu(text)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[#*_`>]+/g, "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s*\.{2,}\s*/g, ". ")
    .replace(/;\s+/g, ", ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

function emotionOf(mood: string) {
  if (mood === "calm" || mood === "quiet" || mood === "neutral") return "neutral";
  return "good";
}

function pace(speed: number, pause: number) {
  const n = Number(speed) || 1.15;
  const p = Number.isFinite(pause) ? pause : 0.1;
  return Math.min(1.4, Math.max(0.95, n + (0.18 - p) * 0.35));
}

function audioFromV3(raw: string) {
  const parts: Buffer[] = [];
  const push = (obj: unknown) => {
    const rec = obj as { result?: { audioChunk?: { data?: string } }; audioChunk?: { data?: string } };
    const b64 = rec?.result?.audioChunk?.data || rec?.audioChunk?.data;
    if (b64) parts.push(Buffer.from(b64, "base64"));
  };
  try {
    push(JSON.parse(raw));
  } catch {
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        push(JSON.parse(t));
      } catch {
        /* skip */
      }
    }
  }
  if (!parts.length) return null;
  return Buffer.concat(parts);
}

async function synthV1(text: string, voice: string, emotion: string, speed: number, key: string, folder: string) {
  const body = new URLSearchParams({
    lang: "ru-RU",
    voice,
    emotion,
    speed: String(Math.round(speed * 100) / 100),
    format: "mp3",
    sampleRateHertz: "48000",
    text,
    folderId: folder,
  });
  for (const auth of [`Api-Key ${key}`, `Bearer ${key}`]) {
    const res = await fetch("https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 400) continue;
    return `data:audio/mpeg;base64,${buf.toString("base64")}`;
  }
  return "";
}

async function synthV3(text: string, voice: string, emotion: string, speed: number, key: string, folder: string) {
  const hints: Record<string, unknown>[] = [{ voice }, { speed }];
  if (voice === "alena" || voice === "zahar" || voice === "jane") hints.splice(1, 0, { role: emotion === "neutral" ? "neutral" : "good" });
  const body = {
    text,
    hints,
    outputAudioSpec: { containerAudio: { containerAudioType: "MP3" } },
    folderId: folder,
  };
  for (const auth of [`Api-Key ${key}`, `Bearer ${key}`]) {
    const res = await fetch("https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis", {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        "x-folder-id": folder,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) continue;
    const buf = audioFromV3(await res.text());
    if (!buf || buf.length < 400) continue;
    return `data:audio/mpeg;base64,${buf.toString("base64")}`;
  }
  return "";
}

async function synthesize(text: string, voice: string, emotion: string, speed: number, key: string, folder: string) {
  return (await synthV1(text, voice, emotion, speed, key, folder)) || (await synthV3(text, voice, emotion, speed, key, folder));
}

export const speakAgent = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        text: string;
        who?: "oleg" | "olga";
        preview?: Partial<VoiceSettings>;
      },
  )
  .handler(async ({ data }) => {
    const key = serverEnv("YANDEX_API_KEY");
    const folder = serverEnv("YANDEX_FOLDER_ID");
    const settings = { ...loadVoiceSettings(), ...(data.preview || {}) };
    const who = data.who === "olga" ? "olga" : "oleg";
    const preferred = who === "olga" ? settings.olga : settings.oleg;
    const list =
      who === "olga"
        ? [preferred, ...FEMALE.filter((v) => v !== preferred)]
        : [preferred, ...MALE.filter((v) => v !== preferred)];
    const text = clean(data.text || "");
    if (!key || !folder || !text) return { ok: false as const, error: "no-voice" };
    const emotion = emotionOf(settings.mood || settings.role || "good");
    const speed = pace(settings.speed, settings.pause);
    for (const voice of list) {
      const audio = await synthesize(text, voice, emotion, speed, key, folder);
      if (audio) {
        return {
          ok: true as const,
          audio,
          speed: 1,
          volume: settings.mood === "quiet" ? 0.78 : 1,
          voice,
        };
      }
    }
    return { ok: false as const, error: "tts" };
  });

export const publicVoiceSettings = createServerFn({ method: "GET" }).handler(async () => loadVoiceSettings());
