import { SITE, SCHOOLS, BRANCHES } from "./site";
import { schoolIdOfPath } from "./site-bind-core";
import { SEO_COPY } from "./seo-copy";
import { YANDEX_RATING, YANDEX_REVIEWS } from "./reviews";
import { courseLength, coursePlace, coursePrice } from "./ages";

export const SEO_ORIGIN = "https://www.rastudio.org";
export const DEFAULT_OG = `${SEO_ORIGIN}/og.jpg`;
export const YANDEX_ORG = "https://yandex.ru/maps/org/razvivaysya/34620041541/";
export const INDEXNOW_KEY = "rastudio-indexnow-8f3a2c";

export type HeadPage = {
  title: string;
  description: string;
  ogTitle?: string;
  ogImage?: string;
  canonical: string;
  path?: string;
  kind?: string;
  h1?: string;
  paragraphs?: string[];
};

function absUrl(href: string) {
  if (!href) return SEO_ORIGIN;
  if (href.startsWith("http")) return href.replace("https://rastudio.org", SEO_ORIGIN);
  return `${SEO_ORIGIN}${href.startsWith("/") ? href : `/${href}`}`;
}

const NOINDEX_PREFIXES = ["/hs-2-", "/eventschedule", "/roboticsinenglish1", "/roboticsinenglish2", "/roboticsinenglish3", "/roboticsinenglish4"];
const NOINDEX_PATHS = new Set([
  "/parenttesting",
  "/kbmprof",
  "/tmxprof",
  "/sborbojcamsvo",
  "/sbordetyampalestiny",
  "/admin",
]);
const NOT_COURSE_PATHS = new Set([
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
const GENERIC_HEADING = /^(о курсе|о курсе и его ценности|филиалы|события|добро пожаловать)/i;
const CANONICAL_MAP: Record<string, string> = {
  "/roboticsinenglish1": "/roboticsinenglish",
  "/roboticsinenglish2": "/roboticsinenglish",
  "/roboticsinenglish3": "/roboticsinenglish",
  "/roboticsinenglish4": "/roboticsinenglish",
};

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

function canonicalOf(page: HeadPage) {
  const path = page.path || "";
  const decoded = decodePath(path);
  const mapped = CANONICAL_MAP[decoded] || CANONICAL_MAP[path];
  const raw =
    mapped != null
      ? `${SEO_ORIGIN}${mapped}`
      : page.canonical || `${SEO_ORIGIN}${path === "/" || !path ? "" : path}`;
  return raw.replace("https://rastudio.org", SEO_ORIGIN).replace(/\/$/, "") || SEO_ORIGIN;
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
  if (!core) return SITE.homeTitle;
  if (/развивайся/i.test(core) || /rastudio\.org/i.test(core)) return core;
  return `${core} | Студия «Развивайся»`;
}

function clipMeta(text: string, max = 168) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 80 ? cut.slice(0, sp) : cut).trim()}…`;
}

export function fallbackDescription(page: HeadPage) {
  const heading = GENERIC_HEADING.test((page.h1 || "").trim()) ? page.title : page.h1 || page.title;
  const name = stripBrand(heading || "").replace(/[«»"]/g, "").trim();
  const kind = page.kind || "";
  if (kind === "teacher") {
    const role = (page.paragraphs?.[0] || "педагог студии «Развивайся»").replace(/\s+/g, " ").trim();
    return clipMeta(`${name} — ${role} Коломна и Луховицы, пробное занятие.`);
  }
  if (kind === "master") {
    return clipMeta(`${name} в студии «Развивайся», Коломна. Разовое занятие для детей и взрослых, запись 8 (800) 511-34-01.`);
  }
  if (kind === "course" || kind === "school") {
    return clipMeta(`${name} в студии «Развивайся». Коломна и Луховицы, пробное занятие без абонемента.`);
  }
  return clipMeta(`${name || "Страница"} — студия «Развивайся», Коломна и Луховицы. Пробное занятие, 8 (800) 511-34-01.`);
}

export function enrichPage(page: HeadPage): HeadPage {
  const path = page.path || "";
  const decoded = decodePath(path);
  const extra = SEO_COPY[path] || SEO_COPY[decoded];
  const title = brandTitle(extra?.title || page.title || SITE.homeTitle);
  const description =
    extra?.description ||
    (page.description || "").trim() ||
    fallbackDescription({ ...page, title });
  return {
    ...page,
    title,
    description,
    ogTitle: page.ogTitle || title,
    ogImage: page.ogImage ? absUrl(page.ogImage) : DEFAULT_OG,
    canonical: canonicalOf({ ...page, path }),
  };
}

export function pageHead(page: HeadPage, opts?: { noindex?: boolean }) {
  const p = enrichPage(page);
  const ogTitle = p.ogTitle || p.title;
  const noindex = opts?.noindex || shouldNoindex(page.path);
  const ogImage = p.ogImage || DEFAULT_OG;
  const defaultOg = ogImage === DEFAULT_OG || /\/og\.jpg$/i.test(ogImage);
  return {
    meta: [
      { title: p.title },
      { name: "description", content: p.description },
      {
        name: "robots",
        content: noindex
          ? "noindex, follow"
          : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
      },
      { name: "geo.region", content: "RU-MOS" },
      { name: "geo.placename", content: "Коломна, Луховицы" },
      { name: "geo.position", content: "55.0834;38.7686" },
      { name: "ICBM", content: "55.0834, 38.7686" },
      { name: "format-detection", content: "telephone=yes" },
      { property: "og:type", content: p.kind === "course" || p.kind === "school" ? "article" : "website" },
      { property: "og:locale", content: "ru_RU" },
      { property: "og:site_name", content: 'Студия "РАЗВИВАЙСЯ"' },
      { property: "og:title", content: ogTitle },
      { property: "og:description", content: p.description },
      { property: "og:url", content: p.canonical },
      { property: "og:image", content: ogImage },
      { property: "og:image:alt", content: ogTitle },
      ...(defaultOg
        ? [
            { property: "og:image:width", content: "1200" },
            { property: "og:image:height", content: "630" },
            { property: "og:image:type", content: "image/jpeg" },
          ]
        : []),
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: ogTitle },
      { name: "twitter:description", content: p.description },
      { name: "twitter:image", content: ogImage },
    ],
    links: [{ rel: "canonical", href: p.canonical }],
  };
}

const ORG_ID = `${SEO_ORIGIN}/#organization`;

