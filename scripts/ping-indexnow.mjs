import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const HOST = "www.rastudio.org";
const KEY = "rastudio-indexnow-8f3a2c";
const xml = fs.readFileSync(path.join(ROOT, "public/sitemap.xml"), "utf8");
const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).slice(0, 200);

const body = JSON.stringify({
  host: HOST,
  key: KEY,
  keyLocation: `https://${HOST}/${KEY}.txt`,
  urlList,
});

const endpoints = ["https://yandex.com/indexnow", "https://api.indexnow.org/indexnow"];
for (const url of endpoints) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body,
    });
    console.log("IndexNow", url, res.status, (await res.text()).slice(0, 200), "urls", urlList.length);
  } catch (err) {
    console.log("IndexNow", url, "fail", err instanceof Error ? err.message : err);
  }
}
