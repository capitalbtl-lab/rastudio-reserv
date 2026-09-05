import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { WINDOW_FLAGS } from "./agent-config";

export type DebugWidgetId = (typeof WINDOW_FLAGS)[number]["id"];

type DebugSettings = { tools: Record<string, boolean>; widget: Record<string, boolean> };

function emptyWidget() {
  const widget: Record<string, boolean> = {};
  for (const f of WINDOW_FLAGS) widget[f.id] = false;
  return widget;
}

const DEFAULT: DebugSettings = {
  tools: { chat: true, funnel: true, voice: true, net: true },
  widget: emptyWidget(),
};

function fileOf() {
  return join(process.cwd(), "storage", "debug-mode.json");
}

export function loadDebug(): DebugSettings {
  try {
    if (!existsSync(fileOf())) return { tools: { ...DEFAULT.tools }, widget: emptyWidget() };
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<DebugSettings>;
    return {
      tools: { ...DEFAULT.tools, ...(raw.tools || {}) },
      widget: { ...emptyWidget(), ...(raw.widget || {}) },
    };
  } catch {
    return { tools: { ...DEFAULT.tools }, widget: emptyWidget() };
  }
}

export function saveDebug(s: DebugSettings) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify(s, null, 2), "utf8");
}
