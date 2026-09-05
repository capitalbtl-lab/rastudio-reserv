/** Заявка с сайта/консультанта: диск сразу, Alfa — очередью. Только ID. */
import { nextLocalId } from "./crm-local-id.ts";

export type TrialLessonBody = {
  type: string;
  subjectId?: number;
  gid?: string;
  date?: string;
  time?: string;
  duration?: number;
  note?: string;
};

export type TrialCreateBody = {
  name: string;
  legal_name: string;
  legal_type: number;
  phone: string[];
  email?: string[];
  dob?: string;
  is_study: number;
  lead_source_id: number;
  lead_status_id: number;
  pipeline_id: number;
  branch_ids: number[];
  note: string;
  group_ids?: number[];
  localId: number;
  courseId?: string;
  subjectId?: number;
  lesson?: TrialLessonBody | null;
};

export function trialLocalId(now = Date.now()) {
  return nextLocalId([], now);
}

export function trialPhoneDigits(phone: string) {
  return String(phone || "").replace(/\D/g, "").slice(-10);
}

export function trialNoteLine(opts: {
  parent: string;
  child: string;
  kind: string;
  courseName?: string;
  groupName?: string;
  gid?: string;
  date?: string;
  time?: string;
}) {
  return [
    `Заказчик: ${opts.parent}`,
    `Ребёнок: ${opts.child}`,
    `Тип: ${opts.kind}`,
    opts.courseName ? `Курс: ${opts.courseName}` : "",
    opts.groupName ? `Группа: ${opts.groupName}` : "",
    opts.gid ? `gid=${opts.gid}` : "",
    opts.date || opts.time ? `Слот: ${opts.date || ""} ${opts.time || ""}`.trim() : "",
    "Источник: rastudio.org",
  ]
    .filter(Boolean)
    .join("\n");
}

export function trialCreateBody(opts: {
  localId: number;
  child: string;
  parent: string;
  phone: string;
  email?: string;
  dob?: string;
  branchId: number;
  statusId?: number;
  courseId?: string;
  subjectId?: number;
  gid?: string;
  note: string;
  lesson?: TrialLessonBody | null;
}): TrialCreateBody {
  const gid = opts.gid && /^\d+$/.test(opts.gid) ? Number(opts.gid) : 0;
  const email = String(opts.email || "").trim();
  const dob = String(opts.dob || "").trim();
  return {
    name: opts.child,
    legal_name: opts.parent,
    legal_type: 1,
    phone: [opts.phone],
    ...(email ? { email: [email] } : {}),
    ...(dob ? { dob } : {}),
    is_study: 0,
    lead_source_id: 2,
    lead_status_id: Number(opts.statusId) || 1,
    pipeline_id: 1,
    branch_ids: [opts.branchId],
    note: opts.note,
    ...(gid ? { group_ids: [gid] } : {}),
    localId: opts.localId,
    courseId: opts.courseId || "",
    subjectId: opts.subjectId || 0,
    lesson: opts.lesson || null,
  };
}

export function trialAlfaCustomerBody(body: TrialCreateBody) {
  const { localId: _localId, courseId: _courseId, subjectId: _subjectId, lesson: _lesson, ...rest } = body;
  return rest;
}

export function trialLeadCard(opts: {
  localId: number;
  branchId: number;
  child: string;
  phone: string;
  email?: string;
  note?: string;
  statusId?: number;
}) {
  return {
    id: opts.localId,
    customerId: opts.localId,
    branchId: opts.branchId,
    name: opts.child,
    age: "",
    phone: opts.phone,
    email: opts.email || "",
    note: opts.note || "",
    assigned: "",
    statusId: Number(opts.statusId) || 1,
    at: new Date().toISOString(),
    chats: 0,
  };
}
