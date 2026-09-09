import type { Dossier } from "./dossiers";
import type { CustomerCard } from "./crm-cards";
import { listAdminSlots } from "./alfacrm-schedule";
import { collectCustomerJournal, journalGroupsOfCustomer } from "./group-cards";
import { beatsOf } from "./crm-slots-core";
import { clientCardId, CRM_BRANCH } from "./ids";
import { listTeachers, teachersAtBranch } from "./crm-teachers";
import { loadSubjects } from "./crm-subjects";
import { isAdminGroup } from "./group-status";
import { clientLessonFromJournal } from "./crm-journal-core";
import { customerBalance, cardPays, isPayJournalComplete } from "./crm-pay";
import { writeoffSumOf } from "./crm-ledger-core";
import { accountSnapOf, liveCttOf, paySumForCtt, payCountForCtt } from "./crm-pay-core";
import { asCustomerComm, commsOf } from "./crm-comms";
import { loadTariffs } from "./crm-tariffs";
import { isPaidCountLabel, parseDossierCtt, withCatalogCtt } from "./pupil-tariffs";
import { parseDossierRegular, regularBelongsToGroups } from "./crm-regular-core";
import { roomsCatalog } from "./crm-rooms";
import { loadRooms } from "./crm-rooms-disk";
import { ensureChudnovaTrialDisk } from "./crm-trial-disk";

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

let catalogSlots: ReturnType<typeof listAdminSlots> | null = null;
let catalogMemo: {
  groups: NonNullable<NonNullable<CustomerCard["catalog"]>["groups"]>;
  subjects: { id: number; name: string }[];
  rooms: { id: number; name: string; branchId: number }[];
} | null = null;

