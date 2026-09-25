/**
 * Архивный клиент и не в живой группе.
 * Фильтр customer/index: is_study 1 (клиент), removed 2 (только архив).
 * В строке ответа removed дока не обещает: пустое поле не выкидываем.
 * Явные 0 (активный) и 1 (в строке — не архив) не берём.
 * is_study 0 — лид, это шаг 6.
 */
export function step7Keep(row: { id?: unknown; is_study?: unknown; removed?: unknown }, live: Set<number>) {
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) return false;
  if (live.has(id)) return false;
  if (row.removed != null && row.removed !== "" && Number(row.removed) !== 2) return false;
  const study = row.is_study;
  return study === true || study === 1 || study === "1";
}
