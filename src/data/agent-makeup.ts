/** Отработка: неделя → три слота своего педагога → ещё три / другой педагог. */

export type MakeupWeek = "this" | "next" | "later";

export const MAKEUP_WEEK_CHIPS: { label: string; send: string; primary?: boolean }[] = [
  { label: "Эта неделя", send: "Отработка на этой неделе", primary: true },
  { label: "Следующая", send: "Отработка на следующей неделе" },
  { label: "Позже", send: "Отработка позже" },
];

export function takeMakeupWeek(text: string): MakeupWeek | "" {
  const t = String(text || "").toLowerCase();
  if (/этой недел|текущ(ая|ей) недел|на этой|эта неделя/.test(t)) return "this";
  if (/следующ/.test(t)) return "next";
  if (/позже|потом|через две недел|через 2 недел|через три недел/.test(t)) return "later";
  return "";
}

export function isMakeupMore(text: string) {
  return /ещё три|еще три|не удобн|не подходит|другие вариант|покажите ещё|покажите еще|ещё вариант|еще вариант/i.test(text);
}

export function isMakeupOtherTeacher(text: string) {
  return /другой педагог|другого педагог|другой учитель|другую педагог/i.test(text);
}

export function weekLabel(kind: MakeupWeek) {
  return kind === "this" ? "на этой неделе" : kind === "next" ? "на следующей неделе" : "позже";
}

export function weekWindow(kind: MakeupWeek, now = new Date()) {
  const start = new Date(now.getTime());
  start.setHours(0, 0, 0, 0);
  const js = start.getDay();
  const sinceMon = js === 0 ? 6 : js - 1;
  const mon = new Date(start);
  mon.setDate(start.getDate() - sinceMon);
  const endOf = (from: Date, days: number) => {
    const t = new Date(from);
    t.setDate(from.getDate() + days);
    t.setHours(23, 59, 59, 999);
    return t;
  };
  if (kind === "this") return { from: start, to: endOf(mon, 6) };
  if (kind === "next") {
    const from = new Date(mon);
    from.setDate(mon.getDate() + 7);
    from.setHours(0, 0, 0, 0);
    return { from, to: endOf(from, 6) };
  }
  const from = new Date(mon);
  from.setDate(mon.getDate() + 14);
  from.setHours(0, 0, 0, 0);
  return { from, to: endOf(from, 20) };
}

export function makeupDateLabel(d: Date) {
  const days = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${days[d.getDay()]} ${dd}.${mm}`;
}

export type RankableMakeup = {
  gid: string;
  at: number;
  seats: string;
  priority: number;
  ownGid?: boolean;
  ownTeacher?: boolean;
};

export function rankMakeupSlots<T extends RankableMakeup>(rows: T[], otherTeacher: boolean) {
  const open = rows.filter((g) => g.priority !== 0 && g.seats !== "мест нет");
  const ownT = open.filter((g) => g.ownTeacher && !g.ownGid).sort((a, b) => a.at - b.at);
  const otherT = open.filter((g) => !g.ownTeacher && !g.ownGid).sort((a, b) => a.at - b.at);
  const pool = otherTeacher || !ownT.length ? otherT : ownT;
  return { own: ownT, other: otherT, pool };
}

export function pageMakeup<T>(pool: T[], skip: number, size = 3) {
  const n = Math.max(0, skip);
  return {
    slice: pool.slice(n, n + size),
    more: pool.length > n + size,
    exhausted: n + size >= pool.length,
  };
}
