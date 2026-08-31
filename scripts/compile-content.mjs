import fs from "node:fs";
import path from "node:path";

const ROOT = "/workspace";
const pages = JSON.parse(fs.readFileSync(path.join(ROOT, "content/pages.json"), "utf8"));

const CHROME_ALT =
  /логотип|телеграм|оферт|сервис|мы в телеграм|договор оферты|skip to|wix/i;
const CHROME_PARA =
  /^(курсы программирования, робототехники|3 современные студии|согласие на обработку|top of page|bottom of page|skip to)/i;
const FOOTER_BIT = /студия ["«]развивайся["»] - с 2016/i;

function filenameFromSrc(src, alt = "") {
  try {
    const last = decodeURIComponent((src.split("/").pop() || "").split("?")[0]);
    return last || alt || "";
  } catch {
    return alt || "";
  }
}

function upsize(src, w = 1200) {
  if (!src || !src.includes("wixstatic.com")) return src;
  return src.replace(/\/v1\/(fill|fit)\/w_\d+,h_\d+[^/]*/i, (_m, kind) => {
    const h = Math.round(w * 0.72);
    return `/v1/${kind}/w_${w},h_${h},al_c,q_85,enc_avif,quality_auto`;
  });
}

function widthOf(src) {
  const m = String(src).match(/w_(\d+)/);
  return m ? Number(m[1]) : 0;
}

