#!/usr/bin/env python3
"""Фон: AlfaCRM → личные дела на rastudio.org. CRM важнее локальных ФИО/пола/даты рождения."""
import json, time, urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path("/var/www/rastudio")
FILE = ROOT / "storage" / "dossiers.json"
EVERY = 7 * 24 * 3600
BRANCH_TITLE = {
    1: "Коломна, Гражданская, 2",
    2: "Коломна, ЦМИТ, Октябрьской революции, 340",
    3: "Луховицы, Пушкина, 202А",
    4: "Летние программы",
}
MAX = 4000


def env():
    out = {}
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def post(host, path, body, tok=None):
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if tok:
        headers["X-ALFACRM-TOKEN"] = tok
    req = urllib.request.Request(host + path, data=json.dumps(body).encode(), headers=headers)
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode() or "{}")


def load():
    if not FILE.exists():
        return {"items": [], "lastCrmSync": "", "nextCrmSync": ""}
    try:
        raw = json.loads(FILE.read_text())
        return {"items": raw.get("items") or [], "lastCrmSync": raw.get("lastCrmSync") or "", "nextCrmSync": raw.get("nextCrmSync") or ""}
    except Exception:
        return {"items": [], "lastCrmSync": "", "nextCrmSync": ""}


def save(store):
    FILE.parent.mkdir(parents=True, exist_ok=True)
    store["items"] = store["items"][:MAX]
    tmp = FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(store, ensure_ascii=False, separators=(",", ":")))
    tmp.replace(FILE)


def digits(raw):
    d = "".join(ch for ch in str(raw or "") if ch.isdigit())
    if len(d) == 10 and d.startswith("9"):
        d = "7" + d
    if len(d) == 11 and d.startswith("8"):
        d = "7" + d[1:]
    return d


def split_fio(fio):
    parts = (fio or "").split()
    if not parts:
        return {"fio": ""}
    if len(parts) == 1:
        return {"fio": fio, "first": parts[0]}
    if len(parts) == 2:
        return {"fio": fio, "last": parts[0], "first": parts[1]}
    return {"fio": fio, "last": parts[0], "first": parts[1], "middle": " ".join(parts[2:])}


def stringify(v):
    if v is None or v == "":
        return ""
    if isinstance(v, list):
        return ", ".join(stringify(x) for x in v if stringify(x))
    if isinstance(v, dict):
        return json.dumps(v, ensure_ascii=False)
    return str(v)


def gender_of(g):
    if g in (1, "1"):
        return "мальчик"
    if g in (2, "2"):
        return "девочка"
    return None


