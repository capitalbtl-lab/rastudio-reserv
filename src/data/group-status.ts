/**
 * Статусы групп AlfaCRM и правила: админка / сайт / запись.
 * Имя группы не участвует. Только statusId + priority.
 */
export const GROUP_STATUSES = [
  { id: 1, name: "Идет набор (ожидает старта)", admin: true },
  { id: 6, name: "Старт занятий", admin: true },
  { id: 2, name: "Обучается (идет набор)", admin: true },
  { id: 4, name: "Обучается (набор завершен)", admin: true },
  { id: 5, name: "Набор приостановлен", admin: true },
  { id: 10, name: "Не обучается (набор завершен)", admin: true },
  { id: 3, name: "Обучение завершено", admin: false },
  { id: 7, name: "Набор смены", admin: false },
  { id: 8, name: "Смена идет", admin: false },
  { id: 9, name: "Смена завершена", admin: false },
] as const;

export type GroupStatusId = (typeof GROUP_STATUSES)[number]["id"];

export type StatusPublish = {
  schedule: boolean;
  trial: boolean;
  group: boolean;
};

/** Стартовые галочки Админка → Сайт. Меняются в настройках, не в коде. */
export const DEFAULT_STATUS_PUBLISH: Record<string, StatusPublish> = {
  "1": { schedule: true, trial: true, group: true },
  "6": { schedule: true, trial: true, group: true },
  "2": { schedule: true, trial: true, group: true },
  "4": { schedule: true, trial: false, group: false },
  "5": { schedule: false, trial: false, group: false },
  "10": { schedule: false, trial: false, group: false },
  "3": { schedule: false, trial: false, group: false },
  "7": { schedule: false, trial: false, group: false },
  "8": { schedule: false, trial: false, group: false },
  "9": { schedule: false, trial: false, group: false },
};

export const GROUP_PRIORITY = [
  { id: 1, name: "1 · первая для записи" },
  { id: 2, name: "2 · вторая очередь" },
  { id: 3, name: "3 · запасная" },
  { id: 0, name: "0 · на сайт не выкладывать" },
] as const;

export function groupStatusName(id?: number) {
  return GROUP_STATUSES.find((s) => s.id === Number(id))?.name || "";
}

/** Архив CRM. В основном списке админки нет. */
export function isArchivedGroup(statusId?: number) {
  return Number(statusId) === 3;
}

/** Неактивные смены (выкл. в CRM). Не тянем. */
export function isCampStatus(statusId?: number) {
  const n = Number(statusId);
  return n === 7 || n === 8 || n === 9;
}

/** Все группы админки, кроме архива и выключенных смен. Status 4 — живая. */
export function isAdminGroup(statusId?: number) {
  if (isArchivedGroup(statusId) || isCampStatus(statusId)) return false;
  return true;
}

export function readPriority(raw: unknown): number {
  if (raw == null || raw === "") return 1;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  if (n < 0) return 0;
  if (n > 3) return 3;
  return n;
}

export function publishOf(
  statusId: number | undefined,
  table?: Record<string, StatusPublish> | null,
): StatusPublish {
  const key = String(Number(statusId) || 0);
  return table?.[key] || DEFAULT_STATUS_PUBLISH[key] || { schedule: false, trial: false, group: false };
}

export type PublicSlotHint = {
  statusId?: number;
  priority?: number;
  courseId?: string;
  path?: string;
  siteCourseId?: string;
};

function boundToSite(s: PublicSlotHint) {
  return Boolean(s.courseId || s.siteCourseId || s.path);
}

/** Витрина rastudio.org: статус пускает расписание и priority ≥ 1, курс сайта привязан. */
export function slotOnPublicSchedule(s: PublicSlotHint, table?: Record<string, StatusPublish> | null) {
  if (!isAdminGroup(s.statusId)) return false;
  if (readPriority(s.priority) <= 0) return false;
  if (!publishOf(s.statusId, table).schedule) return false;
  return boundToSite(s);
}

export function slotPublicTrial(s: PublicSlotHint, table?: Record<string, StatusPublish> | null) {
  if (!slotOnPublicSchedule(s, table)) return false;
  return publishOf(s.statusId, table).trial;
}

export function slotPublicGroup(s: PublicSlotHint, table?: Record<string, StatusPublish> | null) {
  if (!slotOnPublicSchedule(s, table)) return false;
  return publishOf(s.statusId, table).group;
}

export function mergeStatusPublish(raw?: Record<string, Partial<StatusPublish>> | null): Record<string, StatusPublish> {
  const out: Record<string, StatusPublish> = {};
  for (const st of GROUP_STATUSES) {
    const key = String(st.id);
    const base = DEFAULT_STATUS_PUBLISH[key] || { schedule: false, trial: false, group: false };
    const patch = raw?.[key] || {};
    out[key] = {
      schedule: patch.schedule ?? base.schedule,
      trial: patch.trial ?? base.trial,
      group: patch.group ?? base.group,
    };
  }
  return out;
}
