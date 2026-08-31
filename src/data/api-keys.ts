import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { logAdmin } from "./admin-settings";

export type ApiKind = "llm" | "telephony" | "crm" | "other";
export type ApiField = { key: string; label: string; secret?: boolean; value: string };
export type ApiConn = {
  id: string;
  kind: ApiKind;
  name: string;
  enabled: boolean;
  fields: ApiField[];
};

type Catalog = { id: string; kind: ApiKind; name: string; hint: string; fields: Omit<ApiField, "value">[] };

export const API_CATALOG: Catalog[] = [
  {
    id: "yandex",
    kind: "llm",
    name: "YandexGPT",
    hint: "Основная модель Олега и Ольги. Ключ из console.yandex.cloud, Folder ID каталога.",
    fields: [
      { key: "YANDEX_API_KEY", label: "API-ключ", secret: true },
      { key: "YANDEX_FOLDER_ID", label: "Folder ID" },
    ],
  },
  {
    id: "deepseek",
    kind: "llm",
    name: "DeepSeek (запасной)",
    hint: "Если Yandex не ответил — чат уходит сюда. Ключ с platform.deepseek.com.",
    fields: [{ key: "DEEPSEEK_API_KEY", label: "API-ключ", secret: true }],
  },
  {
    id: "novofon",
    kind: "telephony",
    name: "Novofon",
    hint: "Запись звонков и статистика. User key и secret из кабинета Novofon / API.",
    fields: [
      { key: "NOVOFON_USER_KEY", label: "User key" },
      { key: "NOVOFON_SECRET", label: "Secret", secret: true },
    ],
  },
  {
    id: "alfacrm",
    kind: "crm",
    name: "AlfaCRM",
    hint: "Группы, лиды, пробные, личные дела. Хост s20.online, почта роли API, ключ v2api.",
    fields: [
      { key: "ALFACRM_HOST", label: "Хост" },
      { key: "ALFACRM_EMAIL", label: "E-mail" },
      { key: "ALFACRM_API_KEY", label: "Ключ API v2", secret: true },
      { key: "ALFACRM_APP_KEY", label: "X-APP-KEY", secret: true },
    ],
  },
];

const KINDS: ApiKind[] = ["llm", "telephony", "crm", "other"];

function fileOf() {
  return join(process.cwd(), "storage", "api-keys.json");
}

function nid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function blankFromCatalog(): ApiConn[] {
  return API_CATALOG.map((c) => ({
    id: c.id,
    kind: c.kind,
    name: c.name,
    enabled: true,
    fields: c.fields.map((f) => ({ ...f, value: "" })),
  }));
}

export function loadApiConns(): ApiConn[] {
  const base = blankFromCatalog();
  try {
    if (!existsSync(fileOf())) return base;
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as { conns?: ApiConn[] };
    const have = Array.isArray(raw.conns) ? raw.conns : [];
    const byId = new Map(have.map((c) => [c.id, c]));
    const out = base.map((b) => {
      const s = byId.get(b.id);
      if (!s) return b;
      return {
        ...b,
        enabled: s.enabled !== false,
        name: s.name || b.name,
        fields: b.fields.map((f) => ({ ...f, value: s.fields?.find((x) => x.key === f.key)?.value || f.value })),
      };
    });
    for (const c of have) {
      if (out.some((x) => x.id === c.id)) continue;
      out.push({
        id: String(c.id || nid()).slice(0, 40),
        kind: KINDS.includes(c.kind) ? c.kind : "other",
        name: String(c.name || "Сервис").slice(0, 80),
        enabled: c.enabled !== false,
        fields: (c.fields || []).map((f) => ({
          key: String(f.key || "KEY").slice(0, 60),
          label: String(f.label || f.key || "Ключ").slice(0, 80),
          secret: Boolean(f.secret),
          value: String(f.value || ""),
        })),
      });
    }
    return out;
  } catch {
    return base;
  }
}

function saveApiConns(list: ApiConn[]) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify({ conns: list }, null, 2), "utf8");
}

