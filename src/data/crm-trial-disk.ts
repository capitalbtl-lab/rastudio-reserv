/** Пробное Чудновой на диск сразу. Alfa догоняет очередью. Без token. */

import { planChudnovaTrial, TRIAL_TEST_DATE, TRIAL_TEST_TIME, TRIAL_TEST_SUBJECT, TRIAL_TEST_TEACHER, shouldEnsureChudnovaTrial } from "./crm-trial-test-core.ts";
import { loadCustomerCalendar, nextLocalLessonId, upsertCustomerCalendar, upsertGroupCalendar } from "./group-cards.ts";
import { stampJournal } from "./crm-journal-core.ts";
import { enqueueExport } from "./crm-export-queue.ts";
import { DEFAULT_ROOM } from "./crm-rooms.ts";

function isoFromRu(date: string) {
  const m = String(date).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "2026-09-08";
}

function addMins(hhmm: string, mins: number) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  const t = ((h * 60 + m + Number(mins || 0)) % (24 * 60) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function ensureChudnovaTrialDisk(opts: {
  customerId: number;
  branchId: number;
  name?: string;
  gid?: number;
  subjectId?: number;
  roomId?: number;
  teacherId?: number;
  groupName?: string;
  subject?: string;
  teacher?: string;
}) {
  const customerId = Number(opts.customerId) || 0;
  const branchId = Number(opts.branchId) || 1;
  if (!shouldEnsureChudnovaTrial(customerId, opts.name)) return null;
  const cal = loadCustomerCalendar(customerId);
  const want = isoFromRu(TRIAL_TEST_DATE);
  const hit = cal.find((l) => String(l.date || "").startsWith(want));
  if (hit) return { existed: true as const, lessonId: Number(hit.lessonId) || 0, date: String(hit.date || "") };
  const plan = planChudnovaTrial({
    customerId,
    branchId,
    subjectId: Number(opts.subjectId) || TRIAL_TEST_SUBJECT,
    gid: 0,
    roomId: Number(opts.roomId) || DEFAULT_ROOM[branchId] || 28,
    teacherId: Number(opts.teacherId) || TRIAL_TEST_TEACHER,
    date: TRIAL_TEST_DATE,
    time: TRIAL_TEST_TIME,
  });
  if (!plan) return null;
  const localId = nextLocalLessonId();
  const to = addMins(plan.time, plan.duration);
  const row = stampJournal(
    {
      date: isoFromRu(plan.date),
      from: plan.time,
      to,
      status: 1,
      type: "Пробное",
      typeId: 3,
      duration: plan.duration,
      subjectId: plan.subjectId,
      teacherIds: plan.teacherId ? [plan.teacherId] : [],
      roomId: plan.roomId || undefined,
      groupIds: plan.gid ? [plan.gid] : [],
      customerIds: [plan.customerId],
      note: plan.note,
      lessonId: localId,
      group: opts.groupName || "Пробное",
      subject: opts.subject || "Художественная школа (10-14 лет)",
      teacher: opts.teacher || "",
    },
    [plan.customerId],
  );
  upsertCustomerCalendar(plan.customerId, row);
  if (plan.gid) {
    upsertGroupCalendar(plan.branchId, plan.gid, row, { name: opts.groupName, subjectId: plan.subjectId, subject: opts.subject });
  }
  enqueueExport({
    op: "lesson.create",
    branchId: plan.branchId,
    entityId: plan.customerId,
    body: {
      localId,
      type: "trial",
      lesson_type_id: 3,
      date: plan.date,
      lesson_date: plan.date,
      time: plan.time,
      time_from: plan.time,
      duration: plan.duration,
      subjectId: plan.subjectId,
      subject_id: plan.subjectId,
      customer_ids: [plan.customerId],
      room_id: plan.roomId || 28,
      roomId: plan.roomId || 28,
      note: plan.note,
    },
  });
  return { existed: false as const, lessonId: localId, date: isoFromRu(plan.date) };
}
