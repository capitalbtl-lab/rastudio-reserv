import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type PageAgent = {
  path: string;
  on: boolean;
  who: "olga" | "oleg";
  greeting: string;
  focus: string;
  autoOpenSec: number;
  steer: boolean;
};

type Store = { pages: PageAgent[] };

function fileOf() {
  return join(process.cwd(), "storage", "page-agents.json");
}

export function safeSitePath(raw: string) {
  let p = String(raw || "/").trim();
  if (p.startsWith("#")) return p === "#trial" ? "#trial" : "";
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.includes("..") || /^\/admin(?:\/|$)/i.test(p) || /^\/api(?:\/|$)/i.test(p)) return "";
  if (!/^\/[a-zA-Z0-9а-яА-ЯёЁ_./%+@\-]*$/.test(p)) return "";
  return (p.replace(/\/+$/, "") || "/").slice(0, 180);
}

export function emptyPageAgent(path = "/"): PageAgent {
  return {
    path: safeSitePath(path) || "/",
    on: false,
    who: "olga",
    greeting: "",
    focus: "",
    autoOpenSec: 0,
    steer: true,
  };
}

export function asPageAgent(raw: unknown): PageAgent | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const path = safeSitePath(String(s.path || ""));
  if (!path || path.startsWith("#")) return null;
  const who = s.who === "oleg" ? "oleg" : "olga";
  const auto = Math.max(0, Math.min(120, Math.round(Number(s.autoOpenSec) || 0)));
  return {
    path,
    on: Boolean(s.on),
    who,
    greeting: String(s.greeting || "").trim().slice(0, 280),
    focus: String(s.focus || "").trim().slice(0, 400),
    autoOpenSec: auto,
    steer: s.steer !== false,
  };
}

export function loadPageAgents(): Store {
  try {
    if (!existsSync(fileOf())) return { pages: [] };
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Store;
    const pages = Array.isArray(raw.pages) ? raw.pages.map(asPageAgent).filter(Boolean) as PageAgent[] : [];
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
  const hit = loadPageAgents().pages.find((a) => a.path === p);
  if (!hit) return null;
  return hit;
}

export function upsertPageAgent(raw: unknown) {
  const next = asPageAgent(raw);
  if (!next) return { ok: false as const, error: "Некорректный путь страницы." };
  const store = loadPageAgents();
  store.pages = [next, ...store.pages.filter((p) => p.path !== next.path)].slice(0, 80);
  savePageAgents(store);
  return { ok: true as const, agent: next, pages: store.pages };
}

export function pageAgentPrompt(agent: PageAgent | null, path = "/") {
  if (!agent?.on) return "";
  const who = agent.who === "oleg" ? "Олег" : "Ольга";
  return `

Вы внедрены на страницу ${agent.path || path} как ${who}.
${agent.focus ? `Фокус этой страницы: ${agent.focus}` : "Говорите про то, что сейчас на экране, не переключайте тему без нужды."}
${agent.steer ? "Если родитель задержался или просит подробности — вызови open_page (курс, расписание, пробное). Страница откроется сама. В речи коротко скажи, что сейчас откроется." : "Страницы сами не открывай, только кнопку open_course."}`;
}
