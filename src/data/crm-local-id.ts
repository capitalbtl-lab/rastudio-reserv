/** Свои id кабинета. Alfa всегда > 0. Новое на диске сразу < 0, пока очередь не переписала. */

export function isLocalId(n: number) {
  return Number(n) < 0;
}

export function isCrmId(n: number) {
  return Number(n) > 0;
}

/**
 * Предмет: отрицательный — новый свой; 9000+ или local — старые свои до переписи.
 * Клиента/урок/этап 9000+ не трогаем: это номера Alfa.
 */
export function isLocalSubject(s: { id?: number; local?: boolean }) {
  const n = Number(s.id) || 0;
  return Boolean(s.local) || n < 0 || n >= 9000;
}

export function nextLocalId(used: Iterable<number> = [], now = Date.now()) {
  const seen = new Set<number>();
  for (const raw of used) {
    const n = Number(raw);
    if (n < 0) seen.add(n);
  }
  let id = -Math.abs((now % 1_000_000_000) || 1);
  while (id >= 0 || seen.has(id)) id -= 1;
  return id;
}
