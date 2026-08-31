import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { serverEnv } from "./server-env";
import type { NovofonCall } from "./novofon";

export type CallCrm = {
  id?: number;
  age?: number | null;
  branch?: string;
  isStudy?: boolean;
  archived?: boolean;
  studyStatus?: string;
  groups?: string[];
  courseNote?: string;
  lastAttend?: string;
  months?: number;
  dropped?: boolean;
  comms?: string[];
};
export type CallRecord = NovofonCall & { transcript?: string; error?: string; crm?: CallCrm };
export type FaqItem = { q: string; a: string; on?: boolean };
export type ScriptItem = { name: string; steps: string[]; on?: boolean };
export type LineItem = { text: string; on?: boolean };
export type Knowledge = {
  updated: string;
  calls: number;
  transcribed: number;
  summary: string;
  faq: FaqItem[];
  objections: FaqItem[];
  phrases: LineItem[] | string[];
  rules: LineItem[] | string[];
  scripts?: ScriptItem[];
  siteRecommendations?: LineItem[] | string[];
  instructions?: LineItem[] | string[];
};

export type CallSettings = {
  minSeconds: number;
  scanHours: number;
  paused: boolean;
  autoKnowledge: boolean;
  inject: {
    faq: boolean;
    objections: boolean;
    scripts: boolean;
    phrases: boolean;
    rules: boolean;
    instructions: boolean;
    siteRecommendations: boolean;
  };
};

type Store = {
  calls: CallRecord[];
  knowledge: Knowledge | null;
  scannedAt?: string;
  settings?: CallSettings;
};

function storePath() {
  return join(process.cwd(), "storage", "call-knowledge.json");
}

function settingsPath() {
  return join(process.cwd(), "storage", "call-settings.json");
}

export const defaultCallSettings = (): CallSettings => ({
  minSeconds: 30,
  scanHours: 6,
  paused: false,
  autoKnowledge: true,
  inject: {
    faq: true,
    objections: true,
    scripts: true,
    phrases: true,
    rules: true,
    instructions: true,
    siteRecommendations: false,
  },
});

export function loadCallStore(): Store {
  try {
    if (existsSync(storePath())) return JSON.parse(readFileSync(storePath(), "utf8")) as Store;
  } catch {
    /* empty */
  }
  return { calls: [], knowledge: null };
}

function saveCallStore(store: Store) {
  mkdirSync(dirname(storePath()), { recursive: true });
  writeFileSync(storePath(), JSON.stringify(store), "utf8");
}

export function loadCallSettings(): CallSettings {
  try {
    if (existsSync(settingsPath())) {
      return { ...defaultCallSettings(), ...JSON.parse(readFileSync(settingsPath(), "utf8")) };
    }
  } catch {
    /* none */
  }
  return loadCallStore().settings || defaultCallSettings();
}

