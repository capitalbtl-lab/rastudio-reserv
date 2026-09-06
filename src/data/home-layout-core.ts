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

const KNOWN = new Set(HOME_BLOCKS.map((b) => b.id));

export function defaultHomeOrder(): HomeBlockId[] {
  return HOME_BLOCKS.map((b) => b.id);
}

export function homeBlockLabel(id: string) {
  return HOME_BLOCKS.find((b) => b.id === id)?.label || id;
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