const MAIN_HOURS = {
  "@type": "OpeningHoursSpecification",
  dayOfWeek: ["Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  opens: "10:00",
  closes: "19:00",
};

const BRANCH_GEO = [
  { "@type": "GeoCoordinates", latitude: 55.0834, longitude: 38.7686 },
  { "@type": "GeoCoordinates", latitude: 55.0789, longitude: 38.7788 },
  { "@type": "GeoCoordinates", latitude: 54.9652, longitude: 39.0265 },
];

function postalOf(branch: (typeof BRANCHES)[number]) {
  return {
    "@type": "PostalAddress",
    addressLocality: branch.city,
    streetAddress: branch.address,
    addressRegion: "Московская область",
    postalCode: branch.city === "Луховицы" ? "140501" : "140400",
    addressCountry: "RU",
  };
}

export function organizationJsonLd() {
  const logoUrl = absUrl(SITE.logo.src);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["EducationalOrganization", "LocalBusiness"],
        "@id": ORG_ID,
        name: SITE.name,
        alternateName: ["Развивайся", "RASTUDIO", "Студия Развивайся", "ЦМИТ Развивайся"],
        legalName: SITE.name,
        url: SEO_ORIGIN,
        email: SITE.email,
        telephone: "+78005113401",
        image: logoUrl,
        logo: { "@type": "ImageObject", url: logoUrl, width: 1200, height: 289 },
        priceRange: "₽₽",
        currenciesAccepted: "RUB",
        foundingDate: "2016",
        openingHours: "We-Su 10:00-19:00",
        openingHoursSpecification: [MAIN_HOURS],
        hasMap: YANDEX_ORG,
        geo: BRANCH_GEO[0],
        areaServed: [
          { "@type": "City", name: "Коломна" },
          { "@type": "City", name: "Луховицы" },
        ],
        contactPoint: {
          "@type": "ContactPoint",
          telephone: "+78005113401",
          email: SITE.email,
          contactType: "customer service",
          availableLanguage: ["Russian"],
          areaServed: "RU",
        },
        sameAs: [SITE.vk, SITE.telegram, YANDEX_ORG, YANDEX_REVIEWS],
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: "4.9",
          bestRating: "5",
          ratingCount: YANDEX_RATING.ratings,
          reviewCount: YANDEX_RATING.reviews,
        },
        address: BRANCHES.map((b) => postalOf(b)),
        department: BRANCHES.map((b, i) => ({
          "@type": "LocalBusiness",
          name: b.name,
          address: postalOf(b),
          geo: BRANCH_GEO[i],
          telephone: "+78005113401",
          url: `${SEO_ORIGIN}/contacts`,
          ...(i === 0 ? { openingHoursSpecification: [MAIN_HOURS], openingHours: "We-Su 10:00-19:00" } : {}),
        })),
      },
      {
        "@type": "WebSite",
        "@id": `${SEO_ORIGIN}/#website`,
        url: SEO_ORIGIN,
        name: SITE.name,
        inLanguage: "ru-RU",
        publisher: { "@id": ORG_ID },
      },
    ],
  };
}

