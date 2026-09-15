/** Одна роль человека на сайте: список клиентов, воронка и карточка. */

export type PersonRole = "учится" | "лид" | "архив" | "удалён";

export type PersonRoleInput = {
  is_study?: unknown;
  removed?: unknown;
  lead_status_id?: unknown;
  status_id?: unknown;
  crm_funnel?: unknown;
  status?: unknown;
};

/**
 * Экран «Клиенты» — только учится. Экран «Лиды» — воронка.
 * is_study=1 всегда ученик: хвост lead_status_id / карточка на доске Alfa не делает лидом.
 * Иначе Чуднова (худ. школа) сидит в «Ожидает старта».
 */
export function personRole(it: PersonRoleInput): PersonRole {
  if (Number(it.removed) === 1) return "удалён";
  const studyRaw = it.is_study;
  const study = studyRaw === "" || studyRaw == null ? NaN : Number(studyRaw);
  if (study === 2) return "архив";
  if (study === 1) return "учится";
  if (study === 0) return "лид";
  if (String(it.crm_funnel || "") === "1") return "лид";
  const st = String(it.status || "");
  if (st === "лид" || st === "учится" || st === "архив" || st === "удалён") return st;
  return "удалён";
}

/** Лид / клиент / архив для сверки. Как вкладка Клиенты, не хвост status.
 *  is_study=0 — лид (новый, в группе, или бывший клиент).
 *  crm_funnel=1 — на доске CRM, даже если is_study ещё 1 (кроме архива).
 *  is_study=1 без воронки — ученик (Чуднова в «Ожидает старта»).
 *  is_study=2 — архив, в том числе лид в архиве. */
export function dossierAuditRole(it: PersonRoleInput): "лид" | "клиент" | "архив" {
  const r = personRole(it);
  if (r === "архив") return "архив";
  if (r === "лид") return "лид";
  if (String(it.crm_funnel || "") === "1") return "лид";
  return "клиент";
}

/** Лид / клиент / архив для сверки. is_study=1 не лид, даже если status ещё «лид». */
export function alfaStudyRole(it: PersonRoleInput): "лид" | "клиент" | "архив" {
  return dossierAuditRole(it);
}

/** Лид на диске, которого надо перепроверить в Alfa: не клиент is_study=1. */
export function customerPullCandidate(d: { crmId?: number; status?: string; extras?: { is_study?: string } }) {
  if (!Number(d.crmId)) return false;
  if (String(d.extras?.is_study || "") === "1") return false;
  return String(d.extras?.is_study || "") === "0" || d.status === "лид";
}

export function personIsStudy(role: PersonRole): 0 | 1 | 2 {
  if (role === "архив") return 2;
  if (role === "лид") return 0;
  return 1;
}

export function personSaveFields(next: 0 | 1 | 2) {
  if (next === 0) return { is_study: 0, lead_status_id: 0, crm_funnel: "1" as const };
  if (next === 2) return { is_study: 2, lead_status_id: 0, crm_funnel: "0" as const };
  return { is_study: 1, lead_status_id: 0, crm_funnel: "0" as const };
}
