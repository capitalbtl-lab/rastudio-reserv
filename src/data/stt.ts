import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { serverEnv } from "./server-env";

const exec = promisify(execFile);

function authHeaders(key: string, folder: string) {
  return [
    { Authorization: `Api-Key ${key}`, "x-folder-id": folder },
    { Authorization: `Bearer ${key}`, "x-folder-id": folder },
  ];
}

async function recognizeChunk(buf: Buffer, key: string, folder: string) {
  const url = "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?lang=ru-RU&topic=general&format=mp3";
  for (const headers of authHeaders(key, folder)) {
    const res = await fetch(url, { method: "POST", headers, body: new Uint8Array(buf) });
    const json = (await res.json()) as { result?: string };
    const text = json.result || "";
    if (res.ok && text) return text;
  }
  return "";
}

async function splitMp3(src: string, dir: string) {
  mkdirSync(dir, { recursive: true });
  await exec("ffmpeg", ["-y", "-i", src, "-ac", "1", "-ar", "16000", "-f", "segment", "-segment_time", "25", "-c:a", "libmp3lame", "-q:a", "6", join(dir, "p-%03d.mp3")]);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".mp3"))
    .sort()
    .map((f) => join(dir, f));
}

export async function transcribeUrl(url: string, id: string) {
  const key = serverEnv("YANDEX_API_KEY");
  const folder = serverEnv("YANDEX_FOLDER_ID");
  if (!key || !folder) throw new Error("no-stt");
  const root = join(process.cwd(), "storage", "calls", id);
  mkdirSync(root, { recursive: true });
  const file = join(root, "call.mp3");
  const audio = await fetch(url);
  if (!audio.ok) throw new Error("no-audio");
  writeFileSync(file, Buffer.from(await audio.arrayBuffer()));
  const chunksDir = join(root, "chunks");
  let parts: string[] = [];
  try {
    parts = await splitMp3(file, chunksDir);
  } catch {
    parts = [file];
  }
  const texts: string[] = [];
  for (const part of parts) {
    const buf = readFileSync(part);
    if (buf.length < 400) continue;
    const piece = await recognizeChunk(buf, key, folder);
    if (piece) texts.push(piece.trim());
  }
  try {
    rmSync(chunksDir, { recursive: true, force: true });
  } catch {
    /* keep */
  }
  return texts.join(" ").replace(/\s+/g, " ").trim();
}