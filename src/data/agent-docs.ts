import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { logAdmin } from "./admin-settings";
import { driftOf, guessChannel, loadChannels, saveChannels, yandexJson, type AgentChannel } from "./agent-channels";

const execFileAsync = promisify(execFile);

export type DocKind = "instruction" | "rules" | "offer" | "other";

export type DocItem = {
  id: string;
  title: string;
  body: string;
  on: boolean;
  channel?: string;
};

export type TransformRow = {
  id: string;
  from: string;
  toChannel: string;
  toText: string;
  comment: string;
  accuracy: number;
  drift: number;
  on: boolean;
};

export type AgentDoc = {
  id: string;
  at: string;
  kind: DocKind;
  name: string;
  mime: string;
  file: string;
  chars: number;
  text: string;
  items: DocItem[];
  byChannel?: Record<string, string>;
  transformRows?: TransformRow[];
  transformAt?: string;
  transformAccuracy?: number;
  transformDrift?: number;
  active: boolean;
  status: "ok" | "empty" | "error";
  error?: string;
};

export type Contradiction = {
  id: string;
  a: string;
  b: string;
  sources: string[];
  severity: "high" | "mid" | "low";
  autoFix?: string;
  needManual: boolean;
  proposal: string;
  status: "open" | "applied" | "dismissed";
};

type Store = { docs: AgentDoc[]; contradictions?: Contradiction[] };

const KIND_LABEL: Record<DocKind, string> = {
  instruction: "Инструкция для агента",
  rules: "Правила оказания услуг",
  offer: "Договор оферты",
  other: "Прочий документ",
};

function nid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function storeFile() {
  return join(process.cwd(), "storage", "agent-docs.json");
}

function dirOf() {
  return join(process.cwd(), "storage", "agent-docs");
}

function loadStore(): Store {
  try {
    if (!existsSync(storeFile())) return { docs: [], contradictions: [] };
    const raw = JSON.parse(readFileSync(storeFile(), "utf8")) as Partial<Store>;
    return { docs: Array.isArray(raw.docs) ? raw.docs : [], contradictions: Array.isArray(raw.contradictions) ? raw.contradictions : [] };
  } catch {
    return { docs: [], contradictions: [] };
  }
}

function saveStore(store: Store) {
  mkdirSync(dirname(storeFile()), { recursive: true });
  writeFileSync(storeFile(), JSON.stringify(store, null, 2), "utf8");
}

function safeName(name: string) {
  return name.replace(/[^\w.\u0400-\u04FF-]+/g, "_").slice(0, 80) || "file";
}

function asKind(raw: string): DocKind {
  if (raw === "instruction" || raw === "rules" || raw === "offer" || raw === "other") return raw;
  return "other";
}

