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

export function hydratePrices(rows: PriceRow[]) {
  cache = rows.map((r) => ({ ...r }));
}

export function listPriceRows() {
  return cache;
}

export function formatRub(n: number) {
  return `${n.toLocaleString("ru-RU")} ₽ / 4 нед.`;
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

export function publicPriceLabel(path: string) {
  const hit = priceForPath(path);
  if (hit?.all) return formatRub(hit.all);
  return "от 3 350 ₽ / 4 нед.";
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
