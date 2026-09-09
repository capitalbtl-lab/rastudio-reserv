/** Кварталы журнала группы. Полугодие и год — пачки из кварталов. */

export type Grain = "quarter" | "half" | "year";
export type JournalChunk = { key: string; from: string; to: string; label: string; keys: string[] };

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

const QMETA = [
  { q: 1, from: "01.01", to: "31.03", label: "I квартал" },
  { q: 2, from: "01.04", to: "30.06", label: "II квартал" },
  { q: 3, from: "01.07", to: "30.09", label: "III квартал" },
  { q: 4, from: "01.10", to: "31.12", label: "IV квартал" },
] as const;

export function journalQuarters(now = new Date(), years = 6): JournalChunk[] {
  const out: JournalChunk[] = [];
  let y = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3) + 1;
  for (let i = 0; i < years * 4; i += 1) {
    const m = QMETA[q - 1];
    const key = `${y}q${q}`;
    out.push({ key, from: `${m.from}.${y}`, to: `${m.to}.${y}`, label: `${m.label} ${y}`, keys: [key] });
    if (q === 1) {
      y -= 1;
      q = 4;
    } else q -= 1;
  }
  return out;
}

/** Старые полугодия YYYY-1 / YYYY-2 → кварталы. */
export function expandPeriodKeys(keys: string[] | undefined) {
  const out = new Set<string>();
  for (const raw of keys || []) {
    const k = String(raw || "");
    const q = k.match(/^(\d{4})q([1-4])$/);
    if (q) {
      out.add(`${q[1]}q${q[2]}`);
      continue;
    }
    const h = k.match(/^(\d{4})-([12])$/);
    if (h) {
      if (h[2] === "1") {
        out.add(`${h[1]}q1`);
        out.add(`${h[1]}q2`);
      } else {
        out.add(`${h[1]}q3`);
        out.add(`${h[1]}q4`);
      }
      continue;
    }
    const y = k.match(/^(\d{4})$/);
    if (y) {
      out.add(`${y[1]}q1`);
      out.add(`${y[1]}q2`);
      out.add(`${y[1]}q3`);
      out.add(`${y[1]}q4`);
    }
  }
  return [...out];
}

export function journalChunks(grain: Grain = "quarter", now = new Date(), years = 6): JournalChunk[] {
  const qs = journalQuarters(now, years);
  if (grain === "quarter") return qs;
  if (grain === "half") {
    const out: JournalChunk[] = [];
    const byY = new Map<string, JournalChunk[]>();
    for (const q of qs) {
      const y = q.key.slice(0, 4);
      const list = byY.get(y) || [];
      list.push(q);
      byY.set(y, list);
    }
    const yearsDesc = [...byY.keys()].sort((a, b) => Number(b) - Number(a));
    for (const y of yearsDesc) {
      const list = byY.get(y) || [];
      const h2 = list.filter((x) => x.key.endsWith("q3") || x.key.endsWith("q4"));
      const h1 = list.filter((x) => x.key.endsWith("q1") || x.key.endsWith("q2"));
      if (h2.length) {
        out.push({
          key: `${y}h2`,
          from: `01.07.${y}`,
          to: `31.12.${y}`,
          label: `июл–дек ${y}`,
          keys: h2.map((x) => x.key),
        });
      }
      if (h1.length) {
        out.push({
          key: `${y}h1`,
          from: `01.01.${y}`,
          to: `30.06.${y}`,
          label: `янв–июн ${y}`,
          keys: h1.map((x) => x.key),
        });
      }
    }
    return out;
  }
  const out: JournalChunk[] = [];
  const seen = new Set<string>();
  for (const q of qs) {
    const y = q.key.slice(0, 4);
    if (seen.has(y)) continue;
    seen.add(y);
    out.push({
      key: y,
      from: `01.01.${y}`,
      to: `31.12.${y}`,
      label: `${y} год`,
      keys: [`${y}q1`, `${y}q2`, `${y}q3`, `${y}q4`],
    });
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
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}q${q}`;
}

export function inferredPeriodKeys(calendar: { date?: string }[] | undefined, stored?: string[]) {
  const set = new Set(expandPeriodKeys(stored));
  for (const l of calendar || []) {
    const d = parseLessonDate(l.date);
    if (d) set.add(periodOfDate(d));
  }
  return [...set];
}

/** Только явно снятые с Alfa порции. Календарь на диске не считается «загружено». */
export function pulledPeriodKeys(fill?: { done?: string[]; pulled?: Record<string, string> } | null) {
  const pulled = expandPeriodKeys(Object.keys(fill?.pulled || {}));
  if (pulled.length) return pulled;
  const stored = expandPeriodKeys(fill?.done);
  if (stored.length === 1) return stored;
  return [];
}

export function chunkDone(chunk: JournalChunk, done: string[]) {
  const have = new Set(done);
  return chunk.keys.every((k) => have.has(k));
}

export function nextChunk(done: string[], grain: Grain = "quarter", now = new Date()) {
  return journalChunks(grain, now).find((c) => !chunkDone(c, done)) || null;
}

export function inPeriod(date: string | undefined, from: string, to: string) {
  const d = parseLessonDate(date);
  const a = parseLessonDate(from);
  const b = parseLessonDate(to);
  if (!d || !a || !b) return false;
  return d >= a && d <= b;
}

export function journalPeriods(now = new Date(), years = 6) {
  return journalQuarters(now, years);
}

export function nextPeriod(done: string[], periods = journalPeriods()) {
  const have = new Set(expandPeriodKeys(done));
  return periods.find((p) => !have.has(p.key)) || null;
}

export function groupAge(from?: string, to?: string, now = new Date()) {
  const start = parseLessonDate(from);
  if (!start) return { id: "unknown" as const, label: "срок неизвестен" };
  const end = parseLessonDate(to) || now;
  const ago = (now.getTime() - start.getTime()) / (30.44 * 86400000);
  const span = Math.max(0, (end.getTime() - start.getTime()) / (30.44 * 86400000));
  if (ago <= 14 && span <= 16) return { id: "young" as const, label: "молодая" };
  if (ago >= 36) return { id: "old" as const, label: "старая" };
  return { id: "mid" as const, label: "средняя" };
}

export function chunkOverlapsLife(chunk: { from: string; to: string }, from?: string, to?: string) {
  const a = parseLessonDate(chunk.from);
  const b = parseLessonDate(chunk.to);
  if (!a || !b) return true;
  const start = parseLessonDate(from);
  const end = parseLessonDate(to);
  if (!start && !end) return false;
  const s = start ? new Date(start.getTime() - 14 * 86400000) : new Date(0);
  const e = end ? new Date(end.getTime() + 14 * 86400000) : new Date(2099, 11, 31);
  return a <= e && b >= s;
}

export function lifeLabel(from?: string, to?: string) {
  const a = parseLessonDate(from);
  const b = parseLessonDate(to);
  if (a && b) {
    const fa = fmtMonth(a);
    const fb = fmtMonth(b);
    return fa === fb ? `с ${fa}` : `с ${fa} по ${fb}`;
  }
  if (a) return `с ${fmtMonth(a)}`;
  if (b) return `по ${fmtMonth(b)}`;
  return "";
}
