import seed from "./prices.seed.json" with { type: "json" };

export type PriceRow = {
  id: string;
  name: string;
  age: string;
  path: string;
  /** = courseId в дереве (обычно path). Цена курса ищется по этому ID, не по имени. */
  courseId?: string;
  /** schoolId дерева. direction — только подпись. */
  schoolId?: string;
  /** Предмет AlfaCRM, если цена привязана к subjectId. */
  subjectId?: number;
  direction: string;
  all: number;
  kbm: number;
  tmx: number;
  mins?: number;
  perWeek?: number;
  extra?: Record<string, number>;
};

const SEED = seed as PriceRow[];

export const SCHOOL_DIRECTION: Record<string, string> = {
  "/art-studio": "Художественная школа",
  "/robototehnika-v-kolomne": "Школа робототехники",
  "/programming-school": "Школа программирования",
  "/promising-professions": "Школа наук и инженерии",
  "/early-childhood-care": "Школа раннего развития",
  "/languageschool": "Школа иностранных языков",
  "/model-school": "Модельная школа",
};

/** Закрытая таблица посева: подпись direction → schoolId. Не живой поиск по имени. */
export const SCHOOL_OF_DIRECTION: Record<string, string> = Object.fromEntries(
  Object.entries(SCHOOL_DIRECTION).map(([id, label]) => [label, id]),
);

function cleanExtra(raw?: Record<string, number>) {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!k || k === "all" || k === "kbm" || k === "tmx") continue;
    out[k] = Math.max(0, Math.round(Number(v) || 0));
  }
  return out;
}

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

function withSchool(r: PriceRow): PriceRow {
  const courseId = r.courseId || r.path || r.id;
  return {
    ...r,
    name: tidyCourseName(r.name),
    courseId,
    schoolId: r.schoolId || SCHOOL_OF_DIRECTION[r.direction] || "",
    mins: Math.max(0, Math.round(Number(r.mins) || 0)),
    perWeek: Math.max(0, Math.round(Number(r.perWeek) || 0)),
    extra: cleanExtra(r.extra),
  };
}

let cache: PriceRow[] = SEED.map((r) => withSchool(r));

export function hydratePrices(rows: PriceRow[]) {
  cache = rows.map(withSchool);
}

export function listPriceRows() {
  return cache;
}

export function formatAmount(n: number) {
  return n.toLocaleString("ru-RU");
}

export function formatRub(n: number) {
  return `${formatAmount(n)} ₽ / 4 нед.`;
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
    cache.find((r) => normPath(r.courseId || "") === p) ||
    cache.find((r) => normPath(r.path || r.id) === p) ||
    null
  );
}

/** schoolId курса сайта. Не regex URL и не название школы. */
export function schoolIdOfCourse(path: string) {
  const hit = priceForPath(path);
  if (hit?.schoolId) return hit.schoolId;
  const p = normPath(path);
  return SCHOOL_DIRECTION[p] ? p : "";
}

export function priceInfo(path: string): { amount: number; from: boolean } | null {
  const hit = priceForPath(path);
  if (hit?.all) return { amount: hit.all, from: false };
  const schoolId = hit?.schoolId || schoolIdOfCourse(path);
  if (!schoolId) return null;
  const nums = cache.filter((r) => r.schoolId === schoolId).map((r) => r.all).filter(Boolean);
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

export type GroupDuration = { path: string; course: string; mins: number; perWeek: number; groups: number };

/** Длительность к цене: только courseId / path. Имя курса не склеивает. */
export function matchDuration(row: PriceRow, items: GroupDuration[]) {
  const rp = normPath(row.courseId || row.path);
  if (!rp) return null;
  return items.find((it) => normPath(it.path) === rp) || null;
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
