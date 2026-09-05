import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { WINDOW_FLAGS } from "./agent-config";

export type DebugWidgetId = (typeof WINDOW_FLAGS)[number]["id"];

export type DebugNetHit = {
  at: string;
  ok: boolean;
  ms: number;
  channel: string;
  error?: string;
  chars?: number;
};

type DebugSettings = {
  tools: Record<string, boolean>;
  widget: Record<string, boolean>;
  last?: DebugNetHit[];
};

function emptyWidget() {
  const widget: Record<string, boolean> = {};
  for (const f of WINDOW_FLAGS) widget[f.id] = false;
  return widget;
}

const DEFAULT: DebugSettings = {
  tools: { chat: true, funnel: true, voice: true, net: true },
  widget: emptyWidget(),
  last: [],
};

function fileOf() {
  return join(process.cwd(), "storage", "debug-mode.json");
}

export function loadDebug(): DebugSettings {
  try {
    if (!existsSync(fileOf())) return { tools: { ...DEFAULT.tools }, widget: emptyWidget(), last: [] };
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<DebugSettings>;
    return {
      tools: { ...DEFAULT.tools, ...(raw.tools || {}) },
      widget: { ...emptyWidget(), ...(raw.widget || {}) },
      last: Array.isArray(raw.last) ? raw.last.slice(0, 8) : [],
    };
  } catch {
    return { tools: { ...DEFAULT.tools }, widget: emptyWidget(), last: [] };
  }
}

export function saveDebug(s: DebugSettings) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify({ tools: s.tools, widget: s.widget, last: (s.last || []).slice(0, 8) }, null, 2), "utf8");
}

export function stampDebugNet(hit: Omit<DebugNetHit, "at"> & { at?: string }) {
  const s = loadDebug();
  const row: DebugNetHit = {
    at: hit.at || new Date().toISOString(),
    ok: Boolean(hit.ok),
    ms: Number(hit.ms) || 0,
    channel: String(hit.channel || "site").slice(0, 24),
    error: hit.error ? String(hit.error).slice(0, 240) : "",
    chars: Number(hit.chars) || 0,
  };
  s.last = [row, ...(s.last || [])].slice(0, 8);
  saveDebug(s);
}
