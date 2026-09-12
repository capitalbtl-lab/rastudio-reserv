import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  inboundTake,
  pendingEntityIds,
  mergeJournalInbound,
  pruneCalendarToAlfaIds,
  canFanOutToCalendar,
  countAlfaLessonRows,
  mergeSeenLessonIds,
  canPruneCalendarFill,
  uniquePositiveIds,
  canCloseLessonCensus,
  nightGroupDiff,
  nightOnSiteReason,
  nightLockBusy,
  groupProlonged,
  mergeInboundSiteFields,
} from "./crm-inbound-core.ts";
import { slotActiveToday, slotOnPublicSchedule, mergeStatusPublish } from "./group-status.ts";

describe("вход из Alfa", () => {
  it("очередь старше входа", () => {
    assert.equal(inboundTake({ pending: true }), "skip");
    assert.equal(inboundTake({ pending: false }), "alfa");
    const hold = pendingEntityIds(
      [
        { op: "lesson.update", entityId: 15 },
        { op: "lesson.create", entityId: -3, body: { localId: -3 } },
        { op: "customer.update", entityId: 9 },
      ],
      ["lesson.update", "lesson.create"],
    );
    assert.equal(hold.has(15), true);
    assert.equal(hold.has(-3), true);
    assert.equal(hold.has(9), false);
  });

  it("журнал: свои id и очередь не затираются снимком Alfa", () => {
    const pulled = [
      { lessonId: 15, date: "2026-09-05", from: "16:00", status: 1 },
      { lessonId: 16, date: "2026-09-06", from: "16:00", status: 3 },
    ];
    const prev = [
      { lessonId: 15, date: "2026-09-05", from: "16:00", status: 3, customerIds: [10] },
      { lessonId: -4, date: "2026-09-07", from: "16:00", status: 1 },
    ];
    const merged = mergeJournalInbound(pulled, prev, [15]);
    const ours = merged.find((x) => x.lessonId === 15);
    assert.equal(ours?.status, 3);
    assert.deepEqual(ours && "customerIds" in ours ? ours.customerIds : [], [10]);
    assert.equal(merged.some((x) => x.lessonId === -4), true);
    assert.equal(merged.find((x) => x.lessonId === 16)?.status, 3);
  });

  it("фон: union не стирает старые занятия вне окна Alfa", () => {
    const pulled = [{ lessonId: 16, date: "2026-09-06", from: "16:00", status: 3 }];
    const prev = [
      { lessonId: 99, date: "2026-06-01", from: "16:00", status: 3 },
      { lessonId: 16, date: "2026-09-06", from: "16:00", status: 1 },
      { lessonId: 15, date: "2026-09-05", from: "16:00", status: 3, customerIds: [10] },
    ];
    const merged = mergeJournalInbound(pulled, prev, [15], "union");
    assert.equal(merged.find((x) => x.lessonId === 99)?.status, 3);
    assert.equal(merged.find((x) => x.lessonId === 16)?.status, 3);
    assert.equal(merged.find((x) => x.lessonId === 15)?.status, 3);
  });

  it("урок с номером и без номера на ту же дату не даёт две строки", () => {
    const merged = mergeJournalInbound(
      [{ lessonId: 50, date: "01.09.2026", from: "10:00", status: 3 }],
      [{ date: "01.09.2026", from: "10:00", status: 3, customerIds: [7] }],
      [],
      "union",
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.lessonId, 50);
  });

  it("склейка без номера сохраняет сумму и тему", () => {
    const merged = mergeJournalInbound(
      [{ lessonId: 50, date: "01.09.2026", from: "10:00", status: 3, amount: 0, topic: "" }],
      [{ date: "01.09.2026", from: "10:00", status: 3, amount: 350, topic: "роботы" }],
      [],
      "union",
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.lessonId, 50);
    assert.equal(merged[0]?.amount, 350);
    assert.equal((merged[0] as { topic?: string }).topic, "роботы");
  });

  it("два урока без номера в разных группах на одно время — две строки", () => {
    const merged = mergeJournalInbound(
      [
        { date: "01.09.2026", from: "10:00", status: 3, groupIds: [10], amount: 350 },
        { date: "01.09.2026", from: "10:00", status: 3, groupIds: [20], amount: 400 },
      ],
      [],
      [],
      "union",
    );
    assert.equal(merged.length, 2);
  });

  it("пустой состав Alfa не затирает учеников на диске", () => {
    const merged = mergeJournalInbound(
      [{ lessonId: 50, date: "01.09.2026", from: "10:00", status: 3, customerIds: [] }],
      [{ lessonId: 50, date: "01.09.2026", from: "10:00", status: 3, customerIds: [7, 8] }],
      [],
      "union",
    );
    assert.deepEqual(merged[0]?.customerIds, [7, 8]);
  });

  it("перепроверка снимает лишние номера, свои и очередь оставляет", () => {
    const disk = [
      { lessonId: 10, date: "01.09.2026", from: "10:00" },
      { lessonId: 99, date: "02.09.2026", from: "10:00" },
      { lessonId: -4, date: "03.09.2026", from: "10:00" },
      { date: "04.09.2026", from: "10:00" },
      { lessonId: 11, date: "05.09.2026", from: "11:00" },
    ];
    const next = pruneCalendarToAlfaIds(disk, [10, 11], [11]);
    assert.equal(countAlfaLessonRows(next), 2);
    assert.equal(next.some((x) => x.lessonId === 99), false);
    assert.equal(next.some((x) => x.lessonId === -4), true);
    assert.equal(next.some((x) => !x.lessonId), false);
    assert.deepEqual(mergeSeenLessonIds([10], [{ lessonId: 11 }, { lessonId: 10 }]), [10, 11]);
    assert.equal(canFanOutToCalendar([{ lessonId: 10, date: "01.09.2026", from: "10:00" }], { lessonId: 0, date: "01.09.2026", from: "10:00" }), false);
    assert.equal(canFanOutToCalendar([{ lessonId: 10, date: "01.09.2026", from: "10:00" }], { lessonId: 99, date: "01.09.2026", from: "10:00" }), false);
    assert.equal(canFanOutToCalendar([{ lessonId: 10, date: "01.09.2026", from: "10:00" }], { lessonId: 10, date: "01.09.2026", from: "10:00" }), true);
    assert.equal(canPruneCalendarFill({ prune: true, wantFull: true, fillDone: true }), true);
    assert.equal(canPruneCalendarFill({ prune: true, wantFull: false, fillDone: true }), false);
    assert.equal(canPruneCalendarFill({ prune: true, wantFull: true, fillDone: false }), false);
    assert.equal(canPruneCalendarFill({ prune: false, wantFull: true, fillDone: true }), false);
    assert.deepEqual(uniquePositiveIds([10, 10, 0, -4, 11]), [10, 11]);
    assert.equal(canCloseLessonCensus({ live: true, aborted: false }), true);
    assert.equal(canCloseLessonCensus({ live: true, aborted: true }), false);
    assert.equal(canCloseLessonCensus({ live: false, aborted: false }), false);
  });
});

