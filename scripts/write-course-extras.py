#!/usr/bin/env python3
"""Rebuild course-extras.json from public/media/courses/* and finish thin folders from /tmp or SFTP."""
from __future__ import annotations

import json
import re
from pathlib import Path

OUT_DIR = Path("/workspace/public/media/courses")
EXTRAS_PATH = Path("/workspace/content/course-extras.json")

PY = "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-python"
CPP = "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-си"
SCRATCH = "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-5-7-лет"
MINECRAFT = "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-7-9-лет"
JUNIOR = "/kursy-shkoly-programmirovaniya/it-лаборатория-dev-для-детей-9-10-лет"
UNITY = "/kursy-shkoly-programmirovaniya/it-школа-разработка-игр-на-unity"

SLUG_TO_PATH = {
    "art-studio": "/art-studio",
    "art-studio-3-4": "/art-studio-3-4",
    "art-studio-5-6": "/art-studio-5-6",
    "art-studio-7-8": "/art-studio-7-8",
    "art-studio-9-13": "/art-studio-9-13",
    "digitalartschool": "/digitalartschool",
    "englishlanguagegg": "/englishlanguagegg",
    "englishlanguagesm": "/englishlanguagesm",
    "gamedesign": "/gamedesign",
    "happybricks": "/happybricks",
    "3d-modeling": "/3d-modeling",
    "japanese": "/japanese",
    "kinder-master": "/kinder-master",
    "master-class": "/master-class",
    "mentalarithmetic": "/mentalarithmetic",
    "model-school": "/model-school",
    "podgotovka-v-hudvuz": "/podgotovka-v-hudvuz",
    "programming-school": "/programming-school",
    "promising-professions": "/promising-professions",
    "radioengineering": "/radioengineering",
    "roboticsinenglish": "/roboticsinenglish",
    "robototehnika-5-7": "/robototehnika-5-7",
    "robototehnika-7-9": "/robototehnika-7-9",
    "robototehnika-10-14": "/robototehnika-10-14",
    "robototehnika-v-kolomne": "/robototehnika-v-kolomne",
    "science-course": "/science-course",
    "sculptural-studio": "/sculptural-studio",
    "team": "/team",
    "teslaphysics": "/teslaphysics",
    "tinkercad2025itogi": "/tinkercad2025itogi",
    "vitaminkorean": "/vitaminkorean",
    "preparation-for-school": "/preparation-for-school",
    "it-лаборатория-create-для-детей-5-7-лет": SCRATCH,
    "it-лаборатория-create-для-детей-7-9-лет": MINECRAFT,
    "it-лаборатория-dev-для-детей-9-10-лет": JUNIOR,
    "it-школа-программирование-на-python": PY,
    "it-школа-программирование-на-си": CPP,
    "it-школа-разработка-игр-на-unity": UNITY,
}

ALT = {
    "/art-studio": "Художественная школа студии «Развивайся» в Коломне",
    "/art-studio-3-4": "Художественная студия 3–4 года в Коломне",
    "/art-studio-5-6": "Художественная студия 5–6 лет в Коломне",
    "/art-studio-7-8": "Художественная студия 7–9 лет в Коломне",
    "/art-studio-9-13": "Художественная студия 9–13 лет в Коломне",
    "/teslaphysics": "Курс «Физика инноваций» в Коломне",
    "/science-course": "Научный курс в студии «Развивайся»",
    "/model-school": "Модельная школа в Коломне",
    "/programming-school": "Школа программирования в Коломне",
    "/kinder-master": "Курс Киндер-мастер в Коломне",
    "/radioengineering": "Радиотехника для детей в Коломне",
    "/master-class": "Мастер-классы студии «Развивайся»",
    "/team": "Педагоги студии «Развивайся»",
}


def slug_for(path: str) -> str:
    raw = path.rstrip("/").split("/")[-1]
    return re.sub(r"[^a-z0-9а-яё-]+", "-", raw.lower())[:48] or "misc"


def extras_from_disk() -> dict:
    extras = {}
    for folder in sorted(OUT_DIR.iterdir()):
        if not folder.is_dir():
            continue
        files = sorted(p for p in folder.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
        if not files:
            continue
        dest = SLUG_TO_PATH.get(folder.name)
        if not dest:
            dest = "/" + folder.name
        alt = ALT.get(dest, "Занятия в студии «Развивайся» в Коломне")
        extras[dest] = [
            {"src": f"/media/courses/{folder.name}/{p.name}", "filename": p.name, "alt": alt}
            for p in files
        ]
    return extras


if __name__ == "__main__":
    extras = extras_from_disk()
    EXTRAS_PATH.write_text(json.dumps(extras, ensure_ascii=False, indent=2) + "\n")
    print("wrote", len(extras), "paths", sum(len(v) for v in extras.values()), "photos")
    for k, v in sorted(extras.items(), key=lambda kv: -len(kv[1])):
        print(f"{len(v):2}  {k}")
