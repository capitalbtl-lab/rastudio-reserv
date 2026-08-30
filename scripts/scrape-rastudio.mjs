import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const ORIGIN = "https://www.rastudio.org";
const OUT = "/workspace/content/pages.json";
const IMG_MAP = "/workspace/content/images.json";

async function sitemapLocs(url) {
  const xml = await fetch(url).then((r) => r.text());
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
}

function filenameFromUrl(src) {
  try {
    const u = new URL(src);
    const last = decodeURIComponent(u.pathname.split("/").pop() || "image");
    return last.split("?")[0] || "image";
  } catch {
    return "image";
  }
}

async function scrapePage(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1200);
  return page.evaluate((pageUrl) => {
    const meta = (sel) => document.querySelector(sel)?.getAttribute("content") || "";
    const title = document.title || "";
    const description =
      meta('meta[name="description"]') || meta('meta[property="og:description"]');
    const ogTitle = meta('meta[property="og:title"]');
    const ogImage = meta('meta[property="og:image"]');
    const canonical =
      document.querySelector('link[rel="canonical"]')?.getAttribute("href") || pageUrl;
    const h1 = [...document.querySelectorAll("h1")]
      .map((el) => el.innerText.trim())
      .filter(Boolean);
    const headings = [...document.querySelectorAll("h1,h2,h3")]
      .map((el) => ({ tag: el.tagName.toLowerCase(), text: el.innerText.trim() }))
      .filter((h) => h.text && !/top of page|bottom of page/i.test(h.text));
    const paragraphs = [...document.querySelectorAll("p, li")]
      .map((el) => el.innerText.trim())
      .filter(
        (t) =>
          t.length > 40 &&
          !/top of page|bottom of page|перейти к основному/i.test(t),
      );
    const seen = new Set();
    const images = [];
    for (const img of document.querySelectorAll("img")) {
      const src = img.currentSrc || img.src || img.getAttribute("src") || "";
      if (!src || src.startsWith("data:")) continue;
      if (src.includes("wixstatic.com/media/") || src.includes("parastorage") || src.includes("wixmp")) {
        const alt = img.getAttribute("alt") || img.alt || "";
        const key = src.split("?")[0];
        if (seen.has(key)) continue;
        seen.add(key);
        images.push({ src, alt });
      }
    }
    const links = [...document.querySelectorAll("a[href]")]
      .map((a) => ({ href: a.getAttribute("href") || "", text: a.innerText.trim() }))
      .filter((l) => l.href && l.text && l.text.length < 80);
    return {
      url: pageUrl,
      title,
      description,
      ogTitle,
      ogImage,
      canonical,
      h1,
      headings,
      paragraphs: paragraphs.slice(0, 40),
      images,
      links: links.slice(0, 80),
    };
  }, url);
}

const sitemaps = [
  `${ORIGIN}/pages-sitemap.xml`,
  `${ORIGIN}/dynamic-team_p_9f3600b4_5726_4b91_b900_0d914f1cded2_0_5000-sitemap.xml`,
  `${ORIGIN}/dynamic-kursy-shkoly-programmirovaniya_p_d81c3147_000c_4557_a946_76aaf7c406b1_0_5000-sitemap.xml`,
  `${ORIGIN}/dynamic-master-klassy_p_a2b6b385_81ca_417b_94c8_4fac43f4cc48_0_5000-sitemap.xml`,
];

const urls = [...new Set((await Promise.all(sitemaps.map(sitemapLocs))).flat())];
console.log("urls", urls.length);

const browser = await chromium.launch({ headless: true });
const pages = [];
const images = new Map();
const concurrency = 4;
let i = 0;

async function worker() {
  const context = await browser.newContext({ locale: "ru-RU", viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  while (true) {
    const idx = i++;
    if (idx >= urls.length) break;
    const url = urls[idx];
    try {
      const data = await scrapePage(page, url);
      const path = new URL(url).pathname.replace(/\/$/, "") || "/";
      data.path = path;
      pages.push(data);
      for (const img of data.images) {
        const name = filenameFromUrl(img.src);
        if (!images.has(name)) images.set(name, img);
      }
      console.log("ok", idx + 1, path, data.title.slice(0, 60));
    } catch (err) {
      console.error("fail", url, err.message);
      pages.push({ url, path: new URL(url).pathname, error: String(err.message) });
    }
  }
  await context.close();
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
await browser.close();

pages.sort((a, b) => String(a.path).localeCompare(String(b.path)));
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(pages, null, 2));
await writeFile(
  IMG_MAP,
  JSON.stringify(
    [...images.entries()].map(([filename, img]) => ({ filename, ...img })),
    null,
    2,
  ),
);
console.log("saved", pages.length, "pages", images.size, "images");
