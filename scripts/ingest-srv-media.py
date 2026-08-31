#!/usr/bin/env python3
"""Pull live course photos from /srv/rastudio-media-source onto course galleries."""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

import paramiko
from PIL import Image

HOST = "90.156.169.197"
USER = "root"
PASS = "24549874qwertY@)"
REMOTE_ROOT = "/srv/rastudio-media-source"
OUT_DIR = Path("/workspace/public/media/courses")
EXTRAS_PATH = Path("/workspace/content/course-extras.json")

PY = "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-python"
CPP = "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-си"
SCRATCH = "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-5-7-лет"
MINECRAFT = "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-7-9-лет"
JUNIOR = "/kursy-shkoly-programmirovaniya/it-лаборатория-dev-для-детей-9-10-лет"
UNITY = "/kursy-shkoly-programmirovaniya/it-школа-разработка-игр-на-unity"

SKIP = re.compile(
    r"логотип|модул|фон для|фон кнон|великие учен|направления художественной|"
    r"этапы сотрудничества|банер it|банер |нейросеть|заставка|обои|"
    r"empty-state|watermark",
    re.I,
)
PHOTO_EXT = {".jpg", ".jpeg"}
ALL_EXT = {".jpg", ".jpeg", ".png"}


def nkey(name: str) -> tuple:
    stem = Path(name).stem.lower()
    nums = [int(x) for x in re.findall(r"\d+", stem)]
    return (re.sub(r"\d+", "", stem), nums or [0])


def classify_name(rel: str, name: str) -> str | None:
    n = name.lower()
    if SKIP.search(n):
        return None
    if "скульпт" in n:
        return "/sculptural-studio"
    if "вуз" in n:
        return "/podgotovka-v-hudvuz"
    if "манга" in n or "аниме" in n:
        return "/digitalartschool"
    if "цифровая художествен" in n:
        return "/digitalartschool"
    if "робототехник" in n and ("английск" in n or "english" in n or "билингв" in n):
        return "/roboticsinenglish"
    if "беспилот" in n:
        return "/robototehnika-v-kolomne"
    if re.search(r"3-4|3–4", n) and ("художеств" in n or "рисован" in n or "лепк" in n):
        return "/art-studio-3-4"
    if re.search(r"5-6|5–6", n) and "робот" in n:
        return "/robototehnika-5-7"
    if re.search(r"5-6|5–6", n) and ("художеств" in n or "рисован" in n):
        return "/art-studio-5-6"
    if re.search(r"7-9|7–9|7-8", n) and "робот" in n:
        return "/robototehnika-7-9"
    if re.search(r"7-9|7–9|7-8", n) and ("художеств" in n or "рисован" in n):
        return "/art-studio-7-8"
    if re.search(r"10-14|10–14", n) and "робот" in n:
        return "/robototehnika-10-14"
    if "scratch" in n or "startschool" in n or ("start" in n and "лаборатор" in n):
        return SCRATCH
    if "minecraft" in n or "майнкрафт" in n:
        return MINECRAFT
    if "create" in n and "лаборатор" in n:
        return MINECRAFT
    if "9-10" in n or ("dev" in n and "лаборатор" in n) or "juniorschool" in n:
        return JUNIOR
    if "python" in n:
        return PY
    if "c++" in n or "программирование на с" in n or "программирование на си" in n:
        return CPP
    if "unity" in n or "gamedev" in n:
        return UNITY
    if "blender" in n or "гейм" in n or "game-дизайн" in n or "3d-анимац" in n:
        return "/gamedesign"
    if "компас" in n:
        return "/3d-modeling"
    if "физика инновац" in n or "тесл" in n or "альтернативн" in n:
        return "/teslaphysics"
    if "увлекательн" in n or "планета-steam" in n or "планета steam" in n:
        return "/science-course"
    if "научн" in n and "курс" in n:
        return "/science-course"
    if "радиотех" in n:
        return "/radioengineering"
    if "киндер" in n:
        return "/kinder-master"
    if "модельн" in n or "подиум" in n:
        return "/model-school"
    if "подготов" in n and "школ" in n:
        return "/preparation-for-school"
    if "лего" in n:
        return "/happybricks"
    if "ментальн" in n:
        return "/mentalarithmetic"
    if "японск" in n or "nihongo" in n:
        return "/japanese"
    if "корейск" in n or "vitamin korean" in n:
        return "/vitaminkorean"
    if ("английск" in n or "english" in n or "go getter" in n or "super mind" in n) and "робот" not in n:
        if re.search(r"6-8|6–8|super mind", n):
            return "/englishlanguagesm"
        return "/englishlanguagegg"
    if "тинкеркад" in n or "tinkercad" in n:
        return "/tinkercad2025itogi"
    if "фото мастер-класс" in n:
        return "/master-class"
    if "педагоги" in n:
        return "/team"
    if "фото школа программирования" in n or "it школа в студии" in n:
        return "/programming-school"
    if "инженерные и научные" in n:
        return "/promising-professions"
    return None