function splitHeuristic(text: string): DocItem[] {
  const cleaned = text.replace(/\r/g, "").trim();
  if (!cleaned) return [];
  const numbered = cleaned.split(/\n(?=\d{1,2}\.\s+\S[^\n]{2,90}\s*$)/m);
  if (numbered.length >= 2) {
    return numbered
      .map((chunk, i) => {
        const lines = chunk.trim().split("\n");
        const head = lines[0].replace(/^\d{1,2}\.\s*/, "").trim();
        const body = (lines.length > 1 ? lines.slice(1).join("\n") : chunk).trim();
        return {
          id: `i${i + 1}`,
          title: (head || `Раздел ${i + 1}`).slice(0, 200),
          body: body || chunk.trim(),
          on: true,
        };
      })
      .filter((it) => it.body.length > 20);
  }
  const chunks = cleaned
    .split(/\n(?=(?:Статья\s+\d+|§\s*\d+|#{1,3}\s+|[А-ЯЁ][А-ЯЁ0-9 «»"„-]{10,}\n))/)
    .map((c) => c.trim())
    .filter((c) => c.length > 40);
  const source = chunks.length > 1 ? chunks : cleaned.split(/\n{2,}/).map((c) => c.trim()).filter((c) => c.length > 40);
  return source.map((chunk, i) => {
    const lines = chunk.split("\n");
    const title = lines[0].replace(/^#+\s*/, "").replace(/^\d+[.)]\s*/, "").slice(0, 200) || `Пункт ${i + 1}`;
    const body = (lines.length > 1 ? lines.slice(1).join("\n") : chunk).trim();
    return { id: `i${i + 1}`, title, body: body || chunk, on: true };
  });
}

async function extractText(filePath: string) {
  const script = join(process.cwd(), "scripts", "extract-agent-doc.py");
  const { stdout } = await execFileAsync("python3", [script, filePath], { timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  return String(stdout || "").trim();
}

async function interpret(_kind: DocKind, text: string) {
  const split = splitHeuristic(text);
  if (split.length) return split;
  return [{ id: "i1", title: "Документ", body: text, on: true }];
}

function publicDoc(d: AgentDoc) {
  const { file, ...rest } = d;
  return rest;
}

export function documentsForAudit() {
  return loadStore().docs.filter((d) => d.active).map((d) => ({
    name: d.name,
    kind: d.kind,
    text: d.text,
    byChannel: d.byChannel || {},
  }));
}

function assembleChannels(rows: TransformRow[]) {
  const bag: Record<string, string[]> = {};
  for (const r of rows) {
    if (!r.on) continue;
    const id = r.toChannel || "common";
    if (!bag[id]) bag[id] = [];
    bag[id].push(r.toText.trim());
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(bag)) out[k] = v.join("\n\n");
  return out;
}

function scoreRows(rows: TransformRow[]) {
  if (!rows.length) return { accuracy: 100, drift: 0 };
  const accuracy = Math.round(rows.reduce((s, r) => s + r.accuracy, 0) / rows.length);
  return { accuracy, drift: 100 - accuracy };
}

async function buildTransform(doc: AgentDoc, percent = 0): Promise<TransformRow[]> {
  const channels = loadChannels();
  const ids = channels.map((c) => c.id);
  const items = doc.items.length ? doc.items : await interpret(doc.kind, doc.text);
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const rows: TransformRow[] = items.map((it, i) => {
    const from = [it.title, it.body].filter(Boolean).join("\n");
    const toChannel = it.channel && ids.includes(it.channel) ? it.channel : guessChannel(from, ids);
    const toText = from;
    const d = driftOf(from, toText);
    return {
      id: it.id || `t${i + 1}`,
      from,
      toChannel,
      toText,
      comment:
        toChannel === "common"
          ? p
            ? `Общее. Адаптация ${p}% по правилам канала.`
            : "Нет маркера канала — в «Общее для всех»."
          : p
            ? `Канал «${channels.find((c) => c.id === toChannel)?.label}», адаптация ${p}%.`
            : `Маркер канала: ${channels.find((c) => c.id === toChannel)?.label}. Текст не сокращали.`,
      accuracy: d.accuracy,
      drift: d.drift,
      on: it.on !== false,
    };
  });
  const llm = await yandexJson<{ rows?: { id?: string; channel?: string; toText?: string; comment?: string }[] }>(
    p
      ? "Ты методист студии «Развивайся». Распредели фрагменты по каналам и адаптируй текст под правила канала. Факты, запреты, телефоны и адреса не выкидывай. Ответ — только JSON."
      : "Ты методист студии. Не переписывай текст. Только распредели фрагменты по каналам. Ответ — JSON.",
    `Каналы и правила:
${channels.map((c) => `### ${c.id} ${c.label}\n${c.rules}`).join("\n\n")}
Процент адаптации: ${p}. 0 = копируй дословно. 100 = максимально под правила канала, смысл тот же. Цель расхождения с оригиналом ≈ ${p}%.
JSON: {"rows":[{"id":"как в списке","channel":"id канала","toText":"текст для канала","comment":"что сделали"}]}
Фрагменты:
${rows
  .map((r) => `--- ${r.id} ---\n${r.from.slice(0, p ? 900 : 1200)}`)
  .join("\n")
  .slice(0, p ? 18000 : 22000)}`,
    p ? 5500 : 3500,
  );
  if (llm?.rows?.length) {
    for (const hint of llm.rows) {
      const row = rows.find((r) => r.id === hint.id);
      if (!row) continue;
      if (hint.channel && ids.includes(hint.channel)) row.toChannel = hint.channel;
      if (p && hint.toText && hint.toText.trim()) row.toText = String(hint.toText);
      if (hint.comment) row.comment = String(hint.comment).slice(0, 400);
      const d = driftOf(row.from, row.toText);
      row.accuracy = d.accuracy;
      row.drift = d.drift;
    }
  }
  return rows;
}

export function docsPrompt(channel = "site") {
  const store = loadStore();
  const live = store.docs.filter((d) => d.active && d.status === "ok");
  if (!live.length) return "";
  const channels = loadChannels();
  const label = channels.find((c) => c.id === channel)?.label || channel;
  const parts: string[] = [
    "",
    `ОФИЦИАЛЬНЫЕ ДОКУМЕНТЫ. Сейчас канал: ${label} (id=${channel}). Читай ТОЛЬКО блоки «Общее для всех» и «${label}». Другие каналы не используй. Текст полный, без сокращений. Не выдумывай условия.`,
  ];
  for (const d of live) {
    parts.push(`### ${KIND_LABEL[d.kind]} «${d.name}»`);
    const bag = d.byChannel || {};
    const common = bag.common || "";
    const mine = channel === "common" ? "" : bag[channel] || "";
    if (common || mine) {
      if (common) parts.push(`Общее для всех:\n${common}`);
      if (mine) parts.push(`${label}:\n${mine}`);
    } else {
      const on = d.items.filter((i) => i.on);
      parts.push(d.text || on.map((it) => `${it.title}\n${it.body}`).join("\n\n"));
    }
  }
  return `\n${parts.join("\n\n")}\n`;
}

export const adminAgentDocs = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        action:
          | "list"
          | "upload"
          | "remove"
          | "toggle"
          | "toggleItem"
          | "reparse"
          | "saveChannels"
          | "previewTransform"
          | "applyTransform"
          | "contradictions"
          | "applyFixes";
        id?: string;
        itemId?: string;
        on?: boolean;
        kind?: string;
        name?: string;
        mime?: string;
        base64?: string;
        channels?: AgentChannel[];
        rows?: TransformRow[];
        fixIds?: string[];
        percent?: number;
      },
  )
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const store = loadStore();
    const pack = () => ({
      ok: true as const,
      docs: store.docs.map(publicDoc),
      channels: loadChannels(),
      contradictions: store.contradictions || [],
    });
    if (data.action === "list") return pack();
    if (data.action === "remove" && data.id) {
      const hit = store.docs.find((d) => d.id === data.id);
      store.docs = store.docs.filter((d) => d.id !== data.id);
      saveStore(store);
      if (hit?.file && existsSync(hit.file)) {
        try {
          unlinkSync(hit.file);
        } catch {
          /* */
        }
      }
      logAdmin(`Документ агента удалён: ${hit?.name || data.id}`);
      return pack();
    }
    if (data.action === "toggle" && data.id) {
      store.docs = store.docs.map((d) => (d.id === data.id ? { ...d, active: data.on !== false } : d));
      saveStore(store);
      return pack();
    }
    if (data.action === "toggleItem" && data.id && data.itemId) {
      store.docs = store.docs.map((d) =>
        d.id === data.id
          ? { ...d, items: d.items.map((it) => (it.id === data.itemId ? { ...it, on: data.on !== false } : it)) }
          : d,
      );
      saveStore(store);
      return pack();
    }
    if (data.action === "reparse" && data.id) {
      const hit = store.docs.find((d) => d.id === data.id);
      if (!hit?.file || !existsSync(hit.file)) return { ok: false as const, error: "Файл не найден на диске." };
      try {
        const text = await extractText(hit.file);
        if (!text) {
          hit.status = "empty";
          hit.error = "Текст не извлечён";
          hit.items = [];
        } else {
          hit.text = text;
          hit.chars = hit.text.length;
          hit.items = await interpret(hit.kind, hit.text);
          hit.status = hit.items.length ? "ok" : "empty";
          hit.error = undefined;
        }
        saveStore(store);
        logAdmin(`Документ переразобран: ${hit.name}`);
        return pack();
      } catch (e) {
        hit.status = "error";
        hit.error = e instanceof Error ? e.message : "Ошибка разбора";
        saveStore(store);
        return { ok: false as const, error: hit.error };
      }
    }
    if (data.action === "upload") {
      const raw = String(data.base64 || "").replace(/^data:[^;]+;base64,/, "");
      if (!raw) return { ok: false as const, error: "Файл пустой." };
      const buf = Buffer.from(raw, "base64");
      if (buf.length > 8 * 1024 * 1024) return { ok: false as const, error: "Файл больше 8 МБ." };
      const name = safeName(String(data.name || "document"));
      const ext = extname(name).toLowerCase();
      if (![".pdf", ".docx", ".doc", ".txt", ".md"].includes(ext)) {
        return { ok: false as const, error: "Нужен PDF, Word (.docx) или текстовый файл." };
      }
      const id = nid();
      mkdirSync(dirOf(), { recursive: true });
      const file = join(dirOf(), `${id}${ext}`);
      writeFileSync(file, buf);
      const kind = asKind(String(data.kind || "other"));
      const doc: AgentDoc = {
        id,
        at: new Date().toISOString(),
        kind,
        name: String(data.name || name).slice(0, 160),
        mime: String(data.mime || "").slice(0, 80),
        file,
        chars: 0,
        text: "",
        items: [],
        active: true,
        status: "ok",
      };
      try {
        const text = await extractText(file);
        if (!text) {
          doc.status = "empty";
          doc.error = "В файле нет текста. Если это скан — загрузите текстовый PDF или Word.";
        } else {
          doc.text = text;
          doc.chars = doc.text.length;
          doc.items = await interpret(kind, doc.text);
          doc.status = doc.items.length ? "ok" : "empty";
        }
      } catch (e) {
        doc.status = "error";
        doc.error = e instanceof Error ? e.message : "Не разобрался";
      }
      store.docs = [doc, ...store.docs].slice(0, 40);
      saveStore(store);
      logAdmin(`Документ агента: ${KIND_LABEL[kind]} «${doc.name}», пунктов ${doc.items.length}`);
      return pack();
    }
    if (data.action === "saveChannels") {
      const channels = saveChannels(Array.isArray(data.channels) ? data.channels : []);
      logAdmin("Каналы агента обновлены");
      return { ...pack(), channels };
    }
    if (data.action === "previewTransform" && data.id) {
      const hit = store.docs.find((d) => d.id === data.id);
      if (!hit) return { ok: false as const, error: "Документ не найден." };
      const rows = await buildTransform(hit, Number(data.percent) || 0);
      const score = scoreRows(rows);
      hit.transformRows = rows;
      hit.transformAt = new Date().toISOString();
      hit.transformAccuracy = score.accuracy;
      hit.transformDrift = score.drift;
      saveStore(store);
      logAdmin(`Превью преобразования: ${hit.name}`);
      return pack();
    }
    if (data.action === "applyTransform" && data.id) {
      const hit = store.docs.find((d) => d.id === data.id);
      if (!hit) return { ok: false as const, error: "Документ не найден." };
      const rows = (data.rows || hit.transformRows || []).map((r) => {
        const d = driftOf(r.from || "", r.toText || "");
        return { ...r, accuracy: d.accuracy, drift: d.drift, toText: String(r.toText || ""), from: String(r.from || "") };
      });
      const score = scoreRows(rows);
      hit.transformRows = rows;
      hit.byChannel = assembleChannels(rows);
      hit.transformAt = new Date().toISOString();
      hit.transformAccuracy = score.accuracy;
      hit.transformDrift = score.drift;
      hit.items = rows.map((r) => {
        const nl = r.toText.indexOf("\n");
        return {
          id: r.id,
          title: (nl >= 0 ? r.toText.slice(0, nl) : r.toText).slice(0, 200),
          body: nl >= 0 ? r.toText.slice(nl + 1) : r.toText,
          on: r.on,
          channel: r.toChannel,
        };
      });
      saveStore(store);
      logAdmin(`Преобразование применено: ${hit.name}, точность ${score.accuracy}%`);
      return pack();
    }
    if (data.action === "contradictions") {
      let brain: { extra?: string; scripts?: { title: string; body: string }[]; examples?: { kind: string; input: string; output: string }[] } = {};
      try {
        brain = JSON.parse(readFileSync(join(process.cwd(), "storage", "agent-brain.json"), "utf8")) as typeof brain;
      } catch {
        /* */
      }
      const corpus = [
        ...(brain.scripts || []).map((s) => `СКРИПТ «${s.title}»:\n${s.body}`),
        brain.extra ? `ДОП. ИНСТРУКЦИЯ:\n${brain.extra}` : "",
        ...(brain.examples || []).filter((e) => e.kind === "rule").map((e) => `ПРАВИЛО: ${e.input || e.output}`),
        ...store.docs.filter((d) => d.active).map((d) => `ДОКУМЕНТ «${d.name}»:\n${d.text}`),
      ]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 24000);
      const llm = await yandexJson<{ items?: Contradiction[] }>(
        "Ты аудитор инструкций детской студии. Ищи только реальные противоречия (А запрещает то, что Б разрешает, разные цены, разные филиалы, разные правила записи). JSON, без markdown.",
        `Найди противоречия в материалах обучения агента.
JSON: {"items":[{"id":"c1","a":"цитата А","b":"цитата Б","sources":["документ/скрипт"],"severity":"high|mid|low","autoFix":"готовый текст правила или пусто","needManual":true,"proposal":"что сделать оператору"}]}
Не больше 12 пунктов. Если противоречий нет — {"items":[]}.

${corpus}`,
        4000,
      );
      const items: Contradiction[] = (llm?.items || []).map((it, i) => ({
        id: String(it.id || `c${i + 1}`),
        a: String(it.a || "").slice(0, 800),
        b: String(it.b || "").slice(0, 800),
        sources: Array.isArray(it.sources) ? it.sources.map(String).slice(0, 6) : [],
        severity: it.severity === "high" || it.severity === "low" ? it.severity : "mid",
        autoFix: it.autoFix ? String(it.autoFix).slice(0, 1200) : "",
        needManual: it.needManual !== false,
        proposal: String(it.proposal || "").slice(0, 800),
        status: "open",
      }));
      store.contradictions = items;
      saveStore(store);
      logAdmin(`Противоречия: ${items.length}`);
      return pack();
    }
    if (data.action === "applyFixes") {
      const ids = new Set(data.fixIds || []);
      const keep: Contradiction[] = [];
      const rules: { title: string; body: string }[] = [];
      for (const c of store.contradictions || []) {
        if (ids.has(c.id) && c.autoFix && !c.needManual) {
          rules.push({ title: c.id, body: c.autoFix });
          keep.push({ ...c, status: "applied" });
        } else keep.push(c);
      }
      store.contradictions = keep;
      if (rules.length) {
        try {
          const brainPath = join(process.cwd(), "storage", "agent-brain.json");
          const brain = JSON.parse(readFileSync(brainPath, "utf8")) as { examples?: { id: string; at: string; kind: string; input: string; output: string; note: string; source: string }[] };
          const extra = rules.map((r) => ({
            id: nid(),
            at: new Date().toISOString(),
            kind: "rule",
            input: r.body,
            output: "",
            note: "автоисправление противоречия",
            source: "contradiction",
          }));
          brain.examples = [...extra, ...(brain.examples || [])].slice(0, 400);
          writeFileSync(brainPath, JSON.stringify(brain, null, 2), "utf8");
        } catch {
          /* */
        }
      }
      saveStore(store);
      return pack();
    }
    return { ok: false as const, error: "Неизвестное действие." };
  });
