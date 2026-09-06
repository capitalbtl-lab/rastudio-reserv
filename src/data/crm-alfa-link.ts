import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  alfaLinkOf,
  alfaLinked,
  alfaSyncOf,
  exportOpPushChannel,
  type AlfaLinkMode,
  type AlfaPullCh,
  type AlfaPushCh,
  type AlfaSyncFlags,
} from "./crm-alfa-link-core";

export type { AlfaLinkMode, AlfaPullCh, AlfaPushCh, AlfaSyncFlags };
export {
  ALFA_LINK_MODES,
  ALFA_PULL_CH,
  ALFA_PUSH_CH,
  ALFA_SYNC_DEFAULT,
  alfaLinked,
  alfaLinkOf,
  alfaSyncOf,
  exportOpPushChannel,
} from "./crm-alfa-link-core";

export type AlfaLinkState = { mode: AlfaLinkMode; at: string } & AlfaSyncFlags;

function fileOf() {
  return join(process.cwd(), "storage", "crm-alfa-link.json");
}

function emptyLink(): AlfaLinkState {
  return { mode: "linked", at: "", ...alfaSyncOf(null) };
}

export function loadAlfaLink(): AlfaLinkState {
  try {
    if (!existsSync(fileOf())) return emptyLink();
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<AlfaLinkState>;
    return { mode: alfaLinkOf(raw.mode), at: String(raw.at || ""), ...alfaSyncOf(raw) };
  } catch {
    return emptyLink();
  }
}

export function saveAlfaLink(raw: AlfaLinkMode | Partial<AlfaLinkState> | string | null | undefined): AlfaLinkState {
  const cur = loadAlfaLink();
  const patch = typeof raw === "object" && raw ? raw : { mode: alfaLinkOf(raw) };
  const next: AlfaLinkState = {
    ...cur,
    ...alfaSyncOf({ ...cur, ...patch }),
    mode: patch.mode ? alfaLinkOf(patch.mode) : cur.mode,
    at: new Date().toISOString(),
  };
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify(next, null, 0), "utf8");
  return next;
}

export function alfaLinkedNow() {
  return alfaLinked(loadAlfaLink().mode);
}

/** «Обновить» и fresh — режим «Фон с AlfaCRM». */
export function wantAlfaPull(fresh?: unknown) {
  return Boolean(fresh) && alfaLinkedNow();
}

/** Дельта лидов — фон, если канал «Лиды» включён. */
export function wantAlfaDelta(delta?: unknown) {
  if (!Boolean(delta) || !alfaLinkedNow()) return false;
  return loadAlfaLink().pull.leads !== false;
}

export function wantAlfaPullChannel(ch: AlfaPullCh) {
  if (!alfaLinkedNow()) return false;
  return loadAlfaLink().pull[ch] !== false;
}

export function wantAlfaPush(op: string, body?: Record<string, unknown>) {
  if (!alfaLinkedNow()) return false;
  const ch = exportOpPushChannel(op, body);
  return loadAlfaLink().push[ch] !== false;
}
