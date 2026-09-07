export function customerIdsOfRegular(it: Record<string, unknown>) {
  return Array.isArray(it.customer_ids) ? it.customer_ids.map(Number).filter((n) => n > 0) : [];
}

/** Копии ученика, не общий слот группы на 18:10. */
export function pickCustomerRegularItems(items: Record<string, unknown>[], customerId: number) {
  const cid = Number(customerId) || 0;
  const hit = (items || []).filter((it) => {
    if (Number(it.disabled || it.is_disabled || 0) === 1) return false;
    const ids = customerIdsOfRegular(it);
    return !ids.length || ids.includes(cid);
  });
  const personal = hit.filter((it) => {
    const ids = customerIdsOfRegular(it);
    return ids.length > 0 && ids.length <= 3 && ids.includes(cid);
  });
  const chosen = personal.length ? personal : hit.filter((it) => customerIdsOfRegular(it).includes(cid));
  const list = chosen.length ? chosen : hit;
  const map = new Map<string, Record<string, unknown>>();
  for (const it of list) {
    const from = String(it.time_from_v || it.time_from || "");
    const key = `${Number(it.day || 0)}|${from}|${Number(it.related_id || it.group_id || 0)}`;
    const prev = map.get(key);
    const n = customerIdsOfRegular(it).length;
    if (!prev || n < customerIdsOfRegular(prev).length || n === 1) map.set(key, it);
  }
  return [...map.values()];
}
