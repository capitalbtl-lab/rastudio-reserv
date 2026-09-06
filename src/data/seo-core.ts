const HOME_TITLE =
  'Студия "РАЗВИВАЙСЯ" | Художественная школа, робототехника, инженерные и айти-курсы';

export const NOINDEX_PREFIXES = [
  "/hs-2-",
  "/eventschedule",
  "/roboticsinenglish1",
  "/roboticsinenglish2",
  "/roboticsinenglish3",
  "/roboticsinenglish4",
];
export const NOINDEX_PATHS = new Set([
  "/parenttesting",
  "/kbmprof",
  "/tmxprof",
  "/sborbojcamsvo",
  "/sbordetyampalestiny",
  "/admin",
]);
export const NOT_COURSE_PATHS = new Set([
  "/charity",
  "/event-list",
  "/legal-information",
  "/parenttesting",
  "/opendoors",
  "/tinkercad2025itogi",
  "/kbmprof",
  "/tmxprof",
  "/sborbojcamsvo",
  "/sbordetyampalestiny",
  "/eventschedule-c",
  "/eventschedule-s",
]);
export const GENERIC_HEADING = /^(о курсе|о курсе и его ценности|филиалы|события|добро пожаловать)/i;

export function decodePath(path = "") {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function shouldNoindex(path = "") {
  const decoded = decodePath(path);
  if (NOINDEX_PATHS.has(decoded) || NOINDEX_PATHS.has(path)) return true;
  return NOINDEX_PREFIXES.some((p) => decoded.startsWith(p) || path.startsWith(p));
}

export function isCourseSchemaPath(path = "", kind = "") {
  const decoded = decodePath(path);
  if (kind && kind !== "course" && kind !== "school") return false;
  if (NOT_COURSE_PATHS.has(decoded) || NOT_COURSE_PATHS.has(path)) return false;
  if (decoded.startsWith("/hs-2-") || path.startsWith("/hs-2-")) return false;
  if (shouldNoindex(path)) return false;
  return kind === "course" || kind === "school";
}

export function stripBrand(text: string) {
  return (text || "")
    .replace(/\s*\|\s*RASTUDIO\.ORG\s*$/i, "")
    .replace(/\s*\|\s*RASTUDIO\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function brandTitle(title: string) {
  const core = stripBrand(title);
  if (!core) return HOME_TITLE;
  if (/развивайся/i.test(core) || /rastudio\.org/i.test(core)) return core;
  return `${core} | Студия «Развивайся»`;
}

export function clipMeta(text: string, max = 168) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 80 ? cut.slice(0, sp) : cut).trim()}…`;
}

export type SeoSeed = {
  title?: string;
  description?: string;
  kind?: string;
  h1?: string;
  paragraphs?: string[];
};

export function bodyDescription(page: SeoSeed) {
  const skip = /^(согласие|top of page|bottom of page|курсы программирования, робототехники|3 современные студии)/i;
  for (const raw of page.paragraphs || []) {
    const t = String(raw || "").replace(/\s+/g, " ").trim();
    if (t.length > 50 && !skip.test(t) && !GENERIC_HEADING.test(t)) return clipMeta(t);
  }
  return "";
}

export function fallbackDescription(page: SeoSeed) {
  const heading = GENERIC_HEADING.test((page.h1 || "").trim()) ? page.title : page.h1 || page.title;
  const name = stripBrand(heading || "").replace(/[«»"]/g, "").trim();
  const kind = page.kind || "";
  if (kind === "teacher") {
    const role = (page.paragraphs?.[0] || "педагог студии «Развивайся»").replace(/\s+/g, " ").trim();
    return clipMeta(`${name} — ${role} Коломна и Луховицы, пробное занятие.`);
  }
  const fromBody = bodyDescription(page);
  if (fromBody) return fromBody;
  if (kind === "master") {
    return clipMeta(
      `${name} в студии «Развивайся», Коломна. Разовое занятие для детей и взрослых, запись 8 (800) 511-34-01.`,
    );
  }
  if (kind === "course" || kind === "school") {
    return clipMeta(`${name} в студии «Развивайся». Коломна и Луховицы, пробное занятие без абонемента.`);
  }
  return clipMeta(
    `${name || "Страница"} — студия «Развивайся», Коломна и Луховицы. Пробное занятие, 8 (800) 511-34-01.`,
  );
}
