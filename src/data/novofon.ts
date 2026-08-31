import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const DATA_API = "https://dataapi-jsonrpc.novofon.ru/v2.0";

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
  file?: string;
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
    if (raw.secret) return { userKey: String(raw.userKey || ""), secret: String(raw.secret) };
  } catch {
    /* none */
  }
  return null;
}

export function saveNovofonKeys(keys: NovofonKeys) {
  mkdirSync(dirname(keysPath()), { recursive: true });
  writeFileSync(keysPath(), JSON.stringify({ userKey: keys.userKey.trim(), secret: keys.secret.trim() }, null, 2));
}

async function rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const res = await fetch(DATA_API, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "1", method, params }),
  });
  const json = (await res.json()) as {
    result?: T;
    error?: { message?: string; data?: { mnemonic?: string; params?: { ip?: string } } };
  };
  if (json.error) {
    const mnemonic = json.error.data?.mnemonic || "";
    if (mnemonic === "ip_not_whitelisted") {
      throw new Error("IP 83.222.25.109 не в белом списке Novofon. Настройки → Правила и настройки безопасности → API — добавьте этот адрес.");
    }
    if (mnemonic === "access_token_invalid") {
      throw new Error("Ключ Novofon не принят. Проверьте Secret от техподдержки.");
    }
    throw new Error(json.error.message || mnemonic || "novofon");
  }
  if (!json.result) throw new Error("novofon пустой ответ");
  return json.result;
}

type ReportRow = {
  communication_id?: number | string;
  start_time?: string;
  contact_phone_number?: string;
  destination?: string | number;
  direction?: string;
  talk_duration?: number;
  total_duration?: number;
  call_records?: string[];
  full_record_file_link?: string;
  is_lost?: boolean;
};

export async function listRecordedCalls(start: string, end: string, keys: NovofonKeys) {
  const out: NovofonCall[] = [];
  for (let offset = 0; offset < 20000; offset += 500) {
    const result = await rpc<{ data?: ReportRow[] }>("get.calls_report", {
      access_token: keys.secret,
      date_from: start,
      date_till: end,
      limit: 500,
      offset,
      fields: [
        "communication_id",
        "start_time",
        "contact_phone_number",
        "destination",
        "direction",
        "talk_duration",
        "call_records",
        "full_record_file_link",
      ],
    });
    const rows = result.data || [];
    for (const row of rows) {
      const seconds = Number(row.talk_duration || 0);
      const recId = row.call_records?.[0] || "";
      const file =
        row.full_record_file_link ||
        (row.communication_id && recId
          ? `https://app.novofon.ru/system/media/talk/${row.communication_id}/${recId}/`
          : "");
      if (!file || seconds < 15) continue;
      const id = String(row.communication_id || recId);
      out.push({
        call_id: id,
        pbx_call_id: id,
        callstart: String(row.start_time || start),
        clid: String(row.contact_phone_number || ""),
        destination: String(row.destination || ""),
        disposition: "answered",
        seconds,
        is_recorded: true,
        sip: String(row.direction || ""),
        file,
      });
    }
    if (rows.length < 500) break;
  }
  return out;
}

export async function recordLink(call: NovofonCall, _keys: NovofonKeys) {
  return call.file || "";
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