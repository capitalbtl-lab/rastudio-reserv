import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { alfaLinkOf, alfaLinked, type AlfaLinkMode } from "./crm-alfa-link-core";

export type { AlfaLinkMode };
export { ALFA_LINK_MODES, alfaLinked, alfaLinkOf } from "./crm-alfa-link-core";

export type AlfaLinkState = { mode: AlfaLinkMode; at: string };

function fileOf() {
  return join(process.cwd(), "storage", "crm-alfa-link.json");
}

export function loadAlfaLink(): AlfaLinkState {
  try {
    if (!existsSync(fileOf())) return { mode: "linked", at: "" };
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<AlfaLinkState>;
    return { mode: alfaLinkOf(raw.mode), at: String(raw.at || "") };
  } catch {
    return { mode: "linked", at: "" };
  }
}

export function saveAlfaLink(mode: AlfaLinkMode): AlfaLinkState {
  const next: AlfaLinkState = { mode: alfaLinkOf(mode), at: new Date().toISOString() };
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify(next, null, 0), "utf8");
  return next;
}

export function alfaLinkedNow() {
  return alfaLinked(loadAlfaLink().mode);
}

/** «Обновить» и fresh — только в режиме «С AlfaCRM». */
export function wantAlfaPull(fresh?: unknown) {
  return Boolean(fresh) && alfaLinkedNow();
}
