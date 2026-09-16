/** Строка шага 2: диск / Alfa · осталось · пачка · +K · ЧЧ:ММ. Не диск, не второй счёт. */

import { LESSON_INBOUND_RUN } from "./crm-customer-sync.ts";

export const PEOPLE_PACK = LESSON_INBOUND_RUN;

export function keepAlfa(prev?: number, next?: number) {
  const hasPrev = prev != null && Number.isFinite(Number(prev));
  const hasNext = next != null && Number.isFinite(Number(next));
  if (!hasNext) return hasPrev ? Number(prev) : undefined;
  if (Number(next) === 0) return 0;
  if (!hasPrev) return Number(next);
  return Math.max(Number(prev), Number(next));
}
