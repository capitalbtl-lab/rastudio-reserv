/** Ограниченный по времени запрос SpeechKit. Ошибка доступа не требует перебора голосов. */
export class VoiceError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

async function requestAudio(url: string, init: RequestInit, key: string, deadline: number) {
  const failures: number[] = [];
  for (const auth of [`Api-Key ${key}`, `Bearer ${key}`]) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new VoiceError("tts-timeout", "Сервис озвучки не ответил вовремя.");
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: auth }, signal: AbortSignal.timeout(Math.min(4000, remaining)) });
    } catch {
      throw new VoiceError("tts-network", "Не удалось связаться с сервисом озвучки.");
    }
    if (res.ok) return res;
    failures.push(res.status);
    await res.text();
    if (res.status === 429 || res.status >= 500) {
      throw new VoiceError("tts-provider", `Сервис озвучки временно недоступен (${res.status}).`);
    }
  }
  if (failures.every((status) => status === 401 || status === 403)) {
    const forbidden = failures.includes(403);
    throw new VoiceError(forbidden ? "tts-forbidden" : "tts-auth", forbidden
      ? "Яндекс SpeechKit отклонил доступ (403). Проверьте права сервисного аккаунта и область ключа."
      : "Яндекс SpeechKit отклонил авторизацию (401). Проверьте ключ и срок его действия.");
  }
  return null;
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

async function synthV1(text: string, voice: string, emotion: string, speed: number, key: string, folder: string, deadline: number) {
  const body = new URLSearchParams({ lang: "ru-RU", voice, emotion, speed: String(Math.round(speed * 100) / 100), format: "mp3", sampleRateHertz: "48000", text, folderId: folder });
  const res = await requestAudio("https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
  }, key, deadline);
  if (!res) return "";
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length >= 400 ? `data:audio/mpeg;base64,${buf.toString("base64")}` : "";
}

async function synthV3(text: string, voice: string, emotion: string, speed: number, key: string, folder: string, deadline: number) {
  const hints: Record<string, unknown>[] = [{ voice }, { speed }];
  if (voice === "alena" || voice === "zahar" || voice === "jane") hints.splice(1, 0, { role: emotion === "neutral" ? "neutral" : "good" });
  const res = await requestAudio("https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis", {
    method: "POST", headers: { "Content-Type": "application/json", "x-folder-id": folder },
    body: JSON.stringify({ text, hints, outputAudioSpec: { containerAudio: { containerAudioType: "MP3" } }, folderId: folder }),
  }, key, deadline);
  if (!res) return "";
  const buf = audioFromV3(await res.text());
  return buf && buf.length >= 400 ? `data:audio/mpeg;base64,${buf.toString("base64")}` : "";
}

export async function synthesize(text: string, voice: string, emotion: string, speed: number, key: string, folder: string, deadline: number) {
  return (await synthV1(text, voice, emotion, speed, key, folder, deadline)) || (await synthV3(text, voice, emotion, speed, key, folder, deadline));
}
