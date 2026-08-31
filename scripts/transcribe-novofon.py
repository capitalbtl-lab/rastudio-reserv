#!/usr/bin/env python3
"""Фон: Novofon → mp3 → расшифровка → база знаний для Ольги."""
import base64, hashlib, hmac, json, subprocess, time, urllib.error, urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path("/var/www/rastudio")
STORE = ROOT / "storage" / "call-knowledge.json"
STATUS = ROOT / "storage" / "transcribe-status.json"
KEYS_PATH = ROOT / "storage" / "novofon.json"
HOST = "https://api.novofon.com"
SCAN_EVERY = 6 * 3600
KB_EVERY = 8
SETTINGS = ROOT / "storage" / "call-settings.json"


def load_settings():
    d = {"minSeconds": 30, "scanHours": 6, "paused": False, "autoKnowledge": True}
    if SETTINGS.exists():
        try:
            d.update(json.loads(SETTINGS.read_text()))
        except Exception:
            pass
    return d


def env():
    out = {}
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip()
    return out


def keys():
    raw = json.loads(KEYS_PATH.read_text())
    return raw["userKey"], raw["secret"]


def rest(path, params):
    user, secret = keys()
    qs = urlencode(sorted((k, str(v)) for k, v in params.items())).replace("%20", "+")
    md5 = hashlib.md5(qs.encode()).hexdigest()
    payload = path + qs + md5
    signs = [
        base64.b64encode(hmac.new(secret.encode(), payload.encode(), hashlib.sha1).digest()).decode(),
        base64.b64encode(hmac.new(secret.encode(), payload.encode(), hashlib.sha1).hexdigest().encode()).decode(),
    ]
    url = HOST + path + (("?" + qs) if qs else "")
    last = None
    for sign in signs:
        req = urllib.request.Request(url, headers={"Authorization": f"{user}:{sign}"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                js = json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            raw = e.read().decode(errors="replace")
            try:
                js = json.loads(raw)
            except Exception:
                last = raw
                continue
        if js.get("status") != "error":
            return js
        last = js.get("message") or js
    raise RuntimeError(str(last))


def load():
    if not STORE.exists():
        return {"calls": [], "knowledge": None}
    return json.loads(STORE.read_text())


def save(data):
    tmp = STORE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False))
    tmp.replace(STORE)


def write_status(**kw):
    STATUS.parent.mkdir(parents=True, exist_ok=True)
    cur = {}
    if STATUS.exists():
        try:
            cur = json.loads(STATUS.read_text())
        except Exception:
            cur = {}
    cur.update(kw)
    cur["updated"] = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    cur["running"] = True
    STATUS.write_text(json.dumps(cur, ensure_ascii=False))


def months(n=24):
    now = datetime.now()
    out = []
    for i in range(n):
        start = (now.replace(day=1) - timedelta(days=32 * i)).replace(day=1, hour=0, minute=0, second=0)
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1, day=1) - timedelta(seconds=1)
        else:
            end = start.replace(month=start.month + 1, day=1) - timedelta(seconds=1)
        fmt = lambda d: d.strftime("%Y-%m-%d %H:%M:%S")
        out.append((fmt(start), fmt(end)))
    return out


def scan():
    data = load()
    map_ = {str(c.get("pbx_call_id") or c.get("call_id")): c for c in data.get("calls") or []}
    min_s = int(load_settings().get("minSeconds") or 30)
    added = 0
    for start, end in months(24):
        skip = 0
        while skip < 20000:
            js = rest("/v1/statistics/pbx/", {"start": start, "end": end, "version": "2", "skip": str(skip), "limit": "1000"})
            rows = js.get("stats") or []
            for row in rows:
                rec = str(row.get("is_recorded")) == "true" or row.get("is_recorded") is True
                seconds = int(row.get("seconds") or 0)
                if not rec or seconds < min_s:
                    continue
                cid = str(row.get("pbx_call_id") or row.get("call_id") or "")
                prev = map_.get(cid) or {}
                map_[cid] = {
                    **prev,
                    "call_id": str(row.get("call_id") or cid),
                    "pbx_call_id": cid,
                    "callstart": str(row.get("callstart") or ""),
                    "clid": str(row.get("clid") or ""),
                    "destination": str(row.get("destination") or ""),
                    "disposition": str(row.get("disposition") or ""),
                    "seconds": seconds,
                    "is_recorded": True,
                    "sip": str(row.get("sip") or ""),
                }
                if not prev:
                    added += 1
            if len(rows) < 1000:
                break
            skip += 1000
    data["calls"] = list(map_.values())
    data["scannedAt"] = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    save(data)
    write_status(last=f"скан +{added}", total=len(data["calls"]))
    print("scan", len(data["calls"]), "new", added, flush=True)


