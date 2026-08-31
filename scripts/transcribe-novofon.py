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
CRM_INDEX = ROOT / "storage" / "crm-index.json"
STUDY = {
    1: "обучается",
    2: "завершил / ушёл",
    4: "ожидает старта",
    5: "должник",
    7: "пропустил 1 занятие",
    8: "ждём на занятиях",
    9: "без статуса",
    10: "пропустил 2 занятия",
    11: "пропустил 3 занятия",
}
LEAD = {1: "разбирается", 2: "ожидает старта", 4: "оплатил", 7: "отложен"}
BRANCH_NAME = {1: "Гражданская", 2: "Октябрьской", 3: "Луховицы"}
_last_alfa = 0.0


def load_settings():
    d = {"minSeconds": 30, "scanHours": 6, "paused": False, "autoKnowledge": True}
    if SETTINGS.exists():
        try:
            d.update(json.loads(SETTINGS.read_text()))
        except Exception:
            pass
    return d


def digits(s):
    d = "".join(ch for ch in str(s or "") if ch.isdigit())
    if d.startswith("8") and len(d) == 11:
        d = "7" + d[1:]
    return d[-10:] if len(d) >= 10 else d


def age_from_dob(dob):
    try:
        day, month, year = [int(x) for x in str(dob).replace("/", ".").split(".")[:3]]
        today = datetime.now()
        age = today.year - year - ((today.month, today.day) < (month, day))
        return age if 1 <= age <= 18 else None
    except Exception:
        return None


def alfa_post(path, body, tok=None, qs=""):
    global _last_alfa
    wait = 0.22 - (time.time() - _last_alfa)
    if wait > 0:
        time.sleep(wait)
    _last_alfa = time.time()
    host = (env().get("ALFACRM_HOST") or "https://studiyarazvivaysya.s20.online").rstrip("/")
    url = host + path + (("?" + qs) if qs else "")
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json", **({"X-ALFACRM-TOKEN": tok} if tok else {})},
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode())


def alfa_token(e):
    js = alfa_post("/v2api/auth/login", {"email": e.get("ALFACRM_EMAIL") or "", "api_key": e.get("ALFACRM_API_KEY") or ""})
    return js.get("token") or ""


def parse_course_note(note):
    if not note:
        return ""
    for line in str(note).splitlines():
        if "курс" in line.lower() or "наименование" in line.lower():
            part = line.split(":", 1)[-1].strip() if ":" in line else line.strip()
            if part:
                return part[:80]
    return ""


