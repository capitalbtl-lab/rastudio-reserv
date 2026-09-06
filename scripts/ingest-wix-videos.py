#!/usr/bin/env python3
"""Pull Wix course videos + robot photos from the studio media server, compress, place locally."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import paramiko
from PIL import Image

HOST = "90.156.169.197"
USER = "root"
PASS = "24549874qwertY@)"
REMOTE_ROOT = "/srv/rastudio-media-source"
OUT = Path("/workspace/public/media/courses")
HOME = Path("/workspace/public/media/home")
GALLERIES = Path("/workspace/src/data/course-galleries.json")
TMP = Path("/tmp/wix-media")
TMP.mkdir(exist_ok=True)

# Only real (non-empty) Wix videos. Huge blender file is skipped.
VIDEOS = [
    {
        "remote": "courses/robotics/20 - Робототехника и программирование в Студии Рзвивайся в Коломне (58).mp4",
        "local": [
            "robototehnika-5-7/intro.mp4",
            "robototehnika-7-9/intro.mp4",
            "robototehnika-10-14/intro.mp4",
            "robototehnika-v-kolomne/intro.mp4",
        ],
        "seconds": 75,
    },
    {
        "remote": "courses/foreignlanguages/Englishlanguage/GoGetter/01 - Go Getter English в Студии Развивайся.mp4",
        "local": ["englishlanguagegg/intro.mp4"],
        "seconds": 75,
    },
    {
        "remote": "courses/foreignlanguages/Englishlanguage/SuperMinds/01 - Super Minds English в Студии Развивайся.mp4",
        "local": ["englishlanguagesm/intro.mp4"],
        "seconds": 75,
    },
    {
        "remote": "courses/foreignlanguages/Japaneselanguage/01 - Kodomo no nihongo в Студии Развивайся.mp4",
        "local": ["japanese/intro.mp4"],
        "seconds": 75,
    },
    {
        "remote": "courses/foreignlanguages/Koreanlanguage/01 - Vitamin Korean в Студии Развивайся.mp4",
        "local": ["vitaminkorean/intro.mp4"],
        "seconds": 75,
    },
    {
        "remote": "courses/foreignlanguages/02 - Заставка Студии Развивайся .mp4",
        "local": ["languageschool/intro.mp4"],
        "seconds": 40,
    },
    {
        "remote": "courses/video/03 - IT-Школа Программирование на Python с CodeBOOK",
        "local": ["programming-school/intro.mp4"],
        "seconds": 75,
    },
]


def compress(src: Path, dest: Path, seconds: int) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(src),
        "-t",
        str(seconds),
        "-vf",
        "scale='min(1280,iw)':-2",
        "-c:v",
        "libx264",
        "-crf",
        "28",
        "-preset",
        "veryfast",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
        "-pix_fmt",
        "yuv420p",
        str(dest),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if dest.stat().st_size < 20_000:
        raise RuntimeError(f"tiny output {dest}")


def save_jpg(src: Path, dest: Path) -> bool:
    try:
        im = Image.open(src).convert("RGB")
    except Exception:
        return False
    w, h = im.size
    if min(w, h) < 280:
        return False
    scale = min(1.0, 1400 / max(w, h))
    if scale < 1:
        im = im.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "JPEG", quality=78, optimize=True, progressive=True)
    return True


def main() -> None:
    t = paramiko.Transport((HOST, 22))
    t.connect(username=USER, password=PASS)
    sftp = paramiko.SFTPClient.from_transport(t)

    for item in VIDEOS:
        remote = f"{REMOTE_ROOT}/{item['remote']}"
        tmp = TMP / Path(item["remote"]).name.replace(" ", "_")
        if not tmp.suffix:
            tmp = tmp.with_suffix(".mp4")
        print("get video", item["remote"])
        sftp.get(remote, str(tmp))
        size = tmp.stat().st_size
        print(f"  {size/1024/1024:.1f} MB")
        if size < 50_000:
            print("  skip empty")
            continue
        first = OUT / item["local"][0]
        compress(tmp, first, item["seconds"])
        print(f"  compressed {first.stat().st_size/1024/1024:.1f} MB → {first}")
        for extra in item["local"][1:]:
            dest = OUT / extra
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(first.read_bytes())
        tmp.unlink(missing_ok=True)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASS, timeout=20, allow_agent=False, look_for_keys=False)
    _, stdout, _ = client.exec_command(
        f"find {REMOTE_ROOT}/courses/robotics -type f \\( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.JPG' -o -iname '*.JPEG' \\) | sort",
        timeout=30,
    )
    photos = [line.strip() for line in stdout.read().decode().splitlines() if line.strip()]
    client.close()

    skip = ("модул", "логотип", "нейросеть", "обои", "заставка")
    jpgs = []
    for remote in photos:
        name = Path(remote).name.lower()
        if any(s in name for s in skip):
            continue
        jpgs.append(remote)

    buckets = {
        "robototehnika-5-7": jpgs[0:10],
        "robototehnika-7-9": jpgs[8:20],
        "robototehnika-10-14": jpgs[16:28],
        "robototehnika-v-kolomne": jpgs[4:16],
    }

    galleries = json.loads(GALLERIES.read_text()) if GALLERIES.exists() else {}
    for slug, rels in buckets.items():
        names = []
        n = 1
        for remote in rels:
            tmp = TMP / f"{slug}-{n}.jpg"
            try:
                sftp.get(remote, str(tmp))
            except Exception as err:
                print("photo skip", remote, err)
                continue
            dest = OUT / slug / f"{n:02d}.jpg"
            if save_jpg(tmp, dest):
                names.append(f"{n:02d}.jpg")
                print("photo", dest)
                n += 1
            tmp.unlink(missing_ok=True)
        if names:
            galleries[slug] = names

    sftp.close()
    t.close()
    GALLERIES.write_text(json.dumps(galleries, ensure_ascii=False, indent=2) + "\n")
    print("galleries updated", {k: len(v) for k, v in galleries.items() if k.startswith("robot")})


if __name__ == "__main__":
    main()
