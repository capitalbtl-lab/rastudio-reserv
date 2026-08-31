import { createServerFn } from "@tanstack/react-start";

function clean(text: string) {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[#*_`>]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}

export const speakAgent = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { text: string; voice?: "filipp" | "alena" })
  .handler(async ({ data }) => {
    const key = process.env.YANDEX_API_KEY?.trim();
    const folder = process.env.YANDEX_FOLDER_ID?.trim();
    const text = clean(data.text || "");
    if (!key || !folder || !text) return { ok: false as const, error: "no-voice" };
    const voice = data.voice === "alena" ? "alena" : "filipp";
    const body = new URLSearchParams({
      text,
      lang: "ru-RU",
      voice,
      emotion: "good",
      speed: voice === "alena" ? "1.25" : "1.3",
      format: "mp3",
      folderId: folder,
    });
    const res = await fetch("https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize", {
      method: "POST",
      headers: {
        Authorization: `Api-Key ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) return { ok: false as const, error: "tts" };
    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: true as const, audio: `data:audio/mpeg;base64,${buf.toString("base64")}` };
  });
