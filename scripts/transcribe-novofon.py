#!/usr/bin/env python3
"""Расшифровывает лучшие звонки Novofon и собирает базу знаний."""
import base64, hashlib, hmac, json, os, subprocess, time, urllib.request
from urllib.parse import urlencode
from pathlib import Path

ROOT = Path("/var/www/rastudio")
STORE = ROOT / "storage" / "call-knowledge.json"
KEYS = json.loads((ROOT / "storage" / "novofon.json").read_text())
ENV = {}
for line in (ROOT / ".env").read_text().splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        ENV[k.strip()] = v.strip()
YKEY = ENV.get("YANDEX_API_KEY", "")
FOLDER = ENV.get("YANDEX_FOLDER_ID", "")
SECRET = KEYS["secret"]
USER = KEYS["userKey"]
HOST = "https://api.novofon.com"
TARGET = 50

def rest(path, params):
    qs = urlencode(sorted((k, str(v)) for k, v in params.items())).replace("%20", "+")
    md5 = hashlib.md5(qs.encode()).hexdigest()
    sign = base64.b64encode(hmac.new(SECRET.encode(), (path + qs + md5).encode(), hashlib.sha1).digest()).decode()
    url = HOST + path + (("?" + qs) if qs else "")
    req = urllib.request.Request(url, headers={"Authorization": f"{USER}:{sign}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

def load():
    return json.loads(STORE.read_text())

def save(data):
    STORE.write_text(json.dumps(data, ensure_ascii=False))

def pending(data):
    rows = [
        c for c in data["calls"]
        if c.get("is_recorded") and not c.get("transcript") and not c.get("error")
        and 60 <= int(c.get("seconds") or 0) <= 900
    ]
    rows.sort(key=lambda c: -int(c.get("seconds") or 0))
    return rows

def record_link(call):
    last = ""
    for params in (
        {"call_id": str(call["call_id"]), "lifetime": "3600"},
        {"pbx_call_id": str(call.get("pbx_call_id") or call["call_id"]), "lifetime": "3600"},
    ):
        try:
            js = rest("/v1/pbx/record/request/", params)
            links = (js.get("links") or []) + [js.get("link") or ""]
            hit = next((x for x in links if x), "")
            if hit:
                return hit
            last = str(js)
        except Exception as e:
            last = str(e)
            continue
    print("nolink", call.get("call_id"), last[:180], flush=True)
    return ""

def stt_file(path):
    body = Path(path).read_bytes()
    if len(body) < 400:
        return ""
    req = urllib.request.Request(
        "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?lang=ru-RU&topic=general&format=mp3",
        data=body,
        headers={"Authorization": f"Api-Key {YKEY}", "x-folder-id": FOLDER},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode()).get("result") or ""
    except Exception as e:
        print("stt", e)
        return ""

def transcribe(call):
    cid = str(call.get("pbx_call_id") or call["call_id"])
    link = record_link(call)
    if not link:
        return "", "нет файла записи"
    work = ROOT / "storage" / "calls" / cid.replace("/", "_")
    work.mkdir(parents=True, exist_ok=True)
    mp3 = work / "call.mp3"
    urllib.request.urlretrieve(link, mp3)
    chunks = work / "chunks"
    chunks.mkdir(exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(mp3), "-ac", "1", "-ar", "16000", "-f", "segment", "-segment_time", "25",
         "-c:a", "libmp3lame", "-q:a", "6", str(chunks / "p-%03d.mp3")],
        check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    parts = sorted(chunks.glob("p-*.mp3")) or [mp3]
    texts = []
    for p in parts:
        t = stt_file(p)
        if t.strip():
            texts.append(t.strip())
    for p in chunks.glob("*"):
        p.unlink(missing_ok=True)
    return " ".join(texts), ("" if texts else "пусто")

def mark(data, call, text, err):
    cid = str(call.get("pbx_call_id") or call["call_id"])
    for c in data["calls"]:
        if str(c.get("pbx_call_id") or c.get("call_id")) == cid:
            c["transcript"] = text
            if err:
                c["error"] = err
            elif "error" in c:
                del c["error"]
            break
    save(data)

def build_knowledge(data):
    texts = [c for c in data["calls"] if (c.get("transcript") or "") and len(c["transcript"]) > 80][-60:]
    if len(texts) < 8:
        return
    blob = "\n".join(
        f"--- {c.get('callstart')} {c.get('seconds')}с ---\n{c['transcript']}" for c in texts
    )[:28000]
    prompt = (
        "По расшифровкам звонков администраторов студии «Развивайся» (Коломна, Луховицы) собери JSON базу знаний. "
        "Убери ФИО и телефоны. Формат: {\"summary\":\"\",\"faq\":[{\"q\":\"\",\"a\":\"\"}],"
        "\"objections\":[{\"q\":\"\",\"a\":\"\"}],\"phrases\":[],\"rules\":[]}. "
        "Не больше 18 faq, 10 objections, 12 phrases, 10 rules.\n\n" + blob
    )
    body = json.dumps({
        "modelUri": f"gpt://{FOLDER}/yandexgpt/latest",
        "completionOptions": {"stream": False, "temperature": 0.2, "maxTokens": 3000},
        "messages": [
            {"role": "system", "text": "Отвечай только валидным JSON без markdown."},
            {"role": "user", "text": prompt},
        ],
    }).encode()
    req = urllib.request.Request(
        "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
        data=body,
        headers={"Authorization": f"Api-Key {YKEY}", "Content-Type": "application/json", "x-folder-id": FOLDER},
    )
    with urllib.request.urlopen(req, timeout=90) as r:
        text = json.loads(r.read().decode())["result"]["alternatives"][0]["message"]["text"]
    start, end = text.find("{"), text.rfind("}")
    raw = json.loads(text[start:end + 1])
    data["knowledge"] = {
        "updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "calls": len(data["calls"]),
        "transcribed": sum(1 for c in data["calls"] if c.get("transcript")),
        "summary": raw.get("summary") or "",
        "faq": (raw.get("faq") or [])[:20],
        "objections": (raw.get("objections") or [])[:12],
        "phrases": [str(x) for x in (raw.get("phrases") or [])][:16],
        "rules": [str(x) for x in (raw.get("rules") or [])][:12],
    }
    save(data)
    print("knowledge", len(data["knowledge"]["faq"]))

def main():
    done0 = sum(1 for c in load()["calls"] if c.get("transcript"))
    print("start transcribed", done0)
    while True:
        data = load()
        done = sum(1 for c in data["calls"] if c.get("transcript"))
        if done >= TARGET:
            break
        rows = pending(data)
        if not rows:
            break
        call = rows[0]
        print("do", call.get("call_id"), call.get("seconds"), flush=True)
        try:
            text, err = transcribe(call)
            mark(load(), call, text, err)
            print(" ok", len(text), err)
        except Exception as e:
            mark(load(), call, "", str(e)[:180])
            print(" err", e)
        time.sleep(0.4)
    try:
        build_knowledge(load())
    except Exception as e:
        print("kb", e)
    print("done", sum(1 for c in load()["calls"] if c.get("transcript")))

if __name__ == "__main__":
    main()
