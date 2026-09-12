/** Единый загрузчик «Истории из Alfa». Кнопки только старт/стоп. В Alfa не пишет. */

import { journalPull, type JournalPullKind } from "./crm-journal-pull";

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
  probe?: boolean;
  school?: string;
};

/** Пропуск кассы: только кто уже в complete[]. fill.done сам по себе не skip. */
export function historyCashSkip(filled: boolean, force: boolean) {
  return Boolean(filled) && !force;
}

/** Один объект за вызов. Касса слева всегда читает Alfa, даже если раньше «сканировали». */
export async function historyLoadOne(spec: HistoryLoadSpec) {
  const kind = spec.kind;
  return journalPull({
    kind,
    study: spec.study,
    customerId: spec.customerId,
    branchId: spec.branchId,
    groupId: spec.groupId,
    periodKey: spec.periodKey,
    grain: spec.grain,
    recheck: Boolean(spec.recheck),
    dateFrom: spec.dateFrom,
    probe: Boolean(spec.probe),
    school: spec.school,
    lite: true,
  });
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
  if (jobKind === "balance") return "balance";
  return "students";
}
