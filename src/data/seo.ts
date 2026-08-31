import { SITE, SCHOOLS, BRANCHES, SCHOOL_COURSE_MATCH } from "@/data/site";
import { SEO_COPY } from "@/data/seo-copy";
import { YANDEX_RATING, YANDEX_REVIEWS } from "@/data/reviews";
import { coursePrice } from "@/data/ages";

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
]);
const CANONICAL_MAP: Record<string, string> = {
  "/roboticsinenglish1": "/roboticsinenglish",
  "/roboticsinenglish2": "/roboticsinenglish",
  "/roboticsinenglish3": "/roboticsinenglish",
  "/roboticsinenglish4": "/roboticsinenglish",
};

export function shouldNoindex(path = "") {
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    /* keep */
  }
  if (NOINDEX_PATHS.has(decoded) || NOINDEX_PATHS.has(path)) return true;
  return NOINDEX_PREFIXES.some((p) => decoded.startsWith(p) || path.startsWith(p));
}

function canonicalOf(page: HeadPage) {
  const path = page.path || "";
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    /* keep */
  }
  const mapped = CANONICAL_MAP[decoded] || CANONICAL_MAP[path];
  const raw =
    mapped != null
      ? `${SEO_ORIGIN}${mapped}`
      : page.canonical || `${SEO_ORIGIN}${path === "/" || !path ? "" : path}`;
  return raw.replace("https://rastudio.org", SEO_ORIGIN).replace(/\/$/, "") || SEO_ORIGIN;
}

export function enrichPage(page: HeadPage): HeadPage {
  const path = page.path || "";
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    /* keep */
  }
  const extra = SEO_COPY[path] || SEO_COPY[decoded];
  const title = extra?.title || page.title || SITE.homeTitle;
  const description =
    extra?.description ||
    page.description ||
    SITE.homeDescription;
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
  return {
    meta: [
      { title: p.title },
      { name: "description", content: p.description },
      { name: "robots", content: noindex ? "noindex, follow" : "index, follow" },
      { name: "geo.region", content: "RU-MOS" },
      { name: "geo.placename", content: "Коломна" },
      { name: "geo.position", content: "55.0834;38.7686" },
      { name: "ICBM", content: "55.0834, 38.7686" },
      { name: "format-detection", content: "telephone=yes" },
      { property: "og:type", content: p.kind === "course" ? "article" : "website" },
      { property: "og:locale", content: "ru_RU" },
      { property: "og:site_name", content: 'Студия "РАЗВИВАЙСЯ"' },
      { property: "og:title", content: ogTitle },
      { property: "og:description", content: p.description },
      { property: "og:url", content: p.canonical },
      { property: "og:image", content: p.ogImage || DEFAULT_OG },
      { property: "og:image:alt", content: ogTitle },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: ogTitle },
      { name: "twitter:description", content: p.description },
      { name: "twitter:image", content: p.ogImage || DEFAULT_OG },
    ],
    links: [{ rel: "canonical", href: p.canonical }],
  };
}

const ORG_ID = `${SEO_ORIGIN}/#organization`;

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["EducationalOrganization", "LocalBusiness"],
        "@id": ORG_ID,
        name: SITE.name,
        alternateName: ["Развивайся", "RASTUDIO", "Студия Развивайся"],
        url: SEO_ORIGIN,
        email: SITE.email,
        telephone: "+78005113401",
        image: absUrl(SITE.logo.src),
        logo: absUrl(SITE.logo.src),
        priceRange: "₽₽",
        areaServed: [
          { "@type": "City", name: "Коломна" },
          { "@type": "City", name: "Луховицы" },
        ],
        sameAs: [SITE.vk, SITE.telegram, YANDEX_ORG, YANDEX_REVIEWS],
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: "4.9",
          bestRating: "5",
          ratingCount: YANDEX_RATING.ratings,
          reviewCount: YANDEX_RATING.reviews,
        },
        address: BRANCHES.map((b) => ({
          "@type": "PostalAddress",
          addressLocality: b.city,
          streetAddress: b.address,
          addressRegion: "Московская область",
          addressCountry: "RU",
        })),
        department: BRANCHES.map((b, i) => ({
          "@type": "LocalBusiness",
          name: b.name,
          address: {
            "@type": "PostalAddress",
            addressLocality: b.city,
            streetAddress: b.address,
            addressRegion: "Московская область",
            addressCountry: "RU",
          },
          geo: [
            { "@type": "GeoCoordinates", latitude: 55.0834, longitude: 38.7686 },
            { "@type": "GeoCoordinates", latitude: 55.0789, longitude: 38.7788 },
            { "@type": "GeoCoordinates", latitude: 54.9652, longitude: 39.0265 },
          ][i],
          telephone: "+78005113401",
          url: `${SEO_ORIGIN}/contacts`,
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
  return SCHOOLS.find((s) => SCHOOL_COURSE_MATCH[s.href]?.(path)) || null;
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

export function courseJsonLd(page: HeadPage) {
  if (page.kind !== "course" && page.kind !== "school") return null;
  const p = enrichPage(page);
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: p.h1 || p.title,
    description: p.description,
    url: p.canonical,
    inLanguage: "ru",
    image: p.ogImage,
    provider: { "@id": ORG_ID },
    offers: {
      "@type": "Offer",
      url: p.canonical,
      priceCurrency: "RUB",
      price: offerPrice(page.path || ""),
      availability: "https://schema.org/InStock",
      category: "Education",
    },
  };
}
