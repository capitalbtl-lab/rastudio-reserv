/** Строка шага 2: диск / Alfa · осталось · пачка · +K · ЧЧ:ММ. Не диск, не второй счёт. */

import { LESSON_INBOUND_RUN } from "./crm-customer-sync.ts";

export const PEOPLE_PACK = LESSON_INBOUND_RUN;

export function keepAlfa(prev?: number, next?: number) {
  const hasPrev = prev != null && Number.isFinite(Number(prev));
  const hasNext = next != null && Number.isFinite(Number(next));
  if (!hasNext) return hasPrev ? Number(prev) : undefined;
  if (Number(next) === 0) return 0;
  if (!hasPrev) return Number(next);
  return Math.max(Number(prev), Number(next));
}

/** Штамп последней записи по cid, Москва. */
export function peopleClock(iso?: string) {
  const t = Date.parse(String(iso || ""));
  if (!Number.isFinite(t) || t <= 0) return "";
  const msk = new Date(t + 3 * 3600_000);
  const hh = String(msk.getUTCHours()).padStart(2, "0");
  const mm = String(msk.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function ruPacks(n: number) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return `${n} пачка`;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return `${n} пачки`;
  return `${n} пачек`;
}

export function peopleLessonsLine(opts: {
  disk: number;
  alfa?: number;
  hole?: number;
  pack?: number;
  plus?: number;
  at?: string;
  running?: boolean;
}): { line: string; hint: string; packsLeft?: number } {
  const disk = Math.max(0, Number(opts.disk) || 0);
  const alfaKnown = opts.alfa != null && Number.isFinite(Number(opts.alfa));
  const alfa = alfaKnown ? Math.max(0, Number(opts.alfa) || 0) : 0;
  const holeKnown = opts.hole != null && Number.isFinite(Number(opts.hole));
  const left = holeKnown ? Math.max(0, Number(opts.hole) || 0) : alfaKnown ? Math.max(0, alfa - disk) : 0;
  const pack = Number(opts.pack) > 0 ? Number(opts.pack) : PEOPLE_PACK;
  const hasPlus = opts.plus != null && Number.isFinite(Number(opts.plus));
  const k = hasPlus ? Math.max(0, Math.floor(Number(opts.plus))) : 0;
  const parts: string[] = [];
  if (alfaKnown) parts.push(`${disk} / ${alfa}`, `осталось ${left}`);
  else parts.push(String(disk));
  parts.push(`пачка ${pack}`);
  if (hasPlus) parts.push(`+${k}`);
  const clock = peopleClock(opts.at);
  if (clock) parts.push(clock);

  let hint = "";
  let packsLeft: number | undefined;
  if (alfaKnown && left === 0) {
    hint = "ничего нового";
  } else if (hasPlus && k > 0 && left > 0) {
    packsLeft = Math.ceil(left / k);
    hint = packsLeft > 1 ? `идёт · ещё ${ruPacks(packsLeft)}` : "идёт";
  } else if (hasPlus && k === 0 && left > 0 && !opts.running) {
    hint = "пачка прошла · не сели · не жать ещё раз";
  }
  return { line: parts.join(" · "), hint, packsLeft };
}

/** Шаг 2: дырка важнее дублей. Short → «Добрать», не окно ±месяц. */
export type PeopleStudentAction = "dobrat" | "recheck" | "load";
export type PeopleStudentBadge = "approved" | "short" | "dups" | "recheck" | "done" | "need";

export function peopleStudentAction(opts: { short?: boolean; dups?: boolean; journal?: boolean; holeApproved?: boolean }): PeopleStudentAction {
  if (opts.short && !opts.holeApproved) return "dobrat";
  if (opts.dups || opts.journal || opts.holeApproved) return "recheck";
  return "load";
}

export function peopleStudentBadge(opts: {
  approved?: boolean;
  short?: boolean;
  dups?: boolean;
  full?: boolean;
  needsRecheck?: boolean;
}): PeopleStudentBadge {
  if (opts.approved) return "approved";
  if (opts.short) return "short";
  if (opts.dups) return "dups";
  if (opts.full) return opts.needsRecheck ? "recheck" : "done";
  return "need";
}

export function peopleStudentHint(opts: { short?: boolean; dups?: boolean; holeApproved?: boolean; lineHint?: string }): string {
  const line = String(opts.lineHint || "");
  if (opts.holeApproved) return line;
  if (opts.short && opts.dups) return line || "добрать · есть дубли";
  if (opts.dups) return "дубли, снять";
  return line;
}
