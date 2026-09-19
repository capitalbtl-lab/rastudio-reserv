import {
  type PageKind,
  isAtomType,
  isCanvasExtra,
  isHomeType,
  kindOrder,
  libraryType,
  pageKindOf,
} from "./block-library-core.ts";
import {
  type HomeBg,
  type HomeCustomBlock,
  type HomeLayoutDoc,
  emptyHomeLayout,
  isCustomBlockId,
  newCustomBlockId,
  normalizeHomeLayout,
} from "./home-layout-core.ts";

export type BlockInstance = {
  id: string;
  typeId: string;
  sectionId?: string;
  content: {
    kicker?: string;
    title?: string;
    text?: string;
    image?: string;
    video?: string;
    images?: string[];
    ctaLabel?: string;
    ctaHref?: string;
    courseId?: string;
    items?: string[];
  };
  style: {
    hidden?: boolean;
    padTop?: number;
    padBottom?: number;
    bg?: HomeBg;
    h?: number;
    w?: number;
    x?: number;
    y?: number;
    align?: "left" | "center" | "right" | "justify";
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
  };
  phone: {
    hidden?: boolean;
    stack?: "column" | "column-reverse";
    padTop?: number;
    padBottom?: number;
    fontSize?: number;
  };
  onAllPages?: boolean;
};

export type LayoutDoc = {
  order: string[];
  blocks: Record<string, BlockInstance>;
};

export type PageDoc = {
  path: string;
  title: string;
  kind: PageKind;
  draft: LayoutDoc;
  published: LayoutDoc;
  publishedPrev?: LayoutDoc;
  updatedAt: string;
};

export type EditorPageItem = { path: string; title: string; kind: PageKind; parent?: string };

export const EDITOR_MENU_LINKS = [
  { path: "/allcourses", title: "Курсы" },
  { path: "/schedule", title: "Расписание" },
  { path: "/team", title: "Педагоги" },
  { path: "/master-class", title: "Мастер-классы" },
] as const;

export const EDITOR_MENU_MORE = [
  { path: "/o-nas", title: "О нас" },
  { path: "/contacts", title: "Контакты" },
] as const;

export function editorMenuTree(pages: EditorPageItem[]) {
  const byPath = new Map(pages.map((p) => [p.path, p]));
  const home = pages.find((p) => p.path === "/") || pages.find((p) => p.kind === "home");
  const schools = pages.filter((p) => p.kind === "school");
  const courses = pages.filter((p) => p.kind === "course");
  const schoolPaths = new Set(schools.map((s) => s.path));
  const coursesOf = (schoolPath: string) => courses.filter((c) => c.parent === schoolPath);
  const orphanCourses = courses.filter((c) => !c.parent || !schoolPaths.has(c.parent));
  const pick = (list: readonly { path: string }[]) => list.map((x) => byPath.get(x.path)).filter((p): p is EditorPageItem => Boolean(p));
  const menu = pick(EDITOR_MENU_LINKS);
  const more = pick(EDITOR_MENU_MORE);
  const used = new Set<string>([
    home?.path || "/",
    ...schools.map((s) => s.path),
    ...courses.map((c) => c.path),
    ...EDITOR_MENU_LINKS.map((x) => x.path),
    ...EDITOR_MENU_MORE.map((x) => x.path),
  ]);
  const rest = pages.filter((p) => !used.has(p.path));
  return { home, schools, coursesOf, orphanCourses, menu, more, rest };
}

function asBg(v: unknown): HomeBg {
  return v === "surface" || v === "ink" || v === "paper" ? v : "inherit";
}

function clampPad(n: unknown) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(160, Math.round(x)));
}

function cleanPath(raw: string) {
  let p = String(raw || "/").trim();
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.includes("..")) return "/";
  return (p.replace(/\/+$/, "") || "/").slice(0, 180);
}

function asText(v: unknown, max: number) {
  return String(v || "").trim().slice(0, max);
}

function asMedia(v: unknown) {
  const s = String(v || "").trim();
  if (!s.startsWith("/") || s.includes("..")) return "";
  return s.slice(0, 200);
}

