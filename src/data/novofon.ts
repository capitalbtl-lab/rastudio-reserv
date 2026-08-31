import { createHmac, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const HOST = "https://api.novofon.com";

export type NovofonKeys = { userKey: string; secret: string };
export type NovofonCall = {
  call_id: string;
  pbx_call_id: string;
  callstart: string;
  clid: string;
  destination: string;
  disposition: string;
  seconds: number;
  is_recorded: boolean;
  sip: string;
};

function keysPath() {
  return join(process.cwd(), "storage", "novofon.json");
}

export function loadNovofonKeys(): NovofonKeys | null {
  const envKey = String(process.env.NOVOFON_USER_KEY || "").trim();
  const envSecret = String(process.env.NOVOFON_SECRET || "").trim();
  if (envKey && envSecret) return { userKey: envKey, secret: envSecret };
  try {
    if (!existsSync(keysPath())) return null;
    const raw = JSON.parse(readFileSync(keysPath(), "utf8")) as Partial<NovofonKeys>;
    if (raw.userKey && raw.secret) return { userKey: String(raw.userKey), secret: String(raw.secret) };
  } catch {
    /* none */
  }
  return null;
}

export function saveNovofonKeys(keys: NovofonKeys) {
  mkdirSync(dirname(keysPath()), { recursive: true });
  writeFileSync(keysPath(), JSON.stringify({ userKey: keys.userKey.trim(), secret: keys.secret.trim() }, null, 2));
}

function queryString(params: Record<string, string>) {
  return Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`.replace(/%20/g, "+"))
    .join("&");
}

function signs(method: string, qs: string, secret: string) {
  const md5 = createHash("md5").update(qs).digest("hex");
  const payload = method + qs + md5;
  return [
    Buffer.from(createHmac("sha1", secret).update(payload).digest("hex")).toString("base64"),
    createHmac("sha1", secret).update(payload).digest("base64"),
  ];
}

export async function novofonGet<T>(path: string, params: Record<string, string>, keys: NovofonKeys): Promise<T> {
  const qs = queryString(params);
  const url = `${HOST}${path}${qs ? `?${qs}` : ""}`;
  let last = "";
  for (const sign of signs(path, qs, keys.secret)) {
    const res = await fetch(url, { headers: { Authorization: `${keys.userKey}:${sign}` } });
    last = await res.text();
    try {
      const json = JSON.parse(last) as T & { status?: string; message?: string };
      if (json && json.status !== "error") return json;
    } catch {
      /* next sign */
    }
  }
  throw new Error(last.slice(0, 240) || "novofon");
}

export async function listRecordedCalls(start: string, end: string, keys: NovofonKeys) {
  const out: NovofonCall[] = [];
  for (let skip = 0; skip < 20000; skip += 1000) {
    const json = await novofonGet<{ stats?: Record<string, unknown>[] }>("/v1/statistics/pbx/", {
      start,
      end,
      version: "2",
      skip: String(skip),
      limit: "1000",
    }, keys);
    const rows = json.stats || [];
    for (const row of rows) {
      const rec = Boolean(row.is_recorded === true || row.is_recorded === "true" || row.is_recorded === 1);
      const seconds = Number(row.seconds || 0);
      if (!rec || seconds < 15) continue;
      out.push({
        call_id: String(row.call_id || ""),
        pbx_call_id: String(row.pbx_call_id || ""),
        callstart: String(row.callstart || ""),
        clid: String(row.clid || ""),
        destination: String(row.destination || ""),
        disposition: String(row.disposition || ""),
        seconds,
        is_recorded: true,
        sip: String(row.sip || ""),
      });
    }
    if (rows.length < 1000) break;
  }
  return out;
}

export async function recordLink(call: NovofonCall, keys: NovofonKeys) {
  const params: Record<string, string> = { lifetime: "3600" };
  if (call.pbx_call_id) params.pbx_call_id = call.pbx_call_id;
  else if (call.call_id) params.call_id = call.call_id;
  const json = await novofonGet<{ link?: string; links?: string[] }>("/v1/pbx/record/request/", params, keys);
  const links = [...(json.links || []), json.link || ""].filter(Boolean);
  return links[0] || "";
}

export function monthWindows(monthsBack = 24) {
  const windows: { start: string; end: string }[] = [];
  const now = new Date();
  for (let i = 0; i < monthsBack; i++) {
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1, 0, 0, 0);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
    windows.push({ start: fmt(start), end: fmt(end) });
  }
  return windows;
}