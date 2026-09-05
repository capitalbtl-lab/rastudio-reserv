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

function leadStageId(it: PersonRoleInput) {
  const raw = it.lead_status_id ?? it.status_id;
  if (raw == null || raw === "" || raw === false) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Экран «Клиенты» — только учится. Экран «Лиды» — воронка.
 * Фролов: is_study может остаться 1, но он на доске CRM (crm_funnel или этап воронки).
 */
export function personRole(it: PersonRoleInput): PersonRole {
  if (Number(it.removed) === 1) return "удалён";
  const studyRaw = it.is_study;
  const study = studyRaw === "" || studyRaw == null ? NaN : Number(studyRaw);
  if (study === 2) return "архив";
  if (study === 0) return "лид";
  if (String(it.crm_funnel || "") === "1") return "лид";
  if (study === 1 && leadStageId(it) > 0) return "лид";
  if (study === 1) return "учится";
  const st = String(it.status || "");
  if (st === "лид" || st === "учится" || st === "архив" || st === "удалён") return st;
  return "удалён";
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
