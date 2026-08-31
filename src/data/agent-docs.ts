import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { logAdmin } from "./admin-settings";
import { serverEnv } from "./server-env";

const execFileAsync = promisify(execFile);

export type DocKind = "instruction" | "rules" | "offer" | "other";

export type DocItem = {
  id: string;
  title: string;
  body: string;
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
  active: boolean;
  status: "ok" | "empty" | "error";
  error?: string;
};

type Store = { docs: AgentDoc[] };

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
    if (!existsSync(storeFile())) return { docs: [] };
    const raw = JSON.parse(readFileSync(storeFile(), "utf8")) as Partial<Store>;
    return { docs: Array.isArray(raw.docs) ? raw.docs : [] };
  } catch {
    return { docs: [] };
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
          title: (head || `Раздел ${i + 1}`).slice(0, 160),
          body: (body || chunk.trim()).slice(0, 12000),
          on: true,
        };
      })
      .filter((it) => it.body.length > 20)
      .slice(0, 80);
  }
  const chunks = cleaned
    .split(/\n(?=(?:Статья\s+\d+|§\s*\d+|#{1,3}\s+|[А-ЯЁ][А-ЯЁ0-9 «»"„-]{10,}\n))/)
    .map((c) => c.trim())
    .filter((c) => c.length > 40);
  const source = chunks.length > 1 ? chunks : cleaned.split(/\n{2,}/).map((c) => c.trim()).filter((c) => c.length > 40);
  return source.slice(0, 80).map((chunk, i) => {
    const lines = chunk.split("\n");
    const title = lines[0].replace(/^#+\s*/, "").replace(/^\d+[.)]\s*/, "").slice(0, 160) || `Пункт ${i + 1}`;
    const body = (lines.length > 1 ? lines.slice(1).join("\n") : chunk).trim();
    return { id: `i${i + 1}`, title, body: (body || chunk).slice(0, 12000), on: true };
  });
}

async function llmItems(kind: DocKind, text: string): Promise<DocItem[] | null> {
  const key = serverEnv("YANDEX_API_KEY");
  const folder = serverEnv("YANDEX_FOLDER_ID");
  if (!key || !folder) return null;
  const prompt =
    kind === "instruction"
      ? "Разбей инструкцию для ИИ-администратора студии «Развивайся» на отдельные команды."
      : kind === "rules"
        ? "Разбей правила оказания услуг на пункты, которыми агент отвечает родителю."
        : kind === "offer"
          ? "Выдели из договора оферты пункты, которые агент может коротко объяснить родителю: оплата, отказ, пробное, возврат, персональные данные."
          : "Разбей документ на рабочие пункты для консультации родителя.";
  const body = {
    modelUri: `gpt://${folder}/yandexgpt/latest`,
    completionOptions: { stream: false, temperature: 0.1, maxTokens: 4000 },
    messages: [
      { role: "system", text: "Отвечай только валидным JSON без markdown." },
      {
        role: "user",
        text: `${prompt}
JSON: {"items":[{"title":"короткий заголовок","body":"текст пункта"}]}
Не больше 40 пунктов. Без ФИО и лишней воды.

Документ:
${text.slice(0, 18000)}`,
      },
    ],
  };
  try {
    for (const auth of [`Api-Key ${key}`, `Bearer ${key}`]) {
      const res = await fetch("https://llm.api.cloud.yandex.net/foundationModels/v1/completion", {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json", "x-folder-id": folder },
        body: JSON.stringify(body),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { result?: { alternatives?: { message?: { text?: string } }[] } };
      const raw = json.result?.alternatives?.[0]?.message?.text || "";
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start < 0 || end <= start) continue;
      const parsed = JSON.parse(raw.slice(start, end + 1)) as { items?: { title?: string; body?: string }[] };
      const items = (parsed.items || [])
        .map((it, i) => ({
          id: `i${i + 1}`,
          title: String(it.title || `Пункт ${i + 1}`).slice(0, 120),
          body: String(it.body || "").trim().slice(0, 12000),
          on: true,
        }))
        .filter((it) => it.body.length > 8)
        .slice(0, 40);
      if (items.length) return items;
    }
  } catch {
    /* heuristic */
  }
  return null;
}

async function extractText(filePath: string) {
  const script = join(process.cwd(), "scripts", "extract-agent-doc.py");
  const { stdout } = await execFileAsync("python3", [script, filePath], { timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  return String(stdout || "").trim();
}

async function interpret(_kind: DocKind, text: string) {
  const split = splitHeuristic(text);
  if (split.length >= 2) return split;
  if (split.length === 1 && split[0].body.length > 200) return split;
  return split.length ? split : [{ id: "i1", title: "Документ", body: text.slice(0, 12000), on: true }];
}

function publicDoc(d: AgentDoc) {
  const { text, file, ...rest } = d;
  return { ...rest, chars: d.chars, preview: text.slice(0, 400) };
}

export function docsPrompt() {
  const store = loadStore();
  const live = store.docs.filter((d) => d.active && d.status === "ok");
  if (!live.length) return "";
  const parts: string[] = [
    "",
    "ОФИЦИАЛЬНЫЕ ДОКУМЕНТЫ СТУДИИ. Если родитель спрашивает про договор, оплату, отказ, правила — опирайся на них. Не выдумывай условия, которых нет в тексте. Не читай документ целиком, дай суть пункта.",
  ];
  for (const d of live) {
    parts.push(`### ${KIND_LABEL[d.kind]} «${d.name}»`);
    const on = d.items.filter((i) => i.on).slice(0, 40);
    if (on.length) {
      for (const it of on) parts.push(`- ${it.title}:\n${it.body.slice(0, 4000)}`);
    } else {
      parts.push(d.text.slice(0, 8000));
    }
  }
  return `\n${parts.join("\n").slice(0, 24000)}\n`;
}

export const adminAgentDocs = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        action: "list" | "upload" | "remove" | "toggle" | "toggleItem" | "reparse";
        id?: string;
        itemId?: string;
        on?: boolean;
        kind?: string;
        name?: string;
        mime?: string;
        base64?: string;
      },
  )
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const store = loadStore();
    const pack = () => ({ ok: true as const, docs: store.docs.map(publicDoc) });
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
          hit.text = text.slice(0, 80000);
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
          doc.text = text.slice(0, 80000);
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
    return { ok: false as const, error: "Неизвестное действие." };
  });
