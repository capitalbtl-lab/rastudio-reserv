import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EDITOR_STATIC_PAGES, pageKindOf, type PageKind } from "./block-library-core.ts";
import {
  cloneLayout,
  emptyPageDoc,
  homeToLayout,
  inferKind,
  layoutsEqual,
  layoutToHome,
  normalizePageDoc,
  pageFileKey,
  type EditorPageItem,
  type PageDoc,
} from "./page-layout-core.ts";
import { loadHomeLayoutFile, saveHomeLayoutFile } from "./home-layout-file.ts";
import { loadSiteTree } from "./site-tree.ts";

function dirOf() {
  return join(process.cwd(), "storage", "pages");
}

function fileOf(path: string) {
  return join(dirOf(), `${pageFileKey(path)}.json`);
}

function treeIds() {
  try {
    const tree = loadSiteTree();
    return {
      schools: tree.schools.map((s) => s.id),
      courses: tree.courses.map((c) => c.id),
      items: [
        ...tree.schools.map((s) => ({ path: s.href || s.id, title: s.label, kind: "school" as PageKind })),
        ...tree.courses.map((c) => {
          const school = tree.schools.find((s) => s.id === c.schoolId);
          return {
            path: c.href || c.id,
            title: c.label,
            kind: "course" as PageKind,
            parent: school ? school.href || school.id : c.schoolId,
          };
        }),
      ],
    };
  } catch {
    return { schools: [] as string[], courses: [] as string[], items: [] as EditorPageItem[] };
  }
}

function fallbackMeta(path: string): { path: string; title: string; kind: PageKind; courseId?: string } {
  const p = path.replace(/\/+$/, "") || "/";
  const known = EDITOR_STATIC_PAGES.find((x) => x.path === p);
  if (known) return { path: p, title: known.title, kind: known.kind };
  const tree = treeIds();
  const hit = tree.items.find((x) => x.path === p);
  const kind = hit?.kind || inferKind(p, tree.schools, tree.courses);
  const courseId = kind === "course" ? p : "";
  return { path: p, title: hit?.title || p, kind, courseId };
}

function migrateHomeIfNeeded(doc: PageDoc): PageDoc {
  if (doc.path !== "/") return doc;
  const home = loadHomeLayoutFile();
  if (!home) return doc;
  const fromFile = homeToLayout(home);
  return { ...doc, draft: fromFile, published: cloneLayout(fromFile) };
}

export function loadPageDoc(path: string): PageDoc {
  const meta = fallbackMeta(path);
  let doc = emptyPageDoc(meta.path, meta.title, meta.kind, meta.courseId);
  try {
    if (existsSync(fileOf(meta.path))) {
      doc = normalizePageDoc(JSON.parse(readFileSync(fileOf(meta.path), "utf8")), meta);
    }
  } catch {
    /* seed */
  }
  if (meta.path === "/" && !existsSync(fileOf("/"))) {
    const source = loadHomeLayoutFile();
    doc = migrateHomeIfNeeded(doc);
    if (source) savePageDoc(doc);
  }
  return doc;
}

export function savePageDoc(doc: PageDoc): PageDoc {
  const meta = fallbackMeta(doc.path);
  const next = normalizePageDoc({ ...doc, updatedAt: new Date().toISOString() }, meta);
  mkdirSync(dirOf(), { recursive: true });
  writeFileSync(fileOf(next.path), JSON.stringify(next, null, 2), "utf8");
  if (next.path === "/") {
    saveHomeLayoutFile(layoutToHome(next.published));
  }
  return next;
}

export function savePageDraft(path: string, raw: unknown): PageDoc {
  const doc = loadPageDoc(path);
  const meta = fallbackMeta(path);
  const draft = normalizePageDoc({ ...doc, draft: raw }, meta).draft;
  return savePageDoc({ ...doc, draft });
}

export function publishPage(path: string): PageDoc {
  const doc = loadPageDoc(path);
  if (!doc.draft.order.length) return doc;
  return savePageDoc({
    ...doc,
    publishedPrev: cloneLayout(doc.published),
    published: cloneLayout(doc.draft),
  });
}

export function unpublishPage(path: string): PageDoc {
  const doc = loadPageDoc(path);
  if (!doc.publishedPrev) return doc;
  return savePageDoc({
    ...doc,
    published: cloneLayout(doc.publishedPrev),
    draft: cloneLayout(doc.publishedPrev),
    publishedPrev: undefined,
  });
}

export function listEditorPages(): EditorPageItem[] {
  const tree = treeIds();
  const seen = new Set<string>();
  const out: EditorPageItem[] = [];
  for (const item of [...EDITOR_STATIC_PAGES, ...tree.items]) {
    if (!item.path || seen.has(item.path)) continue;
    seen.add(item.path);
    out.push({
      path: item.path,
      title: item.title,
      kind: item.kind || pageKindOf(item.path, tree.schools, tree.courses),
      parent: "parent" in item ? item.parent : undefined,
    });
  }
  return out;
}

export function publishedHomeLayout() {
  return layoutToHome(loadPageDoc("/").published);
}

export function draftHomeLayout() {
  return layoutToHome(loadPageDoc("/").draft);
}

export function layoutsDiffer(doc: PageDoc) {
  return !layoutsEqual(doc.draft, doc.published);
}