function cleanText(s) {
  return String(s || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(arr) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const key = typeof item === "string" ? item : JSON.stringify(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function kindOf(p) {
  if (p === "/") return "home";
  if (p === "/team") return "team";
  if (p.startsWith("/team/")) return "teacher";
  if (p === "/master-class") return "master-list";
  if (p.startsWith("/master-klassy/")) return "master";
  if (p === "/contacts") return "contacts";
  if (p === "/allcourses") return "catalog";
  if (p === "/o-nas") return "about";
  if (
    [
      "/art-studio",
      "/robototehnika-v-kolomne",
      "/programming-school",
      "/promising-professions",
      "/model-school",
      "/early-childhood-care",
      "/languageschool",
    ].includes(p)
  )
    return "school";
  return "course";
}

function internalHref(href) {
  if (!href) return href;
  try {
    const u = new URL(href, "https://www.rastudio.org");
    if (u.hostname.replace(/^www\./, "") === "rastudio.org") {
      return (u.pathname || "/") + (u.search || "") + (u.hash || "");
    }
  } catch {
    /* keep */
  }
  return href;
}

const compiled = [];
const byPath = new Map();
const COURSE_HEROES = JSON.parse(
  fs.readFileSync(path.join(ROOT, "content/course-heroes.json"), "utf8"),
);
const COURSE_VIDEOS = JSON.parse(
  fs.readFileSync(path.join(ROOT, "content/course-videos.json"), "utf8"),
);
const FILE_EXTRAS = JSON.parse(
  fs.readFileSync(path.join(ROOT, "content/course-extras.json"), "utf8"),
);
const MANUAL_EXTRAS = {
  "/digitalartschool": [
    {
      src: "/courses/manga.jpg",
      filename: "Развивайся - Курс Манга и аниме в Коломне.png",
      alt: "Курс манга и аниме в Коломне",
    },
  ],
  "/robototehnika-v-kolomne": [
    {
      src: "/courses/drones.jpg",
      filename: "Развивайся - Беспилотная авиация в Коломне.png",
      alt: "Беспилотная авиация в Коломне",
    },
  ],
  "/promising-professions": [
    {
      src: "/courses/planet-steam.jpg",
      filename: "Развивайся - Курс планета-STEAM в Коломне.png",
      alt: "Курс «Планета STEAM» в Коломне",
    },
    {
      src: "/courses/drones.jpg",
      filename: "Развивайся - Беспилотная авиация в Коломне.png",
      alt: "Беспилотная авиация в Коломне",
    },
  ],
  "/science-course": [
    {
      src: "/courses/planet-steam.jpg",
      filename: "Развивайся - Курс планета-STEAM в Коломне.png",
      alt: "Курс «Планета STEAM» в Коломне",
    },
  ],
};
const COURSE_EXTRAS = { ...FILE_EXTRAS };
for (const [key, arr] of Object.entries(MANUAL_EXTRAS)) {
  const have = new Set((COURSE_EXTRAS[key] || []).map((i) => i.src));
  COURSE_EXTRAS[key] = [
    ...(COURSE_EXTRAS[key] || []),
    ...arr.filter((i) => !have.has(i.src)),
  ];
}

function heroFor(pathValue, decoded) {
  return COURSE_HEROES[pathValue] || COURSE_HEROES[decoded] || null;
}

for (const raw of pages) {
  const p = raw.path || "/";
  const title = cleanText(raw.title) || "";
  const description = cleanText(raw.description) || "";
  const h1s = unique(
    (raw.h1 || [])
      .map(cleanText)
      .filter((t) => t && !FOOTER_BIT.test(t) && t.length < 220),
  );
  const displayH1 =
    h1s.find((t) => t.length >= 18) ||
    h1s.slice(0, 2).join(" ").trim() ||
    title.split("|")[0].trim();
  const headings = unique(
    (raw.headings || [])
      .map((h) => ({ tag: h.tag, text: cleanText(h.text) }))
      .filter(
        (h) =>
          h.text &&
          !FOOTER_BIT.test(h.text) &&
          h.tag !== "h1" &&
          h.text.length < 220,
      ),
  ).slice(0, 16);

  const paragraphs = unique(
    (raw.paragraphs || [])
      .map(cleanText)
      .filter((t) => t && t.length > 24 && !CHROME_PARA.test(t.toLowerCase())),
  ).slice(0, 22);

  const images = [];
  const seenImg = new Set();
  for (const img of raw.images || []) {
    const src = img.src || "";
    const alt = cleanText(img.alt || "");
    if (!src.includes("wixstatic.com") && !src.startsWith("/courses/")) continue;
    if (CHROME_ALT.test(alt)) continue;
    if (widthOf(src) && widthOf(src) < 180) continue;
    const filename = filenameFromSrc(src, alt);
    const key = src.replace(/\/v1\/[^/]+/, "");
    if (seenImg.has(key)) continue;
    seenImg.add(key);
    images.push({
      src,
      alt: alt || filename,
      filename,
    });
  }

  const maxImgs =
    p === "/team" || p === "/master-class" || p === "/allcourses" ? 24 : 10;
  let keptImages = images.slice(0, maxImgs);
  const decodedPath = (() => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  })();
  const hero = heroFor(p, decodedPath);
  if (hero) {
    keptImages = [
      { src: hero.src, alt: hero.alt, filename: hero.filename },
      ...keptImages.filter((img) => img.src !== hero.src),
    ].slice(0, maxImgs);
  }
  const extras = COURSE_EXTRAS[p] || COURSE_EXTRAS[decodedPath];
  if (extras) {
    const have = new Set(keptImages.map((img) => img.src));
    const fresh = extras.filter((img) => !have.has(img.src));
    const head = hero ? keptImages.slice(0, 1) : [];
    const rest = hero ? keptImages.slice(1) : keptImages;
    keptImages = [...head, ...fresh, ...rest].slice(0, maxImgs);
  }

  const related = unique(
    (raw.links || [])
      .map((l) => {
        const href = internalHref(typeof l === "string" ? l : l.href);
        const text = cleanText(typeof l === "string" ? "" : l.text);
        if (!href || href.startsWith("tel:") || href.startsWith("mailto:")) return null;
        if (!href.startsWith("/")) return null;
        if (
          [
            "/",
            "/allcourses",
            "/o-nas",
            "/servicerules",
            "/legal-information",
            "/charity",
            "/parenttesting",
            "/contacts",
          ].includes(href) &&
          /главн|курс|о нас|правил|юридич|благотвор|тест|контакт/i.test(text)
        )
          return null;
        if (!text || text.length < 3 || text.length > 90) return null;
        if (/подробнее|личный кабинет|telegram|подключить/i.test(text)) return { href, text };
        if (href.startsWith("/team/") || href.startsWith("/master-klassy/") || href.startsWith("/kursy-"))
          return { href, text };
        if (/^\/[a-z0-9-]+$/i.test(href) && text !== "ПОДРОБНЕЕ") return { href, text };
        return null;
      })
      .filter(Boolean),
  ).slice(0, 18);

  const page = {
    path: p,
    pathDecoded: decodedPath,
    kind: kindOf(p),
    title,
    description,
    ogTitle: cleanText(raw.ogTitle) || title,
    ogImage: hero
      ? `https://www.rastudio.org${hero.src}`
      : raw.ogImage || "",
    canonical: raw.canonical || `https://www.rastudio.org${p === "/" ? "" : p}`,
    h1: displayH1,
    headings,
    paragraphs,
    images: keptImages,
    related,
  };
  compiled.push(page);
  byPath.set(p, page);
  byPath.set(page.pathDecoded, page);
}

const FALLBACKS = [
  {
    path: "/hs-2-zhp",
    title: 'Знакомство с живописью в художественной школе "Развивайся" в Коломне',
    description:
      "Живопись в художественной школе студии «Развивайся»: цвет, тон, техника и работа с натуры для детей в Коломне.",
    h1: "Знакомство с живописью",
    clone: "/hs-2-zhivopis",
  },
  {
    path: "/robototehnika-5-7",
    title: 'Школа робототехники в Коломне | Для детей 5-7 лет',
    description:
      "Робототехника для детей 5–7 лет в Коломне: LEGO, логика, конструирование и первые шаги в инженерии в студии «Развивайся».",
    h1: "Робототехника для детей 5–7 лет",
    clone: "/robototehnika-7-9",
  },
  {
    path: "/kursy-shkoly-programmirovaniya/it-%D0%BB%D0%B0%D0%B1%D0%BE%D1%80%D0%B0%D1%82%D0%BE%D1%80%D0%B8%D1%8F-create-%D0%B4%D0%BB%D1%8F-%D0%B4%D0%B5%D1%82%D0%B5%D0%B9-7-9-%D0%BB%D0%B5%D1%82",
    title: 'IT-Лаборатория Create: "Создатель игр и IT-проектов" | RASTUDIO.ORG',
    description:
      "IT-лаборатория Create для детей 7–9 лет: игры, цифровые интерфейсы и 3D-объекты в студии «Развивайся».",
    h1: 'IT-Лаборатория Create: "Создатель игр и IT-проектов"',
    clone:
      "/kursy-shkoly-programmirovaniya/it-%D0%BB%D0%B0%D0%B1%D0%BE%D1%80%D0%B0%D1%82%D0%BE%D1%80%D0%B8%D1%8F-create-%D0%B4%D0%BB%D1%8F-%D0%B4%D0%B5%D1%82%D0%B5%D0%B9-5-7-%D0%BB%D0%B5%D1%82",
  },
  {
    path: "/team/%D0%B2%D0%B0%D0%BB%D0%B5%D1%80%D0%B8%D0%B9-%D1%8F%D0%BD%D0%BE%D0%B2%D0%B8%D1%87-%D0%B3%D0%B8%D0%BB%D1%8C%D0%BC%D0%B0%D0%BD",
    title: "Валерий Янович Гильман | RASTUDIO.ORG",
    description:
      "Валерий Янович Гильман — педагог студии «Развивайся» в Коломне.",
    h1: "Валерий Янович Гильман",
    clone: "/team",
  },
];

for (const fb of FALLBACKS) {
  const existing = byPath.get(fb.path);
  if (existing && existing.title && existing.paragraphs.length) continue;
  const clone = byPath.get(fb.clone) || compiled[0];
  const page = {
    path: fb.path,
    pathDecoded: decodeURIComponent(fb.path),
    kind: kindOf(fb.path),
    title: fb.title,
    description: fb.description,
    ogTitle: fb.title,
    ogImage: clone.ogImage,
    canonical: `https://www.rastudio.org${fb.path}`,
    h1: fb.h1,
    headings: clone.headings?.slice(0, 6) || [],
    paragraphs:
      fb.path.startsWith("/team/")
        ? [
            "Преподаватель робототехники для детей старшего возраста, 3D моделирования, методическая работа, наставник.",
          ]
        : clone.paragraphs.slice(0, 8),
    images: clone.images.slice(0, 4),
    related: [],
  };
  const idx = compiled.findIndex((x) => x.path === fb.path);
  if (idx >= 0) compiled[idx] = page;
  else compiled.push(page);
  byPath.set(page.path, page);
  byPath.set(page.pathDecoded, page);
}

function applyLocalHeroes(page) {
  const hero = heroFor(page.path, page.pathDecoded);
  const extras = COURSE_EXTRAS[page.path] || COURSE_EXTRAS[page.pathDecoded] || [];
  let images = page.images || [];
  if (hero) {
    images = [
      { src: hero.src, alt: hero.alt, filename: hero.filename },
      ...images.filter((img) => img.src !== hero.src),
    ];
    page.ogImage = `https://www.rastudio.org${hero.src}`;
  }
  const have = new Set(images.map((img) => img.src));
  const fresh = extras.filter((img) => !have.has(img.src));
  const head = hero ? images.slice(0, 1) : [];
  const rest = hero ? images.slice(1) : images;
  page.images = [...head, ...fresh, ...rest].slice(
    0,
    page.path === "/team" || page.path === "/master-class" || page.path === "/allcourses" ? 24 : 10,
  );
  page.video =
    COURSE_VIDEOS[page.path] || COURSE_VIDEOS[page.pathDecoded] || null;
}

for (const page of compiled) applyLocalHeroes(page);

const teamPage = byPath.get("/team");
const teachers = [];
if (teamPage) {
  const bios = teamPage.paragraphs.filter(
    (t) => t.startsWith("Преподаватель") || t.startsWith("Педагог"),
  );
  let bi = 0;
  for (const img of teamPage.images) {
    const name = img.alt.replace(/\s*\(педагог\)\s*/i, "").trim();
    if (!name || name.length < 6) continue;
    const slug = compiled.find(
      (p) => p.kind === "teacher" && (p.h1.includes(name.split(" ")[0]) || p.title.includes(name.split(" ")[0])),
    );
    teachers.push({
      name,
      role: bios[bi++] || "Педагог студии «Развивайся»",
      photo: img.src,
      alt: img.alt,
      filename: img.filename,
      href: slug?.path || "/team",
    });
  }
}

const COURSE_ORDER = [
  ["/art-studio-9-13", "Художественная школа 9–13 лет"],
  ["/art-studio-7-8", "Художественная студия 7–8 лет"],
  ["/art-studio-5-6", "Художественная студия «Карандашики» 5–7 лет"],
  ["/art-studio-3-4", "Художественная студия «Карандашики» 3–5 лет"],
  ["/sculptural-studio", "Скульптурная лепка"],
  ["/podgotovka-v-hudvuz", "Подготовка в художественные вузы"],
  ["/digitalartschool", "Цифровая художественная школа"],
  ["/robototehnika-10-14", "Робототехника 10–14 лет"],
  ["/robototehnika-7-9", "Робототехника 7–9 лет"],
  ["/robototehnika-5-7", "Робототехника 5–7 лет"],
  ["/roboticsinenglish", "Робототехника на английском"],
  ["/gamedesign", "Game-дизайн и 3D-анимация в Blender"],
  ["/3d-modeling", "Инженерное 3D-моделирование в Компас"],
  [
    "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-5-7-лет",
    "StartSchool: программирование в Scratch",
  ],
  [
    "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-7-9-лет",
    "IT-лаборатория Create: игры и IT-проекты",
  ],
  [
    "/kursy-shkoly-programmirovaniya/it-лаборатория-dev-для-детей-9-10-лет",
    "JuniorSchool: программирование 3в1",
  ],
  [
    "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-python",
    "Программирование на Python",
  ],
  [
    "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-си",
    "Программирование на C++",
  ],
  [
    "/kursy-shkoly-programmirovaniya/it-школа-разработка-игр-на-unity",
    "GameDev 4в1 — Unity",
  ],
  ["/radioengineering", "Радиоконструирование"],
  ["/science-course", "Увлекательная наука"],
  ["/teslaphysics", "Физика Теслы"],
  ["/mentalarithmetic", "Ментальная арифметика"],
  ["/preparation-for-school", "Подготовка к школе «Умный карандашик»"],
  ["/happybricks", "Кирпичики счастья"],
  ["/kinder-master", "Киндер-мастер"],
  ["/model-school", "Модельная школа «Подиум»"],
  ["/englishlanguagegg", "Английский Go Getter"],
  ["/englishlanguagesm", "Английский Super Minds"],
  ["/japanese", "Японский язык Kodomo no Nihongo"],
  ["/vitaminkorean", "Корейский язык Vitamin Korean"],
  ["/oge-ininformatics", "Подготовка к ОГЭ по информатике"],
];

const courses = COURSE_ORDER.map(([href, label]) => {
  const page = byPath.get(href);
  const img = page?.images?.[0];
  return {
    href,
    label,
    title: page?.h1 || label,
    description: page?.description || "",
    image: img?.src || "",
    alt: img?.alt || label,
    filename: img?.filename || "",
  };
});

const home = byPath.get("/");
const homeHero =
  (home?.images || []).find((i) => /робототехник/i.test(i.alt)) || home?.images?.[0];

const catalog = {
  generatedAt: new Date().toISOString(),
  pages: compiled.map((p) => ({
    ...p,
    images: p.images.map((i) => ({ ...i, src: upsize(i.src, 1100) })),
  })),
  teachers: teachers.map((t) => ({ ...t, photo: upsize(t.photo, 640) })),
  courses: courses.map((c) => ({ ...c, image: c.image ? upsize(c.image, 900) : c.image })),
  homeHero: homeHero
    ? { ...homeHero, src: upsize(homeHero.src, 1600) }
    : null,
};

const outDir = path.join(ROOT, "src/data");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "catalog.json"), JSON.stringify(catalog));
console.log(
  "pages",
  catalog.pages.length,
  "teachers",
  catalog.teachers.length,
  "courses",
  catalog.courses.length,
  "bytes",
  fs.statSync(path.join(outDir, "catalog.json")).size,
);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${compiled
  .map((p) => {
    const loc = `https://www.rastudio.org${p.path === "/" ? "" : p.path}`;
    return `  <url><loc>${loc.replace(/&/g, "&")}</loc><changefreq>weekly</changefreq></url>`;
  })
  .join("\n")}
</urlset>
`;
fs.mkdirSync(path.join(ROOT, "public"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "public/sitemap.xml"), sitemap);
fs.writeFileSync(
  path.join(ROOT, "public/robots.txt"),
  `User-agent: *
Allow: /

Sitemap: https://www.rastudio.org/sitemap.xml
`,
);
fs.writeFileSync(
  path.join(outDir, "lite.json"),
  JSON.stringify({
    home: catalog.pages.find((p) => p.path === "/") || catalog.pages[0],
    teachers: catalog.teachers,
    courses: catalog.courses,
  }),
);
console.log("lite", fs.statSync(path.join(outDir, "lite.json")).size);
