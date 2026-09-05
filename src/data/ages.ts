import { publicPriceLabel, listPriceRows } from "./prices-core";

export const AGE_BANDS = [
  { id: "3-4", label: "3–4 года", min: 3, max: 4 },
  { id: "5-6", label: "5–6 лет", min: 5, max: 6 },
  { id: "7-9", label: "7–9 лет", min: 7, max: 9 },
  { id: "10-14", label: "10–14 лет", min: 10, max: 14 },
  { id: "15", label: "15+", min: 15, max: 18 },
] as const;

export type AgeBandId = (typeof AGE_BANDS)[number]["id"];

export function parseAgeRanges(text: string): [number, number][] {
  if (!text) return [];
  const out: [number, number][] = [];
  const re = /(\d+)\s*[–—-]\s*(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push([Number(m[1]), Number(m[2])]);
  if (!out.length) {
    const from = text.match(/от\s*(\d+)/i);
    const plus = text.match(/(\d+)\s*\+/);
    if (from || plus) out.push([Number((from || plus)![1]), 18]);
    else {
      const one = text.match(/\b(\d+)\s*(?:лет|года)/i);
      if (one) out.push([Number(one[1]), Number(one[1])]);
    }
  }
  return out;
}

export function agesOverlap(text: string, min: number, max: number) {
  const ranges = parseAgeRanges(text);
  if (!ranges.length) return false;
  return ranges.some(([a, b]) => a <= max && b >= min);
}

export function coursePlace(href: string) {
  if (/art-studio|sculptural|hudvuz|digitalart|model-school|english|japanese|vitamin|preparation|happybricks/i.test(href)) {
    return "Коломна";
  }
  return "Коломна · Луховицы";
}

export function courseLength(href: string) {
  const row = listPriceRows().find((r) => r.path === href || r.courseId === href);
  if (row?.mins) return `${row.mins} мин`;
  if (/art-studio-3-4|art-studio-5-6|happybricks|preparation-for-school/i.test(href)) return "60 мин";
  return "90 мин";
}

export function coursePrice(path: string) {
  return publicPriceLabel(path);
}

export function ageBadge(age?: string | null, title?: string | null) {
  const src = `${age || ""} ${title || ""}`.replace(/\s+/g, " ").trim();
  if (!src) return "";
  const range = src.match(/(\d{1,2})\s*[–—-]\s*(\d{1,2})/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (a >= 2 && b <= 18 && a <= b) return `${a}–${b} ${b <= 4 ? "года" : "лет"}`;
  }
  const plus = src.match(/(?:от\s*)?(\d{1,2})\s*\+/i) || src.match(/от\s*(\d{1,2})/i);
  if (plus) {
    const n = Number(plus[1]);
    if (n >= 2 && n <= 18) return `${n}+`;
  }
  const one = src.match(/\b(\d{1,2})\s*(лет|года|год)\b/i);
  if (one) return `${one[1]} ${/год/i.test(one[2]) && Number(one[1]) <= 4 ? "года" : "лет"}`;
  return ageShort(age);
}

export function courseNameOnly(title: string, age?: string | null) {
  let t = (title || "").replace(/\s+/g, " ").trim();
  if (!t) return title;
  t = t
    .replace(/\s*\(\s*\d{1,2}\s*[–—-]\s*\d{1,2}\s*(?:лет|года|год)?\s*\)\s*$/i, "")
    .replace(/\s+для детей\s+\d{1,2}\s*[–—-]\s*\d{1,2}\s*(?:лет|года|год)?\s*$/i, "")
    .replace(/\s+\d{1,2}\s*[–—-]\s*\d{1,2}\s*(?:лет|года|год)?\s*$/i, "")
    .replace(/\s+\d{1,2}\s*\+\s*(?:лет)?\s*$/i, "")
    .replace(/\s+для детей\s*$/i, "")
    .replace(/\s*\d{1,2}\s*[–—-]\s*\d{1,2}\s*(?:лет|года|год)?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[·,;:\-–—]\s*$/g, "")
    .trim();
  return t.length >= 3 ? t : title;
}

export function ageShort(age?: string | null) {
  if (!age) return "";
  const bit = age
    .replace(/^курс\s+/i, "")
    .replace(/^для детей\s+/i, "")
    .replace(/^для\s+/i, "")
    .trim();
  const range = bit.match(/(\d+\s*[–—-]\s*\d+\s*(?:лет|года)?|\d+\s*\+\s*|\d+\s*лет)/i);
  return range ? range[1].replace(/\s+/g, " ").trim() : bit;
}

export function courseFacts(href: string, age?: string) {
  return [age, courseLength(href), coursePrice(href), coursePlace(href)].filter(Boolean).join(" · ");
}

export function courseOfferFacts(path: string, age?: string | null) {
  return [ageShort(age), courseLength(path), coursePlace(path)].filter(Boolean);
}

export function coursesForAge(age: number) {
  const n = Math.round(Number(age));
  const map = new Map<string, { name: string; age: string; path: string; courseId: string; schoolId: string }[]>();
  if (!Number.isFinite(n) || n < 2 || n > 20) return [];
  for (const row of listPriceRows()) {
    if (!agesOverlap(row.age, n, n)) continue;
    const list = map.get(row.direction) || [];
    const courseId = row.courseId || row.path;
    list.push({ name: row.name, age: row.age, path: row.path, courseId, schoolId: row.schoolId || "" });
    map.set(row.direction, list);
  }
  return [...map.entries()].map(([direction, items]) => ({ direction, items }));
}

export function formatCoursesForAge(age: number) {
  const groups = coursesForAge(age);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  if (!total) return `В каталоге нет курсов на ${age} лет. Уточните возраст.`;
  return [
    `Все курсы для ${age} лет — ${total} программ. Ключ — courseId дерева. Цена = колонка «Все». Перечисли родителю ВСЕ, по школам, без сокращения до двух.`,
    ...groups.map(
      (g) =>
        `${g.direction}: ${g.items.map((i) => `${i.name} [courseId=${i.courseId}] ${coursePrice(i.courseId || i.path)}`).join("; ")}.`,
    ),
  ].join("\n");
}
