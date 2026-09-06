#!/usr/bin/env python3
"""Скачать оставшиеся Wix-файлы в public/media/imported и собрать карту id → локальный путь."""
from __future__ import annotations

import json
import re
import ssl
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path("/workspace")
OUT = ROOT / "public" / "media" / "imported"
MAP = ROOT / "src" / "data" / "wix-local.json"
WIX = re.compile(r"https://static\.wixstatic\.com/media/[^\"'\\s]+")
CTX = ssl.create_default_context()

SOURCES = [
    ROOT / "src/data/catalog.json",
    ROOT / "src/data/cms.json",
    ROOT / "src/data/lite.json",
    ROOT / "src/data/site.ts",
    ROOT / "src/routes/index.tsx",
]


def media_key(url: str) -> tuple[str, str] | None:
    m = re.search(r"/media/([^/]+)\.(jpg|jpeg|png|webp|gif)", url, re.I)
    if not m:
        return None
    return m.group(1), m.group(2).lower()


def orig_url(key: str, ext: str) -> str:
    return f"https://static.wixstatic.com/media/{key}.{ext}"


def fetch(url: str) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": "rastudio-localize/1"})
    try:
        with urllib.request.urlopen(req, timeout=40, context=CTX) as r:
            data = r.read()
            if data and r.status == 200:
                return data
    except Exception:
        return None
    return None


def save_one(url: str) -> tuple[str, str | None]:
    parsed = media_key(url)
    if not parsed:
        return url, None
    key, ext = parsed
    safe = key.replace("~", "_")
    dest = OUT / f"{safe}.{ext}"
    rel = f"/media/imported/{safe}.{ext}"
    if dest.exists() and dest.stat().st_size > 800:
        return key, rel
    data = fetch(orig_url(key, ext)) or fetch(url)
    if not data or len(data) < 400:
        return key, None
    dest.write_bytes(data)
    return key, rel


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    urls: set[str] = set()
    for path in SOURCES:
        urls.update(WIX.findall(path.read_text("utf-8", "replace")))
    keys: dict[str, str] = {}
    if MAP.exists():
        keys.update(json.loads(MAP.read_text()))
    missing = []
    seen = set()
    for url in sorted(urls):
        parsed = media_key(url)
        if not parsed:
            continue
        key, _ = parsed
        if key in keys or key in seen:
            continue
        seen.add(key)
        missing.append(url)
    print(f"unique {len(seen)} to fetch {len(missing)} already {len(keys)}")
    ok = fail = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = [pool.submit(save_one, u) for u in missing]
        for fut in as_completed(futs):
            key, rel = fut.result()
            if rel:
                keys[key] = rel
                ok += 1
            else:
                fail += 1
                print("fail", key)
    MAP.write_text(json.dumps(keys, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"map {len(keys)} saved ok {ok} fail {fail}")


if __name__ == "__main__":
    main()
