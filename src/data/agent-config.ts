import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { logAdmin } from "./admin-settings";

export type AgentSettings = {
  updatedAt: string;
  defaultPartner: "oleg" | "olga";
  style: "short" | "warm" | "detailed";
  extra: string;
  askOnce: boolean;
  injectTraining: boolean;
  maxExamples: number;
};

export type TrainExample = {
  id: string;
  at: string;
  kind: "qa" | "rule" | "dialog" | "correction";
  input: string;
  output: string;
  note: string;
  source: string;
};

type Brain = { settings: AgentSettings; examples: TrainExample[] };

const DEFAULT_SETTINGS: AgentSettings = {
  updatedAt: "",
  defaultPartner: "olga",
  style: "warm",
  extra: "",
  askOnce: true,
  injectTraining: true,
  maxExamples: 40,
};

function fileOf() {
  return join(process.cwd(), "storage", "agent-brain.json");
}

function loadBrain(): Brain {
  try {
    if (!existsSync(fileOf())) return { settings: { ...DEFAULT_SETTINGS }, examples: [] };
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<Brain>;
    return {
      settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
      examples: Array.isArray(raw.examples) ? raw.examples : [],
    };
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, examples: [] };
  }
}

function saveBrain(brain: Brain) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify(brain, null, 2), "utf8");
}

function nid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const STYLE: Record<AgentSettings["style"], string> = {
  short: "Стиль: коротко, 1–3 предложения, без воды.",
  warm: "Стиль: тёплый живой администратор, без канцелярита, 2–4 предложения.",
  detailed: "Стиль: чуть подробнее, но без простыни. Главное — в первых двух фразах.",
};

export function agentPromptAddons() {
  const brain = loadBrain();
  const s = brain.settings;
  const parts: string[] = ["", STYLE[s.style] || STYLE.warm];
  if (s.askOnce) {
    parts.push(
      "Память сессии обязательна: не повторяй вопросы, на которые уже есть ответ. Не переспрашивай возраст, город, филиал, курс, имя и телефон.",
    );
  }
  if (s.extra.trim()) parts.push(`Доп. инструкция администратора студии:\n${s.extra.trim().slice(0, 2500)}`);
  if (s.injectTraining && brain.examples.length) {
    const take = brain.examples.slice(0, Math.max(4, Math.min(60, s.maxExamples || 40)));
    parts.push("ОБУЧЕНИЕ (эти примеры и правила важнее общих фраз):");
    for (const ex of take) {
      if (ex.kind === "rule") parts.push(`Правило: ${ex.output || ex.input}`);
      else parts.push(`Пример.\nРодитель: ${ex.input.slice(0, 400)}\nОтвет: ${ex.output.slice(0, 600)}`);
    }
  }
  return `\n${parts.join("\n")}\n`;
}

export const adminAgentBrain = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        action: "get" | "saveSettings" | "add" | "update" | "remove" | "import";
        settings?: Partial<AgentSettings>;
        example?: Partial<TrainExample> & { id?: string };
        examples?: TrainExample[];
      },
  )
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const brain = loadBrain();
    if (data.action === "get") {
      return { ok: true as const, settings: brain.settings, examples: brain.examples, total: brain.examples.length };
    }
    if (data.action === "saveSettings") {
      const next: AgentSettings = {
        ...brain.settings,
        ...(data.settings || {}),
        defaultPartner: data.settings?.defaultPartner === "oleg" ? "oleg" : "olga",
        style:
          data.settings?.style === "short" || data.settings?.style === "detailed" || data.settings?.style === "warm"
            ? data.settings.style
            : brain.settings.style,
        extra: String(data.settings?.extra ?? brain.settings.extra).slice(0, 4000),
        askOnce: data.settings?.askOnce !== false,
        injectTraining: data.settings?.injectTraining !== false,
        maxExamples: Math.max(4, Math.min(80, Number(data.settings?.maxExamples || brain.settings.maxExamples || 40))),
        updatedAt: new Date().toISOString(),
      };
      saveBrain({ ...brain, settings: next });
      logAdmin("Настройки ассистента сохранены");
      return { ok: true as const, settings: next, examples: brain.examples, total: brain.examples.length };
    }
    if (data.action === "add") {
      const ex: TrainExample = {
        id: nid(),
        at: new Date().toISOString(),
        kind:
          data.example?.kind === "rule" || data.example?.kind === "dialog" || data.example?.kind === "correction"
            ? data.example.kind
            : "qa",
        input: String(data.example?.input || "").trim().slice(0, 2000),
        output: String(data.example?.output || "").trim().slice(0, 2500),
        note: String(data.example?.note || "").trim().slice(0, 400),
        source: String(data.example?.source || "manual").slice(0, 80),
      };
      if (!ex.input && !ex.output) return { ok: false as const, error: "Нужен текст примера." };
      const examples = [ex, ...brain.examples].slice(0, 400);
      saveBrain({ ...brain, examples });
      logAdmin("Обучение: добавлен пример");
      return { ok: true as const, settings: brain.settings, examples, total: examples.length };
    }
    if (data.action === "update" && data.example?.id) {
      const examples = brain.examples.map((e) =>
        e.id === data.example?.id
          ? {
              ...e,
              input: data.example.input != null ? String(data.example.input).slice(0, 2000) : e.input,
              output: data.example.output != null ? String(data.example.output).slice(0, 2500) : e.output,
              note: data.example.note != null ? String(data.example.note).slice(0, 400) : e.note,
              kind: data.example.kind || e.kind,
            }
          : e,
      );
      saveBrain({ ...brain, examples });
      return { ok: true as const, settings: brain.settings, examples, total: examples.length };
    }
    if (data.action === "remove" && data.example?.id) {
      const examples = brain.examples.filter((e) => e.id !== data.example?.id);
      saveBrain({ ...brain, examples });
      logAdmin("Обучение: пример удалён");
      return { ok: true as const, settings: brain.settings, examples, total: examples.length };
    }
    if (data.action === "import") {
      const incoming = (data.examples || [])
        .map((e) => ({
          id: e.id || nid(),
          at: e.at || new Date().toISOString(),
          kind: e.kind === "rule" || e.kind === "dialog" || e.kind === "correction" ? e.kind : ("qa" as const),
          input: String(e.input || "").slice(0, 2000),
          output: String(e.output || "").slice(0, 2500),
          note: String(e.note || "").slice(0, 400),
          source: String(e.source || "import").slice(0, 80),
        }))
        .filter((e) => e.input || e.output);
      const seen = new Set(brain.examples.map((e) => `${e.input}||${e.output}`));
      const extra = incoming.filter((e) => !seen.has(`${e.input}||${e.output}`));
      const examples = [...extra, ...brain.examples].slice(0, 400);
      saveBrain({ ...brain, examples });
      logAdmin(`Обучение: импорт ${extra.length}`);
      return { ok: true as const, settings: brain.settings, examples, total: examples.length, added: extra.length };
    }
    return { ok: false as const, error: "Неизвестное действие." };
  });
