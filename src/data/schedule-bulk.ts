/** Массовые правки расписания голосом. Без Node, можно в клиенте. Филиал только по branchId. */
import type { CrmSlot } from "./crm-slots-core";
import { readPriority } from "./group-status";

export type BulkChange = { id: string; field: string; from: string; to: string };
export type BulkPreview = { comment: string; changes: BulkChange[]; adds: [] };

function branchIdFromPrompt(t: string): number | null {
  if (/гражданск/.test(t)) return 1;
  if (/цмит|октябрь|340/.test(t)) return 2;
  if (/луховиц|пушкин/.test(t)) return 3;
  if (/летн|филиал.{0,12}лет/.test(t) && !/граждан|цмит|луховиц|лет\s+\d/.test(t)) return 4;
  return null;
}

function isAllGroups(t: string) {
  return /у\s+всех|во\s+всех|всем|все\s+групп|каждую\s+групп|каждой\s+групп|массово|по\s+всем/.test(t);
}

/** Приоритет по branchId. Имя и год в названии не фильтр. */
export function bulkPriorityFromPrompt(prompt: string, slots: CrmSlot[], selectedIds: string[] = []): BulkPreview | null {
  const t = String(prompt || "")
    .toLowerCase()
    .replace(/ё/g, "е");
  if (!/приоритет|prioritet|выклад/.test(t)) return null;
  const tagged = t.match(/приоритет(?:\s*(?:номер|равен|=|:))?\s*([0-3])/);
  let to = tagged ? Number(tagged[1]) : NaN;
  if (!Number.isFinite(to)) {
    if (/\b0\b|ноль|нулев|не выклад|не на сайт|снять с сайта/.test(t)) to = 0;
    else if (/\b1\b|перв(ый|ая|ую|ое)|вылож/.test(t)) to = 1;
    else if (/\b2\b|втор/.test(t)) to = 2;
    else if (/\b3\b|трет|запасн/.test(t)) to = 3;
  }
  if (!Number.isFinite(to) || to < 0 || to > 3) return null;
  const all = isAllGroups(t);
  let pool = selectedIds.length && !all ? slots.filter((s) => selectedIds.includes(s.id)) : slots.slice();
  pool = pool.filter((s) => Number(s.groupId) > 0);
  const branchId = branchIdFromPrompt(t);
  if (branchId) pool = pool.filter((s) => Number(s.branchId) === branchId);
  const want = readPriority(to);
  const changes = pool
    .filter((s) => readPriority(s.priority) !== want)
    .map((s) => ({ id: s.id, field: "priority", from: String(readPriority(s.priority)), to: String(want) }));
  const where = branchId ? ` филиала ${branchId}` : "";
  if (!changes.length) {
    return { comment: `Приоритет ${want} уже стоит у ${pool.length} групп${where}.`, changes: [], adds: [] };
  }
  return {
    comment: `Приоритет ${want} у ${changes.length} групп${where}. Имена не смотрел.`,
    changes,
    adds: [],
  };
}

export function bulkLimitFromPrompt(prompt: string, slots: CrmSlot[], selectedIds: string[] = []): BulkPreview | null {
  const t = String(prompt || "")
    .toLowerCase()
    .replace(/ё/g, "е");
  if (/приоритет|prioritet/.test(t)) return null;
  if (!/мест|лимит|столбц|цифр|свободн|набор|вместимост|максимальн|количеств|детей|человек|ребен|ребён|capacity|limit/.test(t)) return null;
  const tagged = t.match(/цифр[а-я]*\s*(\d{1,3})/);
  const nums = [...t.matchAll(/\b(\d{1,3})\b/g)].map((m) => Number(m[1])).filter((n) => n >= 1 && n <= 200);
  const to = tagged ? Number(tagged[1]) : nums.length ? nums[nums.length - 1] : NaN;
  if (!Number.isFinite(to) || to < 0 || to > 200) return null;
  const all = isAllGroups(t) || /столбц/.test(t);
  let pool = selectedIds.length && !all ? slots.filter((s) => selectedIds.includes(s.id)) : slots.slice();
  const branchId = branchIdFromPrompt(t);
  if (branchId) pool = pool.filter((s) => Number(s.branchId) === branchId);
  const changes = pool
    .filter((s) => Number(s.limit) !== to)
    .map((s) => ({ id: s.id, field: "limit", from: String(s.limit ?? 0), to: String(to) }));
  if (!changes.length) return { comment: `Лимит ${to} уже стоит у выбранных групп.`, changes: [], adds: [] };
  return { comment: `Лимит мест ${to} у ${changes.length} групп.`, changes, adds: [] };
}

export function bulkPreviewFromPrompt(prompt: string, slots: CrmSlot[], selectedIds: string[] = []) {
  return bulkPriorityFromPrompt(prompt, slots, selectedIds) || bulkLimitFromPrompt(prompt, slots, selectedIds);
}
