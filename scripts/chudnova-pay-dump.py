#!/usr/bin/env python3
"""Разово: чем API видит платежи 19764-66 и кассы токена. Не очередь, не диск."""
import json
import urllib.error
import urllib.request

IDS = (19764, 19765, 19766)
BRANCHES = (1, 2, 3, 4)


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
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"http": e.code, "raw": e.read().decode("utf-8", "replace")[:300]}


def items_of(j):
    raw = j.get("items") if isinstance(j, dict) else []
    if isinstance(raw, dict):
        raw = list(raw.values())
    return [x for x in (raw or []) if isinstance(x, dict)]


def main():
    e = env()
    host = (e.get("ALFACRM_HOST") or "https://studiyarazvivaysya.s20.online").rstrip("/")
    email = e.get("ALFACRM_EMAIL") or ""
    key = e.get("ALFACRM_API_KEY") or ""
    auth = post(host, "/v2api/auth/login", {"email": email, "api_key": key})
    token = auth.get("token") or (auth.get("data") or {}).get("token") or ""
    print("api email", email)
    print("token", "ok" if token else auth)
    if not token:
        return
    for b in BRANCHES:
        j = post(host, f"/v2api/{b}/pay-account/index", {"page": 0}, token)
        print("кассы филиал", b, "total", j.get("total"), "http", j.get("http"))
        for x in items_of(j)[:20]:
            print(" ", x.get("id"), x.get("name") or x.get("title"), "branch", x.get("branch_id"))
    u = post(host, "/v2api/1/user/index", {"email": email, "page": 0}, token)
    users = items_of(u)
    if users:
        x = users[0]
        print("user", x.get("id"), "pay_account_ids", x.get("pay_account_ids"), "branch_ids", x.get("branch_ids"))
    else:
        print("user empty", u.get("http") or u.get("total"))
    c = post(host, "/v2api/1/customer/index", {"id": 670, "page": 0}, token)
    cust = items_of(c)
    if cust:
        x = cust[0]
        print("cid670", x.get("id"), x.get("name"), "study", x.get("is_study"), "branch", x.get("branch_id"))
    for pid in IDS:
        for b in BRANCHES:
            j = post(host, f"/v2api/{b}/pay/index", {"id": pid, "page": 0}, token)
            rows = items_of(j)
            if not rows:
                print("pay", pid, "branch", b, "empty total", j.get("total"), "http", j.get("http"))
                continue
            x = rows[0]
            print(
                "pay",
                pid,
                "branch",
                b,
                "cid",
                x.get("customer_id"),
                "type",
                x.get("pay_type_id"),
                "acc",
                x.get("pay_account_id"),
                "loc",
                x.get("location_id"),
                "bid",
                x.get("branch_id"),
                "date",
                x.get("document_date"),
                "income",
                x.get("income"),
                "note",
                str(x.get("note") or "")[:40],
            )


if __name__ == "__main__":
    main()
