import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);
const HOST = (env.ALFACRM_HOST || "https://studiyarazvivaysya.s20.online").replace(/\/$/, "");

const auth = await fetch(`${HOST}/v2api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: env.ALFACRM_EMAIL, api_key: env.ALFACRM_API_KEY }),
}).then((r) => r.json());
const tok = auth.token;

async function req(path, body = {}) {
  const r = await fetch(`${HOST}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-ALFACRM-TOKEN": tok },
    body: JSON.stringify(body),
  });
  return r.json();
}

const login = await fetch(`${HOST}/login`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    "LoginForm[username]": env.ALFACRM_EMAIL,
    "LoginForm[password]": env.ALFACRM_WEB_PASSWORD || "",
    "LoginForm[rememberMe]": "1",
  }),
  redirect: "manual",
});
const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");

function checkedIds(html, field) {
  const re = new RegExp(`name="Tariff\\[${field}\\]\\[\\]" value="(\\d+)"([^>]*)>`, "gi");
  const ids = [];
  for (const m of html.matchAll(re)) {
    if (/checked/i.test(m[0])) ids.push(Number(m[1]));
  }
  return [...new Set(ids)];
}

async function card(id) {
  for (const company of [2, 1, 3, 4]) {
    const res = await fetch(`${HOST}/company/${company}/tariff/update?id=${id}`, {
      headers: { Cookie: cookie, Accept: "text/html" },
      redirect: "manual",
    });
    const html = await res.text();
    if (res.status !== 200 || /LoginForm/i.test(html) || !html.includes("Tariff[subject_ids]")) continue;
    return {
      subjectIds: checkedIds(html, "subject_ids"),
      lessonTypeIds: checkedIds(html, "lesson_type_ids"),
      ok: true,
    };
  }
  return { subjectIds: [], lessonTypeIds: [], ok: false };
}

const byId = new Map();
for (const b of [1, 2, 3, 4]) {
  const j = await req(`/v2api/${b}/tariff/index`, { page: 0, pageSize: 300 });
  for (const row of j.items || []) {
    const id = Number(row.id);
    if (!id) continue;
    const prev = byId.get(id) || {};
    byId.set(id, {
      ...prev,
      ...row,
      id,
      branch_ids: [...new Set([...(prev.branch_ids || []), ...(row.branch_ids || []), b])],
    });
  }
}

const lt = await req("/v2api/2/lesson-type/index", { page: 0, pageSize: 50 });
const lessonTypes = (lt.items || [])
  .map((x) => ({ id: Number(x.id), name: String(x.name || "") }))
  .filter((x) => x.id && x.name);

const rows = [...byId.values()].sort((a, b) => a.id - b.id);

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function w() {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, () => w()));
  return out;
}

const cards = await pool(rows, 5, (r) => card(Number(r.id)));
const items = rows.map((row, i) => {
  const c = cards[i];
  return {
    id: Number(row.id),
    name: String(row.name || "").trim(),
    price: Number(row.price || 0),
    lessonsCount: Number(row.lessons_count || 0),
    duration: Number(row.duration || 0),
    type: Number(row.type || 1),
    archive: Boolean(Number(row.is_archive)),
    branchIds: [...new Set((row.branch_ids || []).map(Number).filter(Boolean))],
    subjectIds: c.subjectIds,
    lessonTypeIds: c.lessonTypeIds,
    eDate: String(row.e_date || ""),
    added: String(row.added || ""),
    cardOk: c.ok,
  };
});

mkdirSync("storage", { recursive: true });
writeFileSync("storage/crm-tariffs.json", JSON.stringify({ at: new Date().toISOString(), items, lessonTypes }, null, 2));
const active = items.filter((t) => !t.archive);
const t179 = items.find((t) => t.id === 179);
console.log(
  JSON.stringify({
    n: items.length,
    active: active.length,
    withSub: active.filter((t) => t.subjectIds.length).length,
    fail: items.filter((t) => !t.cardOk).length,
    t179: t179 && { subjectIds: t179.subjectIds, lessonTypeIds: t179.lessonTypeIds },
  }),
);
