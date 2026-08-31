import { createServerFn } from "@tanstack/react-start";
import { serverEnv } from "./server-env";
import { loadVoiceSettings, type VoiceSettings } from "./voice-settings";

const MALE = ["zahar", "filipp", "ermil"];
const FEMALE = ["alena", "jane", "marina"];

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

function clean(text: string, pause: number) {
  let t = speakRu(text)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[#*_`>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (pause < 0.45) {
    t = t.replace(/\s+[—–]\s+/g, ", ").replace(/\s*\.{2,}\s*/g, ". ").replace(/;\s+/g, ", ");
  }
  return t.slice(0, 800);
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

function roleOf(mood: string) {
  if (mood === "calm" || mood === "quiet" || mood === "neutral") return "neutral";
  if (mood === "friendly") return "friendly";
  return "good";
}

async function synthesize(text: string, voice: string, role: string, speed: number, pause: number, key: string, folder: string) {
  const auths = [`Bearer ${key}`, `Api-Key ${key}`];
  const breakMs = Math.round(20 + pause * 90);
  const ssml = `<speak>${text
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/([.!?])\s+/g, `$1<break time="${breakMs}ms"/> `)}</speak>`;
  const bodies = [
    { text, hints: [{ voice }, { role }, { speed }] },
    { text, hints: [{ voice }, { speed }] },
    { ssml, hints: [{ voice }] },
    { text, voice, hints: [{ voice }] },
  ];
  for (const auth of auths) {
    for (const body of bodies) {
      const res = await fetch("https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis", {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
          "x-folder-id": folder,
        },
        body: JSON.stringify({ ...body, folderId: folder }),
      });
      if (!res.ok) continue;
      const buf = audioFromV3(await res.text());
      if (!buf || buf.length < 200) continue;
      const mime = buf.slice(0, 4).toString("ascii") === "RIFF" ? "audio/wav" : "audio/mpeg";
      return `data:${mime};base64,${buf.toString("base64")}`;
    }
  }
  return "";
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
    const list = who === "olga" ? [preferred, ...FEMALE.filter((v) => v !== preferred)] : [preferred, ...MALE.filter((v) => v !== preferred)];
    const text = clean(data.text || "", settings.pause);
    if (!key || !folder || !text) return { ok: false as const, error: "no-voice" };
    const mood = settings.mood || settings.role || "good";
    for (const voice of list) {
      const audio = await synthesize(text, voice, roleOf(mood), settings.speed, settings.pause, key, folder);
      if (audio) {
        return {
          ok: true as const,
          audio,
          speed: 1,
          volume: mood === "quiet" ? 0.72 : 1,
          voice,
        };
      }
    }
    return { ok: false as const, error: "tts" };
  });

export const publicVoiceSettings = createServerFn({ method: "GET" }).handler(async () => loadVoiceSettings());