def apply(store, item, branch, archived=False):
    cid = item.get("id")
    if not cid:
        return
    phones = item.get("phone") or []
    if not isinstance(phones, list):
        phones = [phones]
    phone0 = next((str(p) for p in phones if p), "")
    dig = digits(phone0)
    found = None
    for d in store["items"]:
        if d.get("crmId") == cid or (dig and d.get("phoneDigits") == dig):
            found = d
            break
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    child_name = str(item.get("name") or "").strip()
    parent_name = str(item.get("legal_name") or "").strip()
    addr = ", ".join(str(x) for x in (item.get("addr") or []) if x)
    custom_addr = str(item.get("custom_adresprozhivaniya") or "").strip()
    if not addr and custom_addr and "введите адрес" not in custom_addr.lower():
        addr = custom_addr
    study = int(item.get("is_study") or 0)
    status = "архив" if archived or study == 2 else ("учится" if study == 1 else "лид")
    paid = []
    if item.get("paid_till"):
        paid.append(f"оплачено до {item.get('paid_till')}")
    if item.get("paid_count"):
        paid.append(f"занятий по абонементу: {item.get('paid_count')}")
    extras = {k: stringify(v) for k, v in item.items()}
    g = gender_of(item.get("gender"))
    if not found:
        found = {
            "id": f"crm-{cid}",
            "phones": [],
            "phoneDigits": dig,
            "child": {"fio": ""},
            "parent": {"fio": ""},
            "coursesNow": [],
            "coursesPast": [],
            "services": [],
            "extras": {},
            "chatIds": [],
            "log": [],
            "createdAt": now,
        }
        store["items"].insert(0, found)
    found["crmId"] = cid
    found["branchId"] = branch
    found["url"] = f"https://studiyarazvivaysya.s20.online/company/{branch}/lead/view?id={cid}"
    if phone0 and phone0 not in found.get("phones", []):
        found.setdefault("phones", []).append(phone0)
    if dig:
        found["phoneDigits"] = dig
    if child_name:
        child = found.get("child") or {}
        child.update(split_fio(child_name))
        if g:
            child["gender"] = g
        if item.get("dob"):
            child["dob"] = str(item.get("dob"))
        found["child"] = child
    if parent_name:
        found["parent"] = split_fio(parent_name)
    if addr:
        found["address"] = addr
    found["branch"] = BRANCH_TITLE.get(branch, str(branch))
    found["city"] = "Луховицы" if branch == 3 else ("лето" if branch == 4 else "Коломна")
    if paid:
        found["tariff"] = " · ".join(paid)
    found["status"] = status
    prev = found.get("extras") or {}
    prev.update({k: v for k, v in extras.items() if k not in prev or v != prev.get(k)})
    # always add new keys
    for k, v in extras.items():
        if k not in prev:
            prev[k] = v
        else:
            prev[k] = v if v != "" or prev[k] == "" else prev[k]
            if v:
                prev[k] = v
    found["extras"] = prev
    found["updatedAt"] = now
    found.setdefault("log", [])
    found["log"] = ([{"at": now, "source": "alfacrm", "text": f"CRM {cid}: {child_name}"}] + found["log"])[:80]


def sync_once(e):
    host = e.get("ALFACRM_HOST", "https://studiyarazvivaysya.s20.online").rstrip("/")
    auth = post(host, "/v2api/auth/login", {"email": e.get("ALFACRM_EMAIL"), "api_key": e.get("ALFACRM_API_KEY")})
    tok = auth.get("token")
    if not tok:
        print("no token", flush=True)
        return 0
    store = load()
    n = 0
    for branch in (1, 2, 3, 4):
        for study in (0, 1, 2):
            page = 0
            while page < 40:
                js = post(host, f"/v2api/{branch}/customer/index", {"page": page, "pageSize": 50, "is_study": study}, tok)
                items = js.get("items") or []
                for it in items:
                    apply(store, it, branch, archived=(study == 2))
                    n += 1
                if len(items) < 50:
                    break
                page += 1
                time.sleep(0.15)
        page = 0
        while page < 20:
            try:
                js = post(host, f"/v2api/{branch}/customer/index", {"page": page, "pageSize": 50, "removed": 1}, tok)
            except Exception as err:
                print("removed", branch, err, flush=True)
                break
            items = js.get("items") or []
            for it in items:
                apply(store, it, branch, archived=True)
                n += 1
            if len(items) < 50:
                break
            page += 1
            time.sleep(0.15)
    store["lastCrmSync"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    store["items"].sort(key=lambda d: d.get("updatedAt") or "", reverse=True)
    save(store)
    print("synced", n, "last", store["lastCrmSync"], flush=True)
    return n


def parse_iso(raw):
    s = str(raw or "").strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def main():
    print("sync-dossiers start, weekly CRM → site only", flush=True)
    while True:
        store = load()
        now = datetime.now(timezone.utc)
        nxt = parse_iso(store.get("nextCrmSync"))
        last = store.get("lastCrmSync")
        should = (not last) or (nxt is None) or (now >= nxt)
        if should:
            try:
                sync_once(env())
            except Exception as err:
                print("sync error", err, flush=True)
            store = load()
            store["nextCrmSync"] = (datetime.now(timezone.utc) + timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
            save(store)
            print("next auto", store["nextCrmSync"], flush=True)
        store = load()
        nxt = parse_iso(store.get("nextCrmSync"))
        now = datetime.now(timezone.utc)
        wait = EVERY
        if nxt:
            wait = max(60.0, (nxt - now).total_seconds())
        wait = min(wait, 3600.0)
        time.sleep(wait)


if __name__ == "__main__":
    main()
