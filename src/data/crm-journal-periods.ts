/** Полугодия журнала группы: узкое окно в Alfa, чтобы запрос успевал. */

export type HalfPeriod = { key: string; from: string; to: string; label: string };

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export function journalPeriods(now = new Date(), years = 6): HalfPeriod[] {
  const out: HalfPeriod[] = [];
  let y = now.getFullYear();
  let h: 1 | 2 = now.getMonth() < 6 ? 1 : 2;
  for (let i = 0; i < years * 2; i += 1) {
    out.push({
      key: `${y}-${h}`,
      from: h === 1 ? `01.01.${y}` : `01.07.${y}`,
      to: h === 1 ? `30.06.${y}` : `31.12.${y}`,
      label: h === 1 ? `янв–июн ${y}` : `июл–дек ${y}`,
    });
    if (h === 1) {
      y -= 1;
      h = 2;
    } else h = 1;
  }
  return out;
}

export function parseLessonDate(raw?: string) {
  const s = String(raw || "").trim();
  const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (ru) return new Date(Number(ru[3]), Number(ru[2]) - 1, Number(ru[1]));
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return null;
}

function fmtMonth(d: Date) {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function spanOf(calendar: { date?: string }[] | undefined) {
  let min: Date | null = null;
  let max: Date | null = null;
  for (const l of calendar || []) {
    const d = parseLessonDate(l.date);
    if (!d) continue;
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  }
  return { from: min ? fmtMonth(min) : "", to: max ? fmtMonth(max) : "", lessons: (calendar || []).length };
}

export function periodOfDate(d: Date) {
  const h = d.getMonth() < 6 ? 1 : 2;
  return `${d.getFullYear()}-${h}`;
}

export function inferredPeriodKeys(calendar: { date?: string }[] | undefined, stored?: string[]) {
  const set = new Set(stored || []);
  for (const l of calendar || []) {
    const d = parseLessonDate(l.date);
    if (d) set.add(periodOfDate(d));
  }
  return [...set];
}

export function nextPeriod(done: string[], periods = journalPeriods()) {
  const have = new Set(done);
  return periods.find((p) => !have.has(p.key)) || null;
}

export function inPeriod(date: string | undefined, from: string, to: string) {
  const d = parseLessonDate(date);
  const a = parseLessonDate(from);
  const b = parseLessonDate(to);
  if (!d || !a || !b) return false;
  return d >= a && d <= b;
}
