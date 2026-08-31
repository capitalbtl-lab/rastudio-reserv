import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  EDIT_FIELDS,
  hydrateEdits,
  normEditPath,
  snapshotEdits,
  type EditField,
  type EditsStore,
  type PageEdit,
} from "./edits-core";
import { findCoursePage } from "./agent-courses";
export {
  hydrateEdits,
  snapshotEdits,
  normEditPath,
  EDIT_FIELDS,
  type EditField,
  type EditsStore,
  type PageEdit,
} from "./edits-core";

function filePath() {
  return join(process.cwd(), "storage", "site-edits.json");
}

export function ensureLiveEdits() {
  try {
    if (existsSync(filePath())) {
      hydrateEdits(JSON.parse(readFileSync(filePath(), "utf8")) as EditsStore);
    }
  } catch {
    /* empty */
  }
  return snapshotEdits();
}

function save(store: EditsStore) {
  hydrateEdits(store);
  mkdirSync(dirname(filePath()), { recursive: true });
  writeFileSync(filePath(), JSON.stringify(store, null, 2), "utf8");
  return store;
}

export function resolveEditPath(raw: string, fallback = "") {
  const q = (raw || "").trim();
  if (!q || q === "текущая" || q === "эта страница") return normEditPath(fallback || "/");
  if (/^главн/i.test(q) || q === "/" || q === "home") return "/";
  if (q.startsWith("/")) return normEditPath(q);
  const hit = findCoursePage(q);
  return hit ? hit.path : normEditPath(q);
}

export function setPageField(path: string, field: string, value: string, fallbackPath = "") {
  const key = resolveEditPath(path, fallbackPath);
  const f = (EDIT_FIELDS as readonly string[]).includes(field) ? (field as EditField) : null;
  if (!f) return { ok: false as const, error: `Поле ${field} нельзя менять.` };
  const text = value.trim();
  if (text.length < 3) return { ok: false as const, error: "Текст слишком короткий." };
  const store = { ...ensureLiveEdits() };
  const cur = { ...(store[key] || {}) };
  cur[f] = text;
  store[key] = cur;
  save(store);
  return { ok: true as const, path: key, field: f, value: text };
}

export function clearPageField(path: string, field?: string, fallbackPath = "") {
  const key = resolveEditPath(path, fallbackPath);
  const store = { ...ensureLiveEdits() };
  const cur = { ...(store[key] || {}) };
  if (field && (EDIT_FIELDS as readonly string[]).includes(field)) delete cur[field as EditField];
  else return { ok: false as const, error: "Укажите поле." };
  if (!Object.keys(cur).length) delete store[key];
  else store[key] = cur;
  save(store);
  return { ok: true as const, path: key, field };
}

export function listPageEdits() {
  const store = ensureLiveEdits();
  return Object.entries(store).map(([path, fields]) => ({ path, fields }));
}

export function previewPage(path: string, fallbackPath = "") {
  const key = resolveEditPath(path, fallbackPath);
  return { path: key, fields: ensureLiveEdits()[key] || {} };
}

export function applyPageEdits<T extends { path?: string; pathDecoded?: string; h1?: string; description?: string; paragraphs?: string[] }>(page: T): T {
  ensureLiveEdits();
  const edit = (snapshotEdits()[normEditPath(page.pathDecoded || page.path || "")] || {}) as PageEdit;
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
  const edit = snapshotEdits()[normEditPath(course.pathDecoded || course.path || "")] || {};
  if (!Object.keys(edit).length) return course;
  return {
    ...course,
    name: edit.h1 || course.name,
    aboutLead: edit.description || course.aboutLead,
    aboutBody: edit.about || course.aboutBody,
    program: edit.description || course.program,
  };
}