def classify_folder(rel: str, name: str) -> str | None:
    by_name = classify_name(rel, name)
    if by_name:
        return by_name
    n = name.lower()
    if SKIP.search(n):
        return None
    if rel.startswith("courses/artschool/photo/") or rel.startswith("courses/artschool/curses/"):
        if "скульпт" in n:
            return "/sculptural-studio"
        if "модул" in n or "направления" in n or "логотип" in n:
            return None
        return "/art-studio"
    if rel.startswith("courses/modelingschool"):
        return "/model-school"
    if rel.startswith("courses/scientificschool"):
        return "/teslaphysics"
    if rel.startswith("courses/kindermaster"):
        return "/kinder-master"
    if rel.startswith("courses/radioelectronicdesign"):
        return "/radioengineering"
    if rel.startswith("courses/digitalartschool"):
        return "/digitalartschool"
    if rel.startswith("courses/earlyschool"):
        return "/preparation-for-school"
    if rel.startswith("courses/mentalarithmetic"):
        return "/mentalarithmetic"
    if rel.startswith("courses/competitions"):
        return "/tinkercad2025itogi"
    if rel.startswith("courses/3dmodeling"):
        return "/gamedesign"
    if rel.startswith("courses/programmingschool"):
        return "/programming-school"
    if rel.startswith("master-classes/") and Path(name).suffix.lower() in PHOTO_EXT:
        return "/master-class"
    if rel.startswith("teachers/"):
        return "/team"
    return None


def slug_for(path: str) -> str:
    raw = path.rstrip("/").split("/")[-1]
    return re.sub(r"[^a-z0-9а-яё-]+", "-", raw.lower())[:48] or "misc"


def unique_prefer_jpg(rels: list[str]) -> list[str]:
    by_stem: dict[str, str] = {}
    for rel in rels:
        p = Path(rel)
        ext = p.suffix.lower()
        if ext not in ALL_EXT:
            continue
        stem = p.stem.lower()
        prev = by_stem.get(stem)
        if not prev:
            by_stem[stem] = rel
            continue
        # prefer real photos over png infographics
        if ext in PHOTO_EXT and Path(prev).suffix.lower() not in PHOTO_EXT:
            by_stem[stem] = rel
    ordered = sorted(by_stem.values(), key=lambda r: nkey(Path(r).name))
    photos = [r for r in ordered if Path(r).suffix.lower() in PHOTO_EXT]
    pngs = [r for r in ordered if Path(r).suffix.lower() == ".png"]
    return photos + pngs


def cap_for(dest: str) -> int:
    if dest in ("/art-studio", "/model-school", "/teslaphysics", "/programming-school", "/promising-professions"):
        return 16
    if dest in ("/team", "/master-class"):
        return 14
    return 12


