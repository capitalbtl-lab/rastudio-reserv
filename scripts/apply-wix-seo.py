#!/usr/bin/env python3
"""Apply Wix meta descriptions and image alts onto catalog/lite. Does not touch robots.txt."""
import json
import re
from pathlib import Path
from urllib.parse import unquote

ROOT = Path("/workspace")
WIX = json.loads((ROOT / "content/wix-seo.json").read_text())
PAGES = json.loads((ROOT / "content/pages.json").read_text())
MEDIA_NAMES = json.loads((ROOT / "content/wix-media-names.json").read_text())
CAT_PATH = ROOT / "src/data/catalog.json"
LITE_PATH = ROOT / "src/data/lite.json"
MAP_PATH = ROOT / "src/data/wix-seo-map.json"

HASH = re.compile(r"^[0-9a-f]{5,8}_[0-9a-f]{8,}", re.I)
EXT = re.compile(r"\.(png|jpe?g|gif|webp)$", re.I)
GENERIC_ALT = re.compile(r"empty-state|placeholder|image-empty|^логотипы на главную", re.I)
INVENTED = re.compile(
    r"пробное занятие|лего, логика, конструирование|цвет, тон, техника|дефиле, позирование|личностный рост для девочек|макияж для девочек",
    re.I,
)


def clean(s):
    return re.sub(r"\s+", " ", str(s or "").replace("\xa0", " ")).strip()


def norm_title(s):
    s = clean(s).lower().replace("ё", "е").replace("«", "").replace("»", "").replace('"', "")
    s = re.sub(r"\s*\|\s*rastudio\.org\s*$", "", s)
    return s.strip()


def strip_file(s):
    t = clean(s)
    t = EXT.sub("", t)
    t = re.sub(r"\s+\(\d+\)\s*$", "", t)
    return t.strip()


def media_id(src):
    value = str(src or "")
    m = re.search(r"/media/([^/?#]+)", value, re.I)
    if m:
        return unquote(m.group(1)).replace("_mv2.", "~mv2.")
    m = re.search(r"/imported/([^/?#]+)", value, re.I)
    if not m:
        return ""
    return unquote(m.group(1)).replace("_mv2.", "~mv2.")


def clip(text, max_len=168):
    t = clean(text)
    if len(t) <= max_len:
        return t
    cut = t[: max_len - 1]
    sp = cut.rfind(" ")
    return (cut[:sp] if sp > 80 else cut).rstrip() + "…"


def body_desc(paragraphs):
    for p in paragraphs or []:
        t = clean(p)
        if len(t) > 50 and not re.match(r"^(согласие|top of page|bottom of page)", t, re.I):
            return clip(t)
    return ""


EXPLICIT = {
    "sssaw": ["/model-school", "/model-school-podium"],
    "m01ap": ["/master-class"],
    "e5jr8": ["/robototehnika-5-7"],
    "sk40z": ["/hs-2-zhivopis", "/hs-2-zhp"],
    "a8kt5": ["/"],
    "vnmcv": ["/master-class"],
}

catalog = json.loads(CAT_PATH.read_text())
by_title = {}
for page in catalog["pages"]:
    key = norm_title(page.get("title") or "")
    if key:
        by_title.setdefault(key, []).append(page["path"])
    key2 = norm_title((page.get("title") or "").split("|")[0])
    if key2:
        by_title.setdefault(key2, []).append(page["path"])

wix_by_path = {}
for row in WIX:
    desc = clean(row.get("description") or "")
    title = clean(row.get("title") or "")
    if not desc:
        continue
    paths = list(EXPLICIT.get(row["id"], []))
    key = norm_title(title)
    if key:
        paths.extend(by_title.get(key, []))
        paths.extend(by_title.get(norm_title(title.split("|")[0]), []))
    for path in dict.fromkeys(paths):
        wix_by_path[path] = {"title": title, "description": desc, "id": row["id"]}

MAP_PATH.write_text(json.dumps(wix_by_path, ensure_ascii=False, indent=2) + "\n")

alt_by_id = {}
for page in PAGES:
    for img in page.get("images") or []:
        mid = media_id(img.get("src"))
        if not mid:
            continue
        alt = clean(img.get("alt") or "")
        if not alt:
            continue
        prev = alt_by_id.get(mid, "")
        score = (0 if EXT.search(alt) or HASH.match(alt) else 2) + min(len(alt), 80) / 80
        prev_score = (0 if EXT.search(prev) or HASH.match(prev) else 2) + min(len(prev), 80) / 80
        if score >= prev_score:
            alt_by_id[mid] = alt


def pick_alt(img, page_title):
    src = img.get("src") or ""
    mid = media_id(src)
    wix_alt = alt_by_id.get(mid, "")
    media_name = MEDIA_NAMES.get(mid, "")
    filename = img.get("filename") or ""
    for raw in (wix_alt, img.get("alt"), media_name, filename, (page_title or "").split("|")[0]):
        t = strip_file(raw or "")
        if t and not HASH.match(t) and len(t) > 3 and not GENERIC_ALT.search(t):
            return t
    return "Занятия в Студии Развивайся"


changed_desc = 0
changed_alt = 0
for page in catalog["pages"]:
    path = page["path"]
    dump = wix_by_path.get(path) or wix_by_path.get(page.get("pathDecoded") or "")
    current = clean(page.get("description") or "")
    if dump:
        if current != dump["description"]:
            page["description"] = dump["description"]
            changed_desc += 1
        if dump.get("title") and (
            not page.get("title")
            or "RASTUDIO.ORG" in (page.get("title") or "")
            or INVENTED.search(page.get("title") or "")
        ):
            page["title"] = dump["title"]
    elif not current or INVENTED.search(current):
        from_body = body_desc(page.get("paragraphs"))
        if from_body and from_body != current:
            page["description"] = from_body
            changed_desc += 1
    title = page.get("title") or page.get("h1") or ""
    for img in page.get("images") or []:
        nxt = pick_alt(img, title)
        if nxt != img.get("alt"):
            img["alt"] = nxt
            changed_alt += 1

for course in catalog.get("courses") or []:
    page = next(
        (p for p in catalog["pages"] if p["path"] == course["href"] or p.get("pathDecoded") == course["href"]),
        None,
    )
    if page and page.get("description"):
        course["description"] = page["description"]
    if page and page.get("images"):
        course["alt"] = page["images"][0].get("alt") or course.get("alt") or course.get("label")

if catalog.get("homeHero"):
    home = next((p for p in catalog["pages"] if p["path"] == "/"), None)
    if home and home.get("images"):
        catalog["homeHero"]["alt"] = home["images"][0].get("alt") or catalog["homeHero"].get("alt")

CAT_PATH.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")))

lite = json.loads(LITE_PATH.read_text())
home = next((p for p in catalog["pages"] if p["path"] == "/"), None)
if home:
    lite["home"] = home
lite["courses"] = catalog["courses"]
lite["teachers"] = catalog.get("teachers") or lite.get("teachers")
LITE_PATH.write_text(json.dumps(lite, ensure_ascii=False, separators=(",", ":")))

print("wix paths", len(wix_by_path))
print("desc updated", changed_desc)
print("alts updated", changed_alt)
print("mapped:")
for p, row in sorted(wix_by_path.items()):
    print(f"  {p} <- {row['id']}")
