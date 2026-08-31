import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ORIGIN = "https://www.rastudio.org";
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/catalog.json"), "utf8"));
const lastmod = new Date().toISOString().slice(0, 10);

const extra = ["/schedule"];
const skip = new Set([
  "/eventschedule-c",
  "/eventschedule-s",
  "/parenttesting",
  "/kbmprof",
  "/tmxprof",
  "/sborbojcamsvo",
  "/sbordetyampalestiny",
  "/roboticsinenglish1",
  "/roboticsinenglish2",
  "/roboticsinenglish3",
  "/roboticsinenglish4",
]);
const skipPrefix = ["/hs-2-", "/master-klassy/"];

function loc(p) {
  if (!p || p === "/") return ORIGIN;
  const encoded = p
    .split("/")
    .map((bit) => (bit ? encodeURIComponent(decodeURIComponent(bit)) : ""))
    .join("/");
  return `${ORIGIN}${encoded}`;
}

function priority(kind, p) {
  if (p === "/") return "1.0";
  if (kind === "school" || p === "/allcourses" || p === "/schedule") return "0.9";
  if (kind === "course" || p === "/contacts") return "0.8";
  if (kind === "master-list" || kind === "team") return "0.6";
  return "0.5";
}

function freq(kind, p) {
  if (p === "/" || p === "/schedule") return "daily";
  if (kind === "course" || kind === "school") return "weekly";
  return "monthly";
}

const urls = [];
const seen = new Set();
for (const page of catalog.pages) {
  const p = page.pathDecoded || page.path;
  if (!p || skip.has(p) || seen.has(p)) continue;
  if (skipPrefix.some((pre) => p.startsWith(pre))) continue;
  seen.add(p);
  urls.push({ loc: loc(p), lastmod, changefreq: freq(page.kind, p), priority: priority(page.kind, p) });
}
for (const p of extra) {
  if (seen.has(p)) continue;
  urls.push({ loc: loc(p), lastmod, changefreq: freq("", p), priority: priority("", p) });
}

urls.sort((a, b) => a.loc.localeCompare(b.loc, "ru"));

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`,
  )
  .join("\n")}
</urlset>
`;

fs.writeFileSync(path.join(ROOT, "public/sitemap.xml"), xml);
console.log("sitemap", urls.length, "urls");