def build_crm_index(e):
    tok = alfa_token(e)
    if not tok:
        print("crm no token", flush=True)
        return {}
    subjects = {}
    try:
        js = alfa_post("/v2api/2/subject/index", {"page": 0, "pageSize": 200}, tok)
        for s in js.get("items") or []:
            subjects[int(s.get("id") or 0)] = s.get("name") or ""
    except Exception as err:
        print("subjects", err, flush=True)
    groups = {}
    for branch in (1, 2, 3):
        try:
            js = alfa_post(f"/v2api/{branch}/group/index", {"page": 0, "pageSize": 200}, tok)
            for g in js.get("items") or []:
                groups[int(g.get("id") or 0)] = g.get("name") or ""
        except Exception as err:
            print("groups", branch, err, flush=True)
    cust_groups = {}
    for branch in (1, 2, 3):
        for page in range(6):
            try:
                js = alfa_post(
                    f"/v2api/{branch}/lesson/index",
                    {
                        "page": page,
                        "pageSize": 100,
                        "date_from": (datetime.now() - timedelta(days=180)).strftime("%Y-%m-%d"),
                        "date_to": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d"),
                    },
                    tok,
                )
            except Exception:
                break
            items = js.get("items") or []
            for les in items:
                gname = groups.get(int((les.get("group_ids") or [0])[0] or 0)) or subjects.get(int(les.get("subject_id") or 0)) or ""
                if not gname:
                    continue
                for cid in les.get("customer_ids") or []:
                    cust_groups.setdefault(int(cid), set()).add(gname)
            if len(items) < 100:
                break
    phones = {}
    for branch in (1, 2, 3):
        for extra in ({}, {"removed": 1}):
            page = 0
            while page < 30:
                payload = {"page": page, "pageSize": 50, **extra}
                js = alfa_post(f"/v2api/{branch}/customer/index", payload, tok)
                items = js.get("items") or []
                for c in items:
                    archived = extra.get("removed") == 1
                    status = "архив" if archived else (
                        STUDY.get(int(c.get("study_status_id") or 0), "")
                        if int(c.get("is_study") or 0) == 1
                        else ("лид / не учится" if int(c.get("is_study") or 0) == 0 else "")
                    )
                    profile = {
                        "id": c.get("id"),
                        "age": age_from_dob(c.get("dob") or ""),
                        "branch": BRANCH_NAME.get(branch, str(branch)),
                        "branchId": branch,
                        "isStudy": int(c.get("is_study") or 0) == 1,
                        "archived": archived,
                        "studyStatus": status,
                        "leadStatus": LEAD.get(int(c.get("lead_status_id") or 0), ""),
                        "groups": sorted(cust_groups.get(int(c.get("id") or 0), []))[:4],
                        "courseNote": parse_course_note(c.get("note") or ""),
                        "lastAttend": c.get("last_attend_date") or "",
                        "startedAt": (c.get("b_date") or "")[:10],
                        "paidTill": c.get("paid_till") or "",
                        "paidCount": c.get("paid_count") or 0,
                        "months": 0,
                        "dropped": False,
                    }
                    last = profile["lastAttend"]
                    profile["dropped"] = (not archived and profile["studyStatus"] in ("завершил / ушёл",)) or (
                        bool(profile["isStudy"]) and bool(last) and last < (datetime.now() - timedelta(days=60)).strftime("%Y-%m-%d")
                    )
                    if archived:
                        profile["dropped"] = True
                    try:
                        if profile["startedAt"]:
                            start = datetime.strptime(profile["startedAt"][:10], "%Y-%m-%d")
                            profile["months"] = max(0, (datetime.now() - start).days // 30)
                    except Exception:
                        profile["months"] = 0
                    for ph in c.get("phone") or []:
                        d = digits(ph)
                        if len(d) >= 10 and (d not in phones or archived is False):
                            phones[d] = profile
                if len(items) < 50:
                    break
                page += 1
    CRM_INDEX.write_text(json.dumps({"at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"), "phones": phones}, ensure_ascii=False))
    print("crm index", len(phones), flush=True)
    return phones


def load_crm_phones():
    if CRM_INDEX.exists():
        try:
            return json.loads(CRM_INDEX.read_text()).get("phones") or {}
        except Exception:
            return {}
    return {}


STUDIO_TAIL = {"8005113401", "9681999399"}


def phones_of_call(call):
    out = []
    for raw in (call.get("clid"), call.get("destination")):
        d = digits(raw)
        if len(d) >= 10 and d[-10:] not in STUDIO_TAIL:
            out.append(d[-10:])
    return out


def fetch_comms(profile, e):
    try:
        tok = alfa_token(e)
        br = profile.get("branchId") or 2
        cid = profile.get("id")
        if not cid:
            return []
        js = alfa_post(
            f"/v2api/{br}/communication/index",
            {"page": 0, "pageSize": 12},
            tok,
            qs=f"class=Customer&related_id={cid}",
        )
        out = []
        for it in js.get("items") or []:
            t = str(it.get("comment") or "").strip()
            if t:
                out.append(t[:180])
        return out[:10]
    except Exception as err:
        print("comms", err, flush=True)
        return []


def crm_for_call(call, phones, e=None):
    for d in phones_of_call(call):
        profile = phones.get(d) or phones.get(d[-10:])
        if not profile:
            continue
        snap = {k: v for k, v in profile.items()}
        if e:
            snap["comms"] = fetch_comms(profile, e)
        return snap
    return None


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
    rows = []
    for c in data.get("calls") or []:
        if not c.get("is_recorded"):
            continue
        if int(c.get("seconds") or 0) < min_s:
            continue
        if c.get("turns"):
            continue
        cid = str(c.get("pbx_call_id") or c.get("call_id") or "").replace("/", "_")
        mp3 = ROOT / "storage" / "calls" / cid / "call.mp3"
        has = mp3.exists() and mp3.stat().st_size > 1000
        if c.get("transcript") and not has:
            continue
        if c.get("error") and not has:
            continue
        rows.append(c)

    def rank(c):
        s = int(c.get("seconds") or 0)
        if c.get("transcript") and not c.get("turns"):
            return (-1, -s)
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


