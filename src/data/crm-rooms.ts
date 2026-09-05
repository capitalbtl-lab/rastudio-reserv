/** Аудитория карточки занятия — только филиал группы, без архива и без «всех подряд». */

export function roomArchived(x: Record<string, unknown>) {
  if ([x.removed, x.is_removed, x.archived, x.is_archived, x.is_delete].some((v) => Number(v) === 1 || v === true)) return true;
  if (x.is_active === 0 || x.enabled === 0 || x.is_enabled === 0 || x.state === 0) return true;
  const blob = `${x.name || ""} ${x.note || ""}`.toLowerCase();
  return /архив/.test(blob);
}

export function roomBranchIds(x: Record<string, unknown>) {
  const ids: number[] = [];
  if (Array.isArray(x.branch_ids)) for (const v of x.branch_ids) if (Number(v)) ids.push(Number(v));
  if (Number(x.branch_id)) ids.push(Number(x.branch_id));
  const loc = Number(x.location_id || x.filial_id || 0);
  if (loc >= 1 && loc <= 4) ids.push(loc);
  return [...new Set(ids)];
}

/** Филиал только по ID. Имя аудитории не ключ. Нет ID — не этого филиала. */
export function roomBelongsToBranch(x: Record<string, unknown>, branch: number) {
  const ids = roomBranchIds(x);
  if (!ids.length) return false;
  return ids.includes(Number(branch));
}

export function roomsOfBranchList(raw: Record<string, unknown>[], branch: number) {
  const seen = new Set<number>();
  const out: { id: number; name: string }[] = [];
  for (const x of raw) {
    const id = Number(x.id || 0);
    if (!id || seen.has(id) || roomArchived(x)) continue;
    if (!roomBelongsToBranch(x, branch)) continue;
    seen.add(id);
    const name = String(x.name || "").trim() || `аудитория ${id}`;
    out.push({ id, name });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return out;
}
