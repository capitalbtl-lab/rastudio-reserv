/** Штамп входа ученика: полная история один раз, дальше только новое. */

import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { lessonsSetGap } from "./crm-inbound-core.ts";

export const CUSTOMER_SYNC_TTL_MS = 10 * 60 * 1000;
export const LESSON_INBOUND_RUN = 7;
export const LESSON_STATUSES = [3, 1, 2] as const;
export const LESSON_RECENT_DAYS = -21;

export type LessonFillCursor = { bid: number; statusIdx: number; page: number; done?: boolean; from?: string; to?: string };

export const LESSON_FILL_FLOOR = "2015-01-01";

export type CustomerSyncStamp = {
  lessonsAt?: string;
  lessonsFull?: boolean;
  /** Детали явки (is_attend) за весь период уже сняты с Alfa. */
  lessonsAttend?: boolean;
  lessonFill?: LessonFillCursor;
  paysAt?: string;
  lessonsRecheckAt?: string;
  paysRecheckAt?: string;
  /** Дырка журнала принята человеком. Проба/Добрать/синяя не ставят и не снимают. */
  journalHoleApprovedAt?: string;
  /** Явный «С нуля». Живая качка с этим штампом не пишет счёт обратно. */
  lessonsResetAt?: string;
  /** Явный «С нуля» кассы. Живой inboundPays с этим штампом не пишет строки обратно. */
  paysResetAt?: string;
  /** Сколько занятий Alfa отдаёт по customer_id (сверка с диском). */
  lessonsAlfa?: number;
  lessonsAlfaAt?: string;
  /** Сколько занятий на диске после последней загрузки/перепроверки. */
  lessonsDisk?: number;
  /** Номера уроков, которые видели в Alfa за этот проход перепроверки. */
  lessonsSeenIds?: number[];
  /** Сколько id переписи нет на диске. Решение колонки — множества, не total. */
  lessonsHoleN?: number;
  /** Сколько id на диске нет в переписи (без hold/группы). */
  lessonsExtraN?: number;
  /** Окно пробы жёлтых, у кого уже есть счёт: 30 → 90 → 180. Нет ключа — полное 2015. */
  lessonsWindowDays?: number;
};

type Store = { at: string; byId: Record<string, CustomerSyncStamp> };

let mem: Store | null = null;
let memMtime = 0;

function fileOf() {
  return join(process.cwd(), "storage", "crm-customer-sync.json");
}
