/** Сообщения 502/500/nginx в кабинете — не HTML и не JSON движка. */

export function tidyHttpError(raw: unknown, fallback = "Не удалось выполнить запрос."): string {
  const s = typeof raw === "string" ? raw : raw instanceof Error ? raw.message : raw == null ? "" : String(raw);
  if (!s.trim()) return fallback;
  if (/"unhandled"\s*:\s*true/i.test(s) || (/"status"\s*:\s*500/.test(s) && /"error"\s*:\s*true/.test(s))) {
    return "Кабинет перезапускается. Обновите страницу через несколько секунд.";
  }
  if (/<!DOCTYPE|<html|502 Bad Gateway|504 Gateway|nginx/i.test(s)) {
    return "Сервер не ответил вовремя. Кабинет мог перезапуститься — обновите страницу и повторите. Данные на сайте не пропали.";
  }
  if (/node:fs|readFileSync|externalized for browser/i.test(s)) {
    return "Кабинет обновляется. Обновите страницу.";
  }
  if (/^[{[]/.test(s.trim()) && s.length > 80) return fallback;
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 280) || fallback;
}

export function isTransientHttp(raw: unknown): boolean {
  const s = String(raw instanceof Error ? raw.message : raw || "");
  return /502|504|Bad Gateway|Gateway Time|unhandled|status.:.?500|перезапуск|не ответил/i.test(s);
}
