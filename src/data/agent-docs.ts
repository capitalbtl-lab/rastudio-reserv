import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { logAdmin } from "./admin-settings";

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

export function docsPrompt() {
  const store = loadStore();
  const live = store.docs.filter((d) => d.active && d.status === "ok");
  if (!live.length) return "";
  const parts: string[] = [
    "",
    "ОФИЦИАЛЬНЫЕ ДОКУМЕНТЫ СТУДИИ — полный текст, без сокращений. Если родитель спрашивает про договор, оплату, отказ, правила — опирайся на них дословно по смыслу. Не выдумывай условия, которых нет. Родителю отвечай коротко, но суть пункта не меняй.",
  ];
  for (const d of live) {
    parts.push(`### ${KIND_LABEL[d.kind]} «${d.name}»`);
    const on = d.items.filter((i) => i.on);
    if (on.length && on.length < d.items.length) {
      for (const it of on) parts.push(`${it.title}\n${it.body}`);
    } else {
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
    return { ok: false as const, error: "Неизвестное действие." };
  });
