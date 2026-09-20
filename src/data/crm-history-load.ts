/** Единый загрузчик «Истории из Alfa». Кнопки только старт/стоп. В Alfa не пишет. */

import { journalPull, type JournalPullKind } from "./crm-journal-pull";
import { diskPersonSnap, observeStepPull } from "./crm-step-run-log.ts";

export type HistoryLoadSpec = {
  kind: JournalPullKind;
  study?: "1" | "2" | "all";
  customerId?: number;
  branchId?: number;
  groupId?: number;
  periodKey?: string;
  grain?: "quarter" | "half" | "year";
  recheck?: boolean;
  dateFrom?: string;
  dateTo?: string;
  recheckDays?: number;
  prune?: boolean;
  probe?: boolean;
  school?: string;
  name?: string;
  slowFill?: boolean;
  jobId?: string;
  jobMode?: string;
};

export type HistoryLoadResult = {
  ok?: boolean;
  extra?: string;
  error?: string;
  more?: boolean;
  lastArchiveCatalog?: { name?: string; step?: string };
  lastLife?: { left?: number };
  lastArchives?: { branch?: string };
  lastArchivesPupils?: { left?: number };
  student?: { paysMore?: boolean; paysOk?: boolean; short?: boolean; seated?: number; dropped?: number; holeApproved?: boolean; dups?: boolean };
  pagesComplete?: boolean;
  holeN?: number;
  extraN?: number;
  seated?: number;
};

/** Пропуск кассы: complete, либо страницы прошли и есть строки / пустой проход. Синяя force — не skip. */
export function historyCashSkip(filled: boolean, force: boolean, scanned = false, hasRowsOrEmpty = false) {
  return Boolean(!force && (filled || (scanned && hasRowsOrEmpty)));
}

/** Один объект за вызов. Касса слева всегда читает Alfa, даже если раньше «сканировали». */
export async function historyLoadOne(spec: HistoryLoadSpec): Promise<HistoryLoadResult> {
  const kind = spec.kind;
  const started = Date.now();
  const before = Number(spec.customerId) ? diskPersonSnap(Number(spec.customerId)) : {};
  const res = await journalPull({
    kind,
    study: spec.study,
    customerId: spec.customerId,
    branchId: spec.branchId,
    groupId: spec.groupId,
    periodKey: spec.periodKey,
    grain: spec.grain,
    recheck: Boolean(spec.recheck),
    dateFrom: spec.dateFrom,
    dateTo: spec.dateTo,
    recheckDays: spec.recheckDays,
    prune: Boolean(spec.prune),
    probe: Boolean(spec.probe),
    school: spec.school,
    name: spec.name,
    lite: true,
    slowFill: Boolean(spec.slowFill),
  });
  try {
    observeStepPull(
      {
        kind,
        recheck: Boolean(spec.recheck),
        probe: Boolean(spec.probe),
        dateFrom: spec.dateFrom,
        dateTo: spec.dateTo,
        recheckDays: spec.recheckDays,
        study: spec.study,
        customerId: spec.customerId,
        groupId: spec.groupId,
        branchId: spec.branchId,
        name: spec.name,
        jobId: spec.jobId,
        jobMode: spec.jobMode,
        peopleKind: kind === "balance" ? "balance" : "",
      },
      before,
      res as Parameters<typeof observeStepPull>[2],
      started,
    );
  } catch {
    /* лог не рвёт шаг */
  }
  return res as HistoryLoadResult;
}

export function historyPullKind(mode: string, jobKind: string): JournalPullKind {
  if (mode === "count") return "archiveCount";
  if (mode === "audit") return "audit";
  if (mode === "details") return "details";
  if (mode === "catalog") return "archiveCatalog";
  if (mode === "life") return "life";
  if (mode === "archives") return "archives";
  if (mode === "archivesPupils") return "archivesPupils";
  if (mode === "groups" || mode === "groups-recheck" || mode === "group-one") return "group";
  if (mode === "roster" || mode === "roster-recheck") return "roster";
  if (jobKind === "balance") return "balance";
  return "students";
}