def pending(data):
    min_s = int(load_settings().get("minSeconds") or 30)
    rows = [
        c for c in data.get("calls") or []
        if c.get("is_recorded") and not c.get("transcript") and not c.get("error")
        and int(c.get("seconds") or 0) >= min_s
    ]

    def rank(c):
        s = int(c.get("seconds") or 0)
        if 90 <= s <= 720:
            return (0, -s)
        if 30 <= s < 90:
            return (1, -s)
        return (2, -s)

    rows.sort(key=rank)
    return rows


def record_link(call):
    last = ""
    for params in (
        {"call_id": str(call["call_id"]), "lifetime": "7200"},
        {"pbx_call_id": str(call.get("pbx_call_id") or call["call_id"]), "lifetime": "7200"},
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
    print("nolink", call.get("call_id"), last[:160], flush=True)
    return ""


def stt_file(path: Path, e):
    body = path.read_bytes()
    if len(body) < 400 or len(body) > 900000:
        return ""
    url = "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?lang=ru-RU&topic=general&format=lpcm&sampleRateHertz=16000"
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Authorization": f"Api-Key {e['YANDEX_API_KEY']}", "x-folder-id": e.get("YANDEX_FOLDER_ID", "")},
    )
    try:
        with urllib.request.urlopen(req, timeout=35) as r:
            return json.loads(r.read().decode()).get("result") or ""
    except Exception as err:
        print("stt", err, flush=True)
        return ""


def transcribe(call, e):
    cid = str(call.get("pbx_call_id") or call["call_id"])
    work = ROOT / "storage" / "calls" / cid.replace("/", "_")
    work.mkdir(parents=True, exist_ok=True)
    mp3 = work / "call.mp3"
    if not mp3.exists() or mp3.stat().st_size < 1000:
        link = record_link(call)
        if not link:
            return "", "нет файла записи"
        urllib.request.urlretrieve(link, mp3)
    wav = work / "full.wav"
    chunks = work / "chunks"
    chunks.mkdir(exist_ok=True)
    for old in chunks.glob("*"):
        old.unlink(missing_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(mp3), "-ac", "1", "-ar", "16000", str(wav)],
        check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180,
    )
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(wav), "-f", "segment", "-segment_time", "20",
         "-ac", "1", "-ar", "16000", "-acodec", "pcm_s16le", str(chunks / "p-%03d.wav")],
        check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180,
    )
    parts = sorted(p for p in chunks.glob("p-*.wav") if p.stat().st_size > 1000)
    if not parts and wav.exists():
        raw = work / "full.raw"
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(wav), "-ac", "1", "-ar", "16000", "-f", "s16le", str(raw)],
            check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180,
        )
        data = raw.read_bytes() if raw.exists() else b""
        step = 16000 * 2 * 20
        for i in range(0, len(data), step):
            piece = data[i:i + step]
            if len(piece) < 4000:
                continue
            dest = chunks / f"r-{i:07d}.raw"
            dest.write_bytes(piece)
            parts.append(dest)
    texts = []
    for p in parts:
        t = stt_file(p, e)
        if t.strip():
            texts.append(t.strip())
    for p in chunks.glob("*"):
        p.unlink(missing_ok=True)
    if wav.exists():
        wav.unlink(missing_ok=True)
    return " ".join(texts), ("" if texts else "пусто")


def mark(call, text, err):
    data = load()
    cid = str(call.get("pbx_call_id") or call["call_id"])
    for c in data["calls"]:
        if str(c.get("pbx_call_id") or c.get("call_id")) == cid:
            c["transcript"] = text
            if err:
                c["error"] = err
            else:
                c.pop("error", None)
            break
    save(data)