describe("ночной diff групп", () => {
  const today = "2026-09-07";
  const pub = mergeStatusPublish(null);

  it("новая живая — added, архив 3 и смены не в добор", () => {
    const hits = nightGroupDiff({
      today,
      disk: [{ branchId: 1, groupId: 10, statusId: 2, bDate: "2026-01-01", eDate: "2026-12-31" }],
      incoming: [
        { branchId: 1, groupId: 10, statusId: 2, bDate: "2026-01-01", eDate: "2026-12-31", name: "старая" },
        { branchId: 1, groupId: 20, statusId: 2, bDate: "2026-09-01", eDate: "2026-12-31", name: "новая" },
        { branchId: 1, groupId: 30, statusId: 3, bDate: "2025-01-01", eDate: "2026-06-01", name: "архив" },
        { branchId: 4, groupId: 40, statusId: 7, name: "смена" },
      ],
    });
    assert.deepEqual(
      hits.map((h) => `${h.kind}:${h.groupId}`),
      ["added:20"],
    );
  });

  it("сняли с архива — revived по prev, не по имени", () => {
    const hits = nightGroupDiff({
      today,
      disk: [],
      prev: [{ branchId: 2, groupId: 580, statusId: 3 }],
      incoming: [{ branchId: 2, groupId: 580, statusId: 2, bDate: "2026-09-01", eDate: "2026-12-31", name: "Роботы" }],
    });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].kind, "revived");
    assert.equal(hits[0].groupId, 580);
    assert.equal(hits[0].branchId, 2);
  });

  it("продлили eDate или снова сегодня действует — prolonged; те же даты — нет", () => {
    const disk = { branchId: 1, groupId: 11, statusId: 2, bDate: "2026-01-01", eDate: "2026-09-01" };
    assert.equal(groupProlonged(disk, { ...disk, eDate: "2026-12-31" }, today), true);
    assert.equal(groupProlonged(disk, { ...disk, eDate: "2026-12-01" }, today), true);
    const liveDisk = { branchId: 1, groupId: 12, statusId: 2, bDate: "2026-01-01", eDate: "2026-12-31" };
    assert.equal(groupProlonged(liveDisk, liveDisk, today), false);
    const hits = nightGroupDiff({
      today,
      disk: [disk, liveDisk],
      incoming: [
        { ...disk, eDate: "2026-12-31", name: "a" },
        { ...liveDisk, name: "b" },
      ],
    });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].kind, "prolonged");
    assert.equal(hits[0].groupId, 11);
  });

  it("живые без смены дат не в добор, даже если состав учеников менялся", () => {
    const hits = nightGroupDiff({
      today,
      disk: [{ branchId: 1, groupId: 9, statusId: 4, bDate: "2026-01-01", eDate: "2026-12-31" }],
      incoming: [{ branchId: 1, groupId: 9, statusId: 4, bDate: "2026-01-01", eDate: "2026-12-31", name: "та же" }],
    });
    assert.equal(hits.length, 0);
  });

  it("витрина: срок и reason без угадывания курса", () => {
    const slot = { statusId: 2, priority: 1, courseId: "/art-studio-5-6", bDate: "2026-01-01", eDate: "2026-12-31" };
    assert.equal(slotActiveToday(slot, today), true);
    assert.equal(slotOnPublicSchedule(slot, pub), true);
    assert.equal(nightOnSiteReason(slot, pub).reason, "yes");
    assert.equal(nightOnSiteReason({ ...slot, eDate: "2026-09-01" }, pub).reason, "срок кончился");
    assert.equal(nightOnSiteReason({ ...slot, priority: 0 }, pub).reason, "priority=0");
    assert.equal(nightOnSiteReason({ ...slot, courseId: "13", path: "" }, pub).reason, "no courseId");
    assert.equal(nightOnSiteReason({ ...slot, statusId: 3 }, pub).reason, "архив");
    assert.equal(nightOnSiteReason({ ...slot, statusId: 5 }, pub).reason, "statusPublish.schedule=false");
    assert.equal(slotOnPublicSchedule({ ...slot, eDate: "2026-09-01" }, pub), false);
  });

  it("замок: живой pid — busy, мёртвый и просроченный — нет", () => {
    const now = Date.parse("2026-09-07T01:00:00Z");
    assert.equal(nightLockBusy({ pid: 7, at: "2026-09-07T00:50:00Z" }, now, () => true), true);
    assert.equal(nightLockBusy({ pid: 7, at: "2026-09-07T00:50:00Z" }, now, () => false), false);
    assert.equal(nightLockBusy({ pid: 7, at: "2026-09-06T20:00:00Z" }, now, () => true), false);
  });
});

