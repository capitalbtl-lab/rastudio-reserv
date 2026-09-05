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

async function saveLeadForm(data: {
  parent: string;
  child: string;
  dobRu: string;
  phone: string;
  email: string;
  branch: string;
  course: string;
}) {
  const body = {
    LeadForm: { id: 20, lead_source_id: 2 },
    LeadFormForm: {
      field1763751875: data.parent,
      field1763751902: data.child,
      field1763751955: data.dobRu,
      field1763751913: data.phone,
      field1763751923: data.email,
      field1763755924: data.branch,
      ...(data.course ? { field1763755942: data.course } : {}),
    },
  };
  const res = await fetch("https://studiyarazvivaysya.s20.online/v2api/2/lead-form/save?id=20", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { success?: boolean; message?: string };
  if (json.success) return { ok: true as const };
  return { ok: false as const, error: json.message || "Не удалось отправить заявку. Позвоните нам." };
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
  const kindLabel = kind === "group" ? "групповое" : kind === "trial" ? "пробное" : kind;
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
    type: kind,
    subjectId: subjectId || undefined,
    gid: data.gid,
    date: data.date,
    time: data.time,
    duration: data.duration,
    note,
  };
  try {
    const { findDossier, upsertDossier } = await import("./dossiers");
    const { cachePutLead } = await import("./crm-leads");
    const { enqueueExport } = await import("./crm-export-queue");
    const existing = findDossier({ phone });
    const crmId = Number(existing?.crmId) || 0;
    if (crmId) {
      upsertDossier({
        crmId,
        branchId,
        phone,
        child,
        parent,
        dob: dobRu,
        extras: { is_study: "0", lead_status_id: String(statusId) },
        source: "site",
        note,
        ...(data.gid && /^\d+$/.test(data.gid)
          ? { groupLink: { id: Number(data.gid), name: data.groupName || "", branchId, school: "", active: true, subjectId, courseId } }
          : {}),
      });
      cachePutLead(trialLeadCard({ localId: crmId, branchId, child, phone, email, note, statusId }));
      enqueueExport({
        op: "customer.update",
        branchId,
        entityId: crmId,
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
        body: { via: "createAlfaLesson", ...lesson },
      });
      if (data.gid && /^\d+$/.test(data.gid)) {
        enqueueExport({
          op: "cgi.apply",
          branchId,
          entityId: crmId,
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
    enqueueExport({
      op: "customer.create",
      branchId,
      entityId: localId,
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
    try {
      const { upsertAlfaLead } = await import("./alfacrm");
      const saved = await upsertAlfaLead({
        parent,
        child,
        phone,
        email,
        dobRu,
        branchId: branch,
        courseName: resolved.name || data.groupName || "",
        courseId,
        subjectId: subjectId || undefined,
        gid: data.gid,
        groupName: data.groupName,
        kind,
        date: data.date,
        time: data.time,
        duration: data.duration,
      });
      return {
        ok: true as const,
        id: saved.id,
        duplicate: saved.duplicate,
        branch: saved.branch,
        url: saved.url,
        lesson: saved.lesson,
      };
    } catch (err2) {
      console.error("saveTrialLead", err2);
      try {
        const form = await saveLeadForm({
          parent,
          child,
          dobRu: dobRu || dobFromAge(data.age) || "01.09.2017",
          phone,
          email: email || `lead+${phone.replace(/\D/g, "").slice(-10)}@rastudio.org`,
          branch,
          course: subjectId ? String(subjectId) : resolved.subjectId || resolved.courseId,
        });
        if (form.ok) return { ok: true as const, id: 0, duplicate: false, branch: branchId };
        return form;
      } catch {
        return { ok: false as const, error: "Сеть недоступна. Позвоните 8 (800) 511-34-01." };
      }
    }
  }
}
