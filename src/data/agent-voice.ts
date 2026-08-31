import { createServerFn } from "@tanstack/react-start";
import { serverEnv } from "./server-env";
import { loadVoiceSettings } from "./voice-settings";

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
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
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

async function synthesize(text: string, voice: string, role: string, speed: number, key: string, folder: string) {
  const auths = [`Bearer ${key}`, `Api-Key ${key}`];
  const bodies = [
    {
      text,
      hints: [{ voice }, { role }, { speed: String(speed) }],
      folderId: folder,
    },
    { text, voice, folderId: folder },
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
        body: JSON.stringify(body),
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
  .validator((data: unknown) => data as { text: string; who?: "oleg" | "olga" })
  .handler(async ({ data }) => {
    const key = serverEnv("YANDEX_API_KEY");
    const folder = serverEnv("YANDEX_FOLDER_ID");
    const text = clean(data.text || "");
    if (!key || !folder || !text) return { ok: false as const, error: "no-voice" };
    const settings = loadVoiceSettings();
    const voice = data.who === "olga" ? settings.olga : settings.oleg;
    const audio = await synthesize(text, voice, settings.role, settings.speed, key, folder);
    if (!audio) return { ok: false as const, error: "tts" };
    return { ok: true as const, audio, speed: settings.speed };
  });

export const publicVoiceSettings = createServerFn({ method: "GET" }).handler(async () => loadVoiceSettings());