describe("inbound не сбрасывает курс сайта", () => {
  const disk = {
    groupId: 465,
    branchId: 3,
    subjectId: 37,
    subject: "Робототехника 7-9",
    courseId: "/robototehnika-7-9",
    schoolId: "/robototehnika-v-kolomne",
    school: "Роботы",
    course: "7-9",
    path: "/robototehnika-7-9",
  };
  const alfa114 = {
    groupId: 465,
    branchId: 3,
    subjectId: 114,
    subject: "Билингвальная робототехника",
    courseId: "",
    schoolId: "",
    school: "",
    course: "Билингвальная робототехника",
    path: "",
  };

  it("merge не обнуляет courseId у существующего слота", () => {
    const m = mergeInboundSiteFields(alfa114, disk);
    assert.equal(m.courseId, "/robototehnika-7-9");
    assert.equal(m.schoolId, "/robototehnika-v-kolomne");
    assert.equal(m.path, "/robototehnika-7-9");
    assert.equal(m.keepSite, true);
    assert.equal(m.subjectId, 114);
    assert.equal(m.skipAlfaIds, false);
  });

  it("pending group.update сохраняет subjectId и courseId с диска", () => {
    const hold = pendingEntityIds([{ op: "group.update", entityId: 465, body: { subject_id: 37 } }], ["group.update"]);
    assert.equal(hold.has(465), true);
    const m = mergeInboundSiteFields(alfa114, disk, { pending: true });
    assert.equal(inboundTake({ pending: true }), "skip");
    assert.equal(m.skipAlfaIds, true);
    assert.equal(m.subjectId, 37);
    assert.equal(m.courseId, "/robototehnika-7-9");
  });

  it("новый groupId без курса — поля сайта пустые, subjectId с Alfa", () => {
    const m = mergeInboundSiteFields({ groupId: 900, subjectId: 37, subject: "Робототехника 7-9" });
    assert.equal(m.courseId, "");
    assert.equal(m.subjectId, 37);
    assert.equal(m.keepSite, false);
  });

  it("есть assign — курс с диска не обнуляем даже если courseId слота пустой", () => {
    const m = mergeInboundSiteFields(alfa114, { ...disk, courseId: "", path: "" }, { hasAssign: true });
    assert.equal(m.keepSite, true);
    assert.equal(m.schoolId, "/robototehnika-v-kolomne");
  });
});

