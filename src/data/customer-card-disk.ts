import type { Dossier } from "./dossiers";
import type { CustomerCard } from "./crm-cards";
import { listAdminSlots } from "./alfacrm-schedule";
import { loadGroupCard } from "./group-cards";
import { beatsOf } from "./crm-slots-core";
import { clientCardId, CRM_BRANCH } from "./ids";
import { listTeachers, teachersAtBranch } from "./crm-teachers";
import { loadSubjects } from "./crm-subjects";
import { isAdminGroup } from "./group-status";

function ageLabel(dob: string) {
  const m = String(dob || "").match(/^(\d{1,2})[.](\d{1,2})[.](\d{4})$/) || String(dob || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const y = m[1].length === 4 ? Number(m[1]) : Number(m[3]);
  const mo = Number(m[2]);
  const d = m[1].length === 4 ? Number(m[3]) : Number(m[1]);
  const now = new Date();
  let years = now.getFullYear() - y;
  let months = now.getMonth() + 1 - mo;
  if (now.getDate() < d) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return "";
  return months ? `${years} лет +${months}мес` : `${years} лет`;
}

export function cardFromDossier(d: Dossier, branch: number): CustomerCard {
  const customerId = Number(d.crmId) || 0;
  const useBranch = Number(d.branchId || branch) || 1;
  const study = Number(d.extras?.is_study);
  const studyStatusId = Number(d.extras?.study_status_id || 0);
  const slots = listAdminSlots();
  const groups = (d.groupLinks || []).map((g) => {
    const slot = slots.find((s) => s.groupId === g.id && s.branchId === (g.branchId || useBranch)) || slots.find((s) => s.groupId === g.id);
    return {
      id: g.id,
      name: g.name || slot?.groupName || `группа ${g.id}`,
      branchId: g.branchId || slot?.branchId || useBranch,
      school: g.school || slot?.school || "",
      active: g.active !== false,
      subjectId: g.subjectId || slot?.subjectId || undefined,
      courseId: g.courseId || slot?.courseId,
    };
  });
  const days = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const regular: NonNullable<CustomerCard["regular"]> = [];
  const calendar: NonNullable<CustomerCard["calendar"]> = [];
  for (const g of groups.filter((x) => x.active)) {
    const slot = slots.find((s) => s.groupId === g.id && s.branchId === g.branchId) || slots.find((s) => s.groupId === g.id);
    if (slot) {
      for (const b of beatsOf(slot)) {
        regular.push({
          groupId: g.id,
          groupName: g.name || slot.groupName,
          day: slot.dayLabel || days[Number(b.day)] || "",
          from: b.timeFrom,
          to: b.timeTo,
          teacher: slot.teacher || "",
          subject: slot.subject || "",
          branch: CRM_BRANCH[slot.branchId]?.short || "",
          lessonId: b.lessonId,
          subjectId: slot.subjectId,
          teacherId: slot.teacherId || undefined,
          roomId: slot.roomId || undefined,
        });
      }
    }
    const gcard = loadGroupCard(g.branchId, g.id);
    for (const les of gcard?.calendar || []) {
      const ids = les.customerIds || [];
      if (ids.length && customerId && !ids.includes(customerId)) continue;
      calendar.push({
        id: Number(les.lessonId || 0),
        date: les.date,
        from: les.from,
        to: les.to,
        type: les.type || "",
        typeId: Number(les.typeId || 0),
        group: g.name || les.group || "",
        teacher: les.teacher || "",
        status: les.status,
        subject: les.subject || "",
        room: les.room || "",
      });
    }
  }
  const seen = new Set<string>();
  const catalogGroups: NonNullable<NonNullable<CustomerCard["catalog"]>["groups"]> = [];
  for (const s of slots) {
    if (!s.groupId || !isAdminGroup(s.statusId)) continue;
    const key = `${s.branchId}:${s.groupId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    catalogGroups.push({
      id: s.groupId,
      name: s.groupName,
      branchId: s.branchId,
      subjectId: s.subjectId || undefined,
      teacher: s.teacher,
      day: s.dayLabel,
      from: s.timeFrom,
      to: s.timeTo,
    });
  }
  catalogGroups.sort((a, b) => Number(b.branchId === useBranch) - Number(a.branchId === useBranch) || a.name.localeCompare(b.name, "ru"));
  return {
    id: customerId,
    cardId: clientCardId(customerId),
    branchId: useBranch,
    name: d.child.fio || "",
    parent: d.parent.fio || "",
    dob: d.child.dob || "",
    age: ageLabel(d.child.dob || ""),
    gender: d.child.gender || "",
    phones: d.phones || [],
    emails: [],
    address: d.address || "",
    status: d.status || (study === 0 ? "лид" : study === 2 ? "архив" : "учится"),
    isStudy: Number.isFinite(study) ? study : undefined,
    studyStatusId: studyStatusId || undefined,
    note: "",
    paidTill: "",
    url: d.url || "",
    schools: d.schools || [],
    groups,
    regular,
    calendar,
    tariffs: [],
    comms: [],
    catalog: {
      subjects: loadSubjects().map((s) => ({ id: s.id, name: s.name })),
      teachers: teachersAtBranch(useBranch, listTeachers(slots)).map((x) => ({ id: x.id, name: x.name })),
      rooms: [],
      groups: catalogGroups,
    },
  };
}
