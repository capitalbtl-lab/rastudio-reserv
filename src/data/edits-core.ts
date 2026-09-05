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

const FIELD_LABELS: Record<EditField, string> = {
  h1: "Заголовок",
  description: "Краткое описание",
  about: "Текст о курсе",
  why_heading: "Заголовок «Почему сейчас»",
  why: "Карточки «Почему сейчас»",
  hero_title: "Главный заголовок",
  hero_text: "Текст под заголовком",
};

const FIELD_ALIAS: Record<string, EditField> = {
  h1: "h1",
  title: "h1",
  заголовок: "h1",
  "заголовок страницы": "h1",
  "заголовок курса": "h1",
  description: "description",
  описание: "description",
  "краткое описание": "description",
  лид: "description",
  about: "about",
  "о курсе": "about",
  "текст о курсе": "about",
  why_heading: "why_heading",
  "почему сейчас заголовок": "why_heading",
  "заголовок почему": "why_heading",
  why: "why",
  "почему сейчас": "why",
  "карточки почему": "why",
  hero_title: "hero_title",
  "главный заголовок": "hero_title",
  "заголовок главной": "hero_title",
  hero_text: "hero_text",
  "текст под заголовком": "hero_text",
  подзаголовок: "hero_text",
  "текст главной": "hero_text",
};

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
  const key = normEditPath(path);
  const raw = cache[key] || {};
  if (key !== "/") return raw;
  return {
    ...raw,
    hero_title: raw.hero_title || raw.h1,
    hero_text: raw.hero_text || raw.description,
  };
}

export function editOf(store: EditsStore, ...paths: (string | undefined)[]): PageEdit {
  for (const p of paths) {
    if (!p) continue;
    const hit = store[normEditPath(p)];
    if (hit && Object.keys(hit).length) return hit;
  }
  return {};
}

export function homeFieldAllowed(field: EditField) {
  return field === "hero_title" || field === "hero_text";
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
  return FIELD_LABELS[field as EditField] || field;
}

export function resolveField(raw: string): EditField | null {
  const k = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
  if (!k) return null;
  if ((FIELDS as readonly string[]).includes(k)) return k as EditField;
  return FIELD_ALIAS[k] || null;
}

/** Главная хранит hero_*, курс — h1/description. Голос говорит «заголовок» в обоих случаях. */
export function fieldForPath(path: string, field: EditField): EditField {
  const key = normEditPath(path);
  if (key === "/") {
    if (field === "h1") return "hero_title";
    if (field === "description") return "hero_text";
  } else {
    if (field === "hero_title") return "h1";
    if (field === "hero_text") return "description";
  }
  return field;
}

export function applyCmsPatch<T extends { name?: string; aboutLead?: string; aboutBody?: string; program?: string }>(
  course: T,
  edit: PageEdit,
): T {
  if (!edit || !Object.keys(edit).length) return course;
  return {
    ...course,
    name: edit.h1 || course.name,
    aboutLead: edit.description || course.aboutLead,
    aboutBody: edit.about || course.aboutBody,
  };
}
