import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  emptyExportQueue,
  exportBody,
  exportPath,
  mergeExportJob,
  crmCreatedId,
  isSingleExportOp,
  type CrmExportJob,
  type CrmExportState,
} from "./crm-export-queue-core";
import { logAdmin } from "./admin-settings";

const MAX_TRIES = 5;
const g = globalThis as { __raCrmExportBusy?: boolean };

function fileOf() {
  return join(process.cwd(), "storage", "crm-export-queue.json");
}

function loadExport(): CrmExportState {
  try {
    if (!existsSync(fileOf())) return emptyExportQueue();
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as CrmExportState;
    return { jobs: Array.isArray(raw.jobs) ? raw.jobs : [], lastAt: String(raw.lastAt || ""), lastNote: String(raw.lastNote || "") };
  } catch {
    return emptyExportQueue();
  }
}

function saveExport(q: CrmExportState) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify({ jobs: q.jobs.slice(-400), lastAt: q.lastAt, lastNote: q.lastNote }, null, 0), "utf8");
  return q;
}

export function crmExportSnapshot() {
  const q = loadExport();
  return { pending: q.jobs.length, lastAt: q.lastAt, lastNote: q.lastNote, busy: Boolean(g.__raCrmExportBusy), ops: q.jobs.map((j) => `${j.op}:${j.entityId}`) };
}

export function enqueueExport(incoming: Omit<CrmExportJob, "id" | "at" | "tries">) {
  const q = loadExport();
  q.jobs = mergeExportJob(q.jobs, incoming);
  q.lastAt = new Date().toISOString();
  q.lastNote = `${incoming.op} ${incoming.entityId}`;
  saveExport(q);
  if (!g.__raCrmExportBusy) void tickExportQueue(2);
  return crmExportSnapshot();
}

