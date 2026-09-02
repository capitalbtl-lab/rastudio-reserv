import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type PullUnit = "min" | "hour" | "day" | "week";
export type ScheduleSettings = { pullN: number; pullUnit: PullUnit; lastPullAt?: number };

const DEFAULT: ScheduleSettings = { pullN: 30, pullUnit: "min" };

const UNITS: PullUnit[] = ["min", "hour", "day", "week"];

function fileOf() {
  return join(process.cwd(), "storage", "schedule-settings.json");
}

export function loadScheduleSettings(): ScheduleSettings {
  try {
    if (!existsSync(fileOf())) return { ...DEFAULT };
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<ScheduleSettings>;
    return normalizeSettings(raw);
  } catch {
    return { ...DEFAULT };
  }
}

export function normalizeSettings(raw: Partial<ScheduleSettings> | null | undefined): ScheduleSettings {
  const unit = UNITS.includes(raw?.pullUnit as PullUnit) ? (raw!.pullUnit as PullUnit) : "min";
  let n = Math.round(Number(raw?.pullN) || 0);
  if (!Number.isFinite(n) || n < 1) n = DEFAULT.pullN;
  if (unit === "min") n = Math.min(180, Math.max(5, n));
  else if (unit === "hour") n = Math.min(48, Math.max(1, n));
  else if (unit === "day") n = Math.min(30, Math.max(1, n));
  else n = Math.min(12, Math.max(1, n));
  const lastPullAt = Math.max(0, Number(raw?.lastPullAt) || 0);
  return { pullN: n, pullUnit: unit, lastPullAt: lastPullAt || undefined };
}

export function saveScheduleSettings(raw: Partial<ScheduleSettings>) {
  const next = normalizeSettings({ ...loadScheduleSettings(), ...raw });
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify({ ...next, at: new Date().toISOString() }, null, 2));
  return next;
}

export function markLastPull(at = Date.now()) {
  const cur = loadScheduleSettings();
  saveScheduleSettings({ ...cur, lastPullAt: at });
  return at;
}

export function lastPullAt(s: ScheduleSettings = loadScheduleSettings()) {
  return Number(s.lastPullAt || 0);
}

export function pullIntervalMs(s: ScheduleSettings = loadScheduleSettings()) {
  const n = Math.max(1, s.pullN);
  let ms = Math.max(5, n) * 60 * 1000;
  if (s.pullUnit === "hour") ms = n * 60 * 60 * 1000;
  else if (s.pullUnit === "day") ms = n * 24 * 60 * 60 * 1000;
  else if (s.pullUnit === "week") ms = n * 7 * 24 * 60 * 60 * 1000;
  return Math.max(60_000, ms);
}

/** setInterval не принимает больше ~24 дней — для недель тикаем раз в час и сверяем срок. */
export function pullTimerMs(s: ScheduleSettings = loadScheduleSettings()) {
  return Math.min(pullIntervalMs(s), 60 * 60 * 1000);
}

export function pullUnitLabel(unit: PullUnit, n = 1) {
  if (unit === "min") return n === 1 ? "минута" : n < 5 ? "минуты" : "минут";
  if (unit === "hour") return n === 1 ? "час" : n < 5 ? "часа" : "часов";
  if (unit === "day") return n === 1 ? "день" : n < 5 ? "дня" : "дней";
  return n === 1 ? "неделя" : n < 5 ? "недели" : "недель";
}
