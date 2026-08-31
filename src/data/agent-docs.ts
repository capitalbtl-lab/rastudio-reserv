import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { logAdmin } from "./admin-settings";
import { driftOf, loadChannels, saveChannels, yandexJson, type AgentChannel } from "./agent-channels";

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
  title: string;
  from: string;
  toChannel: string;
  toText: string;
  byChannel: Record<string, string>;
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
    const title = r.title ? `## ${r.title}\n` : "";
    const cells = r.byChannel && Object.keys(r.byChannel).length ? r.byChannel : { [r.toChannel || "common"]: r.toText };
    for (const [id, text] of Object.entries(cells)) {
      const body = String(text || "").trim();
      if (!body) continue;
      if (!bag[id]) bag[id] = [];
      bag[id].push(`${title}${body}`);
    }
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(bag)) out[k] = v.join("\n\n");
  return out;
}

function scoreRows(rows: TransformRow[]) {
  const cells: { accuracy: number }[] = [];
  for (const r of rows) {
    const bag = r.byChannel && Object.keys(r.byChannel).length ? r.byChannel : { x: r.toText };
    for (const text of Object.values(bag)) {
      if (!String(text || "").trim()) continue;
      cells.push(driftOf(r.from, String(text)));
    }
  }
  if (!cells.length) return { accuracy: 100, drift: 0 };
  const accuracy = Math.round(cells.reduce((s, c) => s + c.accuracy, 0) / cells.length);
  return { accuracy, drift: 100 - accuracy };
}

function titleOf(from: string, fallback = "Тема") {
  const line = from.split("\n").map((s) => s.trim()).find(Boolean) || fallback;
  return line.replace(/^#+\s*/, "").slice(0, 140);
}

function keepSubstance(from: string, next: string) {
  const a = String(from || "").trim();
  const b = String(next || "").trim();
  if (!b) return a;
  if (a.length > 80 && b.length < Math.round(a.length * 0.85)) return a;
  return b;
}

async function buildTransform(doc: AgentDoc, percent = 0): Promise<TransformRow[]> {
  const channels = loadChannels();
  const ids = channels.map((c) => c.id);
  const items = doc.items.length ? doc.items : await interpret(doc.kind, doc.text);
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const rows: TransformRow[] = items.map((it, i) => {
    const from = [it.title, it.body].filter(Boolean).join("\n").trim();
    const title = (it.title || titleOf(from, `Тема ${i + 1}`)).slice(0, 160);
    const byChannel = Object.fromEntries(ids.map((id) => [id, from]));
    return {
      id: it.id || `t${i + 1}`,
      title,
      from,
      toChannel: "common",
      toText: from,
      byChannel,
      comment: p
        ? `Тема «${title}»: факты как в оригинале, манера канала ${p}%.`
        : `Тема «${title}»: полный текст во всех каналах, без сокращения.`,
      accuracy: 100,
      drift: 0,
      on: it.on !== false,
    };
  });
  if (!p || !rows.length) return rows;

  const sys = `Ты методист студии «Развивайся».
На вход — темы инструкции агента целиком.
Верни JSON: для каждой темы текст каждого канала.
ЖЁСТКО:
1) Сохрани все факты, списки, телефоны, адреса, запреты, сценарии, названия курсов. Ничего не выкидывай и не сжимай.
2) Меняй ТОЛЬКО манеру общения под канал:
   site — можно опираться на кнопки на экране, не читай URL вслух;
   phone — вслух, без «нажмите», один вопрос за реплику;
   vk — личка сообщества, персональные данные не в комментарии;
   max — текст и полные ссылки, голосовые не принимай;
   common — факты без манеры конкретного канала.
3) Если адаптировать нечего — верни исходный текст темы без изменений.
4) Длина каждого столбца не короче 90% исходной темы.
JSON: {"topics":[{"id":"...","cells":{${ids.map((id) => `"${id}":"..."`).join(",")}}}]}`;

  for (let i = 0; i < rows.length; i += 3) {
    const batch = rows.slice(i, i + 3);
    const llm = await yandexJson<{ topics?: { id?: string; cells?: Record<string, string> }[] }>(
      sys,
      `Процент адаптации МАНЕРЫ (не содержания): ${p}.
Правила каналов:
${channels.map((c) => `### ${c.id} ${c.label}\n${c.rules}`).join("\n\n")}
Темы:
${batch.map((r) => `--- ${r.id} | ${r.title} ---\n${r.from}`).join("\n\n")}`,
      8000,
    );
    if (!llm?.topics?.length) continue;
    for (const hint of llm.topics) {
      const row = batch.find((r) => r.id === hint.id) || rows.find((r) => r.id === hint.id);
      if (!row || !hint.cells) continue;
      for (const id of ids) {
        if (hint.cells[id] == null) continue;
        row.byChannel[id] = keepSubstance(row.from, String(hint.cells[id] || ""));
      }
      const sample = row.byChannel.site || row.byChannel.common || row.from;
      const d = driftOf(row.from, sample);
      row.accuracy = d.accuracy;
      row.drift = d.drift;
      row.toText = sample;
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
    const mine = channel === "common" ? "" : bag[channel] || "";
    const common = bag.common || "";
    if (mine.trim()) parts.push(`${label}:\n${mine}`);
    else if (common.trim()) parts.push(`Общее для всех:\n${common}`);
    else {
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
        const byChannel = { ...(r.byChannel || {}) };
        if (!Object.keys(byChannel).length && r.toText) byChannel[r.toChannel || "common"] = r.toText;
        const filled = Object.values(byChannel).find((t) => String(t || "").trim()) || r.toText || "";
        const d = driftOf(r.from || "", String(filled));
        return {
          ...r,
          title: r.title || titleOf(r.from || r.toText || ""),
          byChannel,
          toText: String(filled),
          from: String(r.from || ""),
          accuracy: d.accuracy,
          drift: d.drift,
        };
      });
      const score = scoreRows(rows);
      hit.transformRows = rows;
      hit.byChannel = assembleChannels(rows);
      hit.transformAt = new Date().toISOString();
      hit.transformAccuracy = score.accuracy;
      hit.transformDrift = score.drift;
      hit.items = rows.map((r) => ({
        id: r.id,
        title: r.title || titleOf(r.toText || r.from),
        body: r.toText || r.from,
        on: r.on,
        channel: r.toChannel,
      }));
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