export async function tickExportQueue(take = 2) {
  if (g.__raCrmExportBusy) return crmExportSnapshot();
  g.__raCrmExportBusy = true;
  try {
    const { token, request } = await import("./alfacrm");
    const t = await token();
    let q = loadExport();
    const first = q.jobs[0];
    const n = isSingleExportOp(first?.op || "group.update") ? 1 : Math.max(1, take);
    const batch = q.jobs.slice(0, n);
    for (const job of batch) {
      try {
        if (job.op === "cgi.apply") {
          const { applyGroupMembership } = await import("./crm-membership");
          const res = await applyGroupMembership(request, t, {
            customerId: job.entityId,
            groupId: Number(job.body.groupId),
            branch: job.branchId,
            drop: Boolean(job.body.drop),
            bDate: String(job.body.bDate || "") || undefined,
            eDate: String(job.body.eDate || "") || undefined,
          });
          if (!res.ok) throw new Error(res.error || "cgi не подтвердил состав");
        } else if (job.op === "customer-tariff.create") {
          const { postCustomerTariff } = await import("./pupil-tariffs");
          const res = await postCustomerTariff(request, t, {
            branch: job.branchId,
            customerId: job.entityId,
            tariffId: Number(job.body.tariffId),
            bDate: String(job.body.bDate || ""),
            eDate: String(job.body.eDate || ""),
            groupId: Number(job.body.groupId) || 0,
            calcType: Number(job.body.calcType) || 0,
            subjectIds: Array.isArray(job.body.subjectIds) ? (job.body.subjectIds as number[]) : undefined,
            lessonTypeIds: Array.isArray(job.body.lessonTypeIds) ? (job.body.lessonTypeIds as number[]) : undefined,
            periodCount: Number(job.body.periodCount) || undefined,
            periodType: Number(job.body.periodType) || undefined,
            note: job.body.note ? String(job.body.note) : "",
            lessonsCount: Number(job.body.lessonsCount) || undefined,
          });
          if (!res.ok) throw new Error(res.error || "абонемент не принят");
        } else if (job.op === "lesson.create" && job.body.via === "createAlfaLesson") {
          const { createAlfaLesson } = await import("./alfacrm");
          const booked = await createAlfaLesson({
            branch: job.branchId,
            customerId: job.entityId,
            type: String(job.body.type || "trial"),
            subjectId: Number(job.body.subjectId) || undefined,
            gid: job.body.gid ? String(job.body.gid) : undefined,
            date: job.body.date ? String(job.body.date) : undefined,
            time: job.body.time ? String(job.body.time) : undefined,
            duration: Number(job.body.duration) || undefined,
            note: job.body.note ? String(job.body.note) : undefined,
          });
          if (!booked.ok) throw new Error(booked.error || "урок не создался");
        } else if (job.op === "subject.create") {
          const res = await request<{ success?: boolean; errors?: unknown; model?: { id?: number }; id?: number }>(
            exportPath(job),
            exportBody(job),
            t,
          );
          if (res.success === false) throw new Error(JSON.stringify(res.errors || res));
          const sid = crmCreatedId(res);
          if (!sid) throw new Error("AlfaCRM не вернула номер предмета");
          const localId = Number(job.body.localId || job.entityId) || 0;
          const { applyCreatedSubject, activateCrmSubject } = await import("./crm-subjects");
          await applyCreatedSubject(localId, sid, String(job.body.name || ""));
          await activateCrmSubject(sid).catch(() => undefined);
          q = loadExport();
          q.jobs = q.jobs.map((j) => {
            if (j.id === job.id) return j;
            const body = { ...j.body };
            if (Number(body.subject_id) === localId) body.subject_id = sid;
            if (Array.isArray(body.subject_ids)) {
              body.subject_ids = (body.subject_ids as unknown[]).map((n) => (Number(n) === localId ? sid : n));
            }
            return { ...j, body };
          });
          saveExport(q);
        } else if (job.op === "customer-tariff.clear") {
          const { customerTariffIndexPath, customerTariffUpdatePath, customerTariffDeletePath, activeCustomerTariffs } = await import("./pupil-tariffs");
          const json = await request<{ items?: Record<string, unknown>[] }>(
            customerTariffIndexPath(job.branchId, job.entityId),
            { page: 0, pageSize: 50, customer_id: job.entityId },
            t,
          );
          const list = activeCustomerTariffs(json.items);
          const mode = String(job.body.mode || "close");
          const eDate = String(job.body.eDate || "");
          for (const tar of list) {
            if (mode === "delete") {
              await request(customerTariffDeletePath(job.branchId, tar.id, job.entityId), { id: tar.id, customer_id: job.entityId }, t);
            } else {
              await request(customerTariffUpdatePath(job.branchId, tar.id, job.entityId), { id: tar.id, customer_id: job.entityId, e_date: eDate }, t);
            }
          }
        } else {
          const res = await request<{ success?: boolean; errors?: unknown; model?: { id?: number }; id?: number }>(exportPath(job), exportBody(job), t);
          if (res.success === false) throw new Error(JSON.stringify(res.errors || res));
          if (job.op === "group.create") {
            const gid = crmCreatedId(res);
            if (!gid) throw new Error("AlfaCRM не вернула номер группы");
            const { applyCreatedGroup, applyCreatedLesson } = await import("./alfacrm-schedule");
            applyCreatedGroup(String(job.body.slotId || ""), gid, job.branchId);
            const beats = Array.isArray(job.body.beats)
              ? (job.body.beats as { day?: number; timeFrom?: string; timeTo?: string; lessonId?: number }[])
              : [];
            for (const b of beats) {
              if (Number(b.lessonId) || !b.timeFrom || !b.timeTo) continue;
              const created = await request<{ model?: { id?: number }; id?: number }>(
                `/v2api/${job.branchId}/regular-lesson/create`,
                {
                  related_class: "Group",
                  related_id: gid,
                  subject_id: job.body.subject_id,
                  subject_ids: job.body.subject_ids,
                  branch_id: job.branchId,
                  lesson_type_id: 2,
                  day: b.day,
                  days: [b.day],
                  time_from_v: b.timeFrom,
                  time_to_v: b.timeTo,
                  ...(Array.isArray(job.body.teacher_ids) ? { teacher_ids: job.body.teacher_ids } : {}),
                  b_date: job.body.b_date,
                  e_date: job.body.e_date,
                },
                t,
              );
              const lid = crmCreatedId(created);
              if (lid) applyCreatedLesson(`gid:${job.branchId}:${gid}`, Number(b.day) || 1, String(b.timeFrom), lid);
            }
          }
          if (job.op === "customer.create") {
            const cid = crmCreatedId(res);
            if (!cid) throw new Error("AlfaCRM не вернула номер клиента");
            const { applyCreatedCustomer } = await import("./trial-save");
            await applyCreatedCustomer(Number(job.body.localId) || job.entityId, cid, job.branchId, {
              phone: Array.isArray(job.body.phone) ? String(job.body.phone[0] || "") : String(job.body.phone || ""),
              child: String(job.body.name || ""),
              parent: String(job.body.legal_name || ""),
              isStudy: Number(job.body.is_study) || 0,
            });
            const lesson = job.body.lesson as { type?: string; subjectId?: number; gid?: string; date?: string; time?: string; duration?: number; note?: string } | null | undefined;
            if (lesson) {
              const { createAlfaLesson } = await import("./alfacrm");
              await createAlfaLesson({
                branch: job.branchId,
                customerId: cid,
                type: lesson.type || "trial",
                subjectId: Number(lesson.subjectId) || undefined,
                gid: lesson.gid,
                date: lesson.date,
                time: lesson.time,
                duration: lesson.duration,
                note: lesson.note,
              }).catch((e) => logAdmin(`Урок после заявки ${cid}: ${e instanceof Error ? e.message : e}`, "sync"));
            }
            const gid = Number((job.body.group_ids as number[] | undefined)?.[0] || 0);
            if (gid) {
              enqueueExport({
                op: "cgi.apply",
                branchId: job.branchId,
                entityId: cid,
                actor: job.actor || "sync",
                body: {
                  groupId: gid,
                  drop: false,
                  bDate: String(job.body.bDate || ""),
                  eDate: String(job.body.eDate || ""),
                },
              });
            }
          }
          if (job.op === "lead-status.create") {
            const sid = crmCreatedId(res);
            if (!sid) throw new Error("AlfaCRM не вернула номер этапа");
            const localId = Number(job.body.localId || job.entityId) || 0;
            const { applyCreatedLeadStage } = await import("./crm-leads");
            applyCreatedLeadStage(localId, sid);
            q = loadExport();
            q.jobs = q.jobs.map((j) => {
              if (j.id === job.id) return j;
              let entityId = j.entityId;
              if ((j.op === "lead-status.update" || j.op === "lead-status.delete") && j.entityId === localId) entityId = sid;
              const body = { ...j.body };
              if (Number(body.lead_status_id) === localId) body.lead_status_id = sid;
              if (Number(body.localId) === localId) body.localId = sid;
              if (String(j.op).startsWith("lead-status") && Number(body.id) === localId) body.id = sid;
              return { ...j, entityId, body };
            });
            saveExport(q);
          }
          if (job.op === "lesson.create") {
            const lid = crmCreatedId(res);
            if (!lid) throw new Error("AlfaCRM не вернула номер занятия");
            const localId = Number(job.body.localId || job.entityId) || 0;
            if (localId < 0) {
              const { applyCreatedCalendarLesson } = await import("./group-cards");
              applyCreatedCalendarLesson(localId, lid);
              q = loadExport();
              q.jobs = q.jobs.map((j) => {
                if (j.id === job.id) return j;
                if (j.op === "lesson.update" && j.entityId === localId) return { ...j, entityId: lid };
                return j;
              });
              saveExport(q);
            }
          }
        }
        q = loadExport();
        q.jobs = q.jobs.filter((j) => j.id !== job.id);
        q.lastAt = new Date().toISOString();
        q.lastNote = `${job.op} ${job.entityId} ok`;
        saveExport(q);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        q = loadExport();
        q.jobs = q.jobs.map((j) => (j.id === job.id ? { ...j, tries: j.tries + 1 } : j)).filter((j) => j.tries < MAX_TRIES);
        q.lastAt = new Date().toISOString();
        q.lastNote = `${job.op} ${job.entityId}: ${msg}`;
        saveExport(q);
        logAdmin(`Выгрузка CRM: ${q.lastNote}`, "sync");
      }
    }
    return crmExportSnapshot();
  } finally {
    g.__raCrmExportBusy = false;
  }
}
