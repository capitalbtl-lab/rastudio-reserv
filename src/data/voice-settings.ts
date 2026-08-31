import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  DEFAULT_VOICE,
  FEMALE_VOICES,
  MALE_VOICES,
  VOICE_MOODS,
  type VoiceSettings,
} from "./voices-core";

export { DEFAULT_VOICE, FEMALE_VOICES, MALE_VOICES, VOICE_MOODS, VOICE_MOODS as VOICE_ROLES, type VoiceSettings } from "./voices-core";

const MALE_IDS = MALE_VOICES.map((v) => v.id);
const FEMALE_IDS = FEMALE_VOICES.map((v) => v.id);
const MOOD_IDS = VOICE_MOODS.map((v) => v.id);

function filePath() {
  return join(process.cwd(), "storage", "voice.json");
}

function clamp(n: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

function maleOf(id?: string) {
  return MALE_IDS.includes(id as (typeof MALE_IDS)[number]) ? String(id) : DEFAULT_VOICE.oleg;
}

function femaleOf(id?: string) {
  return FEMALE_IDS.includes(id as (typeof FEMALE_IDS)[number]) ? String(id) : DEFAULT_VOICE.olga;
}

function moodOf(id?: string, fallback = DEFAULT_VOICE.mood) {
  const v = String(id || "");
  return MOOD_IDS.includes(v as (typeof MOOD_IDS)[number]) ? v : fallback;
}

export function loadVoiceSettings(): VoiceSettings {
  try {
    if (existsSync(filePath())) {
      const raw = JSON.parse(readFileSync(filePath(), "utf8")) as Partial<VoiceSettings>;
      const mood = moodOf(raw.mood || raw.role);
      const speed = clamp(Number(raw.speed), 0.9, 1.4, DEFAULT_VOICE.speed);
      const pause = clamp(Number(raw.pause), 0, 0.6, DEFAULT_VOICE.pause);
      return {
        oleg: maleOf(raw.oleg),
        olga: femaleOf(raw.olga),
        speed,
        pause,
        mood,
        role: mood === "calm" || mood === "quiet" || mood === "strict" ? "neutral" : mood,
        olegSpeed: clamp(Number(raw.olegSpeed ?? speed), 0.9, 1.4, speed),
        olgaSpeed: clamp(Number(raw.olgaSpeed ?? speed), 0.9, 1.4, speed),
        olegMood: moodOf(raw.olegMood, mood),
        olgaMood: moodOf(raw.olgaMood, mood),
        olegVolume: clamp(Number(raw.olegVolume ?? 1), 0.45, 1, 1),
        olgaVolume: clamp(Number(raw.olgaVolume ?? 1), 0.45, 1, 1),
        turnGap: clamp(Number(raw.turnGap ?? 0.18), 0, 0.8, 0.18),
        sampleOleg: String(raw.sampleOleg || DEFAULT_VOICE.sampleOleg).slice(0, 280),
        sampleOlga: String(raw.sampleOlga || DEFAULT_VOICE.sampleOlga).slice(0, 280),
      };
    }
  } catch {
    /* default */
  }
  return { ...DEFAULT_VOICE };
}

export function saveVoiceSettings(patch: Partial<VoiceSettings>) {
  const cur = loadVoiceSettings();
  const mood = moodOf(patch.mood || patch.role, cur.mood);
  const next: VoiceSettings = {
    oleg: patch.oleg ? maleOf(patch.oleg) : cur.oleg,
    olga: patch.olga ? femaleOf(patch.olga) : cur.olga,
    speed: patch.speed != null ? clamp(Number(patch.speed), 0.9, 1.4, cur.speed) : cur.speed,
    pause: patch.pause != null ? clamp(Number(patch.pause), 0, 0.6, cur.pause) : cur.pause,
    mood,
    role: mood === "calm" || mood === "quiet" || mood === "strict" ? "neutral" : mood,
    olegSpeed: patch.olegSpeed != null ? clamp(Number(patch.olegSpeed), 0.9, 1.4, cur.olegSpeed) : cur.olegSpeed,
    olgaSpeed: patch.olgaSpeed != null ? clamp(Number(patch.olgaSpeed), 0.9, 1.4, cur.olgaSpeed) : cur.olgaSpeed,
    olegMood: patch.olegMood ? moodOf(patch.olegMood, cur.olegMood) : cur.olegMood,
    olgaMood: patch.olgaMood ? moodOf(patch.olgaMood, cur.olgaMood) : cur.olgaMood,
    olegVolume: patch.olegVolume != null ? clamp(Number(patch.olegVolume), 0.45, 1, cur.olegVolume) : cur.olegVolume,
    olgaVolume: patch.olgaVolume != null ? clamp(Number(patch.olgaVolume), 0.45, 1, cur.olgaVolume) : cur.olgaVolume,
    turnGap: patch.turnGap != null ? clamp(Number(patch.turnGap), 0, 0.8, cur.turnGap) : cur.turnGap,
    sampleOleg: patch.sampleOleg != null ? String(patch.sampleOleg).slice(0, 280) : cur.sampleOleg,
    sampleOlga: patch.sampleOlga != null ? String(patch.sampleOlga).slice(0, 280) : cur.sampleOlga,
  };
  mkdirSync(dirname(filePath()), { recursive: true });
  writeFileSync(filePath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function parseVoiceCommand(
  who: string,
  voice: string,
  speed?: number,
  faster?: boolean,
  slower?: boolean,
  mood?: string,
  pause?: number,
) {
  const cur = loadVoiceSettings();
  const patch: Partial<VoiceSettings> = {};
  const w = (who || "").toLowerCase();
  const v = (voice || "").toLowerCase();
  const oleg = /олег|мужск/.test(w) || /захар|филипп|ермил|мадирус/.test(v);
  const olga = /ольг|женск/.test(w) || /ален|джен|марин|оксан|омаж/.test(v);
  if (oleg) {
    patch.oleg = v.includes("филипп") ? "filipp" : v.includes("ермил") ? "ermil" : v.includes("мадирус") ? "madirus" : "zahar";
  }
  if (olga) {
    patch.olga = v.includes("джен")
      ? "jane"
      : v.includes("марин")
        ? "marina"
        : v.includes("оксан")
          ? "oksana"
          : v.includes("омаж")
            ? "omazh"
            : "alena";
  }
  const both = !oleg && !olga;
  if (typeof speed === "number") {
    if (both || oleg) patch.olegSpeed = speed;
    if (both || olga) patch.olgaSpeed = speed;
    patch.speed = speed;
  }
  if (faster) {
    if (both || oleg) patch.olegSpeed = cur.olegSpeed + 0.04;
    if (both || olga) patch.olgaSpeed = cur.olgaSpeed + 0.04;
  }
  if (slower) {
    if (both || oleg) patch.olegSpeed = cur.olegSpeed - 0.04;
    if (both || olga) patch.olgaSpeed = cur.olgaSpeed - 0.04;
  }
  if (typeof pause === "number") patch.pause = pause;
  let nextMood = mood || "";
  if (/радост|позитив/.test(v + w)) nextMood = "good";
  if (/спокойн/.test(v + w)) nextMood = "calm";
  if (/тих/.test(v + w)) nextMood = "quiet";
  if (/дружелюб/.test(v + w)) nextMood = "friendly";
  if (/строг|делов/.test(v + w)) nextMood = "strict";
  if (nextMood) {
    patch.mood = nextMood;
    if (both || oleg) patch.olegMood = nextMood;
    if (both || olga) patch.olgaMood = nextMood;
  }
  return saveVoiceSettings(patch);
}
