/** Подписи клиента. Имя — не ключ; ключ всегда customerId. */

export function isPhoneLike(raw?: string) {
  const t = String(raw || "").trim();
  if (!t) return false;
  const compact = t.replace(/[\s()-]/g, "");
  if (/^\+?\d{10,15}$/.test(compact)) return true;
  if (/^[\d+\s()-]{6,}$/.test(t) && compact.replace(/\D/g, "").length >= 10) return true;
  return false;
}

/** Заголовок карточки / строки. Телефон никогда не становится ФИО. */
export function displayPersonName(child?: string, parent?: string, _phone?: string) {
  const c = String(child || "").trim();
  const p = String(parent || "").trim();
  if (c && !isPhoneLike(c)) return c;
  if (p && !isPhoneLike(p)) return p;
  return "Без имени";
}

export function displayParent(child?: string, parent?: string) {
  const p = String(parent || "").trim();
  if (!p || isPhoneLike(p)) return "";
  const title = displayPersonName(child, parent);
  return title === p ? "" : p;
}

export function initialsOf(name?: string) {
  const t = String(name || "").trim();
  if (!t || isPhoneLike(t) || t === "Без имени") return "·";
  const parts = t.split(/\s+/).filter(Boolean);
  const a = parts[0]?.charAt(0) || "";
  const b = parts.length > 1 ? parts[1].charAt(0) : "";
  return (a + b).toUpperCase() || "·";
}

export function statusLabel(s?: string) {
  if (s === "учится") return "Клиент";
  if (s === "лид") return "Лид";
  if (s === "архив") return "Архив";
  if (s === "снят") return "Снят";
  return s || "—";
}

export function membershipIds(branchId?: number | null, _branchIds?: number[]) {
  const primary = Number(branchId) || 0;
  return primary ? [primary] : [];
}
