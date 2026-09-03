import { serverEnv } from "./server-env";

export function crmHost() {
  return (serverEnv("ALFACRM_HOST") || "https://studiyarazvivaysya.s20.online").replace(/\/$/, "");
}

function webPassword() {
  return (
    serverEnv("ALFACRM_WEB_PASSWORD") ||
    serverEnv("ALFACRM_PASSWORD") ||
    serverEnv("ALFACRM_CRM_PASSWORD") ||
    serverEnv("ALFACRM_API_KEY") ||
    ""
  );
}

export function setCookieList(res: Response) {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === "function") {
    const list = h.getSetCookie();
    if (list?.length) return list;
  }
  const raw = res.headers.get("set-cookie");
  return raw ? [raw] : [];
}

export function mergeCookies(prev: string, set: string[]) {
  const map = new Map<string, string>();
  for (const p of prev.split("; ").filter(Boolean)) {
    const i = p.indexOf("=");
    if (i > 0) map.set(p.slice(0, i), p.slice(i + 1));
  }
  for (const raw of set) {
    const part = raw.split(";")[0];
    const i = part.indexOf("=");
    if (i > 0) map.set(part.slice(0, i), part.slice(i + 1));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

export function csrfOf(html: string) {
  return (
    (html.match(/meta name="csrf-token" content="([^"]+)"/i) || [])[1] ||
    (html.match(/name="_csrf"[^>]*value="([^"]+)"/i) || [])[1] ||
    (html.match(/value="([^"]+)"[^>]*name="_csrf"/i) || [])[1] ||
    ""
  );
}

export async function crmWebLogin() {
  const host = crmHost();
  const email = serverEnv("ALFACRM_EMAIL") || "";
  const pass = webPassword();
  if (!email || !pass) return { cookie: "", error: "Нет пароля кабинета CRM (ALFACRM_WEB_PASSWORD)." };
  const loginUrl = `${host}/site/login`;
  const page = await fetch(loginUrl, { redirect: "manual" });
  let cookie = mergeCookies("", setCookieList(page));
  const html = await page.text();
  const csrf = csrfOf(html);
  const res = await fetch(loginUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
      Origin: host,
      Referer: loginUrl,
    },
    body: new URLSearchParams({
      ...(csrf ? { _csrf: csrf } : {}),
      "LoginForm[username]": email,
      "LoginForm[password]": pass,
      "LoginForm[rememberMe]": "1",
    }),
    redirect: "manual",
  });
  cookie = mergeCookies(cookie, setCookieList(res));
  const loc = res.headers.get("location") || "";
  if (res.status === 302 && loc && !/login/i.test(loc)) {
    const next = loc.startsWith("http") ? loc : `${host}${loc}`;
    const follow = await fetch(next, { headers: { Cookie: cookie }, redirect: "manual" });
    cookie = mergeCookies(cookie, setCookieList(follow));
    return { cookie, error: "" };
  }
  return { cookie: "", error: "Вход в кабинет CRM не удался." };
}
