import { formatRuPhone } from "./ru-phone";
import { TRIAL_COURSES, type TrialPayload } from "./trial-public";
import { trialCreateBody, trialLeadCard, trialLocalId, trialNoteLine } from "./trial-disk";

function courseName(id: string) {
  return TRIAL_COURSES.find((c) => c.id === id)?.name || "";
}

async function resolveTrialCourse(raw: string) {
  const id = String(raw || "").trim();
  if (!id) return { subjectId: "", courseId: "", name: "" };
  if (/^\d+$/.test(id)) {
    return { subjectId: id, courseId: "", name: courseName(id) };
  }
  try {
    const { loadScheduleMap } = await import("./schedule-map");
    const { subjectIdOfCourse } = await import("./ids");
    const map = loadScheduleMap();
    const sid = subjectIdOfCourse(id, map.courses);
    return { subjectId: sid ? String(sid) : "", courseId: id, name: courseName(id) };
  } catch {
    return { subjectId: "", courseId: id, name: courseName(id) };
  }
}

function dobFromAge(age?: number) {
  const n = Number(age);
  if (!Number.isFinite(n) || n < 2 || n > 18) return "";
  return `01.09.${new Date().getFullYear() - Math.round(n)}`;
}

export async function applyCreatedCustomer(
  localId: number,
  crmId: number,
  branchId: number,
  extra?: { phone?: string; child?: string; parent?: string; isStudy?: number },
) {
  if (!crmId) return;
  try {
    const { cacheReplaceLeadId } = await import("./crm-leads");
    cacheReplaceLeadId(branchId, localId, crmId);
  } catch {
    /* доска */
  }
  try {
    const { findDossier, upsertDossier } = await import("./dossiers");
    const prev =
      findDossier({ crmId: localId }) ||
      (extra?.phone ? findDossier({ phone: extra.phone }) : null);
    const study =
      extra?.isStudy === 0 || extra?.isStudy === 1 || extra?.isStudy === 2
        ? extra.isStudy
        : Number(prev?.extras?.is_study);
    const isStudy = Number.isFinite(study) ? Number(study) : 0;
    upsertDossier({
      crmId,
      branchId,
      phone: extra?.phone,
      child: extra?.child,
      parent: extra?.parent,
      extras: {
        is_study: String(isStudy),
        ...(isStudy === 0 ? { lead_status_id: String(prev?.extras?.lead_status_id || "1") } : {}),
        local_id: String(localId),
      },
      source: "alfacrm",
    });
  } catch {
    /* досье */
  }
  try {
    const { applyCreatedCommCustomer } = await import("./crm-comms");
    applyCreatedCommCustomer(localId, crmId);
  } catch {
    /* лента */
  }
}

