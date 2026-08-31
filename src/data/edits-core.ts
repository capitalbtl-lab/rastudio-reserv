export type PageEdit = Partial<{
  h1: string;
  description: string;
  about: string;
  why_heading: string;
  why: string;
  hero_title: string;
  hero_text: string;
}>;

export type EditsStore = Record<string, PageEdit>;

const FIELDS = ["h1", "description", "about", "why_heading", "why", "hero_title", "hero_text"] as const;
export type EditField = (typeof FIELDS)[number];

export const EDIT_FIELDS = FIELDS;

let cache: EditsStore = {};

export function normEditPath(path: string) {
  const clean = (path.startsWith("/") ? path : `/${path}`).replace(/\/+$/, "") || "/";
  try {
    return decodeURIComponent(clean);
  } catch {
    return clean;
  }
}

export function hydrateEdits(store: EditsStore) {
  cache = store || {};
}

export function snapshotEdits() {
  return cache;
}

export function pageEdit(path: string): PageEdit {
  return cache[normEditPath(path)] || {};
}

export function parseWhyItems(raw?: string) {
  if (!raw?.trim()) return null;
  const lines = raw
    .split(/\n+/)
    .map((l) => l.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);
  const items = lines.map((line) => {
    const m = line.match(/^(.{3,60}?)(?:\s*[—–.:]\s+|\s{2,})(.+)$/);
    if (m) return { title: m[1].trim(), text: m[2].trim() };
    return { title: line.slice(0, 42), text: line };
  });
  return items.length ? items : null;
}

export function fieldLabel(field: string) {
  return (
    {
      h1: "Заголовок",
      description: "Краткое описание",
      about: "Текст о курсе",
      why_heading: "Заголовок «Почему сейчас»",
      why: "Карточки «Почему сейчас»",
      hero_title: "Главный заголовок",
      hero_text: "Текст под заголовком",
    } as Record<string, string>
  )[field] || field;
}
