import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  applyCmsPatch,
  editOf,
  fieldForPath,
  homeFieldAllowed,
  hydrateEdits,
  normEditPath,
  resolveField,
  snapshotEdits,
  type EditsStore,
} from "./edits-core";
import { findCoursePage } from "./agent-courses";
export {
  hydrateEdits,
  snapshotEdits,
  normEditPath,
  EDIT_FIELDS,
  resolveField,
  fieldForPath,
  type EditField,
  type EditsStore,
  type PageEdit,
} from "./edits-core";

function filePath() {
  return join(process.cwd(), "storage", "site-edits.json");
}

let diskAt = -1;

export function ensureLiveEdits() {
  try {
    const p = filePath();
    if (!existsSync(p)) {
      if (diskAt !== 0) {
        hydrateEdits({});
        diskAt = 0;
      }
      return snapshotEdits();
    }
    const at = statSync(p).mtimeMs;
    if (at === diskAt) return snapshotEdits();
    hydrateEdits(JSON.parse(readFileSync(p, "utf8")) as EditsStore);
    diskAt = at;
  } catch {
    /* empty */
  }
  return snapshotEdits();
}

function save(store: EditsStore) {
  hydrateEdits(store);
  mkdirSync(dirname(filePath()), { recursive: true });
  writeFileSync(filePath(), JSON.stringify(store, null, 2), "utf8");
  try {
    diskAt = statSync(filePath()).mtimeMs;
  } catch {
    diskAt = Date.now();
  }
  return store;
}

export function titleOfEditPath(path: string) {
  const key = normEditPath(path);
  if (key === "/") return "Главная";
  return findCoursePage(key)?.name || key;
}

export function resolveEditPath(raw: string, fallback = "") {
  const q = (raw || "").trim();
  if (!q || q === "текущая" || q === "эта страница" || q === "эта") return normEditPath(fallback || "/");
  if (/^главн/i.test(q) || q === "/" || q === "home") return "/";
  if (q.startsWith("/")) return normEditPath(q);
  const hit = findCoursePage(q);
  return hit ? hit.path : "";
}

export function setPageField(path: string, field: string, value: string, fallbackPath = "") {
  const key = resolveEditPath(path, fallbackPath);
  if (!key) return { ok: false as const, error: "Страница не найдена. Назовите курс или путь, например /art-studio." };
  const resolved = resolveField(field);
  if (!resolved) {
    return {
      ok: false as const,
      error: `Поле «${field}» нельзя менять. Можно: заголовок, описание, о курсе, почему сейчас.`,
    };
  }
  const f = fieldForPath(key, resolved);
  if (key === "/" && !homeFieldAllowed(f)) {
    return { ok: false as const, error: "На главной можно: главный заголовок или текст под заголовком." };
  }
  const text = value.trim().slice(0, 4000);
  if (text.length < 3) return { ok: false as const, error: "Текст слишком короткий." };
  const store = { ...ensureLiveEdits() };
  const cur = { ...(store[key] || {}) };
  cur[f] = text;
  store[key] = cur;
  save(store);
  return { ok: true as const, path: key, field: f, value: text, title: titleOfEditPath(key) };
}

export function clearPageField(path: string, field?: string, fallbackPath = "") {
  const key = resolveEditPath(path, fallbackPath);
  if (!key) return { ok: false as const, error: "Страница не найдена." };
  const store = { ...ensureLiveEdits() };
  const cur = { ...(store[key] || {}) };
  const resolved = field ? resolveField(field) : null;
  if (!resolved) return { ok: false as const, error: "Укажите поле: заголовок, описание, о курсе." };
  const f = fieldForPath(key, resolved);
  delete cur[f];
  if (!Object.keys(cur).length) delete store[key];
  else store[key] = cur;
  save(store);
  return { ok: true as const, path: key, field: f, title: titleOfEditPath(key) };
}

export function clearPage(path: string, fallbackPath = "") {
  const key = resolveEditPath(path, fallbackPath);
  if (!key) return { ok: false as const, error: "Страница не найдена." };
  const store = { ...ensureLiveEdits() };
  delete store[key];
  save(store);
  return { ok: true as const, path: key, title: titleOfEditPath(key) };
}

export function listPageEdits() {
  const store = ensureLiveEdits();
  return Object.entries(store)
    .filter(([, fields]) => fields && Object.keys(fields).length)
    .map(([path, fields]) => ({
      path,
      title: titleOfEditPath(path),
      fields,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "ru"));
}

export function previewPage(path: string, fallbackPath = "") {
  const key = resolveEditPath(path, fallbackPath) || normEditPath(fallbackPath || "/");
  return { path: key, title: titleOfEditPath(key), fields: ensureLiveEdits()[key] || {} };
}

export function applyPageEdits<T extends { path?: string; pathDecoded?: string; h1?: string; description?: string; paragraphs?: string[] }>(page: T): T {
  ensureLiveEdits();
  const edit = editOf(snapshotEdits(), page.pathDecoded, page.path);
  if (!edit || !Object.keys(edit).length) return page;
  return {
    ...page,
    h1: edit.h1 || page.h1,
    description: edit.description || page.description,
    paragraphs: edit.about ? [edit.about, ...(page.paragraphs || []).slice(1)] : page.paragraphs,
  };
}

export function applyCmsEdits<T extends { path?: string; pathDecoded?: string; name?: string; aboutLead?: string; aboutBody?: string; program?: string }>(course: T): T {
  ensureLiveEdits();
  const edit = editOf(snapshotEdits(), course.pathDecoded, course.path);
  return applyCmsPatch(course, edit);
}