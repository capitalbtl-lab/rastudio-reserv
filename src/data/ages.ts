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
    const one = text.match(/(?:от\s*)?(\d+)\s*\+/i) || text.match(/\b(\d+)\s*(?:лет|года)/i);
    if (one) out.push([Number(one[1]), Number(one[1]) + 3]);
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

const PRICES: Record<string, string> = {
  "/art-studio-9-13": "6 450 ₽ / 4 нед.",
  "/happybricks": "3 350 ₽ / 4 нед.",
  "/kinder-master": "7 450 ₽ / 4 нед.",
  "/model-school": "5 450 ₽ / 4 нед.",
  "/podgotovka-v-hudvuz": "5 500 ₽ / 4 нед.",
  "/preparation-for-school": "4 850 ₽ / 4 нед.",
  "/science-course": "4 350 ₽ / 4 нед.",
  "/sculptural-studio": "3 850 ₽ / 4 нед.",
  "/teslaphysics": "4 650 ₽ / 4 нед.",
  "/mentalarithmetic": "4 650 ₽ / 4 нед.",
};

export function coursePrice(path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  try {
    const decoded = decodeURIComponent(clean);
    if (PRICES[decoded]) return PRICES[decoded];
  } catch {
    /* ignore */
  }
  return PRICES[clean] || "от 3 350 ₽ / 4 нед.";
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
  return [ageShort(age), courseLength(path), coursePrice(path), coursePlace(path)].filter(Boolean);
}
