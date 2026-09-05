/** Формат телефона без AlfaCRM и без node:fs — можно на клиенте. */

export function formatRuPhone(raw: string) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("9")) d = `7${d}`;
  if (d.length === 11 && d.startsWith("8")) d = `7${d.slice(1)}`;
  if (d.length === 11 && d.startsWith("7")) {
    return `+7(${d.slice(1, 4)})${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
  }
  return String(raw || "").trim();
}
