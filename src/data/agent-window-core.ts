/** Видимость окна на сайте. Кнопки-чипы — CHIP_IDS. Не отладка. */

export const SITE_WINDOW_IDS = [
  "showChat",
  "allowVoice",
  "allowAdminMode",
  "showChips",
  "allowOlga",
  "allowOleg",
  "allowReset",
  "allowBarge",
] as const;

export const FRAME_WINDOW_IDS = [
  "showChat",
  "allowVoice",
  "allowAdminMode",
  "allowOlga",
  "allowOleg",
  "allowReset",
  "allowBarge",
] as const;

export const CHIP_IDS = ["showChips", "matchChipsToMessage"] as const;

export type SiteWindowId = (typeof SITE_WINDOW_IDS)[number];

export function siteFlagsAllOff(s: Record<string, unknown>) {
  return SITE_WINDOW_IDS.every((id) => s[id] === false);
}

export function repairSiteFlags(s: Record<string, unknown>, defaults: Record<SiteWindowId, boolean>) {
  if (!siteFlagsAllOff(s)) return s;
  const next: Record<string, unknown> = { ...s };
  for (const id of SITE_WINDOW_IDS) next[id] = defaults[id];
  return next;
}