ADMIN_MARK = (
    "филиал", "пробное", "запишу", "записать вас", "гражданск", "октябрьск", "луховиц",
    "развивайся", "не расслыш", "сколько лет", "абонемент", "занятие", "группа",
    "мастер-класс", "ещё раз куда", "алло здравствуйте",
)
CLIENT_MARK = (
    "хотел", "ребенк", "ребёнк", "сколько стоит", "подскажите", "можно записа",
    "мне бы", "у нас", "мы хотели", "сколько стоит",
)


def is_studio_num(raw):
    d = digits(raw)
    return "5113401" in d or d.startswith("800") or d.startswith("7800")


def score_side(text, marks):
    t = (text or "").lower()
    return sum(1 for w in marks if w in t)


def split_channel(mp3: Path, ch: int, wav: Path):
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(mp3), "-af", f"pan=mono|c0=c{ch}", "-ac", "1", "-ar", "16000", str(wav)],
        check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180,
    )


def chunk_stt(wav: Path, chunks: Path, prefix: str, e):
    for old in chunks.glob(f"{prefix}-*"):
        old.unlink(missing_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(wav), "-f", "segment", "-segment_time", "20",
         "-ac", "1", "-ar", "16000", "-acodec", "pcm_s16le", str(chunks / f"{prefix}-%03d.wav")],
        check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180,
    )
    parts = sorted(p for p in chunks.glob(f"{prefix}-*.wav") if p.stat().st_size > 1000)
    out = []
    for i, p in enumerate(parts):
        t = stt_file(p, e).strip()
        out.append((i * 20, t))
        p.unlink(missing_ok=True)
    return out


def transcribe(call, e):
    cid = str(call.get("pbx_call_id") or call["call_id"])
    work = ROOT / "storage" / "calls" / cid.replace("/", "_")
    work.mkdir(parents=True, exist_ok=True)
    mp3 = work / "call.mp3"
    if not mp3.exists() or mp3.stat().st_size < 1000:
        link = record_link(call)
        if not link:
            return "", "нет файла записи", []
        urllib.request.urlretrieve(link, mp3)
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=channels", "-of", "csv=p=0", str(mp3)],
        capture_output=True, text=True, timeout=30,
    )
    nch = 1
    try:
        nch = int((probe.stdout or "1").splitlines()[0].split(",")[0] or 1)
    except Exception:
        nch = 1
    chunks = work / "chunks"
    chunks.mkdir(exist_ok=True)
    turns = []
    if nch >= 2:
        left_w, right_w = work / "left.wav", work / "right.wav"
        split_channel(mp3, 0, left_w)
        split_channel(mp3, 1, right_w)
        left = chunk_stt(left_w, chunks, "L", e)
        right = chunk_stt(right_w, chunks, "R", e)
        for p in (left_w, right_w):
            if p.exists():
                p.unlink()
        left_all = " ".join(t for _, t in left if t)
        right_all = " ".join(t for _, t in right if t)
        inbound = is_studio_num(call.get("destination")) and not is_studio_num(call.get("clid"))
        mapping = {"left": "client", "right": "admin"} if inbound or not is_studio_num(call.get("clid")) else {"left": "admin", "right": "client"}
        if score_side(left_all, ADMIN_MARK) > score_side(left_all, CLIENT_MARK) and score_side(right_all, CLIENT_MARK) >= score_side(right_all, ADMIN_MARK):
            mapping = {"left": "admin", "right": "client"}
        elif score_side(right_all, ADMIN_MARK) > score_side(right_all, CLIENT_MARK) and score_side(left_all, CLIENT_MARK) >= score_side(left_all, ADMIN_MARK):
            mapping = {"left": "client", "right": "admin"}
        by_t = {}
        for t, text in left:
            if text:
                by_t.setdefault(t, []).append((mapping["left"], text))
        for t, text in right:
            if text:
                by_t.setdefault(t, []).append((mapping["right"], text))
        order = {"client": 0, "admin": 1}
        for t in sorted(by_t):
            for who, text in sorted(by_t[t], key=lambda x: order.get(x[0], 9)):
                if turns and turns[-1]["who"] == who:
                    turns[-1]["text"] = (turns[-1]["text"] + " " + text).strip()
                else:
                    turns.append({"who": who, "t": t, "text": text})
    else:
        wav = work / "full.wav"
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(mp3), "-ac", "1", "-ar", "16000", str(wav)],
            check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180,
        )
        mono = chunk_stt(wav, chunks, "M", e)
        if wav.exists():
            wav.unlink()
        text = " ".join(t for _, t in mono if t).strip()
        if text:
            turns = [{"who": "mixed", "t": 0, "text": text}]
    for p in chunks.glob("*"):
        p.unlink(missing_ok=True)
    label = {"client": "Клиент", "admin": "Администратор", "mixed": "Разговор"}
    lines = [f"{label.get(x['who'], x['who'])}: {x['text']}" for x in turns if x.get("text")]
    text = "\n".join(lines)
    return text, ("" if text else "пусто"), turns