export function valueForEnv(key: string) {
  for (const c of loadApiConns()) {
    if (!c.enabled) continue;
    const hit = c.fields.find((f) => f.key === key && f.value.trim());
    if (hit) return hit.value.trim();
  }
  return "";
}

function mask(value: string, secret?: boolean) {
  if (!secret || !value) return value;
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

function publicConns() {
  return loadApiConns().map((c) => ({
    ...c,
    fields: c.fields.map((f) => ({ ...f, value: mask(f.value, f.secret), set: Boolean(f.value) })),
    hint: API_CATALOG.find((x) => x.id === c.id)?.hint || "",
  }));
}

function mergeFields(prev: ApiField[], next: ApiField[]) {
  const byKey = new Map(prev.map((f) => [f.key, f]));
  return next.map((f) => {
    const old = byKey.get(f.key);
    const incoming = String(f.value || "");
    const keepOld = incoming.startsWith("••••") || incoming === "";
    return {
      key: String(f.key || "").slice(0, 60),
      label: String(f.label || f.key).slice(0, 80),
      secret: Boolean(f.secret),
      value: keepOld && old ? old.value : incoming,
    };
  });
}

export const adminApiKeys = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        action: "list" | "save" | "add" | "remove" | "toggle";
        id?: string;
        name?: string;
        kind?: ApiKind;
        conn?: ApiConn;
        fieldKey?: string;
        fieldLabel?: string;
        fieldValue?: string;
        secret?: boolean;
      },
  )
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const pack = () => ({ ok: true as const, conns: publicConns(), catalog: API_CATALOG });
    if (data.action === "list") return pack();
    const list = loadApiConns();
    if (data.action === "toggle" && data.id) {
      saveApiConns(list.map((c) => (c.id === data.id ? { ...c, enabled: !c.enabled } : c)));
      logAdmin(`API ${data.id}: ${list.find((c) => c.id === data.id)?.enabled ? "выкл" : "вкл"}`);
      return pack();
    }
    if (data.action === "remove" && data.id) {
      if (API_CATALOG.some((c) => c.id === data.id)) return { ok: false as const, error: "Базовый слот нельзя удалить — выключите или очистите ключ." };
      saveApiConns(list.filter((c) => c.id !== data.id));
      logAdmin(`API удалён: ${data.id}`);
      return pack();
    }
    if (data.action === "add") {
      const kind = KINDS.includes(data.kind as ApiKind) ? (data.kind as ApiKind) : "other";
      const id = `custom-${nid()}`;
      const conn: ApiConn = {
        id,
        kind,
        name: String(data.name || "Новый сервис").slice(0, 80),
        enabled: true,
        fields: [
          { key: String(data.fieldKey || "API_KEY").slice(0, 60), label: String(data.fieldLabel || "Ключ").slice(0, 80), secret: data.secret !== false, value: String(data.fieldValue || "") },
        ],
      };
      saveApiConns([...list, conn]);
      logAdmin(`API добавлен: ${conn.name}`);
      return pack();
    }
    if (data.action === "save" && data.conn) {
      const incoming = data.conn;
      const i = list.findIndex((c) => c.id === incoming.id);
      if (i < 0) {
        list.push({
          id: String(incoming.id || nid()).slice(0, 40),
          kind: KINDS.includes(incoming.kind) ? incoming.kind : "other",
          name: String(incoming.name || "Сервис").slice(0, 80),
          enabled: incoming.enabled !== false,
          fields: mergeFields([], incoming.fields || []),
        });
      } else {
        list[i] = {
          ...list[i],
          name: String(incoming.name || list[i].name).slice(0, 80),
          enabled: incoming.enabled !== false,
          fields: mergeFields(list[i].fields, incoming.fields || []),
        };
      }
      saveApiConns(list);
      logAdmin(`API сохранён: ${incoming.name || incoming.id}`);
      return pack();
    }
    return { ok: false as const, error: "Неизвестное действие." };
  });
