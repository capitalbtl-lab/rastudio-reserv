/** Время занятия в карточке: час:минута + длительность → «до». */

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function splitHm(raw: string) {
  const m = String(raw || "").match(/^(\d{1,2}):(\d{2})/);
  return { h: m ? Number(m[1]) : -1, min: m ? Number(m[2]) : -1 };
}

export function joinHm(h: number, min: number) {
  if (h < 0 || min < 0) return "";
  return `${pad2(h)}:${pad2(min)}`;
}

export function addMinsHm(hhmm: string, mins: number) {
  const { h, min } = splitHm(hhmm);
  if (h < 0) return "";
  const t = (((h * 60 + min + Number(mins || 0)) % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`;
}

export const HOUR_OPTS = Array.from({ length: 16 }, (_, i) => i + 7).map((h) => ({ value: String(h), label: pad2(h) }));
export const MIN_OPTS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => ({ value: String(m), label: pad2(m) }));
export const DUR_OPTS = [45, 60, 90, 120, 150, 180].map((n) => ({ value: String(n), label: `${n} мин` }));