export async function saveTrialLead(data: TrialPayload) {
  const parent = data.parent.trim();
  const child = (data.child || "").trim() || "Без имени";
  const phoneRaw = data.phone.trim();
  const email = (data.email || "").trim();
  const branch = data.branch.trim();
  if (!parent || !phoneRaw || !branch) {
    return { ok: false as const, error: "Нужны имя родителя, телефон и филиал." };
  }
  const phone = formatRuPhone(phoneRaw);
  let dob = (data.dob || "").trim();
  if (!dob && data.age) dob = dobFromAge(data.age);
  const [y, m, d] = dob.split("-");
  const dobRu = d && m && y ? `${d}.${m}.${y}` : dob || dobFromAge(data.age);
  const resolved = await resolveTrialCourse(data.course);
  let subjectId = Number(data.subjectId) || Number(resolved.subjectId) || 0;
  let courseId = resolved.courseId || data.course;
  try {
    const { resolveSignupIds } = await import("./site-signup-ids");
    const { listAdminSlots } = await import("./alfacrm-schedule");
    const { loadScheduleMap } = await import("./schedule-map");
    const { subjectIdOfCourse } = await import("./ids");
    const map = loadScheduleMap();
    const ids = resolveSignupIds({
      gid: data.gid,
      branchId: Number(branch) || 0,
      courseId,
      subjectId,
      slots: listAdminSlots(),
      subjectOfCourse: (id) => subjectIdOfCourse(id, map.courses),
    });
    subjectId = ids.subjectId;
    courseId = ids.courseId || courseId;
  } catch {
    /* карта или слоты недоступны */
  }
  const kind = String(data.kind || "trial");
  const { resolveLessonType } = await import("./alfacrm");
  const { lessonCreatePolicy } = await import("./lesson-type-rules");
  const type = resolveLessonType(kind) || resolveLessonType("trial")!;
  const policy = lessonCreatePolicy(type.id);
  const kindLabel = type.name.toLowerCase();
  const gidNum = data.gid && /^\d+$/.test(data.gid) ? Number(data.gid) : 0;
  const useGid = policy.allowGroup && gidNum ? gidNum : 0;
  const attach = policy.attachCgi && gidNum ? gidNum : 0;
  const branchId = Number(branch) || 2;
  const note = trialNoteLine({
    parent,
    child,
    kind: kindLabel,
    courseName: resolved.name || data.groupName || "",
    groupName: data.groupName,
    gid: data.gid,
    date: data.date,
    time: data.time,
  });
  let statusId = 1;
  try {
    const { loadFunnelAuto } = await import("./funnel-auto");
    const rules = loadFunnelAuto();
    if (rules.siteOn) statusId = rules.siteStageId;
  } catch {
    /* заводской Разбирается */
  }
  const lesson = {
    type: type.key,
    lesson_type_id: type.id,
    subjectId: subjectId || undefined,
    subject_id: subjectId || undefined,
    gid: useGid ? String(useGid) : "",
    date: data.date,
    lesson_date: data.date,
    time: data.time,
    time_from: data.time,
    duration: data.duration,
    note,
    teacherId: Number(data.teacherId) || undefined,
    teacher_ids: Number(data.teacherId) ? [Number(data.teacherId)] : undefined,
  };
  async function stampCalendar(customerId: number) {
    if (!data.date || !data.time || !subjectId || !customerId) return;
    try {
      const { nextLocalLessonId, upsertCustomerCalendar } = await import("./group-cards");
      const { stampJournal } = await import("./crm-journal-core");
      const { isoFromRu } = await import("./crm-dates").catch(async () => {
        const iso = String(data.date || "");
        const m = iso.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        return { isoFromRu: (d: string) => {
          const x = String(d).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
          return x ? `${x[3]}-${x[2].padStart(2, "0")}-${x[1].padStart(2, "0")}` : d;
        } };
      });
      const from = String(data.time).replace(".", ":").slice(0, 5);
      const mins = Number(data.duration) || 90;
      const [h, m] = from.split(":").map(Number);
      const tot = ((h || 0) * 60 + (m || 0) + mins) % (24 * 60);
      const to = `${String(Math.floor(tot / 60)).padStart(2, "0")}:${String(tot % 60).padStart(2, "0")}`;
      const dateIso = typeof isoFromRu === "function" ? isoFromRu(String(data.date)) : String(data.date);
      upsertCustomerCalendar(
        customerId,
        stampJournal(
          {
            date: dateIso,
            from,
            to,
            status: 1,
            type: type.name,
            typeId: type.id,
            duration: mins,
            subjectId,
            teacherIds: Number(data.teacherId) ? [Number(data.teacherId)] : [],
            groupIds: useGid ? [useGid] : [],
            customerIds: [customerId],
            note,
            lessonId: nextLocalLessonId(),
            group: data.groupName || type.name,
          },
          [customerId],
        ),
      );
    } catch {
      /* календарь */
    }
  }
  try {
    const { findDossier, upsertDossier } = await import("./dossiers");
    const { cachePutLead, forgetLead } = await import("./crm-leads");
    const { enqueueExport } = await import("./crm-export-queue");
    const existing = findDossier({ phone });
    const crmId = Number(existing?.crmId) || 0;
    if (crmId) {
      const alreadyClient = Number(existing?.extras?.is_study) === 1 || existing?.status === "учится";
      upsertDossier({
        crmId,
        branchId,
        phone,
        child,
        parent,
        dob: dobRu,
        extras: alreadyClient
          ? { is_study: "1", crm_funnel: "0" }
          : { is_study: "0", lead_status_id: String(statusId) },
        source: "site",
        note,
        ...(data.gid && /^\d+$/.test(data.gid)
          ? { groupLink: { id: Number(data.gid), name: data.groupName || "", branchId, school: "", active: true, subjectId, courseId } }
          : {}),
      });
      if (alreadyClient) forgetLead(crmId, branchId);
      else cachePutLead(trialLeadCard({ localId: crmId, branchId, child, phone, email, note, statusId }));
      try {
        const { appendComm } = await import("./crm-comms");
        appendComm({
          customerId: crmId,
          branchId,
          channel: "site",
          actor: "consultant",
          who: parent || "сайт",
          text: note,
          incoming: true,
        });
      } catch {
        /* лента */
      }
      enqueueExport({
        op: "customer.update",
        branchId,
        entityId: crmId,
        actor: "consultant",
        body: {
          name: child,
          legal_name: parent,
          ...(email ? { email: [email] } : {}),
          ...(dobRu ? { dob: dobRu } : {}),
          note,
          ...(data.gid && /^\d+$/.test(data.gid) ? { group_ids: [Number(data.gid)] } : {}),
        },
      });
      enqueueExport({
        op: "lesson.create",
        branchId,
        entityId: crmId,
        actor: "consultant",
        body: { via: "createAlfaLesson", ...lesson },
      });
      if (data.gid && /^\d+$/.test(data.gid)) {
        enqueueExport({
          op: "cgi.apply",
          branchId,
          entityId: crmId,
          actor: "consultant",
          body: { groupId: Number(data.gid), drop: false },
        });
      }
      return { ok: true as const, id: crmId, duplicate: true, branch: branchId, queued: true, pending: false, lesson: { type: kindLabel, date: data.date, time: data.time } };
    }
    const localId = trialLocalId();
    upsertDossier({
      crmId: undefined,
      branchId,
      phone,
      child,
      parent,
      dob: dobRu,
      extras: { is_study: "0", lead_status_id: String(statusId), local_id: String(localId) },
      source: "site",
      note,
      ...(data.gid && /^\d+$/.test(data.gid)
        ? { groupLink: { id: Number(data.gid), name: data.groupName || "", branchId, school: "", active: true, subjectId, courseId } }
        : {}),
    });
    cachePutLead(trialLeadCard({ localId, branchId, child, phone, email, note, statusId }));
    try {
      const { appendComm } = await import("./crm-comms");
      appendComm({
        customerId: localId,
        branchId,
        channel: "site",
        actor: "consultant",
        who: parent || "сайт",
        text: note,
        incoming: true,
      });
    } catch {
      /* лента */
    }
    enqueueExport({
      op: "customer.create",
      branchId,
      entityId: localId,
      actor: "consultant",
      body: trialCreateBody({
        localId,
        child,
        parent,
        phone,
        email,
        dob: dobRu,
        branchId,
        statusId,
        courseId,
        subjectId,
        gid: data.gid,
        note,
        lesson,
      }),
    });
    return { ok: true as const, id: localId, duplicate: false, branch: branchId, queued: true, pending: true, lesson: { type: kindLabel, date: data.date, time: data.time } };
  } catch (err) {
    console.error("saveTrialLead queue", err);
    return { ok: false as const, error: "Заявку не записали на сайт. Позвоните 8 (800) 511-34-01." };
  }
}
