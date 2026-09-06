export const HOME_BLOCKS = [
  { id: "hero", label: "Шапка" },
  { id: "ticker", label: "Бегущая строка" },
  { id: "robot", label: "Робототехника на английском" },
  { id: "ages", label: "Подбор по возрасту" },
  { id: "schools", label: "Семь школ" },
  { id: "catalog", label: "Каталог курсов" },
  { id: "about", label: "О студии" },
  { id: "teachers", label: "Педагоги" },
  { id: "reviews", label: "Отзывы" },
  { id: "stories", label: "Проекты и события" },
  { id: "branches", label: "Филиалы" },
  { id: "trial", label: "Заявка на пробное" },
] as const;

export type HomeBlockId = (typeof HOME_BLOCKS)[number]["id"];
export type HomeSlotId = string;
export type HomeBg = "inherit" | "surface" | "ink" | "paper";
export type HomeDevice = "desktop" | "tablet" | "phone";

export type HomeBlockStyle = {
  hidden?: boolean;
  padTop?: number;
  padBottom?: number;
  bg?: HomeBg;
};

export type HomeCustomBlock = {
  id: string;
  kicker: string;
  title: string;
  text: string;
  image?: string;
  ctaLabel?: string;
  ctaHref?: string;
  why?: string;
};

export type HomeLayoutDoc = {
  order: HomeSlotId[];
  styles: Partial<Record<string, HomeBlockStyle>>;
  texts: Record<string, string>;
  customs: HomeCustomBlock[];
  media: Record<string, string>;
};

const KNOWN = new Set(HOME_BLOCKS.map((b) => b.id));

export function isCustomBlockId(id: string) {
  return /^c_[a-z0-9]+$/i.test(id);
}

