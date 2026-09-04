import seed from "./prices.seed.json";

export type PriceRow = {
  id: string;
  name: string;
  age: string;
  path: string;
  /** = courseId в дереве (обычно path). Цена курса ищется по этому ID, не по имени. */
  courseId?: string;
  /** Предмет AlfaCRM, если цена привязана к subjectId. */
  subjectId?: number;
  direction: string;
  all: number;
  kbm: number;
  tmx: number;
  mins?: number;
  perWeek?: number;
  /** Длительности занятий одной недели, если в неделю 2+ урока разной длины: [90, 180]. */
  minsList?: number[];
  extra?: Record<string, number>;
};

const SEED = seed as PriceRow[];
let cache: PriceRow[] = SEED.map((r) => ({ ...r }));

export function splitCourseAge(name: string): { name: string; age: string } {
  let n = String(name || "")
    .replace(/робототехника и программирование/gi, "Робототехника")
    .replace(/^\d{4}\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  n = n.replace(/[·•]/g, " ");
  n = n.replace(/\s*[\(（]\s*\d+\s*(?:групп[аые]?|гр\.?)?\s*[\)）]\s*$/gi, "").trim();
  let age = "";
  const block = n.match(/\s*[\(（]\s*((?:(?:\d+\s*[-–—]\s*\d+|\d+\s*\+|от\s*\d+)(?:\s*(?:лет|года|год))?(?:\s*[,;]\s*)?)+)\s*[\)）]\s*$/i);
  if (block && block.index != null && block.index >= 4) {
    age = block[1].replace(/\s+/g, " ").replace(/[,\s]+$/g, "").trim();
    n = n.slice(0, block.index).trim();
  } else {
    const m = n.match(/\s*[\(（]?\s*((?:\d+\s*[-–—]\s*\d+|\d+\s*\+|от\s*\d+)\s*(?:лет|года|год)?)\s*[\)）]?\s*$/i);
    if (m && m.index != null && m.index >= 4) {
      age = m[1].replace(/\s+/g, " ").trim();
      n = n.slice(0, m.index).trim();
    }
  }
  n = n
    .replace(/\s*[\(（]\s*(?:\d+\s*[-–—]\s*\d+\s*,?\s*)+$/g, "")
    .replace(/[\s,;:]+$/g, "")
    .replace(/[\(（]\s*$/g, "")
    .trim();
  if (age && /\d/.test(age) && !/лет|год|\+/.test(age)) age = `${age} лет`;
  return { name: n || String(name || "").replace(/^\d{4}\s+/, "").trim(), age };
}

export function tidyCourseName(name: string) {
  return splitCourseAge(name).name;
}

/** «2026 Бальные танцы 5-7 лет» и «Бальные танцы · 5-7 лет» — одна папка. */
export function foldCourseLabel(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/^\d{4}\s+/, "")
    .replace(/[·•–—()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMinsList(raw: string | number | number[] | undefined): number[] {
  if (Array.isArray(raw)) return raw.map((n) => Math.round(Number(n) || 0)).filter((n) => n > 0 && n <= 480);
  if (typeof raw === "number") return raw > 0 ? [Math.round(raw)] : [];
  const s = String(raw || "").trim();
  if (!s) return [];
  const times = s.match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
  if (times) {
    const mins = Math.round(Number(times[1]) || 0);
    const count = Math.min(7, Math.max(1, Math.round(Number(times[2]) || 0)));
    return mins > 0 ? Array.from({ length: count }, () => mins) : [];
  }
  return s
    .split(/[+/,;]|и/i)
    .map((p) => Math.round(Number(p.replace(/[^\d.]/g, "")) || 0))
    .filter((n) => n > 0 && n <= 480);
}

export function formatMinsList(list?: number[], fallback = 0) {
  const xs = parseMinsList(list?.length ? list : fallback);
  if (!xs.length) return "";
  if (xs.length === 1) return String(xs[0]);
  if (xs.every((n) => n === xs[0])) return `${xs[0]} × ${xs.length}`;
  return xs.join(" + ");
}

export function hydratePrices(rows: PriceRow[]) {
  cache = rows.map((r) => {
    const minsList = parseMinsList(r.minsList?.length ? r.minsList : r.mins);
    return {
      ...r,
      name: tidyCourseName(r.name),
      courseId: r.courseId || r.path || r.id,
      mins: minsList[0] || Math.max(0, Math.round(Number(r.mins) || 0)),
      minsList,
      perWeek: Math.max(minsList.length > 1 ? minsList.length : 0, Math.max(0, Math.round(Number(r.perWeek) || 0))),
      extra: cleanExtra(r.extra),
    };
  });
}

function cleanExtra(raw?: Record<string, number>) {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!k || k === "all" || k === "kbm" || k === "tmx") continue;
    out[k] = Math.max(0, Math.round(Number(v) || 0));
  }
  return out;
}

export function listPriceRows() {
  return cache;
}

export const SCHOOL_DIRECTION: Record<string, string> = {
  "/art-studio": "Художественная школа",
  "/robototehnika-v-kolomne": "Школа робототехники",
  "/programming-school": "Школа программирования",
  "/promising-professions": "Школа наук и инженерии",
  "/early-childhood-care": "Школа раннего развития",
  "/languageschool": "Школа иностранных языков",
  "/model-school": "Модельная школа",
};

export function formatAmount(n: number) {
  return n.toLocaleString("ru-RU");
}

export function formatRub(n: number) {
  return `${formatAmount(n)} ₽ / 4 нед.`;
}

export function priceInfo(path: string): { amount: number; from: boolean } | null {
  const hit = priceForPath(path);
  if (hit?.all) return { amount: hit.all, from: false };
  const dir = SCHOOL_DIRECTION[normPath(path)];
  if (!dir) return null;
  const nums = cache.filter((r) => r.direction === dir).map((r) => r.all).filter(Boolean);
  if (!nums.length) return null;
  return { amount: Math.min(...nums), from: true };
}

export function publicPriceLabel(path: string) {
  const info = priceInfo(path);
  if (!info) return "от 3 350 ₽ / 4 нед.";
  return `${info.from ? "от " : ""}${formatRub(info.amount)}`;
}

export function priceShort(path: string) {
  const info = priceInfo(path);
  if (!info) return "";
  return `${info.from ? "от " : ""}${formatAmount(info.amount)} ₽`;
}

export function normPath(path: string) {
  const clean = (path.startsWith("/") ? path : `/${path}`).replace(/\/+$/, "") || "/";
  try {
    return decodeURIComponent(clean);
  } catch {
    return clean;
  }
}

export function priceForPath(path: string) {
  const p = normPath(path);
  return (
    cache.find((r) => normPath(r.courseId || r.path || r.id) === p) ||
    cache.find((r) => normPath(r.path) === p) ||
    cache.find((r) => p.endsWith(normPath(r.path)) || normPath(r.path).endsWith(p))
  );
}

export type GroupDuration = { path: string; course: string; mins: number; perWeek: number; minsList?: number[]; groups: number };

/** Длительность к цене: только courseId / path. Имя курса не склеивает. */
export function matchDuration(row: PriceRow, items: GroupDuration[]) {
  const rp = normPath(row.courseId || row.path);
  const byId = items.find((it) => {
    const sp = normPath(it.path);
    return Boolean(rp && sp && (rp === sp || sp.endsWith(rp) || rp.endsWith(sp)));
  });
  return byId || null;
}

export { priceRowKey } from "./ids";

export const PRICE_DIRECTIONS = [
  "Художественная школа",
  "Школа робототехники",
  "Школа программирования",
  "Школа наук и инженерии",
  "Школа иностранных языков",
  "Школа раннего развития",
  "Модельная школа",
  "Творческая студия",
];
