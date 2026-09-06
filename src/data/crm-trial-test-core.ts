/** Разовое пробное: только Чуднова Александра, отдельная дата в расписании. */

import { isChudnovaAlexandra, PAY_TEST_NAME } from "./crm-pay-test-core.ts";

export const TRIAL_TEST_ID = "2026-09-06-chudnova-trial-c";
export const TRIAL_TEST_DATE = "08.09.2026";
export const TRIAL_TEST_TIME = "16:00";
export const TRIAL_TEST_SUBJECT = 92;
export const TRIAL_TEST_DURATION = 90;

export { isChudnovaAlexandra, PAY_TEST_NAME };

export function planChudnovaTrial(opts: {
  customerId: number;
  branchId: number;
  subjectId?: number;
  gid?: number;
  roomId?: number;
  teacherId?: number;
  date?: string;
  time?: string;
}) {
  const customerId = Number(opts.customerId) || 0;
  const branchId = Number(opts.branchId) || 0;
  if (!customerId || !branchId) return null;
  return {
    customerId,
    branchId,
    subjectId: Number(opts.subjectId) || TRIAL_TEST_SUBJECT,
    gid: Number(opts.gid) || 0,
    roomId: Number(opts.roomId) || 0,
    teacherId: Number(opts.teacherId) || 0,
    date: String(opts.date || TRIAL_TEST_DATE),
    time: String(opts.time || TRIAL_TEST_TIME),
    duration: TRIAL_TEST_DURATION,
    type: "trial" as const,
    note: `пробное rastudio.org · ${PAY_TEST_NAME}`,
  };
}