function catalogBase() {
  const slots = listAdminSlots();
  if (catalogMemo && catalogSlots === slots) return catalogMemo;
  const seen = new Set<string>();
  const groups: NonNullable<NonNullable<CustomerCard["catalog"]>["groups"]> = [];
  for (const s of slots) {
    if (!s.groupId || !isAdminGroup(s.statusId)) continue;
    const key = `${s.branchId}:${s.groupId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push({
      id: s.groupId,
      name: s.groupName,
      branchId: s.branchId,
      subjectId: s.subjectId || undefined,
      teacher: s.teacher,
      teacherId: s.teacherId || undefined,
      day: s.dayLabel,
      from: s.timeFrom,
      to: s.timeTo,
      roomId: s.roomId || undefined,
      course: s.course || undefined,
      school: s.school || undefined,
      schoolId: s.schoolId,
      courseId: s.courseId,
      statusId: s.statusId || undefined,
    });
  }
  catalogSlots = slots;
  catalogMemo = {
    groups,
    subjects: loadSubjects().map((s) => ({ id: s.id, name: s.name })),
    rooms: roomsCatalog(slots, loadRooms()),
  };
  return catalogMemo;
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
  for (const g of journalGroupsOfCustomer(customerId, groups)) {
    if (groups.some((x) => x.id === g.id && x.branchId === g.branchId)) continue;
    groups.push({
      id: g.id,
      name: g.name || `группа ${g.id}`,
      branchId: g.branchId,
      school: "",
      active: false,
      subjectId: g.subjectId,
      courseId: undefined,
    });
  }
  const days = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const regular: NonNullable<CustomerCard["regular"]> = [];
  const calendar: NonNullable<CustomerCard["calendar"]> = [];
  const activeGroups = groups.filter((x) => x.active);
  const ownRegular = parseDossierRegular(d.extras).filter((r) => regularBelongsToGroups(r, groups));
  if (ownRegular.length) {
    for (const r of ownRegular) {
      const g = groups.find((x) => x.id === r.groupId);
      regular.push({
        groupId: r.groupId || g?.id || 0,
        groupName: r.groupName || g?.name || "",
        day: r.dayLabel,
        from: r.from,
        to: r.to,
        teacher: r.teacher || "",
        subject: r.subject || "",
        branch: CRM_BRANCH[r.branchId || g?.branchId || useBranch]?.short || "",
        lessonId: r.id,
        subjectId: r.subjectId,
        teacherId: r.teacherId,
        roomId: r.roomId,
        bDate: r.bDate,
        eDate: r.eDate,
      });
    }
  }
  const art = activeGroups.find((g) => /художествен/i.test(g.name || g.school || "")) || activeGroups[0];
  const artSlot = art
    ? slots.find((s) => s.groupId === art.id && s.branchId === art.branchId) || slots.find((s) => s.groupId === art.id)
    : undefined;
  ensureChudnovaTrialDisk({
    customerId,
    branchId: useBranch,
    name: d.child.fio,
    gid: art?.id,
    subjectId: Number(art?.subjectId || artSlot?.subjectId) || undefined,
    roomId: Number(artSlot?.roomId) || undefined,
    teacherId: Number(artSlot?.teacherId) || undefined,
    groupName: art?.name,
    subject: artSlot?.subject,
    teacher: artSlot?.teacher,
  });
  for (const g of activeGroups) {
    if (ownRegular.length) continue;
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
          bDate: b.bDate || slot.bDate,
          eDate: b.eDate || slot.eDate,
        });
      }
    }
  }
  const journal = collectCustomerJournal(customerId, groups);
  for (const les of journal) {
    calendar.push(clientLessonFromJournal(les, les.group));
  }
  const cat = catalogBase();
  const catalogGroups = cat.groups.slice().sort((a, b) => Number(b.branchId === useBranch) - Number(a.branchId === useBranch) || a.name.localeCompare(b.name, "ru"));
  const catalogTariffs = loadTariffs().items;
  let tariffs = withCatalogCtt(parseDossierCtt(d.extras), catalogTariffs, cat.subjects);
  if (!tariffs.length && String(d.extras?.live_tariff) === "1") {
    const tariffId = Number(d.extras?.tariff_id || 0);
    const fromCat = catalogTariffs.find((t) => t.id === tariffId);
    const raw = String(d.tariff || "").trim();
    const name = fromCat?.name || (!isPaidCountLabel(raw) && raw ? raw : tariffId ? `абонемент #${tariffId}` : "");
    if (name) {
      tariffs = [
        {
          id: tariffId || Number(d.crmId) || 0,
          tariffId: tariffId || undefined,
          name,
          rest: 0,
          lessons: 0,
          archived: false,
          bDate: "",
          eDate: "",
          price: 0,
        },
      ];
    }
  }
  const pays = cardPays(customerId);
  tariffs = tariffs.map((t) => ({
    ...t,
    paySum: paySumForCtt(pays, t.id),
    payCount: payCountForCtt(pays, t.id),
  }));
  const liveCtt = liveCttOf(tariffs);
  const lessonsPlan = journal.filter((l) => Number(l.status) !== 2).length;
  const lessonsFact = journal.filter((l) => Number(l.status) === 3).length;
  const writeoffSum = writeoffSumOf(journal);
  const paidTill = liveCtt.map((t) => t.eDate || "").filter(Boolean).sort().slice(-1)[0] || String(d.extras?.paid_till || "");
  const paidCount = liveCtt.reduce((n, t) => n + (Number(t.lessons) || 0), 0);
  const snap = accountSnapOf(d.extras?.balance, tariffs);
  tariffs = [
    {
      id: 0,
      name: "Базовый счет",
      rest: liveCtt.length ? 0 : snap,
      lessons: 0,
      archived: false,
      basic: true,
      paySum: paySumForCtt(pays, 0),
      payCount: payCountForCtt(pays, 0),
    },
    ...tariffs,
  ];
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
    paidTill,
    lessonsLeft: paidCount,
    lessonsPlan,
    lessonsFact,
    url: d.url || "",
    schools: d.schools || [],
    groups,
    regular,
    calendar,
    tariffs,
    comms: commsOf(customerId).map(asCustomerComm),
    pays,
    paysComplete: isPayJournalComplete(customerId),
    balance: customerBalance(customerId, snap, writeoffSum),
    catalog: {
      subjects: cat.subjects,
      teachers: teachersAtBranch(useBranch, listTeachers(slots), slots).map((x) => ({ id: x.id, name: x.name })),
      rooms: cat.rooms,
      groups: catalogGroups,
    },
  };
}
