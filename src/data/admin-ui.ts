/** Светло-голубой фон панелей кабинета (подробности группы и дальше). */
export const ADMIN_PANEL_BLUE = "#e8f3fc";

/** Оболочка всплывающих окон и меню: небольшое закругление, никогда квадрат. */
export const RA_POP =
  "ra-pop rounded-[8px] overflow-hidden bg-white shadow-[0_12px_32px_rgba(15,23,42,0.18)] ring-1 ring-black/10";

/** Год в дате — только 4 цифры (Chrome иначе даёт 20266). */
export const ISO_DATE_MIN = "1900-01-01";
export const ISO_DATE_MAX = "2099-12-31";
export function clampIsoDate(v: string) {
  const raw = String(v || "");
  const m = raw.match(/^(\d{0,6})-(\d{0,2})-(\d{0,2})/);
  if (!m) return raw.slice(0, 10);
  const year = m[1].slice(0, 4);
  const month = (m[2] || "").slice(0, 2);
  const day = (m[3] || "").slice(0, 2);
  const y = year.length === 4 ? String(Math.min(2099, Math.max(1900, Number(year) || 1900))) : year;
  return [y, month, day].filter((p) => p !== "").join("-");
}
