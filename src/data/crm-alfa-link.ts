import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  alfaLinkOf,
  alfaLinked,
  alfaSyncOf,
  deltaAllowed,
  exportOpPushChannel,
  pullAllowed,
  pullFreshAllowed,
  pushAllowed,
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
  deltaAllowed,
  pullAllowed,
  pushAllowed,
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
  const flags = alfaSyncOf(patch, cur);
  const next: AlfaLinkState = {
    ...cur,
    ...flags,
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
  return pullFreshAllowed(loadAlfaLink(), fresh);
}

export function wantAlfaDelta(delta?: unknown) {
  return deltaAllowed(loadAlfaLink(), delta);
}

export function wantAlfaPullChannel(ch: AlfaPullCh) {
  return pullAllowed(loadAlfaLink(), ch);
}

export function wantAlfaPush(op: string, body?: Record<string, unknown>) {
  return pushAllowed(loadAlfaLink(), op, body);
}