export function schoolForPath(path: string) {
  const found = SCHOOLS.find((s) => s.href === path);
  if (found) return found;
  const schoolId = schoolIdOfPath(path);
  return SCHOOLS.find((s) => s.href === schoolId) || null;
}

export function breadcrumbJsonLd(path: string, title: string) {
  const items: { name: string; item: string }[] = [{ name: "Главная", item: SEO_ORIGIN }];
  if (path === "/") return null;
  const school = schoolForPath(path);
  if (school && school.href !== path) {
    items.push({ name: school.label, item: absUrl(school.href) });
  } else if (path !== "/allcourses") {
    items.push({ name: "Курсы", item: `${SEO_ORIGIN}/allcourses` });
  }
  items.push({ name: title.replace(/\s*\|\s*.*$/, "").trim() || title, item: absUrl(path) });
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.item,
    })),
  };
}

function offerPrice(path: string) {
  const n = coursePrice(path).replace(/\s/g, "").match(/(\d+)/);
  return n ? n[1] : "3350";
}

function workloadIso(path: string) {
  const n = courseLength(path).match(/(\d+)/);
  return n ? `PT${n[1]}M` : "PT90M";
}

function courseLocations(path: string) {
  const both = /Луховиц/i.test(coursePlace(path));
  const branches = both ? BRANCHES : BRANCHES.filter((b) => b.city === "Коломна");
  return branches.map((b, i) => ({
    "@type": "Place",
    name: b.name,
    address: postalOf(b),
    geo: BRANCH_GEO[BRANCHES.indexOf(b)] || BRANCH_GEO[i],
  }));
}

function schemaName(page: HeadPage) {
  const titled = stripBrand(page.title || "");
  const h1 = (page.h1 || "").replace(/\s+/g, " ").trim();
  if (h1 && !GENERIC_HEADING.test(h1) && h1.length <= 140 && h1 !== h1.toUpperCase()) return h1;
  return titled || h1 || SITE.name;
}

export function courseJsonLd(page: HeadPage) {
  if (!isCourseSchemaPath(page.path || "", page.kind || "")) return null;
  const p = enrichPage(page);
  const path = page.path || "";
  const locations = courseLocations(path);
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: schemaName(p),
    description: p.description,
    url: p.canonical,
    inLanguage: "ru",
    image: p.ogImage,
    provider: {
      "@type": "EducationalOrganization",
      "@id": ORG_ID,
      name: SITE.name,
      url: SEO_ORIGIN,
    },
    offers: {
      "@type": "Offer",
      url: p.canonical,
      priceCurrency: "RUB",
      price: offerPrice(path),
      availability: "https://schema.org/InStock",
      category: "Education",
    },
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "Onsite",
      courseWorkload: workloadIso(path),
      inLanguage: "ru",
      location: locations.length === 1 ? locations[0] : locations,
      offers: {
        "@type": "Offer",
        priceCurrency: "RUB",
        price: offerPrice(path),
        availability: "https://schema.org/InStock",
      },
    },
  };
}

export function teacherJsonLd(page: HeadPage) {
  if (page.kind !== "teacher") return null;
  const p = enrichPage(page);
  const name = stripBrand(p.h1 || p.title);
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name,
    jobTitle: (page.paragraphs?.[0] || "Педагог студии «Развивайся»").replace(/\s+/g, " ").trim(),
    worksFor: { "@id": ORG_ID, "@type": "EducationalOrganization", name: SITE.name },
    url: p.canonical,
    image: p.ogImage !== DEFAULT_OG ? p.ogImage : undefined,
    address: {
      "@type": "PostalAddress",
      addressLocality: "Коломна",
      addressRegion: "Московская область",
      addressCountry: "RU",
    },
  };
}

export function itemListJsonLd(name: string, items: { name: string; url: string }[]) {
  if (!items.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      url: absUrl(it.url),
    })),
  };
}

export function courseListJsonLd(courses: { href: string; label?: string; title?: string }[]) {
  const items = courses
    .filter((c) => c.href && isCourseSchemaPath(c.href, "course"))
    .slice(0, 40)
    .map((c) => ({
      name: c.label || stripBrand(c.title || c.href),
      url: c.href,
    }));
  return itemListJsonLd("Курсы студии «Развивайся»", items);
}
