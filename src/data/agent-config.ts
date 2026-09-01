import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { logAdmin } from "./admin-settings";
import { DEFAULT_SCRIPTS, playbookPrompt, type ScriptSection } from "./agent-playbook";
import type { SessionFacts } from "./agent-facts";
import { docsPrompt } from "./agent-docs";

export type AgentSettings = {
  updatedAt: string;
  defaultPartner: "oleg" | "olga";
  style: "short" | "warm" | "detailed";
  extra: string;
  askOnce: boolean;
  injectTraining: boolean;
  maxExamples: number;
  showChat: boolean;
  allowVoice: boolean;
  allowAdminMode: boolean;
  showChips: boolean;
  allowOlga: boolean;
  allowOleg: boolean;
  allowReset: boolean;
  allowBarge: boolean;
  matchChipsToMessage: boolean;
  keepAssistantReplies: boolean;
  speakEveryReply: boolean;
};

export type AgentUiFlags = Pick<
  AgentSettings,
  | "showChat"
  | "allowVoice"
  | "allowAdminMode"
  | "showChips"
  | "allowOlga"
  | "allowOleg"
  | "allowReset"
  | "allowBarge"
  | "defaultPartner"
  | "matchChipsToMessage"
  | "keepAssistantReplies"
  | "speakEveryReply"
>;

export const WINDOW_FLAGS: { id: keyof AgentUiFlags; title: string; hint: string; tip: string }[] = [
  { id: "showChat", title: "Окно ИИ-агента на сайте", hint: "Кнопка «Подобрать курс» и само окно чата.", tip: "Выключено на сайте — посетитель не видит. В отладке можно включить только для себя." },
  { id: "allowVoice", title: "Голосовой режим", hint: "Кнопка «Включить голосовой режим» и микрофон ввода.", tip: "Выключено — только текст. В отладке можно вернуть голос." },
  { id: "allowAdminMode", title: "Административный режим из чата", hint: "Ссылка «войти в административный режим» внизу окна.", tip: "На сайте можно скрыть. В отладке можно оставить для проверки." },
  { id: "showChips", title: "Кнопки-подсказки под сообщениями", hint: "Возраст, город, филиал, курсы и прочие чипы.", tip: "Выключено — только текст. В отладке чипы можно включить отдельно." },
  { id: "allowOlga", title: "Говорить с Ольгой", hint: "Кнопка выбора Ольги в шапке чата.", tip: "Если выключено на сайте, в отладке можно вернуть кнопку." },
  { id: "allowOleg", title: "Говорить с Олегом", hint: "Кнопка выбора Олега в шапке чата.", tip: "То же: сайт скрывает, отладка может показать." },
  { id: "allowReset", title: "Сброс и обновление диалога", hint: "Круглая кнопка сброса в шапке окна.", tip: "На сайте можно убрать. В отладке удобно оставить." },
  { id: "allowBarge", title: "Перебивание в голосовом режиме", hint: "Кнопка «Можно перебивать».", tip: "Посетитель не видит, если выключено. Отладка может включить." },
  { id: "matchChipsToMessage", title: "Кнопки только под текст", hint: "Подсказки совпадают с последней фразой.", tip: "Влияет на логику чипов, не на видимость окна." },
  { id: "keepAssistantReplies", title: "Не удалять ответы ассистента", hint: "Каждая реплика остаётся в ленте.", tip: "Логика ленты. В отладке можно включить отдельно." },
  { id: "speakEveryReply", title: "Озвучивать каждый вопрос", hint: "Голосовой режим читает всю фразу.", tip: "На сайте выключено — молчит. В отладке можно слушать." },
];

export type TrainExample = {
  id: string;
  at: string;
  kind: "qa" | "rule" | "dialog" | "correction";
  input: string;
  output: string;
  note: string;
  source: string;
};

type Brain = {
  settings: AgentSettings;
  examples: TrainExample[];
  scripts: ScriptSection[];
  lastSystematized?: string;
};