export function newCustomBlockId() {
  return `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultHomeOrder(): HomeSlotId[] {
  return HOME_BLOCKS.map((b) => b.id);
}

export function emptyHomeLayout(): HomeLayoutDoc {
  return { order: defaultHomeOrder(), styles: {}, texts: {}, customs: [], media: {} };
}

export function homeBlockLabel(id: string, customs: HomeCustomBlock[] = []) {
  return HOME_BLOCKS.find((b) => b.id === id)?.label || customs.find((c) => c.id === id)?.title || id;
}

export function clampPad(n: unknown) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(160, Math.round(x)));
}

export function normalizeHomeOrder(raw?: unknown, extraIds: string[] = []): HomeSlotId[] {
  const extra = extraIds.filter(isCustomBlockId);
  const allow = new Set<string>([...KNOWN, ...extra]);
  const seen = new Set<string>();
  const out: HomeSlotId[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const id = String(item || "");
      if (!allow.has(id) || seen.has(id)) continue;
      out.push(id);
      seen.add(id);
    }
  }
  for (const b of HOME_BLOCKS) {
    if (!seen.has(b.id)) out.push(b.id);
  }
  for (const id of extra) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

function asBg(v: unknown): HomeBg {
  return v === "surface" || v === "ink" || v === "paper" ? v : "inherit";
}

function asCustom(raw: unknown): HomeCustomBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const id = isCustomBlockId(String(c.id || "")) ? String(c.id) : "";
  const title = String(c.title || "").trim().slice(0, 120);
  if (!id || !title) return null;
  return {
    id,
    kicker: String(c.kicker || "").trim().slice(0, 80),
    title,
    text: String(c.text || "").trim().slice(0, 1200),
    image: String(c.image || "").trim().slice(0, 200) || undefined,
    ctaLabel: String(c.ctaLabel || "").trim().slice(0, 40) || undefined,
    ctaHref: String(c.ctaHref || "").trim().slice(0, 180) || undefined,
    why: String(c.why || "").trim().slice(0, 240) || undefined,
  };
}

export function normalizeHomeLayout(raw?: unknown): HomeLayoutDoc {
  if (Array.isArray(raw)) return { ...emptyHomeLayout(), order: normalizeHomeOrder(raw) };
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const customs = Array.isArray(src.customs) ? src.customs.map(asCustom).filter(Boolean) as HomeCustomBlock[] : [];
  const extra = customs.map((c) => c.id);
  const styles: HomeLayoutDoc["styles"] = {};
  const rawStyles = src.styles && typeof src.styles === "object" ? (src.styles as Record<string, unknown>) : {};
  const styleIds = [...HOME_BLOCKS.map((b) => b.id), ...extra];
  for (const id of styleIds) {
    const s = rawStyles[id];
    if (!s || typeof s !== "object") continue;
    const st = s as HomeBlockStyle;
    styles[id] = {
      hidden: Boolean(st.hidden) || undefined,
      padTop: clampPad(st.padTop) || undefined,
      padBottom: clampPad(st.padBottom) || undefined,
      bg: asBg(st.bg) === "inherit" ? undefined : asBg(st.bg),
    };
    if (!styles[id]?.hidden && !styles[id]?.padTop && !styles[id]?.padBottom && !styles[id]?.bg) delete styles[id];
  }
  const texts: Record<string, string> = {};
  if (src.texts && typeof src.texts === "object") {
    for (const [k, v] of Object.entries(src.texts as Record<string, unknown>)) {
      const t = String(v || "").trim();
      if (k && t) texts[k.slice(0, 80)] = t.slice(0, 4000);
    }
  }
  const media: Record<string, string> = {};
  if (src.media && typeof src.media === "object") {
    for (const [k, v] of Object.entries(src.media as Record<string, unknown>)) {
      const srcPath = String(v || "").trim();
      if (k && srcPath.startsWith("/") && !srcPath.includes("..")) media[k.slice(0, 40)] = srcPath.slice(0, 200);
    }
  }
  return { order: normalizeHomeOrder(src.order, extra), styles, texts, customs, media };
}

export function moveHomeBlock(order: HomeSlotId[], id: HomeSlotId, dir: -1 | 1): HomeSlotId[] {
  const next = [...order];
  const i = next.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= next.length) return next;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function placeHomeBlock(order: HomeSlotId[], id: HomeSlotId, before?: string | null): HomeSlotId[] {
  const rest = order.filter((x) => x !== id);
  if (!before) return [...rest, id];
  const i = rest.indexOf(before);
  if (i < 0) return [...rest, id];
  rest.splice(i, 0, id);
  return rest;
}

export function patchHomeStyle(doc: HomeLayoutDoc, id: HomeSlotId, patch: HomeBlockStyle): HomeLayoutDoc {
  const cur = { ...(doc.styles[id] || {}), ...patch };
  const next: HomeBlockStyle = {
    hidden: cur.hidden || undefined,
    padTop: clampPad(cur.padTop) || undefined,
    padBottom: clampPad(cur.padBottom) || undefined,
    bg: asBg(cur.bg) === "inherit" ? undefined : asBg(cur.bg),
  };
  const styles = { ...doc.styles };
  if (!next.hidden && !next.padTop && !next.padBottom && !next.bg) delete styles[id];
  else styles[id] = next;
  return { ...doc, styles };
}

export function setHomeText(doc: HomeLayoutDoc, key: string, value: string): HomeLayoutDoc {
  const texts = { ...doc.texts };
  const t = value.trim().slice(0, 4000);
  if (!t) delete texts[key];
  else texts[key.slice(0, 80)] = t;
  return { ...doc, texts };
}

export function setHomeMedia(doc: HomeLayoutDoc, id: HomeSlotId, src: string): HomeLayoutDoc {
  const media = { ...doc.media };
  const v = src.trim();
  if (!v) delete media[id];
  else media[id] = v.slice(0, 200);
  const customs = doc.customs.map((c) => (c.id === id ? { ...c, image: v || undefined } : c));
  return { ...doc, media, customs };
}

export function addCustomBlock(doc: HomeLayoutDoc, block: Omit<HomeCustomBlock, "id"> & { id?: string }): HomeLayoutDoc {
  const id = block.id && isCustomBlockId(block.id) ? block.id : newCustomBlockId();
  const custom: HomeCustomBlock = { ...block, id, title: block.title.slice(0, 120) };
  const customs = [...doc.customs.filter((c) => c.id !== id), custom];
  const order = doc.order.includes(id) ? doc.order : [...doc.order, id];
  return normalizeHomeLayout({ ...doc, customs, order });
}

export function visibleHomeOrder(doc: HomeLayoutDoc, showHidden: boolean): HomeSlotId[] {
  if (showHidden) return doc.order;
  return doc.order.filter((id) => !doc.styles[id]?.hidden);
}
