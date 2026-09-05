/** Выгрузка в Alfa: диск уже записан, CRM догоняет пакетом. */

import type { CrmActorId } from "./crm-actors";

export type CrmExportOp =
  | "group.update"
  | "group.create"
  | "customer.update"
  | "customer.create"
  | "regular-lesson.update"
  | "regular-lesson.create"
  | "cgi.apply"
  | "customer-tariff.create"
  | "customer-tariff.clear"
  | "lesson.update"
  | "lesson.create"
  | "pay.create"
  | "subject.create"
  | "lead-status.create"
  | "lead-status.update"
  | "lead-status.delete";

export type CrmExportJob = {
  id: string;
  op: CrmExportOp;
  branchId: number;
  entityId: number;
  body: Record<string, unknown>;
  at: string;
  tries: number;
  actor?: CrmActorId;
};

export type CrmExportState = {
  jobs: CrmExportJob[];
  lastAt: string;
  lastNote: string;
};

export function emptyExportQueue(): CrmExportState {
  return { jobs: [], lastAt: "", lastNote: "" };
}

export function nidExport() {
  return `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function phoneKey(body: Record<string, unknown>) {
  const raw = Array.isArray(body.phone) ? body.phone[0] : body.phone || body.phoneDigits;
  return String(raw || "").replace(/\D/g, "").slice(-10);
}

function foldName(s: unknown) {
  return String(s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

export function sameExportJob(
  a: { op: CrmExportOp; branchId: number; entityId: number; body: Record<string, unknown> },
  b: { op: CrmExportOp; branchId: number; entityId: number; body: Record<string, unknown> },
) {
  if (a.op !== b.op || a.branchId !== b.branchId) return false;
  if (a.op === "cgi.apply") return a.entityId === b.entityId && Number(a.body.groupId) === Number(b.body.groupId);
  if (a.op === "group.create") return String(a.body.slotId || "") === String(b.body.slotId || "");
  if (a.op === "customer.create") return phoneKey(a.body) === phoneKey(b.body) && Boolean(phoneKey(a.body));
  if (a.op === "regular-lesson.create") {
    return a.entityId === b.entityId && Number(a.body.day) === Number(b.body.day) && String(a.body.time_from_v || "") === String(b.body.time_from_v || "");
  }
  if (a.op === "customer-tariff.create") {
    return a.entityId === b.entityId && Number(a.body.tariffId) === Number(b.body.tariffId) && String(a.body.bDate || "") === String(b.body.bDate || "");
  }
  if (a.op === "customer-tariff.clear") return a.entityId === b.entityId;
  if (a.op === "pay.create") return false;
  if (a.op === "lesson.create") {
    const aLocal = Number(a.body.localId || (a.entityId < 0 ? a.entityId : 0));
    const bLocal = Number(b.body.localId || (b.entityId < 0 ? b.entityId : 0));
    return Boolean(aLocal) && aLocal === bLocal;
  }
  if (a.op === "subject.create") {
    return foldName(a.body.name) === foldName(b.body.name) && Boolean(foldName(a.body.name));
  }
  if (a.op === "lead-status.create") {
    if (a.entityId && a.entityId === b.entityId) return true;
    return foldName(a.body.name) === foldName(b.body.name) && Boolean(foldName(a.body.name));
  }
  return a.entityId === b.entityId;
}

/** Одна правка одной сущности: поля сливаются, последняя запись побеждает. */
export function mergeExportJob(jobs: CrmExportJob[], incoming: Omit<CrmExportJob, "id" | "at" | "tries"> & { id?: string; at?: string; tries?: number }): CrmExportJob[] {
  const at = incoming.at || new Date().toISOString();
  if (incoming.op === "lead-status.delete" && incoming.entityId < 0) {
    return jobs.filter(
      (j) => !(j.op === "lead-status.create" && (j.entityId === incoming.entityId || Number(j.body.localId) === incoming.entityId)),
    );
  }
  const hit = jobs.find((j) => sameExportJob(j, incoming));
  if (hit) {
    return jobs.map((j) =>
      j.id === hit.id
        ? { ...j, body: { ...j.body, ...incoming.body }, at, tries: 0, actor: incoming.actor || j.actor }
        : j,
    );
  }
  return [
    ...jobs,
    {
      id: incoming.id || nidExport(),
      op: incoming.op,
      branchId: incoming.branchId,
      entityId: incoming.entityId,
      body: { ...incoming.body },
      at,
      tries: incoming.tries || 0,
      actor: incoming.actor || "human",
    },
  ].slice(-400);
}

export function exportPath(job: CrmExportJob) {
  if (job.op === "customer.update") return `/v2api/${job.branchId}/customer/update?id=${job.entityId}`;
  if (job.op === "customer.create") return `/v2api/${job.branchId}/customer/create`;
  if (job.op === "regular-lesson.update") return `/v2api/${job.branchId}/regular-lesson/update?id=${job.entityId}`;
  if (job.op === "regular-lesson.create") return `/v2api/${job.branchId}/regular-lesson/create`;
  if (job.op === "lesson.update") return `/v2api/${job.branchId}/lesson/update?id=${job.entityId}`;
  if (job.op === "lesson.create") return `/v2api/${job.branchId}/lesson/create`;
  if (job.op === "pay.create") return `/v2api/${job.branchId}/pay/create`;
  if (job.op === "group.create") return `/v2api/${job.branchId}/group/create`;
  if (job.op === "subject.create") return `/v2api/2/subject/create`;
  if (job.op === "lead-status.create") return `/v2api/1/lead-status/create`;
  if (job.op === "lead-status.update") return `/v2api/1/lead-status/update`;
  if (job.op === "lead-status.delete") return `/v2api/1/lead-status/delete`;
  if (job.op === "cgi.apply" || job.op === "customer-tariff.create" || job.op === "customer-tariff.clear") return "";
  return `/v2api/${job.branchId}/group/update`;
}

export function exportBody(job: CrmExportJob) {
  if (job.op === "pay.create") {
    const { localId: _localId, kind: _kind, ...rest } = job.body;
    return rest;
  }
  if (job.op === "lesson.create") {
    const { localId: _localId, via: _via, ...rest } = job.body;
    return rest;
  }
  if (job.op === "subject.create") return { name: String(job.body.name || ""), weight: 1 };
  if (job.op === "lead-status.create") {
    const { localId: _localId, ...rest } = job.body;
    const out: Record<string, unknown> = {
      name: String(rest.name || ""),
      pipeline_id: Number(rest.pipeline_id) || 1,
      is_enabled: rest.is_enabled === undefined ? 1 : rest.is_enabled,
    };
    if (rest.color) out.color = rest.color;
    if (rest.color_id !== undefined) out.color_id = rest.color_id;
    return out;
  }
  if (job.op === "lead-status.update") {
    const { localId: _localId, ...rest } = job.body;
    return { id: job.entityId, pipeline_id: Number(rest.pipeline_id) || 1, ...rest };
  }
  if (job.op === "lead-status.delete") return { id: job.entityId };
  if (job.op === "customer.create") {
    const { localId: _localId, courseId: _courseId, subjectId: _sid, lesson: _lesson, bDate: _bDate, eDate: _eDate, ...rest } = job.body;
    return rest;
  }
  if (job.op === "group.create" || job.op === "regular-lesson.create") {
    const { slotId: _slotId, beats: _beats, ...rest } = job.body;
    return rest;
  }
  return { id: job.entityId, ...job.body };
}

export function crmCreatedId(res: unknown) {
  if (!res || typeof res !== "object") return 0;
  const r = res as { model?: { id?: number }; id?: number };
  return Number(r.model?.id || r.id || 0) || 0;
}

const REMAP_SCALARS = [
  "localId",
  "subject_id",
  "lead_status_id",
  "id",
  "groupId",
  "customer_id",
  "related_id",
  "lessonId",
  "tariffId",
  "statusId",
] as const;

const REMAP_ARRAYS = ["subject_ids", "group_ids", "branch_ids"] as const;

/** Alfa вернула номер — перепись очереди. Свой id (from < 0 или local subject) → crmId. */
export function remapExportJobs(jobs: CrmExportJob[], from: number, to: number, skipId?: string): CrmExportJob[] {
  const a = Number(from) || 0;
  const b = Number(to) || 0;
  if (!a || !b || a === b) return jobs;
  return jobs.map((j) => {
    if (skipId && j.id === skipId) return j;
    const entityId = j.entityId === a ? b : j.entityId;
    const body = { ...j.body };
    let changed = entityId !== j.entityId;
    for (const k of REMAP_SCALARS) {
      if (Number(body[k]) === a) {
        body[k] = b;
        changed = true;
      }
    }
    for (const k of REMAP_ARRAYS) {
      if (!Array.isArray(body[k])) continue;
      const prev = body[k] as unknown[];
      const next = prev.map((n) => (Number(n) === a ? b : n));
      if (next.some((n, i) => n !== prev[i])) {
        body[k] = next;
        changed = true;
      }
    }
    return changed ? { ...j, entityId, body } : j;
  });
}

export function isSingleExportOp(op: CrmExportOp) {
  return (
    op === "cgi.apply" ||
    op === "customer-tariff.create" ||
    op === "customer-tariff.clear" ||
    op === "group.create" ||
    op === "customer.create" ||
    op === "subject.create" ||
    op === "lead-status.create" ||
    op === "lesson.create" ||
    op === "pay.create"
  );
}

export function exportJobSnap(jobs: CrmExportJob[]) {
  return jobs.map((j) => ({
    id: j.id,
    op: j.op,
    entityId: j.entityId,
    branchId: j.branchId,
    actor: j.actor || ("human" as CrmActorId),
    at: j.at,
    tries: j.tries,
  }));
}

export function exportOpLabel(op: CrmExportOp) {
  if (op === "customer.update") return "карточка";
  if (op === "customer.create") return "новый клиент";
  if (op === "group.update") return "группа";
  if (op === "group.create") return "новая группа";
  if (op === "cgi.apply") return "состав";
  if (op === "customer-tariff.create") return "абонемент";
  if (op === "customer-tariff.clear") return "снять абонемент";
  if (op === "lesson.create") return "занятие";
  if (op === "lesson.update") return "урок";
  if (op === "regular-lesson.update") return "расписание";
  if (op === "regular-lesson.create") return "слот";
  if (op === "pay.create") return "платёж";
  if (op === "subject.create") return "предмет";
  if (op === "lead-status.create") return "новый этап";
  if (op === "lead-status.update") return "этап воронки";
  if (op === "lead-status.delete") return "удалить этап";
  return op;
}