const DEFAULT_SETTINGS: AgentSettings = {
  updatedAt: "",
  defaultPartner: "olga",
  style: "warm",
  extra: "",
  askOnce: true,
  injectTraining: true,
  maxExamples: 40,
  showChat: true,
  allowVoice: true,
  allowAdminMode: true,
  showChips: true,
  allowOlga: true,
  allowOleg: true,
  allowReset: true,
  allowBarge: true,
  matchChipsToMessage: true,
  keepAssistantReplies: true,
  speakEveryReply: true,
};

function fileOf() {
  return join(process.cwd(), "storage", "agent-brain.json");
}

function seedScripts(list?: ScriptSection[]) {
  const have = Array.isArray(list) ? list : [];
  const locked = new Set(["funnel", "age", "city", "branch", "school"]);
  if (!have.length) return DEFAULT_SCRIPTS.map((s) => ({ ...s, updatedAt: s.updatedAt || new Date().toISOString() }));
  const byId = new Map(have.map((s) => [s.id, s]));
  for (const def of DEFAULT_SCRIPTS) {
    if (!byId.has(def.id)) have.push({ ...def, updatedAt: new Date().toISOString() });
    else if (locked.has(def.id)) {
      const i = have.findIndex((s) => s.id === def.id);
      if (i >= 0) have[i] = { ...def, updatedAt: new Date().toISOString() };
    }
  }
  return have;
}

export function loadBrain(): Brain {
  try {
    if (!existsSync(fileOf())) {
      const fresh: Brain = { settings: { ...DEFAULT_SETTINGS }, examples: [], scripts: seedScripts() };
      saveBrain(fresh);
      return fresh;
    }
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<Brain>;
    return {
      settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
      examples: Array.isArray(raw.examples) ? raw.examples : [],
      scripts: seedScripts(raw.scripts),
      lastSystematized: raw.lastSystematized,
    };
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, examples: [], scripts: seedScripts() };
  }
}

function saveBrain(brain: Brain) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify(brain, null, 2), "utf8");
}

function nid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function flag(v: boolean | undefined, fallback: boolean) {
  if (v === true) return true;
  if (v === false) return false;
  return fallback !== false;
}

const STYLE: Record<AgentSettings["style"], string> = {
  short: "Как колонка Алиса: 1 предложение и один вопрос. Ждёшь ответ.",
  warm: "Как колонка Алиса: коротко подтверди, что услышала, один новый вопрос, без лекции. 1–2 предложения.",
  detailed: "Можно на предложение длиннее, но всё равно один вопрос за реплику, потом пауза.",
};

export function agentPromptAddons(facts?: SessionFacts, channel = "site") {
  const brain = loadBrain();
  const s = brain.settings;
  const parts: string[] = ["", STYLE[s.style] || STYLE.warm];
  parts.push(playbookPrompt(brain.scripts, facts));
  if (s.askOnce) {
    parts.push(
      "Память сессии обязательна: не повторяй вопросы, на которые уже есть ответ. Не переспрашивай возраст, город, филиал, направление, имя и телефон.",
    );
  }
  if (s.extra.trim()) parts.push(`Доп. инструкция администратора студии:\n${s.extra.trim().slice(0, 2500)}`);
  if (s.injectTraining && brain.examples.length) {
    const take = brain.examples.slice(0, Math.max(4, Math.min(60, s.maxExamples || 40)));
    parts.push("ОБУЧЕНИЕ (эти примеры и правила важнее общих фраз, но не ломают воронку):");
    for (const ex of take) {
      if (ex.kind === "rule") parts.push(`Правило: ${ex.output || ex.input}`);
      else parts.push(`Пример.\nРодитель: ${ex.input.slice(0, 400)}\nОтвет: ${ex.output.slice(0, 600)}`);
    }
  }
  const docs = docsPrompt(channel, [facts?.school, facts?.course, facts?.intent].filter(Boolean).join(" "));
  if (docs.trim()) parts.push(docs);
  return `\n${parts.join("\n")}\n`;
}

