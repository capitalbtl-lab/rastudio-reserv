import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const MALE_VOICES = [
  { id: "filipp", label: "Филипп — спокойный, тёплый" },
  { id: "zahar", label: "Захар — ниже, строже" },
  { id: "ermil", label: "Ермил — живой" },
  { id: "madirus", label: "Мадирус — низкий" },
] as const;

export const FEMALE_VOICES = [
  { id: "alena", label: "Алёна — ясная, приветливая" },
  { id: "jane", label: "Джейн — мягкая" },
  { id: "omazh", label: "Омаж — ниже" },
  { id: "marina", label: "Марина — тёплая" },
  { id: "masha", label: "Маша — молодая" },
] as const;

export const VOICE_ROLES = [
  { id: "good", label: "Доброжелательный" },
  { id: "neutral", label: "Нейтральный" },
  { id: "friendly", label: "Дружелюбный" },
] as const;

export type VoiceSettings = {
  oleg: string;
  olga: string;
  speed: number;
  role: string;
};

const DEFAULT: VoiceSettings = {
  oleg: "filipp",
  olga: "alena",
  speed: 1.28,
  role: "good",
};

function filePath() {
  return join(process.cwd(), "storage", "voice.json");
}

function clampSpeed(n: number) {
  if (!Number.isFinite(n)) return DEFAULT.speed;
  return Math.min(1.6, Math.max(0.85, Math.round(n * 100) / 100));
}

export function loadVoiceSettings(): VoiceSettings {
  try {
    if (existsSync(filePath())) {
      const raw = JSON.parse(readFileSync(filePath(), "utf8")) as Partial<VoiceSettings>;
      return {
        oleg: String(raw.oleg || DEFAULT.oleg),
        olga: String(raw.olga || DEFAULT.olga),
        speed: clampSpeed(Number(raw.speed)),
        role: String(raw.role || DEFAULT.role),
      };
    }
  } catch {
    /* default */
  }
  return { ...DEFAULT };
}

export function saveVoiceSettings(patch: Partial<VoiceSettings>) {
  const cur = loadVoiceSettings();
  const next: VoiceSettings = {
    oleg: patch.oleg ? String(patch.oleg) : cur.oleg,
    olga: patch.olga ? String(patch.olga) : cur.olga,
    speed: patch.speed != null ? clampSpeed(Number(patch.speed)) : cur.speed,
    role: patch.role ? String(patch.role) : cur.role,
  };
  mkdirSync(dirname(filePath()), { recursive: true });
  writeFileSync(filePath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function parseVoiceCommand(who: string, voice: string, speed?: number, faster?: boolean, slower?: boolean) {
  const cur = loadVoiceSettings();
  const patch: Partial<VoiceSettings> = {};
  const w = (who || "").toLowerCase();
  const v = (voice || "").toLowerCase();
  const male = MALE_VOICES.find((x) => x.id === v || x.label.toLowerCase().includes(v));
  const female = FEMALE_VOICES.find((x) => x.id === v || x.label.toLowerCase().includes(v));
  if (/олег|мужск/.test(w) && (male || /филипп|захар|ермил|мадирус/.test(v))) {
    patch.oleg = male?.id || (v.includes("захар") ? "zahar" : v.includes("ермил") ? "ermil" : v.includes("мадирус") ? "madirus" : "filipp");
  } else if (/ольг|женск/.test(w) && (female || /ален|джен|омаж|марин|маша/.test(v))) {
    patch.olga =
      female?.id ||
      (v.includes("джен") ? "jane" : v.includes("омаж") ? "omazh" : v.includes("марин") ? "marina" : v.includes("маша") ? "masha" : "alena");
  } else if (male) {
    patch.oleg = male.id;
  } else if (female) {
    patch.olga = female.id;
  }
  if (typeof speed === "number") patch.speed = speed;
  if (faster) patch.speed = cur.speed + 0.08;
  if (slower) patch.speed = cur.speed - 0.08;
  return saveVoiceSettings(patch);
}