def main() -> None:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASS, timeout=20, allow_agent=False, look_for_keys=False)
    stdin, stdout, _ = client.exec_command(
        f"find {REMOTE_ROOT} -type f \\( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.JPG' -o -iname '*.JPEG' -o -iname '*.PNG' \\) | sort",
        timeout=40,
    )
    files = []
    for line in stdout.read().decode().splitlines():
        if not line.startswith(REMOTE_ROOT):
            continue
        rel = line[len(REMOTE_ROOT) + 1 :]
        if rel.startswith("homepage/") or rel.startswith("logo/") or rel.startswith("icon/") or rel.startswith("docs/"):
            continue
        if rel.startswith("courses/Maincourseimage/") or rel.startswith("courses/copration/"):
            continue
        files.append(rel)

    buckets: dict[str, list[str]] = defaultdict(list)
    art_pool = []
    for rel in files:
        name = Path(rel).name
        if "artschool/photo/" in rel or (
            "artschool/curses/" in rel and "художественная школа" in name.lower() and "модул" not in name.lower()
        ):
            art_pool.append(rel)
        dest = classify_folder(rel, name)
        if dest:
            buckets[dest].append(rel)

    art_pool = unique_prefer_jpg(art_pool)
    slices = [
        ("/art-studio", art_pool[:16]),
        ("/art-studio-9-13", art_pool[10:22]),
        ("/art-studio-7-8", art_pool[22:34]),
        ("/art-studio-5-6", art_pool[34:46]),
        ("/art-studio-3-4", art_pool[46:56] or art_pool[4:14]),
        ("/podgotovka-v-hudvuz", art_pool[56:66] or art_pool[16:26]),
    ]
    for dest, chunk in slices:
        buckets[dest].extend(chunk)

    chosen: dict[str, list[str]] = {}
    for dest, rels in buckets.items():
        uniq = unique_prefer_jpg(rels)
        chosen[dest] = uniq[: cap_for(dest)]
        print(f"{len(chosen[dest]):2}  {dest}   (from {len(rels)})")

    t = paramiko.Transport((HOST, 22))
    t.connect(username=USER, password=PASS)
    sftp = paramiko.SFTPClient.from_transport(t)

    extras: dict[str, list[dict]] = {}
    tmp = Path("/tmp/srv-media")
    tmp.mkdir(exist_ok=True)

    for dest, rels in sorted(chosen.items()):
        slug = slug_for(dest)
        out = OUT_DIR / slug
        out.mkdir(parents=True, exist_ok=True)
        # drop leftover files from older ingest
        for old in out.glob("*"):
            old.unlink()
        items = []
        for i, rel in enumerate(rels, 1):
            remote = f"{REMOTE_ROOT}/{rel}"
            local_tmp = tmp / f"{slug}-{i}{Path(rel).suffix.lower()}"
            try:
                sftp.get(remote, str(local_tmp))
            except Exception as e:
                print("skip", rel, e)
                continue
            dest_file = out / f"{i:02d}.jpg"
            try:
                im = Image.open(local_tmp)
                im = im.convert("RGB")
                w, h = im.size
                if min(w, h) < 280:
                    print("tiny", rel, w, h)
                    continue
                scale = min(1.0, 1400 / max(w, h))
                if scale < 1:
                    im = im.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
                im.save(dest_file, "JPEG", quality=78, optimize=True, progressive=True)
            except Exception as e:
                print("img fail", rel, e)
                continue
            finally:
                local_tmp.unlink(missing_ok=True)
            items.append(
                {
                    "src": f"/media/courses/{slug}/{i:02d}.jpg",
                    "filename": Path(rel).name,
                    "alt": Path(rel).stem.replace("_", " ")[:120],
                }
            )
        if items:
            extras[dest] = items

    sftp.close()
    t.close()
    client.close()

    EXTRAS_PATH.write_text(json.dumps(extras, ensure_ascii=False, indent=2) + "\n")
    print("wrote", EXTRAS_PATH, "courses", len(extras), "files", sum(len(v) for v in extras.values()))


if __name__ == "__main__":
    main()
