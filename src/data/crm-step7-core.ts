/** Шапка архива. Фильтры customer/index складываются через И.
 * Лид — is_study 0, клиент — 1. Роли нет — фильтр 2 (и лиды, и клиенты).
 * 2 в карточку не пишется. removed 2 — только архив. */
export function step7HeaderQuery(id: number, study?: number) {
  const role = study === 0 ? 0 : study === 1 ? 1 : 2;
  return { id, is_study: role, removed: 2, page: 0, pageSize: 1 };
}

/** Архивный клиент и не в живой группе.
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

/** Роль строки списка. В теле 0/false — лид, 1/true — клиент. Пустое поле — роль запроса, не «клиент». 2 не пишется. */
export function step7ListStudy(row: { is_study?: unknown }, asked: 0 | 1): 0 | 1 {
  const role = step7Study(row);
  return role == null ? asked : role;
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
  return idList(row.group_ids).length > 0 || idList(row.groups).length > 0;
}

function idList(raw: unknown): number[] {
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    try {
      return idList(JSON.parse(s));
    } catch {
      return [];
    }
  }
  if (Array.isArray(raw)) {
    return raw
      .map((x) => {
        if (x && typeof x === "object") {
          const rec = x as { id?: unknown; group_id?: unknown };
          return Number(rec.group_id || rec.id);
        }
        return Number(x);
      })
      .filter((n) => Number.isFinite(n) && n > 0);
  }
  if (raw && typeof raw === "object") return idList(Object.values(raw as Record<string, unknown>));
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? [n] : [];
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

/** Customer.dob. Пустое, 0000-00-00 и недата — дня рождения нет. b_date сюда не входит: в CGI это начало обучения. */
export function step7Dob(raw?: unknown, now = new Date()): string {
  const s = String(raw ?? "").trim();
  if (!s || s.startsWith("0000")) return "";
  let y = 0;
  let m = 0;
  let d = 0;
  const ru = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ru) {
    d = Number(ru[1]);
    m = Number(ru[2]);
    y = Number(ru[3]);
  } else if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else return "";
  if (!y || y < 1920 || y > now.getFullYear() + 1 || m < 1 || m > 12 || d < 1 || d > 31) return "";
  const born = new Date(y, m - 1, d);
  if (born.getFullYear() !== y || born.getMonth() !== m - 1 || born.getDate() !== d) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function step7AgeYears(dob?: string, now = new Date()) {
  const iso = step7Dob(dob, now);
  if (!iso) return undefined;
  const y = Number(iso.slice(0, 4));
  const mo = Number(iso.slice(5, 7));
  const da = Number(iso.slice(8, 10));
  const born = new Date(y, mo - 1, da);
  let years = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) years -= 1;
  if (years < 0 || years > 120) return undefined;
  return years;
}

export type Step7Years = 0 | 1 | 2 | 4 | 6 | 2015;

function dayBack(now: Date, span: number) {
  const y = now.getFullYear() - span;
  const m = now.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const d = Math.min(now.getDate(), last);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Срок от даты архива. «За N лет» — календарный день, не 365.25. Пустая дата в срок не входит. */
export function step7InYears(day: string, span: Step7Years, now = new Date()) {
  if (!span) return true;
  if (!day) return false;
  if (span === 2015) return day >= "2015-01-01";
  return day >= dayBack(now, span);
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
  const client = card.study === 1;
  if (!lead && !client) {
    if (!(pick.leads && pick.clients)) return false;
  } else {
    if (lead && !pick.leads) return false;
    if (client && !pick.clients) return false;
  }
  const dob = step7Dob(card.dob, now);
  const age = step7AgeYears(dob, now);
  if (pick.dobYes !== pick.dobNo) {
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

/** То, что пришло с кнопки шага 7. Пустое — фильтра нет. */
export function step7PickOf(raw: unknown): Step7Pick | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Partial<Step7Pick>;
  const years = Number(o.years);
  const allowed = [0, 1, 2, 4, 6, 2015];
  const age = (v: unknown) => {
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    clients: o.clients !== false,
    leads: o.leads !== false,
    ageFrom: age(o.ageFrom),
    ageTo: age(o.ageTo),
    dobYes: Boolean(o.dobYes),
    dobNo: Boolean(o.dobNo),
    fio: Boolean(o.fio),
    groupsYes: Boolean(o.groupsYes),
    groupsNo: Boolean(o.groupsNo),
    years: (allowed.includes(years) ? years : 0) as Step7Years,
  };
}