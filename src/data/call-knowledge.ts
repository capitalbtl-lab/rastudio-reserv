import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { serverEnv } from "./server-env";
import type { NovofonCall } from "./novofon";

export type CallRecord = NovofonCall & { transcript?: string; error?: string };
export type FaqItem = { q: string; a: string };
export type ScriptItem = { name: string; steps: string[] };
export type Knowledge = {
  updated: string;
  calls: number;
  transcribed: number;
  summary: string;
  faq: FaqItem[];
  objections: FaqItem[];
  phrases: string[];
  rules: string[];
  scripts?: ScriptItem[];
  siteRecommendations?: string[];
  instructions?: string[];
};

type Store = {
  calls: CallRecord[];
  knowledge: Knowledge | null;
  scannedAt?: string;
};

function storePath() {
  return join(process.cwd(), "storage", "call-knowledge.json");
}

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
  return loadCallStore()
    .calls.filter((c) => {
      const sec = Number(c.seconds || 0);
      return c.is_recorded && !c.transcript && !c.error && sec >= 30;
    })
    .sort((a, b) => Number(b.seconds || 0) - Number(a.seconds || 0))
    .slice(0, limit);
}

export function callStats() {
  const store = loadCallStore();
  return {
    total: store.calls.length,
    transcribed: store.calls.filter((c) => c.transcript).length,
    failed: store.calls.filter((c) => c.error && !c.transcript).length,
    pending: store.calls.filter((c) => c.is_recorded && !c.transcript && !c.error).length,
    scannedAt: store.scannedAt || "",
    knowledge: store.knowledge,
    worker: workerStatus(),
  };
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

export async function buildKnowledge() {
  const store = loadCallStore();
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
    faq: Array.isArray(raw.faq) ? raw.faq.slice(0, 20) : [],
    objections: Array.isArray(raw.objections) ? raw.objections.slice(0, 12) : [],
    phrases: Array.isArray(raw.phrases) ? raw.phrases.map(String).slice(0, 16) : [],
    rules: Array.isArray(raw.rules) ? raw.rules.map(String).slice(0, 12) : [],
    scripts: Array.isArray(raw.scripts) ? (raw.scripts as ScriptItem[]).slice(0, 8) : [],
    siteRecommendations: Array.isArray(raw.siteRecommendations) ? raw.siteRecommendations.map(String).slice(0, 8) : [],
    instructions: Array.isArray(raw.instructions) ? raw.instructions.map(String).slice(0, 10) : [],
  };
  store.knowledge = knowledge;
  saveCallStore(store);
  return knowledge;
}

export function knowledgeForAgent() {
  const kb = loadCallStore().knowledge;
  if (!kb || (!kb.faq.length && !kb.rules.length)) return "";
  const faq = kb.faq
    .slice(0, 12)
    .map((x) => `В: ${x.q}\nО: ${x.a}`)
    .join("\n");
  const obj = kb.objections
    .slice(0, 8)
    .map((x) => `Сомнение: ${x.q} → ${x.a}`)
    .join("\n");
  const scripts = (kb.scripts || [])
    .slice(0, 6)
    .map((s) => `${s.name}: ${(s.steps || []).join(" → ")}`)
    .join("\n");
  return `

База знаний с реальных звонков администраторов студии (говори в этом духе, не цитируй как «из базы»):
${kb.summary}
Правила с линии: ${kb.rules.join("; ")}
Инструкции ИИ: ${(kb.instructions || []).join("; ")}
Скрипты: ${scripts}
Живые формулировки: ${kb.phrases.slice(0, 8).join(" / ")}
Частые вопросы:
${faq}
Возражения:
${obj}
Что хотят видеть на сайте (если спрашивают — отвечай по факту, не обещай несуществующее): ${(kb.siteRecommendations || []).slice(0, 5).join("; ")}`;
}