/** Лента канала. Правда на диске. Alfa communication — вход, не F5. */

import type { CustomerComm } from "./crm-cards";
import type { CrmActorId } from "./crm-actors";

export const COMM_CHANNELS = ["site", "phone", "vk", "max", "telegram", "alfa", "admin"] as const;
export type CommChannel = (typeof COMM_CHANNELS)[number];

export type DiskComm = {
  id: number;
  customerId: number;
  branchId: number;
  channel: string;
  actor: CrmActorId;
  who: string;
  text: string;
  incoming: boolean;
  at: string;
};

export function commChannelOf(raw?: string | null) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "site" || s === "сайт") return "site";
  if (s === "phone" || s === "телефон" || s === "call") return "phone";
  if (s === "vk" || s === "вк" || s === "vkontakte") return "vk";
  if (s === "max") return "max";
  if (s === "telegram" || s === "tg") return "telegram";
  if (s === "admin" || s === "кабинет") return "admin";
  if (s === "alfa" || s === "crm" || s === "alfacrm") return "alfa";
  return s.slice(0, 24) || "site";
}

export function commChannelLabel(raw?: string | null) {
  const id = commChannelOf(raw);
  if (id === "site") return "Сайт";
  if (id === "phone") return "Телефон";
  if (id === "vk") return "ВК";
  if (id === "max") return "MAX";
  if (id === "telegram") return "Telegram";
  if (id === "admin") return "Кабинет";
  if (id === "alfa") return "Alfa";
  return id;
}

export function asCustomerComm(row: DiskComm): CustomerComm {
  return {
    id: Number(row.id) || 0,
    at: String(row.at || ""),
    who: String(row.who || ""),
    channel: String(row.channel || "site"),
    text: String(row.text || ""),
    incoming: Boolean(row.incoming),
  };
}

export function packAlfaComm(it: Record<string, unknown>, customerId: number, branchId: number): DiskComm | null {
  const text = String(it.comment || it.text || it.message || it.body || "").trim();
  if (!text) return null;
  const incoming = Number(it.is_incoming ?? it.incoming ?? 0) === 1 || /входящ|incoming/i.test(String(it.type_name || it.direction || ""));
  const id = Number(it.id || 0) || 0;
  return {
    id,
    customerId,
    branchId,
    channel: commChannelOf(String(it.type_name || it.channel || it.source || it.provider || "alfa")),
    actor: "sync",
    who: String(it.user_name || it.employee_name || it.manager_name || it.user || "Alfa").trim() || "Alfa",
    text,
    incoming,
    at: String(it.date || it.created_at || it.datetime || it.added || new Date().toISOString()),
  };
}

export function mergeCommsInbound(pulled: DiskComm[], prev: DiskComm[] | undefined, holdIds: Iterable<number> = []) {
  const hold = new Set([...holdIds].map(Number).filter((n) => n));
  const map = new Map<string, DiskComm>();
  for (const x of prev || []) {
    const lid = Number(x.id) || 0;
    map.set(lid ? `id:${lid}` : `t:${x.at}|${x.text.slice(0, 40)}`, x);
  }
  for (const p of pulled) {
    const lid = Number(p.id) || 0;
    if (lid < 0 || hold.has(lid)) continue;
    const k = lid ? `id:${lid}` : `t:${p.at}|${p.text.slice(0, 40)}`;
    const cur = map.get(k);
    if (cur && (Number(cur.id) < 0 || hold.has(Number(cur.id)) || cur.actor !== "sync")) continue;
    map.set(k, p);
  }
  return [...map.values()].sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

export function commsFingerprint(rows: DiskComm[]) {
  return (rows || []).map((x) => `${x.id}|${x.at}|${x.incoming ? 1 : 0}|${x.text}`).join(";");
}

export function commsPrompt(rows: DiskComm[], limit = 8) {
  const last = (rows || []).slice(-Math.max(1, limit));
  if (!last.length) return "";
  return `

ЛЕНТА КАНАЛА (диск сайта, не Alfa). Не выдумывай реплик, которых здесь нет:
${last
  .map((x) => `— ${x.incoming ? "родитель" : x.who || "студия"} [${x.channel}]: ${String(x.text || "").slice(0, 280)}`)
  .join("\n")}
`;
}
