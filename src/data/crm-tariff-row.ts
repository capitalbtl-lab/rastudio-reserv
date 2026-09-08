/** Одна «живость» строки абонемента ученика. Касса (balance / paid_till) сюда не входит. */

export function tariffTodayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });
}

export function tariffDateToIso(raw: string) {
  const s = String(raw || "").trim();
  if (!s || /^0{2,4}[-.]0{1,2}[-.]0{1,4}/.test(s)) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const y = Number(iso[1]);
    if (y < 2000) return "";
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (ru) {
    const y = Number(ru[3]);
    if (y < 2000) return "";
    return `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}`;
  }
  return "";
}

/**
 * Живая строка: есть id, не снята, e_date пусто или ≥ сегодня МСК.
 * Пустой tariff_id (подпись «абонемент») — всё равно живой.
 * b_date в будущем не выключает: только что назначили.
 */
export function tariffRowLive(it: Record<string, unknown>, today = tariffTodayIso()) {
  if (Number(it.removed || it.is_removed || 0) === 1) return false;
  if (!(Number(it.id) > 0)) return false;
  const to = tariffDateToIso(String(it.e_date || it.eDate || ""));
  if (to && to < today) return false;
  return true;
}

export function tariffRowHasTemplate(it: Record<string, unknown>, today = tariffTodayIso()) {
  return tariffRowLive(it, today) && Number(it.tariff_id || it.tariffId || 0) > 0;
}

export function tariffRowCustomerId(it: Record<string, unknown>) {
  const nested =
    it.customer && typeof it.customer === "object"
      ? Number((it.customer as { id?: unknown }).id || 0)
      : 0;
  const listed = Array.isArray(it.customer_ids) ? Number(it.customer_ids[0] || 0) : 0;
  return Number(it.customer_id || it.customerId || nested || listed || 0) || 0;
}

export function liveTariffCustomerIds(items: Record<string, unknown>[], today = tariffTodayIso()) {
  const ids = new Set<number>();
  for (const it of items) {
    if (!tariffRowLive(it, today)) continue;
    const cid = tariffRowCustomerId(it);
    if (cid) ids.add(cid);
  }
  return ids;
}

/** Подпись счёта как в Alfa: имя / предмет / дд.мм.гг / остаток. */

export function isGenericTariffName(raw?: string) {
  const s = String(raw || "").trim();
  if (!s) return true;
  return /^абонемент(\s*[#№]?\s*\d+)?$/i.test(s);
}

export function alfaDateShort(raw?: string) {
  const s = String(raw || "").trim();
  const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (ru) {
    const y = ru[3].length === 4 ? ru[3].slice(-2) : ru[3].padStart(2, "0");
    return `${ru[1].padStart(2, "0")}.${ru[2].padStart(2, "0")}.${y}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1].slice(2)}`;
  return s;
}

export function alfaSubjectShort(name?: string) {
  const s = String(name || "").trim();
  if (!s) return "";
  return s.length > 12 ? s.slice(0, 12) : s;
}

export function cttSelectLabel(t: { name?: string; bDate?: string; rest?: number; subject?: string }) {
  const rest = Number(t.rest || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = alfaDateShort(t.bDate);
  const sub = alfaSubjectShort(t.subject);
  const name = String(t.name || "абонемент").trim() || "абонемент";
  const bits = [name];
  if (sub && !name.toLowerCase().includes(sub.slice(0, 8).toLowerCase())) bits.push(sub);
  if (date) bits.push(date);
  bits.push(rest);
  return bits.join(" / ");
}
