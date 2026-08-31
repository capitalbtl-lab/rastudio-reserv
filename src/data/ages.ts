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
  if (/art-studio-3-4|art-studio-5-6|happybricks|preparation-for-school/i.test(href)) return "60 мин";
  return "90 мин";
}

export function coursePrice(path: string) {
  return publicPriceLabel(path);
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
  const map = new Map<string, { name: string; age: string; path: string }[]>();
  if (!Number.isFinite(n) || n < 2 || n > 20) return [];
  for (const row of listPriceRows()) {
    if (!agesOverlap(row.age, n, n)) continue;
    const list = map.get(row.direction) || [];
    list.push({ name: row.name, age: row.age, path: row.path });
    map.set(row.direction, list);
  }
  return [...map.entries()].map(([direction, items]) => ({ direction, items }));
}

export function formatCoursesForAge(age: number) {
  const groups = coursesForAge(age);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  if (!total) return `В каталоге нет курсов на ${age} лет. Уточните возраст.`;
  return [
    `Все курсы для ${age} лет — ${total} программ. Перечисли родителю ВСЕ, по школам, без сокращения до двух.`,
    ...groups.map((g) => `${g.direction}: ${g.items.map((i) => i.name).join("; ")}.`),
  ].join("\n");
}
