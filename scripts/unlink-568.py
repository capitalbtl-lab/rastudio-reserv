#!/usr/bin/env python3
"""Разово: группа 568 / филиал 2 — снять group_ids с сирот с 12.09.2026. Регулярку и 55050 не трогать."""
import json, time, urllib.request

BRANCH, GROUP, SKIP, PAGE = 2, 568, 55050, 200
DATES = ["12.09.2026", "2026-09-12"]

def env():
    out = {}
    for line in open(".env"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out

def post(host, path, body, token=""):
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        h["X-ALFACRM-TOKEN"] = token
    req = urllib.request.Request(
        host + path, data=json.dumps(body).encode(), headers=h, method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def items_of(d):
    raw = d.get("items") if isinstance(d, dict) else []
    if isinstance(raw, dict):
        raw = list(raw.values())
    return [x for x in (raw or []) if isinstance(x, dict)]

def main():
    e = env()
    host = (e.get("ALFACRM_HOST") or "https://studiyarazvivaysya.s20.online").rstrip("/")
    token = post(host, "/v2api/auth/login", {"email": e.get("ALFACRM_EMAIL") or "", "api_key": e.get("ALFACRM_API_KEY") or ""}).get("token") or ""
    found, used = [], ""
    for date_from in DATES:
        found, page = [], 0
        while True:
            pack = items_of(post(host, f"/v2api/{BRANCH}/lesson/index", {"group_id": GROUP, "status": 1, "date_from": date_from, "page": page, "pageSize": PAGE}, token))
            print(f"index page={page} date={date_from} n={len(pack)}")
            found.extend(pack)
            if len(pack) < PAGE:
                break
            page += 1
        used = date_from
        if found:
            break
    print(f"найдено {len(found)} date={used}")
    to_upd, skipped, seen = [], [], set()
    for it in found:
        lid = int(it.get("id") or 0)
        if not lid or lid in seen:
            skipped.append((lid, "нет id/дубль"))
            continue
        seen.add(lid)
        st = int(it.get("status") or 0)
        rid = it.get("regular_id")
        rid_n = int(rid) if str(rid or "").strip().lstrip("-").isdigit() else 0
        date = it.get("date") or it.get("lesson_date") or ""
        if lid == SKIP:
            skipped.append((lid, f"регулярка 55050 {date}"))
        elif st == 3:
            skipped.append((lid, f"status 3 {date}"))
        elif rid_n > 0:
            skipped.append((lid, f"regular_id {rid_n} {date}"))
        else:
            print(f"разовый {lid} {date}")
            to_upd.append(lid)
    print(f"к обновлению {len(to_upd)}: {to_upd}")
    ok, fail = [], []
    for i, lid in enumerate(to_upd):
        try:
            res = post(host, f"/v2api/{BRANCH}/lesson/update?id={lid}", {"id": lid, "group_ids": []}, token)
            ok.append(lid)
            print("ok", lid, json.dumps(res)[:160])
        except Exception as ex:
            fail.append((lid, str(ex)[:200]))
            print("FAIL", lid, ex)
        if i + 1 < len(to_upd):
            time.sleep(5)
    print("--- отчёт ---")
    print("найдено", len(found))
    print("сняли группу", ok)
    print("ошибки", fail)
    print("пропуск", skipped)

if __name__ == "__main__":
    main()
