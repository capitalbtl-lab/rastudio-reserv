import { isoDateOrEmpty } from "./crm-slots-core.ts";
import { sameIdSet, teacherIdSet, type BeatTeachers } from "./crm-group-teachers-core.ts";

const DAY = ["", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];

export type AlfaRegularSnap = {
  id: number;
  day: number;
  timeFrom: string;
  timeTo: string;
  bDate?: string;
  eDate?: string;
  teacherIds: number[];
  disabled?: boolean;
  hasCustomerOverrides?: boolean;
  branchId?: number;
};

export type CalendarDot = { date: string; from?: string };

export type ExportIssue = {
  code:
    | "index-failed"
    | "no-time"
    | "bad-branch-teacher"
    | "day-mismatch"
    | "no-template-has-lessons"
    | "disabled-template"
    | "period-mismatch"
    | "customer-overrides"
    | "teachers-mismatch";
  text: string;
  beatIndex?: number;
};

const ORDER: ExportIssue["code"][] = [
  "index-failed",
  "no-time",
  "bad-branch-teacher",
  "day-mismatch",
  "no-template-has-lessons",
  "disabled-template",
  "period-mismatch",
  "customer-overrides",
  "teachers-mismatch",
];

export function weekdayIso(iso: string) {
  const t = isoDateOrEmpty(iso);
  if (!t) return 0;
  const d = new Date(`${t}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 0;
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

export function beatFollowsGroupPeriod(beat: BeatTeachers, groupFrom?: string, groupTo?: string) {
  const bb = isoDateOrEmpty(beat.bDate);
  const be = isoDateOrEmpty(beat.eDate);
  if (!bb && !be) return true;
  return bb === isoDateOrEmpty(groupFrom) && be === isoDateOrEmpty(groupTo);
}

export function matchAlfaRegular(beat: BeatTeachers, regs: AlfaRegularSnap[]): AlfaRegularSnap | undefined {
  const lid = Number(beat.lessonId) || 0;
  if (lid) {
    const hit = regs.find((r) => r.id === lid);
    if (hit) return hit;
  }
  const day = Number(beat.day) || 0;
  const from = String(beat.timeFrom || "").slice(0, 5);
  const same = regs.filter((r) => r.day === day && String(r.timeFrom || "").slice(0, 5) === from);
  if (same.length === 1) return same[0];
  if (!lid && regs.length === 1) return regs[0];
  return undefined;
}

function hm(raw?: string) {
  const m = String(raw || "").match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

function dayWord(n: number) {
  return DAY[Number(n) || 0] || `день ${n}`;
}

export function inspectGroupExport(opts: {
  beats: BeatTeachers[];
  ownerTeacherIds?: number[];
  groupFrom?: string;
  groupTo?: string;
  calendar?: CalendarDot[];
  alfaRegulars?: AlfaRegularSnap[] | null;
  alfaOwnerIds?: number[];
  branchTeacherIds?: number[];
  indexFailed?: boolean;
}): { issues: ExportIssue[]; allowFull: boolean; allowGroup: boolean; suggestOwner: boolean } {
  const issues: ExportIssue[] = [];
  if (opts.indexFailed) {
    issues.push({
      code: "index-failed",
      text: "Не сверили шаблон в Alfa. Regular не отправляем.",
    });
  }
  const regs = opts.alfaRegulars || [];
  const liveRegs = regs.filter((r) => !r.disabled);
  const beats = (opts.beats || []).length
    ? opts.beats
    : [{ day: 0, timeFrom: "", timeTo: "", teacherIds: [] }];
  const calDays = [...new Set((opts.calendar || []).map((c) => weekdayIso(c.date)).filter(Boolean))];
  const calDates = (opts.calendar || []).map((c) => c.date).filter(Boolean).slice(0, 4);
  const calHint = calDates.length ? calDates.join(", ") : "";
  const branchOk = new Set((opts.branchTeacherIds || []).map(Number).filter(Boolean));

  beats.forEach((beat, i) => {
    const from = hm(beat.timeFrom);
    const to = hm(beat.timeTo);
    const day = Number(beat.day) || 0;
    const beatIds = teacherIdSet(beat.teacherIds);
    if (!from || !to) {
      issues.push({
        code: "no-time",
        beatIndex: i,
        text: "Слот без времени. Regular в Alfa не отправляем. Период группы и ответственных можно выгрузить в карточке группы.",
      });
      return;
    }
    for (const id of beatIds) {
      if (branchOk.size && !branchOk.has(id)) {
        issues.push({
          code: "bad-branch-teacher",
          beatIndex: i,
          text: `Педагог ${id} не в филиале группы. Этот набор в Alfa не отправляем.`,
        });
        break;
      }
    }
    for (const id of teacherIdSet(opts.ownerTeacherIds)) {
      if (branchOk.size && !branchOk.has(id)) {
        issues.push({
          code: "bad-branch-teacher",
          text: `Ответственный ${id} не в филиале группы. Не отправляем.`,
        });
        break;
      }
    }
    const alfa = matchAlfaRegular(beat, regs);
    if (!alfa && calDays.length) {
      issues.push({
        code: "no-template-has-lessons",
        beatIndex: i,
        text: `В Alfa шаблон снят, занятия остались${calHint ? ` (${calHint})` : ""}. Нельзя записать новый слот: будет другой ритм, старые уроки не удалятся.`,
      });
    }
    if (alfa?.disabled) {
      issues.push({
        code: "disabled-template",
        beatIndex: i,
        text: "Шаблон в Alfa выключен. Не создаём второй и не включаем его этим экспортом.",
      });
    }
    if (alfa && !alfa.disabled) {
      if ((Number(alfa.day) || 0) !== day || hm(alfa.timeFrom) !== from) {
        issues.push({
          code: "day-mismatch",
          beatIndex: i,
          text: `Нельзя заменить шаблон. На сайте ${dayWord(day)} ${from}${to ? `–${to}` : ""}. В Alfa календарь или шаблон — ${dayWord(alfa.day)} ${hm(alfa.timeFrom)}${calHint ? ` (${calHint})` : ""}. Период группы и даты занятий тут ни при чём. Выгрузка шаблона снимет его или сменит день, занятия останутся.`,
        });
      }
    }
    if (!alfa && calDays.length === 0) {
      /* нет шаблона и нет кружков — create допустим на полном экспорте */
    }
    if (calDays.length && day && !calDays.includes(day) && (!alfa || Number(alfa.day) !== day)) {
      issues.push({
        code: "day-mismatch",
        beatIndex: i,
        text: `Нельзя заменить шаблон. На сайте ${dayWord(day)} ${from}. В Alfa кружки — ${calDays.map(dayWord).join(", ")}${calHint ? ` (${calHint})` : ""}.`,
      });
    }
    if (alfa && !alfa.disabled && alfa.hasCustomerOverrides) {
      issues.push({
        code: "customer-overrides",
        beatIndex: i,
        text: "У шаблона личные слоты учеников. Этот regular-lesson.update не делаем.",
      });
    }
    const follows = beatFollowsGroupPeriod(beat, opts.groupFrom, opts.groupTo);
    if (alfa && !follows) {
      const samePeriod =
        isoDateOrEmpty(beat.bDate) === isoDateOrEmpty(alfa.bDate) && isoDateOrEmpty(beat.eDate) === isoDateOrEmpty(alfa.eDate);
      if (!samePeriod) {
        issues.push({
          code: "period-mismatch",
          beatIndex: i,
          text: "Период группы и даты занятий — разные поля. Шаблон в Alfa живёт от дат занятий. Сейчас они не совпадают с Alfa. Regular не пишем.",
        });
      }
    }
    const outside =
      isoDateOrEmpty(beat.bDate) &&
      isoDateOrEmpty(opts.groupFrom) &&
      isoDateOrEmpty(beat.bDate) < isoDateOrEmpty(opts.groupFrom);
    const pastEnd =
      isoDateOrEmpty(beat.eDate) &&
      isoDateOrEmpty(opts.groupTo) &&
      isoDateOrEmpty(beat.eDate) > isoDateOrEmpty(opts.groupTo);
    if (outside || pastEnd) {
      issues.push({
        code: "period-mismatch",
        beatIndex: i,
        text: "Даты занятий бита вне периода группы. В Alfa не слать.",
      });
    }
    if (alfa && !alfa.disabled && !sameIdSet(beatIds, alfa.teacherIds)) {
      issues.push({
        code: "teachers-mismatch",
        beatIndex: i,
        text: `Ответственные и педагоги занятий — разные массивы. Педагоги занятий (${dayWord(day)} ${from}): сайт [${beatIds.join(", ") || "пусто"}], шаблон Alfa [${(alfa.teacherIds || []).join(", ") || "пусто"}].`,
      });
    }
  });

  if (!sameIdSet(opts.ownerTeacherIds, opts.alfaOwnerIds) && teacherIdSet(opts.ownerTeacherIds).length) {
    issues.push({
      code: "teachers-mismatch",
      text: `Ответственные на сайте [${teacherIdSet(opts.ownerTeacherIds).join(", ")}] ≠ Alfa [${teacherIdSet(opts.alfaOwnerIds).join(", ") || "пусто"}].`,
    });
  }

  const uniq = new Map<string, ExportIssue>();
  for (const it of issues) {
    const k = `${it.code}:${it.beatIndex ?? ""}:${it.text}`;
    if (!uniq.has(k)) uniq.set(k, it);
  }
  const sorted = [...uniq.values()].sort((a, b) => ORDER.indexOf(a.code) - ORDER.indexOf(b.code));
  const blockFull = sorted.some((x) => x.code !== "teachers-mismatch");
  const suggestOwner = !teacherIdSet(opts.ownerTeacherIds).length && beats.some((b) => teacherIdSet(b.teacherIds).length);
  return {
    issues: sorted,
    allowFull: !blockFull && !opts.indexFailed,
    allowGroup: true,
    suggestOwner,
  };
}

export function exportIssueSummary(issues: ExportIssue[]) {
  if (!issues.length) return "";
  return [...new Set(issues.map((x) => x.text))].join(" ");
}
