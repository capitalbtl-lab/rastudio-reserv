/** Архивный клиент и не в живой группе. Лид и удалённый не входят. */
export function step7Keep(row: { id?: unknown; is_study?: unknown; removed?: unknown }, live: Set<number>) {
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) return false;
  if (live.has(id)) return false;
  if (Number(row.removed) !== 2) return false;
  const study = row.is_study;
  return study === true || study === 1 || study === "1";
}
