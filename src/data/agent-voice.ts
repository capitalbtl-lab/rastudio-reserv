import { createServerFn } from "@tanstack/react-start";
import { serverEnv } from "./server-env";
import { loadVoiceSettings, type VoiceSettings } from "./voice-settings";
import { synthesize, VoiceError } from "./speechkit-tts.ts";

const MALE = ["zahar", "filipp", "ermil", "madirus"];
const FEMALE = ["alena", "jane", "marina", "oksana", "omazh"];

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
    .replace(/\b(zahar|filipp|ermil|madirus|alena|jane|marina|oksana)\b/gi, "")
    .replace(/\bspeed\s*[\d.]+/gi, "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s*\.{2,}\s*/g, ". ")
    .replace(/;\s+/g, ", ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

function emotionOf(mood: string) {
  if (mood === "strict") return "evil";
  if (mood === "friendly") return "friendly";
  if (mood === "calm" || mood === "quiet" || mood === "neutral") return "neutral";
  return "good";
}

function emotionFallbacks(mood: string) {
  const first = emotionOf(mood);
  return first === "good" ? ["good", "neutral"] : [first, "good"];
}

function pace(speed: number, pause: number) {
  const n = Number(speed) || 1.15;
  const p = Number.isFinite(pause) ? pause : 0.1;
  return Math.min(1.4, Math.max(0.95, n + (0.18 - p) * 0.35));
}

const MALE_OK = new Set(["zahar", "filipp", "ermil", "madirus"]);
const FEMALE_OK = new Set(["alena", "jane", "marina", "oksana", "omazh"]);

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
    const preferred = who === "olga" ? settings.olga || "alena" : settings.oleg || "zahar";
    const list =
      who === "olga"
        ? [preferred, ...FEMALE.filter((v) => v !== preferred)]
        : [preferred, ...MALE.filter((v) => v !== preferred)];
    const text = clean(data.text || "");
    if (!key || !folder || !text) return { ok: false as const, error: "no-voice" };
    const mood = who === "olga" ? settings.olgaMood || settings.mood : settings.olegMood || settings.mood;
    const rawSpeed = who === "olga" ? settings.olgaSpeed || settings.speed : settings.olegSpeed || settings.speed;
    const speed = pace(rawSpeed, settings.pause);
    const vol = who === "olga" ? Number(settings.olgaVolume ?? 1) : Number(settings.olegVolume ?? 1);
    const quiet = mood === "quiet" ? 0.78 : 1;
    const deadline = Date.now() + 12000;
    try {
      for (const voice of list) {
        if (who === "oleg" && !MALE_OK.has(voice)) continue;
        if (who === "olga" && !FEMALE_OK.has(voice)) continue;
        for (const emotion of emotionFallbacks(mood)) {
          const audio = await synthesize(text, voice, emotion, speed, key, folder, deadline);
          if (!audio) continue;
          return {
            ok: true as const,
            audio,
            speed: 1,
            volume: Math.min(1, Math.max(0.45, vol * quiet)),
            voice,
            who,
            turnGap: settings.turnGap ?? 0.18,
          };
        }
      }
    } catch (e) {
      return { ok: false as const, error: e instanceof VoiceError ? e.code : "tts", message: e instanceof VoiceError ? e.message : "Не удалось получить озвучку." };
    }
    return { ok: false as const, error: "tts", message: "Не удалось подобрать голос SpeechKit. Проверьте настройки голоса." };
  });

export const publicVoiceSettings = createServerFn({ method: "GET" }).handler(async () => loadVoiceSettings());