export { programPitch, type ScriptSection } from "./agent-playbook";

export const adminAgentBrain = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        action: "get" | "saveSettings" | "add" | "update" | "remove" | "import" | "saveScript" | "resetScripts" | "systematize";
        settings?: Partial<AgentSettings>;
        example?: Partial<TrainExample> & { id?: string };
        examples?: TrainExample[];
        script?: Partial<ScriptSection> & { id?: string };
      },
  )
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const brain = loadBrain();
    const pack = () => ({
      ok: true as const,
      settings: brain.settings,
      examples: brain.examples,
      scripts: brain.scripts,
      total: brain.examples.length,
      lastSystematized: brain.lastSystematized || "",
    });
    if (data.action === "get") return pack();
    if (data.action === "saveSettings") {
      brain.settings = {
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
        showChat: flag(data.settings?.showChat, brain.settings.showChat),
        allowVoice: flag(data.settings?.allowVoice, brain.settings.allowVoice),
        allowAdminMode: flag(data.settings?.allowAdminMode, brain.settings.allowAdminMode),
        showChips: flag(data.settings?.showChips, brain.settings.showChips),
        allowOlga: flag(data.settings?.allowOlga, brain.settings.allowOlga),
        allowOleg: flag(data.settings?.allowOleg, brain.settings.allowOleg),
        allowReset: flag(data.settings?.allowReset, brain.settings.allowReset),
        allowBarge: flag(data.settings?.allowBarge, brain.settings.allowBarge),
        matchChipsToMessage: flag(data.settings?.matchChipsToMessage, brain.settings.matchChipsToMessage),
        keepAssistantReplies: flag(data.settings?.keepAssistantReplies, brain.settings.keepAssistantReplies),
        speakEveryReply: flag(data.settings?.speakEveryReply, brain.settings.speakEveryReply),
        updatedAt: new Date().toISOString(),
      };
      saveBrain(brain);
      logAdmin("Настройки ассистента сохранены");
      return pack();
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
      brain.examples = [ex, ...brain.examples].slice(0, 400);
      saveBrain(brain);
      logAdmin("Обучение: добавлен пример");
      return pack();
    }
    if (data.action === "update" && data.example?.id) {
      brain.examples = brain.examples.map((e) =>
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
      saveBrain(brain);
      return pack();
    }
    if (data.action === "remove" && data.example?.id) {
      brain.examples = brain.examples.filter((e) => e.id !== data.example?.id);
      saveBrain(brain);
      logAdmin("Обучение: пример удалён");
      return pack();
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
      brain.examples = [...extra, ...brain.examples].slice(0, 400);
      saveBrain(brain);
      logAdmin(`Обучение: импорт ${extra.length}`);
      return { ...pack(), added: extra.length };
    }
    if (data.action === "saveScript" && data.script?.id) {
      const now = new Date().toISOString();
      const idx = brain.scripts.findIndex((s) => s.id === data.script?.id);
      if (idx >= 0) {
        brain.scripts[idx] = {
          ...brain.scripts[idx],
          title: data.script.title != null ? String(data.script.title).slice(0, 120) : brain.scripts[idx].title,
          body: data.script.body != null ? String(data.script.body).slice(0, 8000) : brain.scripts[idx].body,
          updatedAt: now,
        };
      } else {
        brain.scripts.push({
          id: String(data.script.id).slice(0, 40),
          step: (data.script.step as ScriptSection["step"]) || "general",
          title: String(data.script.title || "Скрипт").slice(0, 120),
          body: String(data.script.body || "").slice(0, 8000),
          updatedAt: now,
        });
      }
      saveBrain(brain);
      logAdmin(`Скрипт: ${data.script.id}`);
      return pack();
    }
    if (data.action === "resetScripts") {
      brain.scripts = seedScripts([]);
      saveBrain(brain);
      logAdmin("Скрипты сброшены к эталону");
      return pack();
    }
    if (data.action === "systematize") {
      const { recentChatsForTrain } = await import("./chat-logs");
      const { factsFromMessages } = await import("./agent-facts");
      const chats = recentChatsForTrain(50);
      const counts: Record<string, number> = {};
      const phrases: Record<string, string[]> = { age: [], city: [], school: [], trial: [] };
      for (const c of chats) {
        const f = factsFromMessages(c.messages);
        const key = !f.age ? "stuck-age" : !f.city ? "stuck-city" : !f.branchId ? "stuck-branch" : !f.school ? "stuck-school" : f.briefed ? "reached-offer" : "stuck-program";
        counts[key] = (counts[key] || 0) + 1;
        const user = c.messages.filter((m) => m.role === "user").map((m) => m.content);
        if (f.age) phrases.age.push(user[0] || "");
        if (f.school) phrases.school.push(f.school);
      }
      const note = [
        `Диалогов: ${chats.length}.`,
        `Дошли до записи: ${counts["reached-offer"] || 0}.`,
        `Застряли на возрасте: ${counts["stuck-age"] || 0}, городе: ${counts["stuck-city"] || 0}, филиале: ${counts["stuck-branch"] || 0}, направлении: ${counts["stuck-school"] || 0}, программе: ${counts["stuck-program"] || 0}.`,
        phrases.school.length ? `Частые направления: ${[...new Set(phrases.school)].slice(0, 8).join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join(" ");
      const now = new Date().toISOString();
      const obsId = "observe";
      const obs = brain.scripts.find((s) => s.id === obsId);
      const body = `Наблюдения из живых диалогов (${now.slice(0, 10)}):\n${note}\n\nИспользуй это, чтобы короче вести застрявший шаг. Воронку не ломай.`;
      if (obs) {
        obs.body = body;
        obs.updatedAt = now;
        obs.auto = true;
      } else {
        brain.scripts.push({
          id: obsId,
          step: "general",
          title: "Наблюдения из диалогов",
          body,
          updatedAt: now,
          auto: true,
        });
      }
      const useful = chats.flatMap((c) => {
        const out: TrainExample[] = [];
        for (let i = 1; i < c.messages.length; i += 1) {
          const prev = c.messages[i - 1];
          const cur = c.messages[i];
          if (prev.role === "user" && cur.role === "assistant" && prev.content.length > 8 && cur.content.length > 20) {
            out.push({
              id: nid(),
              at: now,
              kind: "dialog",
              input: prev.content.slice(0, 2000),
              output: cur.content.slice(0, 2500),
              note: "авто из диалога",
              source: `chat:${c.id}`,
            });
          }
        }
        return out;
      });
      const seen = new Set(brain.examples.map((e) => `${e.input}||${e.output}`));
      const extra = useful.filter((e) => !seen.has(`${e.input}||${e.output}`)).slice(0, 25);
      brain.examples = [...extra, ...brain.examples].slice(0, 400);
      brain.lastSystematized = now;
      saveBrain(brain);
      logAdmin(`Обучение: систематизация, +${extra.length} примеров`);
      return { ...pack(), added: extra.length, note };
    }
    return { ok: false as const, error: "Неизвестное действие." };
  });

export function uiFlagsOf(s: AgentSettings): AgentUiFlags {
  return {
    showChat: s.showChat !== false,
    allowVoice: s.allowVoice !== false,
    allowAdminMode: s.allowAdminMode !== false,
    showChips: s.showChips !== false,
    allowOlga: s.allowOlga !== false,
    allowOleg: s.allowOleg !== false,
    allowReset: s.allowReset !== false,
    allowBarge: s.allowBarge !== false,
    matchChipsToMessage: s.matchChipsToMessage !== false,
    keepAssistantReplies: s.keepAssistantReplies !== false,
    speakEveryReply: s.speakEveryReply !== false,
    defaultPartner: s.defaultPartner === "oleg" ? "oleg" : "olga",
  };
}

export const publicAgentUi = createServerFn({ method: "GET" }).handler(async () => {
  const s = loadBrain().settings;
  return { ok: true as const, ui: uiFlagsOf(s) };
});
