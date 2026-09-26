/**
 * Архивный клиент и не в живой группе.
 * Фильтр customer/index: is_study 1 (клиент), removed 2 (только архив).
 * В строке ответа removed дока не обещает: пустое поле не выкидываем.
 * Явные 0 (активный) и 1 (в строке — не архив) не берём.
 * is_study 0 — лид, это шаг 6.
 */
/** Причина архива клиента. Официально Customer.customer_reject_id, словарь customer-reject/index. Пусто и 0 — причины нет. lead_reject_id сюда не берём: это лид. */
export function step7RejectId(row: { customer_reject_id?: unknown }) {
  const n = Number(row.customer_reject_id);
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
