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
export type HomeBg = "inherit" | "surface" | "ink" | "paper";
export type HomeDevice = "desktop" | "tablet" | "phone";

export type HomeBlockStyle = {
  hidden?: boolean;
  padTop?: number;
  padBottom?: number;
  bg?: HomeBg;
};

export type HomeLayoutDoc = {
  order: HomeBlockId[];
  styles: Partial<Record<HomeBlockId, HomeBlockStyle>>;
  texts: Record<string, string>;
};

const KNOWN = new Set(HOME_BLOCKS.map((b) => b.id));

export function defaultHomeOrder(): HomeBlockId[] {
  return HOME_BLOCKS.map((b) => b.id);
}

export function emptyHomeLayout(): HomeLayoutDoc {
  return { order: defaultHomeOrder(), styles: {}, texts: {} };
}

export function homeBlockLabel(id: string) {
  return HOME_BLOCKS.find((b) => b.id === id)?.label || id;
}

export function clampPad(n: unknown) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(160, Math.round(x)));
}

export function normalizeHomeOrder(raw?: unknown): HomeBlockId[] {
  const seen = new Set<HomeBlockId>();
  const out: HomeBlockId[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const id = String(item || "") as HomeBlockId;
      if (!KNOWN.has(id) || seen.has(id)) continue;
      out.push(id);
      seen.add(id);
    }
  }
  for (const b of HOME_BLOCKS) {
    if (!seen.has(b.id)) out.push(b.id);
  }
  return out;
}

function asBg(v: unknown): HomeBg {
  return v === "surface" || v === "ink" || v === "paper" ? v : "inherit";
}

export function normalizeHomeLayout(raw?: unknown): HomeLayoutDoc {
  if (Array.isArray(raw)) return { order: normalizeHomeOrder(raw), styles: {}, texts: {} };
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const styles: HomeLayoutDoc["styles"] = {};
  const rawStyles = src.styles && typeof src.styles === "object" ? (src.styles as Record<string, unknown>) : {};
  for (const b of HOME_BLOCKS) {
    const s = rawStyles[b.id];
    if (!s || typeof s !== "object") continue;
    const st = s as HomeBlockStyle;
    styles[b.id] = {
      hidden: Boolean(st.hidden) || undefined,
      padTop: clampPad(st.padTop) || undefined,
      padBottom: clampPad(st.padBottom) || undefined,
      bg: asBg(st.bg) === "inherit" ? undefined : asBg(st.bg),
    };
    if (!styles[b.id]?.hidden && !styles[b.id]?.padTop && !styles[b.id]?.padBottom && !styles[b.id]?.bg) {
      delete styles[b.id];
    }
  }
  const texts: Record<string, string> = {};
  if (src.texts && typeof src.texts === "object") {
    for (const [k, v] of Object.entries(src.texts as Record<string, unknown>)) {
      const t = String(v || "").trim();
      if (k && t) texts[k.slice(0, 80)] = t.slice(0, 4000);
    }
  }
  return { order: normalizeHomeOrder(src.order), styles, texts };
}

export function moveHomeBlock(order: HomeBlockId[], id: HomeBlockId, dir: -1 | 1): HomeBlockId[] {
  const next = normalizeHomeOrder(order);
  const i = next.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= next.length) return next;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function placeHomeBlock(order: HomeBlockId[], id: HomeBlockId, before?: string | null): HomeBlockId[] {
  const rest = normalizeHomeOrder(order).filter((x) => x !== id);
  if (!before || !KNOWN.has(before as HomeBlockId)) return [...rest, id];
  const i = rest.indexOf(before as HomeBlockId);
  if (i < 0) return [...rest, id];
  rest.splice(i, 0, id);
  return rest;
}

export function patchHomeStyle(doc: HomeLayoutDoc, id: HomeBlockId, patch: HomeBlockStyle): HomeLayoutDoc {
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

export function visibleHomeOrder(doc: HomeLayoutDoc, showHidden: boolean): HomeBlockId[] {
  if (showHidden) return doc.order;
  return doc.order.filter((id) => !doc.styles[id]?.hidden);
}
