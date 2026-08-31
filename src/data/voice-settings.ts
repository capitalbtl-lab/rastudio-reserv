import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const MALE_VOICES = [
  { id: "zahar", label: "Захар — мужской, низкий" },
  { id: "filipp", label: "Филипп — мужской, спокойный" },
  { id: "ermil", label: "Ермил — мужской, живой" },
] as const;

export const FEMALE_VOICES = [
  { id: "alena", label: "Алёна — женский, ясный" },
  { id: "jane", label: "Джейн — женский, мягкий" },
  { id: "marina", label: "Марина — женский, тёплый" },
] as const;

export const VOICE_MOODS = [
  { id: "good", label: "Радостный, позитивный" },
  { id: "friendly", label: "Дружелюбный" },
  { id: "calm", label: "Спокойный" },
  { id: "quiet", label: "Тихий" },
] as const;

export const VOICE_ROLES = VOICE_MOODS;

export type VoiceSettings = {
  oleg: string;
  olga: string;
  speed: number;
  pause: number;
  mood: string;
  role: string;
};

const DEFAULT: VoiceSettings = {
  oleg: "zahar",
  olga: "alena",
  speed: 1.18,
  pause: 0.08,
  mood: "good",
  role: "good",
};

const MALE_IDS = MALE_VOICES.map((v) => v.id);
const FEMALE_IDS = FEMALE_VOICES.map((v) => v.id);

function filePath() {
  return join(process.cwd(), "storage", "voice.json");
}

function clamp(n: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

function maleOf(id?: string) {
  return MALE_IDS.includes(id as (typeof MALE_IDS)[number]) ? String(id) : DEFAULT.oleg;
}

function femaleOf(id?: string) {
  return FEMALE_IDS.includes(id as (typeof FEMALE_IDS)[number]) ? String(id) : DEFAULT.olga;
}

export function loadVoiceSettings(): VoiceSettings {
  try {
    if (existsSync(filePath())) {
      const raw = JSON.parse(readFileSync(filePath(), "utf8")) as Partial<VoiceSettings>;
      const mood = String(raw.mood || raw.role || DEFAULT.mood);
      let speed = clamp(Number(raw.speed), 0.95, 1.35, DEFAULT.speed);
      let pause = clamp(Number(raw.pause), 0, 0.6, DEFAULT.pause);
      if ((raw.speed == null || Number(raw.speed) <= 1.06) && (raw.pause == null || Number(raw.pause) >= 0.18)) {
        speed = DEFAULT.speed;
        pause = DEFAULT.pause;
      }
      return {
        oleg: maleOf(raw.oleg),
        olga: femaleOf(raw.olga),
        speed,
        pause,
        mood,
        role: mood === "calm" || mood === "quiet" ? "neutral" : mood === "friendly" ? "friendly" : "good",
      };
    }
  } catch {
    /* default */
  }
  return { ...DEFAULT };
}

export function saveVoiceSettings(patch: Partial<VoiceSettings>) {
  const cur = loadVoiceSettings();
  const mood = String(patch.mood || patch.role || cur.mood);
  const next: VoiceSettings = {
    oleg: patch.oleg ? maleOf(patch.oleg) : cur.oleg,
    olga: patch.olga ? femaleOf(patch.olga) : cur.olga,
    speed: patch.speed != null ? clamp(Number(patch.speed), 0.95, 1.35, cur.speed) : cur.speed,
    pause: patch.pause != null ? clamp(Number(patch.pause), 0, 0.6, cur.pause) : cur.pause,
    mood,
    role: mood === "calm" || mood === "quiet" ? "neutral" : mood === "friendly" ? "friendly" : "good",
  };
  mkdirSync(dirname(filePath()), { recursive: true });
  writeFileSync(filePath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function parseVoiceCommand(who: string, voice: string, speed?: number, faster?: boolean, slower?: boolean, mood?: string, pause?: number) {
  const cur = loadVoiceSettings();
  const patch: Partial<VoiceSettings> = {};
  const w = (who || "").toLowerCase();
  const v = (voice || "").toLowerCase();
  if (/олег|мужск/.test(w) || /захар|филипп|ермил/.test(v)) {
    patch.oleg = v.includes("филипп") ? "filipp" : v.includes("ермил") ? "ermil" : "zahar";
  }
  if (/ольг|женск/.test(w) || /ален|джен|марин/.test(v)) {
    patch.olga = v.includes("джен") ? "jane" : v.includes("марин") ? "marina" : "alena";
  }
  if (typeof speed === "number") patch.speed = speed;
  if (faster) patch.speed = cur.speed + 0.04;
  if (slower) patch.speed = cur.speed - 0.04;
  if (typeof pause === "number") patch.pause = pause;
  if (mood) patch.mood = mood;
  if (/радост|позитив/.test(v + w)) patch.mood = "good";
  if (/спокойн/.test(v + w)) patch.mood = "calm";
  if (/тих/.test(v + w)) patch.mood = "quiet";
  if (/дружелюб/.test(v + w)) patch.mood = "friendly";
  return saveVoiceSettings(patch);
}