export function newInstanceId() {
  return `inst_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyLayout(): LayoutDoc {
  return { order: [], blocks: {} };
}

export function cloneLayout(doc: LayoutDoc): LayoutDoc {
  return JSON.parse(JSON.stringify(doc)) as LayoutDoc;
}

function asPhone(raw: unknown): BlockInstance["phone"] {
  if (!raw || typeof raw !== "object") return {};
  const p = raw as Record<string, unknown>;
  const phone: BlockInstance["phone"] = {
    hidden: p.hidden ? true : undefined,
    stack: p.stack === "column-reverse" ? "column-reverse" : p.stack === "column" ? "column" : undefined,
    padTop: clampPad(p.padTop) || undefined,
    padBottom: clampPad(p.padBottom) || undefined,
    fontSize: Number(p.fontSize) > 0 ? Math.min(72, Math.round(Number(p.fontSize))) : undefined,
  };
  return phone;
}

function asInstance(raw: unknown, fallbackId: string): BlockInstance | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const id = String(s.id || fallbackId).slice(0, 48);
  if (!id) return null;
  const typeId = String(s.typeId || (isCustomBlockId(id) ? "custom" : id)).slice(0, 80);
  const c = s.content && typeof s.content === "object" ? (s.content as Record<string, unknown>) : {};
  const st = s.style && typeof s.style === "object" ? (s.style as Record<string, unknown>) : {};
  const images = Array.isArray(c.images) ? c.images.map(asMedia).filter(Boolean).slice(0, 12) : undefined;
  return {
    id,
    typeId,
    sectionId: asText(s.sectionId, 40) || undefined,
    content: {
      kicker: asText(c.kicker, 80) || undefined,
      title: asText(c.title, 120) || undefined,
      text: asText(c.text, 4000) || undefined,
      image: asMedia(c.image) || undefined,
      video: asMedia(c.video) || undefined,
      images: images?.length ? images : undefined,
      ctaLabel: asText(c.ctaLabel, 40) || undefined,
      ctaHref: asText(c.ctaHref, 180) || undefined,
      courseId: asText(c.courseId, 180) || undefined,
      items: Array.isArray(c.items) ? c.items.map((x) => asText(x, 200)).filter(Boolean).slice(0, 24) : undefined,
    },
    style: {
      hidden: Boolean(st.hidden) || undefined,
      padTop: clampPad(st.padTop) || undefined,
      padBottom: clampPad(st.padBottom) || undefined,
      bg: asBg(st.bg) === "inherit" ? undefined : asBg(st.bg),
      h: Number(st.h) > 0 ? Math.round(Number(st.h)) : undefined,
      w: Number(st.w) > 0 ? Math.round(Number(st.w)) : undefined,
      x: Number.isFinite(Number(st.x)) ? Math.round(Number(st.x)) : undefined,
      y: Number.isFinite(Number(st.y)) ? Math.round(Number(st.y)) : undefined,
      align:
        st.align === "left" || st.align === "center" || st.align === "right" || st.align === "justify"
          ? st.align
          : undefined,
      fontSize: Number(st.fontSize) > 0 ? Math.min(72, Math.max(12, Math.round(Number(st.fontSize)))) : undefined,
      bold: st.bold ? true : undefined,
      italic: st.italic ? true : undefined,
      underline: st.underline ? true : undefined,
    },
    phone: asPhone(s.phone),
    onAllPages: s.onAllPages ? true : undefined,
  };
}

export function normalizeLayout(raw?: unknown, kind: PageKind = "plain"): LayoutDoc {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const blocks: Record<string, BlockInstance> = {};
  const rawBlocks = src.blocks && typeof src.blocks === "object" ? (src.blocks as Record<string, unknown>) : {};
  for (const [id, val] of Object.entries(rawBlocks)) {
    const inst = asInstance(val, id);
    if (inst) blocks[inst.id] = inst;
  }
  const order: string[] = [];
  const seen = new Set<string>();
  if (Array.isArray(src.order)) {
    for (const item of src.order) {
      const id = String(item || "");
      if (!id || seen.has(id) || !blocks[id]) continue;
      order.push(id);
      seen.add(id);
    }
  }
  for (const id of kindOrder(kind)) {
    if (seen.has(id)) continue;
    if (!blocks[id]) blocks[id] = seedInstance(id, id);
    order.push(id);
    seen.add(id);
  }
  for (const id of Object.keys(blocks)) {
    if (!seen.has(id)) order.push(id);
  }
  return { order, blocks };
}

export function seedInstance(id: string, typeId: string, content: BlockInstance["content"] = {}): BlockInstance {
  return {
    id,
    typeId,
    content,
    style: {},
    phone: typeId === "two-col" || typeId === "custom" || typeId === "course-story" ? { stack: "column" } : {},
  };
}

export function seedLayout(kind: PageKind, courseId = ""): LayoutDoc {
  const order = kindOrder(kind);
  const blocks: Record<string, BlockInstance> = {};
  for (const typeId of order) {
    blocks[typeId] = seedInstance(typeId, typeId, courseId && typeId !== "hero" ? { courseId } : {});
  }
  return { order, blocks };
}

export function emptyPageDoc(path: string, title: string, kind: PageKind, courseId = ""): PageDoc {
  const layout = seedLayout(kind, courseId);
  return {
    path: cleanPath(path),
    title: title.slice(0, 120) || path,
    kind,
    draft: cloneLayout(layout),
    published: cloneLayout(layout),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizePageDoc(raw: unknown, fallback: { path: string; title: string; kind: PageKind; courseId?: string }): PageDoc {
  const base = emptyPageDoc(fallback.path, fallback.title, fallback.kind, fallback.courseId);
  if (!raw || typeof raw !== "object") return base;
  const s = raw as Record<string, unknown>;
  const kind = (["home", "school", "course", "plain", "team", "catalog", "contacts", "master"] as PageKind[]).includes(s.kind as PageKind)
    ? (s.kind as PageKind)
    : fallback.kind;
  const draft = normalizeLayout(s.draft, kind);
  const published = s.published ? normalizeLayout(s.published, kind) : cloneLayout(draft);
  const prev = s.publishedPrev && typeof s.publishedPrev === "object" ? normalizeLayout(s.publishedPrev, kind) : undefined;
  return {
    path: cleanPath(String(s.path || fallback.path)),
    title: asText(s.title, 120) || fallback.title,
    kind,
    draft,
    published,
    publishedPrev: prev,
    updatedAt: asText(s.updatedAt, 40) || base.updatedAt,
  };
}

export function homeToLayout(home: HomeLayoutDoc): LayoutDoc {
  const blocks: Record<string, BlockInstance> = {};
  const order = [...home.order];
  for (const id of order) {
    const custom = home.customs.find((c) => c.id === id);
    const typeId = custom ? custom.typeId || "custom" : id;
    const style = home.styles[id] || {};
    blocks[id] = {
      id,
      typeId,
      content: {
        kicker: home.texts[`${id}.kicker`] || custom?.kicker || undefined,
        title: home.texts[`${id}.title`] || custom?.title || undefined,
        text: home.texts[`${id}.text`] || custom?.text || undefined,
        image: home.media[id] || custom?.image || undefined,
        ctaLabel: custom?.ctaLabel,
        ctaHref: custom?.ctaHref,
        courseId: home.texts[`${id}.courseId`] || custom?.courseId || undefined,
      },
      style: {
        hidden: style.hidden,
        padTop: style.padTop,
        padBottom: style.padBottom,
        bg: style.bg,
        h: style.h,
        align: style.align,
        fontSize: style.fontSize,
        bold: style.bold,
        italic: style.italic,
        underline: style.underline,
      },
      phone: { stack: isAtomType(typeId) ? "column" : undefined },
    };
  }
  return { order, blocks };
}

export function layoutToHome(layout: LayoutDoc): HomeLayoutDoc {
  const customs: HomeCustomBlock[] = [];
  const styles: HomeLayoutDoc["styles"] = {};
  const texts: Record<string, string> = {};
  const media: Record<string, string> = {};
  for (const id of layout.order) {
    const b = layout.blocks[id];
    if (!b) continue;
    if (b.style.hidden || b.style.padTop || b.style.padBottom || b.style.bg || b.style.h || b.style.align || b.style.fontSize || b.style.bold || b.style.italic || b.style.underline) {
      styles[id] = {
        hidden: b.style.hidden,
        padTop: b.style.padTop,
        padBottom: b.style.padBottom,
        bg: b.style.bg,
        h: b.style.h,
        align: b.style.align,
        fontSize: b.style.fontSize,
        bold: b.style.bold,
        italic: b.style.italic,
        underline: b.style.underline,
      };
    }
    if (b.content.kicker) texts[`${id}.kicker`] = b.content.kicker;
    if (b.content.title) texts[`${id}.title`] = b.content.title;
    if (b.content.text) texts[`${id}.text`] = b.content.text;
    if (b.content.courseId) texts[`${id}.courseId`] = b.content.courseId;
    if (b.content.image) media[id] = b.content.image;
    else if (b.content.video) media[id] = b.content.video;
    if (!isHomeType(b.typeId) || isCustomBlockId(id)) {
      customs.push({
        id,
        typeId: b.typeId,
        kicker: b.content.kicker || "",
        title: b.content.title || libraryType(b.typeId)?.label || id,
        text: b.content.text || "",
        image: b.content.image,
        ctaLabel: b.content.ctaLabel,
        ctaHref: b.content.ctaHref,
        courseId: b.content.courseId,
        why: undefined,
      });
    }
  }
  return normalizeHomeLayout({ order: layout.order, styles, texts, customs, media }, false);
}

export function typeIdOf(id: string, home: HomeLayoutDoc): string {
  const custom = home.customs.find((c) => c.id === id);
  if (custom?.typeId) return custom.typeId;
  return id;
}

export function instanceFingerprint(home: HomeLayoutDoc, id: string) {
  const texts: Record<string, string> = {};
  for (const [k, v] of Object.entries(home.texts)) {
    if (k === id || k.startsWith(`${id}.`)) texts[k] = v;
  }
  return JSON.stringify({
    style: home.styles[id] || {},
    media: home.media[id] || "",
    texts,
    custom: home.customs.find((c) => c.id === id) || null,
  });
}

export function changedBlockIds(prev: HomeLayoutDoc, next: HomeLayoutDoc): string[] {
  const ids = new Set<string>([
    ...prev.order,
    ...next.order,
    ...Object.keys(prev.styles),
    ...Object.keys(next.styles),
    ...Object.keys(prev.media),
    ...Object.keys(next.media),
    ...prev.customs.map((c) => c.id),
    ...next.customs.map((c) => c.id),
  ]);
  for (const k of Object.keys(prev.texts)) ids.add(k.split(".")[0] || k);
  for (const k of Object.keys(next.texts)) ids.add(k.split(".")[0] || k);
  return [...ids].filter((id) => instanceFingerprint(prev, id) !== instanceFingerprint(next, id));
}

/** Копирует стиль и контент источника во все блоки того же typeId. courseId страницы не трогает. */
export function applyInstanceToType(layout: LayoutDoc, typeId: string, from: BlockInstance): LayoutDoc {
  const blocks = { ...layout.blocks };
  let n = 0;
  for (const id of layout.order) {
    const b = blocks[id];
    if (!b || b.typeId !== typeId) continue;
    blocks[id] = {
      ...b,
      style: { ...from.style },
      phone: { ...from.phone },
      content: { ...from.content, courseId: b.content.courseId },
      onAllPages: true,
    };
    n += 1;
  }
  return n ? { ...layout, blocks } : layout;
}

export function applyHomeToPage(page: PageDoc, home: HomeLayoutDoc): PageDoc {
  const draft = homeToLayout(home);
  for (const id of draft.order) {
    const prev = page.draft.blocks[id];
    if (prev) {
      draft.blocks[id] = {
        ...draft.blocks[id],
        typeId: prev.typeId || draft.blocks[id].typeId,
        phone: prev.phone?.stack || prev.phone?.hidden ? prev.phone : draft.blocks[id].phone,
        onAllPages: prev.onAllPages,
        sectionId: prev.sectionId,
      };
    }
  }
  return { ...page, draft, updatedAt: new Date().toISOString() };
}

export function addInstance(layout: LayoutDoc, typeId: string, before?: string | null, content: BlockInstance["content"] = {}): LayoutDoc {
  const type = libraryType(typeId) || libraryType("custom");
  const id = isHomeType(typeId) && !layout.blocks[typeId] ? typeId : isCustomBlockId(typeId) ? typeId : newInstanceId();
  const inst = seedInstance(id, type?.typeId || typeId, content);
  if (!inst.content.title && type) inst.content.title = type.label;
  const blocks = { ...layout.blocks, [id]: inst };
  const rest = layout.order.filter((x) => x !== id);
  if (!before) return { order: [...rest, id], blocks };
  const i = rest.indexOf(before);
  if (i < 0) return { order: [...rest, id], blocks };
  rest.splice(i, 0, id);
  return { order: rest, blocks };
}

export function copyInstanceTo(layout: LayoutDoc, from: BlockInstance, before?: string | null): LayoutDoc {
  const id = newInstanceId();
  const inst: BlockInstance = { ...cloneLayout({ order: [from.id], blocks: { [from.id]: from } }).blocks[from.id], id };
  const blocks = { ...layout.blocks, [id]: inst };
  const rest = layout.order.filter((x) => x !== id);
  if (!before) return { order: [...rest, id], blocks };
  const i = rest.indexOf(before);
  if (i < 0) return { order: [...rest, id], blocks };
  rest.splice(i, 0, id);
  return { order: rest, blocks };
}

export function layoutsEqual(a: LayoutDoc, b: LayoutDoc) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function phoneIssues(layout: LayoutDoc): string[] {
  const out: string[] = [];
  for (const id of layout.order) {
    const b = layout.blocks[id];
    if (!b || b.style.hidden || b.phone.hidden) continue;
    if ((b.style.w || 0) > 390) out.push(`${id}: ширина ${b.style.w}px`);
    if ((b.style.fontSize || 0) > 40) out.push(`${id}: кегль ${b.style.fontSize}px`);
    if ((b.style.x || 0) > 24) out.push(`${id}: сдвиг X на телефоне`);
  }
  return out.slice(0, 8);
}

export type PageExtra = {
  id: string;
  typeId: string;
  kicker?: string;
  title?: string;
  text?: string;
  image?: string;
  video?: string;
  ctaLabel?: string;
  ctaHref?: string;
  courseId?: string;
  bg?: HomeBg;
  align?: BlockInstance["style"]["align"];
  h?: number;
  padTop?: number;
  padBottom?: number;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

export function extrasOf(layout: LayoutDoc): PageExtra[] {
  const out: PageExtra[] = [];
  for (const id of layout.order) {
    const b = layout.blocks[id];
    if (!b || b.style.hidden) continue;
    if (!isCanvasExtra(b.typeId, b.id)) continue;
    out.push({
      id: b.id,
      typeId: b.typeId,
      kicker: b.content.kicker,
      title: b.content.title,
      text: b.content.text,
      image: b.content.image,
      video: b.content.video,
      ctaLabel: b.content.ctaLabel,
      ctaHref: b.content.ctaHref,
      courseId: b.content.courseId,
      bg: b.style.bg,
      align: b.style.align,
      h: b.style.h,
      padTop: b.style.padTop,
      padBottom: b.style.padBottom,
      fontSize: b.style.fontSize,
      bold: b.style.bold,
      italic: b.style.italic,
      underline: b.style.underline,
    });
  }
  return out;
}

export function stylesOf(layout: LayoutDoc): Record<string, BlockInstance["style"]> {
  const out: Record<string, BlockInstance["style"]> = {};
  for (const id of layout.order) {
    const st = layout.blocks[id]?.style;
    if (!st) continue;
    if (st.hidden || st.padTop || st.padBottom || st.bg || st.h || st.align || st.fontSize || st.bold || st.italic || st.underline) {
      out[id] = { ...st };
    }
  }
  return out;
}

export function extrasFromHome(home: HomeLayoutDoc): PageExtra[] {
  return extrasOf(homeToLayout(home));
}

export function pageFileKey(path: string) {
  const p = cleanPath(path);
  if (p === "/") return "home";
  return p.replace(/^\//, "").replace(/[^\wа-яё.-]+/gi, "-").slice(0, 120);
}

export function inferKind(path: string, schools: string[] = [], courses: string[] = []) {
  return pageKindOf(cleanPath(path), schools, courses);
}

export { emptyHomeLayout, newCustomBlockId };
