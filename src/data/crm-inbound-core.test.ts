import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  inboundTake,
  pendingEntityIds,
  mergeJournalInbound,
  pruneCalendarToAlfaIds,
  canFanOutToCalendar,
  countAlfaLessonRows,
  countAlfaLessonUniq,
  mergeSeenLessonIds,
  canPruneCalendarFill,
  uniquePositiveIds,
  canCloseLessonCensus,
  mergeInboundSiteFields,
  inboundFillClosed,
  keepAlfaProbe,
  bumpAlfaFromLanded,
  clampRecheckDays,
  recheckWindowYmd,
  iceWindowOrNow,
  windowNewLessonIds,
  windowGoneLessonIds,
  windowAlfaKeep,
  windowAlfaLive,
  recheckWindowFull,
  lessonsSetGap,
  groupWindowGone,
  idsChecksum,
  journalIdsReady,
  censusSeatLessonId,
} from "./crm-inbound-core.ts";

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

  it("очередь не блокирует посадку id, которого на этом календаре нет", () => {
    const merged = mergeJournalInbound(
      [{ lessonId: 1380, date: "2026-09-14", from: "10:00", status: 3 }],
      [{ lessonId: 10, date: "2026-09-01", from: "10:00", status: 3 }],
      [1380],
      "union",
    );
    assert.equal(merged.some((x) => x.lessonId === 1380), true);
    assert.equal(merged.find((x) => x.lessonId === 10)?.status, 3);
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
    assert.equal(next.some((x) => !x.lessonId), true);
    const kept = pruneCalendarToAlfaIds(disk, [10, 11], [], [99]);
    assert.equal(kept.some((x) => x.lessonId === 99), true);
    assert.equal(countAlfaLessonRows(kept), 3);
    assert.equal(countAlfaLessonUniq([{ lessonId: 1 }, { lessonId: 1 }, { lessonId: 2 }]), 2);
    assert.equal(countAlfaLessonRows([{ lessonId: 1 }, { lessonId: 1 }, { lessonId: 2 }]), 3);
    const old = pruneCalendarToAlfaIds(
      [
        { lessonId: 1, date: "2025-01-10" },
        { lessonId: 2, date: "2026-09-12" },
        { lessonId: 3, date: "13.09.2026" },
      ],
      [3],
      [],
      [],
      "2026-08-12",
    );
    assert.equal(old.some((x) => x.lessonId === 1), true);
    assert.equal(old.some((x) => x.lessonId === 2), false);
    assert.equal(old.some((x) => x.lessonId === 3), true);
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
    assert.equal(inboundFillClosed(602, 771, true, false), false);
    assert.equal(inboundFillClosed(771, 771, true, false), true);
    assert.equal(inboundFillClosed(771, 771, true, true), false);
    assert.equal(inboundFillClosed(338, 339, true, false), false);
    assert.equal(inboundFillClosed(0, 0, true, false), true);
    assert.equal(keepAlfaProbe(286, 254, true).write, true);
    assert.equal(keepAlfaProbe(286, 254, true).alfa, 254);
    assert.equal(keepAlfaProbe(286, 254, true, true).write, true);
    assert.equal(keepAlfaProbe(286, 254, true, true).alfa, 254);
    assert.equal(keepAlfaProbe(11, 13, true).write, true);
    assert.equal(keepAlfaProbe(11, 13, true).alfa, 13);
    assert.equal(keepAlfaProbe(286, 0, false).write, false);
    assert.equal(keepAlfaProbe(286, 0, false).alfa, 286);
    assert.equal(bumpAlfaFromLanded(312, 2), 312);
    assert.equal(bumpAlfaFromLanded(312, 0), 312);
    assert.equal(bumpAlfaFromLanded(0, 2), 0);
    assert.equal(bumpAlfaFromLanded(541, 5), 541);
    assert.equal(bumpAlfaFromLanded(312, Math.max(0, 314 - 312)), 312);
    assert.equal(bumpAlfaFromLanded(259, Math.max(0, 233 - 259)), 259);
    assert.equal(censusSeatLessonId({ id: 99901 }), 0);
    assert.equal(censusSeatLessonId({ id: 1, date: "2026-09-01" }), 1);
    assert.equal(censusSeatLessonId({ id: 2, lesson_date: "01.09.2026" }), 2);
    assert.equal(censusSeatLessonId({ id: 3, date: "", lesson_date: "" }), 0);
    assert.equal(censusSeatLessonId({ id: 4, date: "2026-01-01", lesson_date: "" }), 4);
    assert.equal(censusSeatLessonId({ id: 0, date: "2026-01-01" }), 0);
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

  it("синяя: новые и ушедшие id, keep не из длины окна", () => {
    assert.equal(clampRecheckDays(undefined), 32);
    assert.equal(clampRecheckDays(92), 92);
    assert.equal(clampRecheckDays(182), 182);
    assert.equal(clampRecheckDays(1095), 1095);
    assert.equal(clampRecheckDays(2555), 2555);
    assert.equal(clampRecheckDays(4000), 4000);
    assert.equal(clampRecheckDays(7), 7);
    assert.equal(clampRecheckDays(8), 32);
    const now = new Date(2026, 8, 14);
    assert.equal(recheckWindowYmd(4000, now).from, "2015-01-01");
    assert.equal(recheckWindowYmd(1095, now).from, "2023-09-14");
    assert.equal(recheckWindowYmd(2555, now).from, "2019-09-14");
    assert.equal(recheckWindowYmd(32, now).from, "2026-08-13");
    assert.equal(recheckWindowYmd(32, now).to, "2026-10-16");
    const later = new Date(2026, 8, 15);
    const ice = iceWindowOrNow(true, "2026-08-13", "2026-10-16", 32, later);
    assert.equal(ice.from, "2026-08-13");
    assert.equal(ice.to, "2026-10-16");
    const red = iceWindowOrNow(false, "2015-01-01", "2026-10-16", 32, later);
    assert.equal(red.from, "2015-01-01");
    assert.equal(red.to, "");
    const fresh = iceWindowOrNow(true, "2015-01-01", "", 32, now);
    assert.equal(fresh.from, "2026-08-13");
    assert.equal(fresh.to, "2026-10-16");
    assert.deepEqual(windowNewLessonIds([1, 2, 11], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), [11]);
    assert.deepEqual(windowGoneLessonIds([1, 2, 3], [1, 2]), [3]);
    assert.equal(windowAlfaKeep(10, 1, 0), 11);
    assert.equal(windowAlfaKeep(10, 0, 1), 9);
    assert.equal(windowAlfaKeep(10, 80, 0), 90);
    assert.notEqual(windowAlfaKeep(10, 1, 0), 4);
    assert.equal(windowAlfaLive(11, 13, 0, 0, false), 13);
    assert.equal(windowAlfaLive(11, 4, 0, 0, false), 11);
    assert.equal(windowAlfaLive(286, 20, 0, 0, false), 286);
    assert.equal(windowAlfaLive(11, 13, 0, 0, true), 13);
    assert.equal(windowAlfaLive(286, 250, 0, 0, true), 250);
    assert.equal(recheckWindowFull("2015-01-01"), true);
    assert.equal(recheckWindowFull("2026-08-14"), false);
    const gap = lessonsSetGap([1, 3], [1, 2], []);
    assert.deepEqual(gap.hole, [2]);
    assert.deepEqual(gap.extra, [3]);
    assert.equal(lessonsSetGap([1, 2, 9], [1, 2], [9]).extra.length, 0);
    assert.deepEqual(groupWindowGone([1, 2], [], [], true), [1, 2]);
    assert.deepEqual(groupWindowGone([1, 2], [], [], false), []);
    assert.deepEqual(groupWindowGone([1, 2, 9], [1, 2], [9], true), []);
    const win = pruneCalendarToAlfaIds(
      [
        { lessonId: 1, date: "2026-01-01" },
        { lessonId: 2, date: "2026-09-01" },
        { lessonId: 3, date: "2026-12-01" },
      ],
      [2],
      [],
      [],
      "2026-08-01",
      "2026-10-01",
    );
    assert.equal(win.some((x) => x.lessonId === 1), true);
    assert.equal(win.some((x) => x.lessonId === 2), true);
    assert.equal(win.some((x) => x.lessonId === 3), true);
    const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const b = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
    assert.equal(a.length, b.length);
    assert.notEqual(idsChecksum(a), idsChecksum(b));
    assert.equal(
      journalIdsReady({ pagesComplete: true, holeN: 0, extraN: 0, diskUniq: 12, censusN: 12, diskRows: 12 }),
      true,
    );
    assert.equal(
      journalIdsReady({ pagesComplete: true, holeN: 12, extraN: 12, diskUniq: 12, censusN: 12, diskRows: 12 }),
      false,
    );
    assert.equal(
      journalIdsReady({ pagesComplete: true, holeN: 0, extraN: 0, diskUniq: 12, censusN: 12, diskRows: 13 }),
      false,
    );
    assert.equal(idsChecksum([3, 1, 2]), idsChecksum([1, 2, 3]));
    assert.equal(
      journalIdsReady({ pagesComplete: true, holeN: 0, extraN: 0, diskUniq: 3, censusN: 3, diskRows: 3, short: true }),
      false,
    );
    assert.equal(
      journalIdsReady({ pagesComplete: true, holeN: 0, extraN: 2, diskUniq: 14, censusN: 12, diskRows: 14, allowExtra: true }),
      true,
    );
    assert.equal(
      journalIdsReady({ pagesComplete: true, holeN: 0, extraN: 2, diskUniq: 14, censusN: 12, diskRows: 14 }),
      false,
    );
    const noId = pruneCalendarToAlfaIds([{ lessonId: 0, date: "2026-09-01" }, { lessonId: 5, date: "2026-09-01" }], [5], [], [], "2026-08-01", "2026-10-01");
    assert.equal(noId.some((x) => !x.lessonId), true);
    assert.equal(keepAlfaProbe(286, 250, true).write, true);
    assert.equal(keepAlfaProbe(286, 250, true).alfa, 250);
  });
});