def build_knowledge(data, e):
    texts = [c for c in data["calls"] if (c.get("transcript") or "") and len(c["transcript"]) > 80]
    texts.sort(key=lambda c: -int(c.get("seconds") or 0))
    texts = texts[:70]
    if len(texts) < 4:
        return
    blob = "\n".join(
        f"--- {c.get('callstart')} {c.get('seconds')}с ---\n{c['transcript']}" for c in texts
    )[:28000]
    prompt = (
        "По расшифровкам звонков администраторов студии «Развивайся» (Коломна и Луховицы) "
        "собери JSON для ИИ-администраторов Олега и Ольги, чтобы заменить живого администратора. "
        "Убери ФИО, телефоны родителей, адреса домов. Оставь рабочие формулировки.\n"
        "Формат:\n"
        '{"summary":"как говорят на линии",'
        '"faq":[{"q":"","a":""}],'
        '"objections":[{"q":"","a":""}],'
        '"scripts":[{"name":"сценарий","steps":["шаг"]}],'
        '"phrases":["живая фраза"],'
        '"rules":["правило линии"],'
        '"siteRecommendations":["что поправить на сайте, чтобы меньше звонили с одним и тем же"],'
        '"instructions":["инструкция ИИ: как вести родителя от вопроса до записи"]}\n'
        "faq до 20, objections до 12, scripts до 8, phrases 14, rules 12, siteRecommendations 8, instructions 10.\n\n"
        + blob
    )
    body = json.dumps({
        "modelUri": f"gpt://{e.get('YANDEX_FOLDER_ID')}/yandexgpt/latest",
        "completionOptions": {"stream": False, "temperature": 0.2, "maxTokens": 3500},
        "messages": [
            {"role": "system", "text": "Отвечай только валидным JSON без markdown."},
            {"role": "user", "text": prompt},
        ],
    }).encode()
    req = urllib.request.Request(
        "https://llm.api.cloud.yandex.net/foundationModels/v1/completion",
        data=body,
        headers={
            "Authorization": f"Api-Key {e['YANDEX_API_KEY']}",
            "Content-Type": "application/json",
            "x-folder-id": e.get("YANDEX_FOLDER_ID", ""),
        },
    )
    with urllib.request.urlopen(req, timeout=90) as r:
        text = json.loads(r.read().decode())["result"]["alternatives"][0]["message"]["text"]
    start, end = text.find("{"), text.rfind("}")
    raw = json.loads(text[start:end + 1])
    data["knowledge"] = {
        "updated": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "calls": len(data["calls"]),
        "transcribed": sum(1 for c in data["calls"] if c.get("transcript")),
        "summary": raw.get("summary") or "",
        "faq": (raw.get("faq") or [])[:20],
        "objections": (raw.get("objections") or [])[:12],
        "scripts": (raw.get("scripts") or [])[:8],
        "phrases": [str(x) for x in (raw.get("phrases") or [])][:14],
        "rules": [str(x) for x in (raw.get("rules") or [])][:12],
        "siteRecommendations": [str(x) for x in (raw.get("siteRecommendations") or [])][:8],
        "instructions": [str(x) for x in (raw.get("instructions") or [])][:10],
    }
    save(data)
    write_status(knowledgeAt=data["knowledge"]["updated"], faq=len(data["knowledge"]["faq"]))
    print("knowledge", len(data["knowledge"]["faq"]), flush=True)


def main():
    e = env()
    last_scan = 0
    since_kb = 0
    write_status(last="старт фона", transcribed=0)
    while True:
        try:
            cfg = load_settings()
            if cfg.get("paused"):
                write_status(last="пауза в настройках")
                time.sleep(20)
                continue
            scan_every = max(1, int(cfg.get("scanHours") or 6)) * 3600
            if time.time() - last_scan > scan_every or not load().get("calls"):
                scan()
                last_scan = time.time()
            data = load()
            rows = pending(data)
            done = sum(1 for c in data.get("calls") or [] if c.get("transcript"))
            write_status(
                transcribed=done,
                pending=len(rows),
                total=len(data.get("calls") or []),
                last=f"очередь {len(rows)}",
            )
            if not rows:
                time.sleep(120)
                continue
            call = rows[0]
            print("do", call.get("call_id"), call.get("seconds"), flush=True)
            write_status(last=f"расшифровка {call.get('call_id')} {call.get('seconds')}с")
            text, err = transcribe(call, e)
            mark(call, text, err)
            print(" ok", len(text), err, flush=True)
            if text and not err:
                since_kb += 1
                if since_kb >= KB_EVERY and load_settings().get("autoKnowledge", True):
                    try:
                        build_knowledge(load(), e)
                    except Exception as kb_err:
                        print("kb", kb_err, flush=True)
                    since_kb = 0
        except Exception as err:
            print("loop", err, flush=True)
            write_status(last=f"ошибка {err}"[:180])
            time.sleep(8)


if __name__ == "__main__":
    main()