export function saveCallSettings(patch: Partial<CallSettings>) {
  const next = {
    ...loadCallSettings(),
    ...patch,
    inject: { ...loadCallSettings().inject, ...(patch.inject || {}) },
  };
  mkdirSync(dirname(settingsPath()), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function upsertCalls(rows: CallRecord[]) {
  const store = loadCallStore();
  const map = new Map(store.calls.map((c) => [c.pbx_call_id || c.call_id, c]));
  for (const row of rows) map.set(row.pbx_call_id || row.call_id, { ...map.get(row.pbx_call_id || row.call_id), ...row });
  store.calls = [...map.values()];
  store.scannedAt = new Date().toISOString();
  saveCallStore(store);
  return store;
}

export function saveTranscript(id: string, transcript: string, error?: string) {
  const store = loadCallStore();
  store.calls = store.calls.map((c) =>
    c.pbx_call_id === id || c.call_id === id ? { ...c, transcript, error } : c,
  );
  saveCallStore(store);
}

export function nextWithoutTranscript(limit = 8) {
  const min = loadCallSettings().minSeconds || 30;
  return loadCallStore()
    .calls.filter((c) => {
      const sec = Number(c.seconds || 0);
      return c.is_recorded && !c.transcript && !c.error && sec >= min;
    })
    .sort((a, b) => Number(b.seconds || 0) - Number(a.seconds || 0))
    .slice(0, limit);
}

export function callStats() {
  const store = loadCallStore();
  const min = loadCallSettings().minSeconds || 30;
  const eligible = store.calls.filter((c) => Number(c.seconds || 0) >= min);
  return {
    total: eligible.length,
    transcribed: eligible.filter((c) => c.transcript).length,
    failed: eligible.filter((c) => c.error && !c.transcript).length,
    pending: eligible.filter((c) => c.is_recorded && !c.transcript && !c.error).length,
    matched: store.calls.filter((c) => c.crm).length,
    studying: store.calls.filter((c) => c.crm?.isStudy && !c.crm?.dropped).length,
    archived: store.calls.filter((c) => c.crm?.archived || c.crm?.dropped).length,
    scannedAt: store.scannedAt || "",
    knowledge: store.knowledge,
    worker: workerStatus(),
    settings: loadCallSettings(),
  };
}

export function listTranscripts(limit = 40) {
  return loadCallStore()
    .calls.filter((c) => c.transcript)
    .sort((a, b) => String(b.callstart).localeCompare(String(a.callstart)))
    .slice(0, limit)
    .map((c) => ({
      id: c.pbx_call_id || c.call_id,
      callstart: c.callstart,
      seconds: c.seconds,
      preview: String(c.transcript || "").slice(0, 420),
      crm: c.crm
        ? {
            age: c.crm.age,
            studyStatus: c.crm.studyStatus,
            groups: c.crm.groups,
            courseNote: c.crm.courseNote,
            archived: c.crm.archived,
            dropped: c.crm.dropped,
            isStudy: c.crm.isStudy,
            months: c.crm.months,
            lastAttend: c.crm.lastAttend,
            branch: c.crm.branch,
            comms: (c.crm.comms || []).slice(0, 3),
          }
        : null,
    }));
}

export function toggleKnowledge(kind: string, index: number, on: boolean) {
  const store = loadCallStore();
  const kb = store.knowledge;
  if (!kb) throw new Error("no-knowledge");
  const mark = <T extends { on?: boolean }>(arr: T[] | undefined) => {
    if (!arr || !arr[index]) return arr;
    arr[index] = { ...arr[index], on };
    return arr;
  };
  if (kind === "faq") kb.faq = mark(kb.faq) || [];
  if (kind === "objections") kb.objections = mark(kb.objections) || [];
  if (kind === "scripts") kb.scripts = mark(kb.scripts);
  if (kind === "phrases") kb.phrases = mark(asLines(kb.phrases));
  if (kind === "rules") kb.rules = mark(asLines(kb.rules));
  if (kind === "instructions") kb.instructions = mark(asLines(kb.instructions));
  if (kind === "siteRecommendations") kb.siteRecommendations = mark(asLines(kb.siteRecommendations));
  store.knowledge = kb;
  saveCallStore(store);
  return kb;
}

function asLines(items: Array<string | LineItem> | undefined): LineItem[] {
  return (items || []).map((x) => (typeof x === "string" ? { text: x, on: true } : { text: x.text, on: x.on !== false }));
}

function workerStatus() {
  try {
    const p = join(process.cwd(), "storage", "transcribe-status.json");
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf8")) as {
      running?: boolean;
      updated?: string;
      last?: string;
      transcribed?: number;
      pending?: number;
      total?: number;
    };
  } catch {
    return null;
  }
}

async function yandexJson(prompt: string) {
  const key = serverEnv("YANDEX_API_KEY");
  const folder = serverEnv("YANDEX_FOLDER_ID");
  if (!key || !folder) throw new Error("no-gpt");
  const body = {
    modelUri: `gpt://${folder}/yandexgpt/latest`,
    completionOptions: { stream: false, temperature: 0.2, maxTokens: 3000 },
    messages: [
      { role: "system", text: "Ты методист детской студии. Отвечай только валидным JSON без markdown." },
      { role: "user", text: prompt },
    ],
  };
  for (const auth of [`Api-Key ${key}`, `Bearer ${key}`]) {
    const res = await fetch("https://llm.api.cloud.yandex.net/foundationModels/v1/completion", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json", "x-folder-id": folder },
      body: JSON.stringify(body),
    });
    if (!res.ok) continue;
    const json = (await res.json()) as { result?: { alternatives?: { message?: { text?: string } }[] } };
    const text = json.result?.alternatives?.[0]?.message?.text || "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1)) as Partial<Knowledge>;
  }
  throw new Error("gpt");
}

function keepOff(prev: FaqItem[] | undefined, next: FaqItem[]) {
  const off = new Set((prev || []).filter((x) => x.on === false).map((x) => x.q));
  return next.map((x) => ({ ...x, on: !off.has(x.q) }));
}

function keepOffLine(prev: Array<string | LineItem> | undefined, next: string[]) {
  const off = new Set(asLines(prev).filter((x) => x.on === false).map((x) => x.text));
  return next.map((text) => ({ text, on: !off.has(text) }));
}

