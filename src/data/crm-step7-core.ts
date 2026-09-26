/**
 * Архивный клиент и не в живой группе.
 * Фильтр customer/index: is_study 1 (клиент), removed 2 (только архив).
 * В строке ответа removed дока не обещает: пустое поле не выкидываем.
 * Явные 0 (активный) и 1 (в строке — не архив) не берём.
 * is_study 0 — лид. На шаге 7 лид берётся отдельно, через step7KeepAny.
 */
/** Причина архива. У клиента Customer.customer_reject_id, у лида lead_reject_id. Пусто и 0 — причины нет. */
export function step7RejectId(row: { customer_reject_id?: unknown; lead_reject_id?: unknown }, study: 0 | 1 = 1) {
  const n = Number(study === 0 ? row.lead_reject_id : row.customer_reject_id);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.trunc(n);
}

export function step7Keep(row: { id?: unknown; is_study?: unknown; removed?: unknown }, live: Set<number>) {
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) return false;
  if (live.has(id)) return false;
  if (row.removed != null && row.removed !== "" && Number(row.removed) !== 2) return false;
  const study = row.is_study;
  return study === true || study === 1 || study === "1";
}

export function step7Study(row: { is_study?: unknown }): 0 | 1 | null {
  const s = row.is_study;
  if (s === true || s === 1 || s === "1") return 1;
  if (s === false || s === 0 || s === "0") return 0;
  return null;
}

/** Архивный клиент или архивный лид, не в живой группе. Активные лиды остаются на шаге 6. */
export function step7KeepAny(row: { id?: unknown; is_study?: unknown; removed?: unknown }, live: Set<number>) {
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) return false;
  if (live.has(id)) return false;
  if (row.removed != null && row.removed !== "" && Number(row.removed) !== 2) return false;
  return step7Study(row) != null;
}

export function step7HadGroups(row: { group_ids?: unknown; groups?: unknown }) {
  const ids = row.group_ids;
  if (Array.isArray(ids) && ids.some((x) => Number(x) > 0)) return true;
  const groups = row.groups;
  if (Array.isArray(groups) && groups.length > 0) return true;
  return false;
}

/** Дата ухода в архив. Пустое, 0000-00-00 и заглушка 31.12.2030 — даты нет. */
export function step7ArchiveDay(row: { e_date?: unknown; removed_at?: unknown }) {
  const raw = String(row.e_date ?? row.removed_at ?? "").trim();
  if (!raw || raw.startsWith("0000")) return "";
  let y = 0;
  let m = 0;
  let d = 0;
  const ru = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ru) {
    d = Number(ru[1]);
    m = Number(ru[2]);
    y = Number(ru[3]);
  } else if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else return "";
  if (!y || y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return "";
  if (y === 2030 && m === 12 && d === 31) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Живое ФИО: не телефон, не «тест», не «клиент 12». «Тестова» проходит. */
export function step7FioOk(name?: string) {
  const s = String(name || "").trim();
  if (!s || /^(клиент|лид)\s+\d+$/i.test(s)) return false;
  const compact = s.replace(/[\s()+-]/g, "");
  if (/^\+?\d{6,}$/.test(compact)) return false;
  if (!/[a-zа-яё]/i.test(s)) return false;
  const tokens = s.toLowerCase().replace(/ё/g, "е").split(/[^a-zа-я0-9]+/i).filter(Boolean);
  if (tokens.some((t) => t === "тест" || t === "test" || t === "тестовый" || t === "проба")) return false;
  return true;
}

export function step7AgeYears(dob?: string, now = new Date()) {
  const t = String(dob || "").trim();
  if (!t) return undefined;
  let y = 0;
  let mo = 1;
  let da = 1;
  const ru = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ru) {
    da = Number(ru[1]);
    mo = Number(ru[2]);
    y = Number(ru[3]);
  } else if (iso) {
    y = Number(iso[1]);
    mo = Number(iso[2]);
    da = Number(iso[3]);
  }
  if (!y || y < 1920 || y > now.getFullYear() + 1) return undefined;
  const born = new Date(y, mo - 1, da || 1);
  let years = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) years -= 1;
  if (years < 0 || years > 120) return undefined;
  return years;
}

export type Step7Years = 0 | 1 | 2 | 4 | 6 | 2015;

export function step7InYears(day: string, span: Step7Years, now = new Date()) {
  if (!span) return true;
  if (span === 2015) return !day || day >= "2015-01-01";
  if (!day) return false;
  const t = Date.parse(`${day}T12:00:00`);
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t <= span * 365.25 * 86400000;
}

export type Step7Pick = {
  clients: boolean;
  leads: boolean;
  ageFrom?: number;
  ageTo?: number;
  dobYes: boolean;
  dobNo: boolean;
  fio: boolean;
  groupsYes: boolean;
  groupsNo: boolean;
  years: Step7Years;
};

export function step7Shows(
  card: { study?: number; name?: string; dob?: string; hadGroups?: boolean; archivedAt?: string },
  pick: Step7Pick,
  now = new Date(),
) {
  const lead = card.study === 0;
  if (lead && !pick.leads) return false;
  if (!lead && !pick.clients) return false;
  const dob = String(card.dob || "").trim();
  const age = step7AgeYears(dob, now);
  if (pick.dobYes !== pick.dobNo) {
    if (pick.dobYes && age == null && !dob) return false;
    if (pick.dobYes && !dob) return false;
    if (pick.dobNo && dob) return false;
  }
  if (pick.ageFrom != null || pick.ageTo != null) {
    if (age == null) return false;
    if (pick.ageFrom != null && age < pick.ageFrom) return false;
    if (pick.ageTo != null && age > pick.ageTo) return false;
  }
  if (pick.fio && !step7FioOk(card.name)) return false;
  if (pick.groupsYes !== pick.groupsNo) {
    if (pick.groupsYes && !card.hadGroups) return false;
    if (pick.groupsNo && card.hadGroups) return false;
  }
  if (!step7InYears(String(card.archivedAt || ""), pick.years, now)) return false;
  return true;
}