def mark(call, text, err, crm=None, turns=None):
    data = load()
    cid = str(call.get("pbx_call_id") or call["call_id"])
    for c in data["calls"]:
        if str(c.get("pbx_call_id") or c.get("call_id")) == cid:
            if text:
                c["transcript"] = text
            if turns:
                c["turns"] = turns
            if crm:
                c["crm"] = crm
            if err and not text:
                c["error"] = err
            elif text:
                c.pop("error", None)
            break
    save(data)


def enrich_transcripts(e):
    phones = load_crm_phones()
    if not phones:
        phones = build_crm_index(e)
    data = load()
    n = 0
    for c in data.get("calls") or []:
        if not c.get("transcript") or c.get("crm"):
            continue
        crm = crm_for_call(c, phones, e)
        if crm:
            c["crm"] = crm
            n += 1
    if n:
        save(data)
        print("crm attached", n, flush=True)
    write_status(crmMatched=sum(1 for c in data.get("calls") or [] if c.get("crm")))


def crm_line(c):
    crm = c.get("crm") or {}
    if not crm:
        return "CRM: не найден"
    bits = []
    if crm.get("age"):
        bits.append(f"{crm['age']} лет")
    bits.append(crm.get("studyStatus") or ("архив" if crm.get("archived") else "неизвестно"))
    if crm.get("dropped"):
        bits.append("бросил / не ходит")
    if crm.get("months"):
        bits.append(f"в студии ~{crm['months']} мес")
    course = ", ".join(crm.get("groups") or []) or crm.get("courseNote") or ""
    if course:
        bits.append(course)
    if crm.get("lastAttend"):
        bits.append(f"последнее занятие {crm['lastAttend']}")
    if crm.get("branch"):
        bits.append(crm["branch"])
    comm = " | ".join((crm.get("comms") or [])[:4])
    line = "CRM: " + "; ".join(bits)
    if comm:
        line += f"\nПереписка: {comm[:400]}"
    return line


def build_knowledge(data, e):
    texts = [c for c in data["calls"] if (c.get("transcript") or "") and len(c["transcript"]) > 80]
    texts.sort(key=lambda c: -int(c.get("seconds") or 0))
    texts = texts[:70]
    if len(texts) < 4:
        return
    blob = "\n".join(
        f"--- {c.get('callstart')} {c.get('seconds')}с ---\n{crm_line(c)}\n{c['transcript']}" for c in texts
    )[:28000]
    prompt = (
        "По расшифровкам звонков студии «Развивайся» (Коломна, Луховицы) собери JSON для ИИ Олега и Ольги. "
        "В расшифровке есть роли: «Клиент:» — родитель, «Администратор:» — сотрудник студии. "
        "FAQ: вопрос клиента → ответ администратора. Скрипты — как ведёт администратор. "
        "Учитывай возраст, курс, учится/бросил/архив. Убери ФИО и телефоны.\n"
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
    try:
        write_status(last="индекс AlfaCRM")
        build_crm_index(e)
        enrich_transcripts(e)
    except Exception as crm_err:
        print("crm-start", crm_err, flush=True)
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
                try:
                    write_status(last="индекс AlfaCRM")
                    build_crm_index(e)
                    enrich_transcripts(e)
                except Exception as crm_err:
                    print("crm", crm_err, flush=True)
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
            text, err, turns = transcribe(call, e)
            crm = None
            if text and not err:
                try:
                    crm = crm_for_call(call, load_crm_phones() or build_crm_index(e), e)
                except Exception as crm_err:
                    print("crm-one", crm_err, flush=True)
            mark(call, text, err, crm, turns)
            print(" ok", len(text), err, "turns", len(turns or []), flush=True)
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
