import seed from "./prices.seed.json";

export type PriceRow = {
  id: string;
  name: string;
  age: string;
  path: string;
  direction: string;
  all: number;
  kbm: number;
  tmx: number;
};

const SEED = seed as PriceRow[];
let cache: PriceRow[] = SEED.map((r) => ({ ...r }));

export function splitCourseAge(name: string): { name: string; age: string } {
  let n = String(name || "")
    .replace(/робототехника и программирование/gi, "Робототехника")
    .replace(/\s+/g, " ")
    .trim();
  const m = n.match(/\s*[\(（]?\s*((?:\d+\s*[-–—]\s*\d+|\d+\s*\+|от\s*\d+)\s*(?:лет|года|год)?)\s*[\)）]?\s*$/i);
  if (!m || m.index == null) return { name: n, age: "" };
  const cut = n.slice(0, m.index).trim();
  if (cut.length < 4) return { name: n, age: "" };
  let age = m[1].replace(/\s+/g, " ").trim();
  if (/\d/.test(age) && !/лет|год|\+/.test(age)) age = `${age} лет`;
  return { name: cut, age };
}

export function tidyCourseName(name: string) {
  return splitCourseAge(name).name;
}

export function hydratePrices(rows: PriceRow[]) {
  cache = rows.map((r) => ({ ...r, name: tidyCourseName(r.name) }));
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
    cache.find((r) => normPath(r.path) === p) ||
    cache.find((r) => p.endsWith(normPath(r.path)) || normPath(r.path).endsWith(p))
  );
}

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