export async function buildKnowledge() {
  const store = loadCallStore();
  const prev = store.knowledge;
  const texts = store.calls
    .filter((c) => c.transcript && c.transcript.length > 80)
    .slice(-80)
    .map((c, i) => `--- звонок ${i + 1}, ${c.callstart}, ${c.seconds} сек ---\n${c.transcript}`);
  if (!texts.length) throw new Error("no-transcripts");
  const raw = await yandexJson(`По расшифровкам звонков администраторов студии «Развивайся» (Коломна, Луховицы) собери базу знаний для ИИ-администратора Ольги.
Убери ФИО, телефоны, адреса домов. Оставь только рабочие формулировки.
JSON:
{
  "summary": "кратко как говорят живые администраторы",
  "faq": [{"q":"вопрос родителя","a":"как отвечали"}],
  "objections": [{"q":"сомнение","a":"как снимали"}],
  "scripts": [{"name":"запись на пробное","steps":["шаг"]}],
  "phrases": ["живые фразы"],
  "rules": ["правила линии"],
  "siteRecommendations": ["что поправить на сайте"],
  "instructions": ["как ИИ вести родителя до записи"]
}
Не больше 18 faq, 10 objections, 12 phrases, 10 rules.

Расшифровки:
${texts.join("\n").slice(0, 28000)}`);
  const knowledge: Knowledge = {
    updated: new Date().toISOString(),
    calls: store.calls.length,
    transcribed: store.calls.filter((c) => c.transcript).length,
    summary: String(raw.summary || ""),
    faq: keepOff(prev?.faq, Array.isArray(raw.faq) ? raw.faq.slice(0, 20) : []),
    objections: keepOff(prev?.objections, Array.isArray(raw.objections) ? raw.objections.slice(0, 12) : []),
    phrases: keepOffLine(prev?.phrases, Array.isArray(raw.phrases) ? raw.phrases.map(String).slice(0, 16) : []),
    rules: keepOffLine(prev?.rules, Array.isArray(raw.rules) ? raw.rules.map(String).slice(0, 12) : []),
    scripts: Array.isArray(raw.scripts)
      ? (raw.scripts as ScriptItem[]).slice(0, 8).map((s) => ({
          ...s,
          on: prev?.scripts?.find((p) => p.name === s.name)?.on !== false,
        }))
      : [],
    siteRecommendations: keepOffLine(
      prev?.siteRecommendations,
      Array.isArray(raw.siteRecommendations) ? raw.siteRecommendations.map(String).slice(0, 8) : [],
    ),
    instructions: keepOffLine(
      prev?.instructions,
      Array.isArray(raw.instructions) ? raw.instructions.map(String).slice(0, 10) : [],
    ),
  };
  store.knowledge = knowledge;
  saveCallStore(store);
  return knowledge;
}

function onItem(x: { on?: boolean } | string) {
  if (typeof x === "string") return true;
  return x.on !== false;
}

export function knowledgeForAgent() {
  const kb = loadCallStore().knowledge;
  const set = loadCallSettings();
  if (!kb) return "";
  const inj = set.inject;
  const faq = inj.faq
    ? kb.faq.filter(onItem).slice(0, 12).map((x) => `В: ${x.q}\nО: ${x.a}`).join("\n")
    : "";
  const obj = inj.objections
    ? kb.objections.filter(onItem).slice(0, 8).map((x) => `Сомнение: ${x.q} → ${x.a}`).join("\n")
    : "";
  const scripts = inj.scripts
    ? (kb.scripts || []).filter(onItem).slice(0, 6).map((s) => `${s.name}: ${(s.steps || []).join(" → ")}`).join("\n")
    : "";
  const rules = inj.rules ? asLines(kb.rules).filter(onItem).map((x) => x.text) : [];
  const instructions = inj.instructions ? asLines(kb.instructions).filter(onItem).map((x) => x.text) : [];
  const phrases = inj.phrases ? asLines(kb.phrases).filter(onItem).map((x) => x.text) : [];
  const site = inj.siteRecommendations ? asLines(kb.siteRecommendations).filter(onItem).map((x) => x.text) : [];
  if (!faq && !obj && !scripts && !rules.length && !instructions.length) return "";
  return `

База знаний с реальных звонков администраторов студии (говори в этом духе, не цитируй как «из базы»):
${kb.summary}
Правила с линии: ${rules.join("; ")}
Инструкции ИИ: ${instructions.join("; ")}
Скрипты: ${scripts}
Живые формулировки: ${phrases.slice(0, 8).join(" / ")}
Частые вопросы:
${faq}
Возражения:
${obj}
${site.length ? `Замечания к сайту (не обещай несуществующее): ${site.slice(0, 5).join("; ")}` : ""}`;
}