import { createServerFn } from "@tanstack/react-start";

function clean(text: string) {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[#*_`>]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}

function toSsml(text: string) {
  const escaped = clean(text)
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">");
  const body = escaped
    .replace(/\s*\.{2,}\s*/g, ", ")
    .replace(/([.!?])(\s+|$)/g, '<break time="90ms"/>')
    .replace(/:\s+/g, '<break time="50ms"/>')
    .replace(/,\s+/g, '<break time="35ms"/>')
    .replace(/\s+[—–]\s+/g, '<break time="45ms"/>');
  return `<speak>${body}</speak>`;
}

export const speakAgent = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { text: string; voice?: "filipp" | "alena" })
  .handler(async ({ data }) => {
    const key = process.env.YANDEX_API_KEY?.trim();
    const folder = process.env.YANDEX_FOLDER_ID?.trim();
    const text = clean(data.text || "");
    if (!key || !folder || !text) return { ok: false as const, error: "no-voice" };
    const voice = data.voice === "alena" ? "alena" : "zahar";
    const body = new URLSearchParams({
      ssml: toSsml(text),
      lang: "ru-RU",
      voice,
      emotion: "good",
      speed: "1.18",
      format: "mp3",
      folderId: folder,
    });
    let res = await fetch("https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize", {
      method: "POST",
      headers: {
        Authorization: `Api-Key ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) {
      const fallback = new URLSearchParams({
        text,
        lang: "ru-RU",
        voice,
        emotion: "good",
        speed: "1.18",
        format: "mp3",
        folderId: folder,
      });
      res = await fetch("https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize", {
        method: "POST",
        headers: {
          Authorization: `Api-Key ${key}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: fallback,
      });
    }
    if (!res.ok) return { ok: false as const, error: "tts" };
    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: true as const, audio: `data:audio/mpeg;base64,${buf.toString("base64")}` };
  });
