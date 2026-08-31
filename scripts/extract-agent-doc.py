#!/usr/bin/env python3
"""Extract plain text from PDF / DOCX / DOC / TXT for the studio agent."""
from __future__ import annotations

import re
import subprocess
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


def from_txt(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def from_docx(path: Path) -> str:
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml")
    root = ET.fromstring(xml)
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    lines: list[str] = []
    for p in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"):
        bits = [t.text or "" for t in p.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")]
        line = "".join(bits).strip()
        if line:
            lines.append(line)
    return "\n".join(lines)


def from_pdf(path: Path) -> str:
    try:
        import pypdf  # type: ignore

        reader = pypdf.PdfReader(str(path))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception:
        pass
    try:
        import fitz  # type: ignore

        doc = fitz.open(str(path))
        return "\n".join(page.get_text() for page in doc)
    except Exception:
        pass
    try:
        return subprocess.check_output(["pdftotext", "-layout", str(path), "-"], text=True, errors="ignore")
    except Exception as exc:
        raise RuntimeError(f"pdf: {exc}") from exc


def from_doc(path: Path) -> str:
    for cmd in (
        ["antiword", str(path)],
        ["catdoc", str(path)],
        ["soffice", "--headless", "--cat", str(path)],
    ):
        try:
            return subprocess.check_output(cmd, text=True, errors="ignore", timeout=40)
        except Exception:
            continue
    raise RuntimeError("старый .doc не разобрался — сохраните как .docx или PDF")


def clean(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: extract-agent-doc.py FILE", file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    suf = path.suffix.lower()
    if suf in {".txt", ".md"}:
        out = from_txt(path)
    elif suf == ".docx":
        out = from_docx(path)
    elif suf == ".pdf":
        out = from_pdf(path)
    elif suf == ".doc":
        out = from_doc(path)
    else:
        print(f"формат {suf} не поддерживается", file=sys.stderr)
        return 3
    sys.stdout.write(clean(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
