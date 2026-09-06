import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { asPageAgent, safeSitePath, type PageAgent } from "./page-agents-core";

export type { PageAgent } from "./page-agents-core";
export { asPageAgent, emptyPageAgent, pageAgentPrompt, safeSitePath } from "./page-agents-core";

type Store = { pages: PageAgent[] };

function fileOf() {
  return join(process.cwd(), "storage", "page-agents.json");
}

export function loadPageAgents(): Store {
  try {
    if (!existsSync(fileOf())) return { pages: [] };
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Store;
    const pages = Array.isArray(raw.pages) ? (raw.pages.map(asPageAgent).filter(Boolean) as PageAgent[]) : [];
    return { pages };
  } catch {
    return { pages: [] };
  }
}

function savePageAgents(store: Store) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify({ pages: store.pages.slice(0, 80) }, null, 2), "utf8");
  return store;
}

export function agentFor(path: string): PageAgent | null {
  const p = safeSitePath(path) || "/";
  return loadPageAgents().pages.find((a) => a.path === p) || null;
}

export function upsertPageAgent(raw: unknown) {
  const next = asPageAgent(raw);
  if (!next) return { ok: false as const, error: "Некорректный путь страницы." };
  const store = loadPageAgents();
  store.pages = [next, ...store.pages.filter((p) => p.path !== next.path)].slice(0, 80);
  savePageAgents(store);
  return { ok: true as const, agent: next, pages: store.pages };
}
