import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inheritRegularPeriod, isoDateOrEmpty, ruDate, beatFollowsGroup, stampBeatsPeriodIfFollow } from "./crm-slots-core.ts";

describe("второй урок в группе копирует период первого", () => {
  it("isoDateOrEmpty не подставляет сегодня", () => {
    assert.equal(isoDateOrEmpty(""), "");
    assert.equal(isoDateOrEmpty("нет"), "");
    assert.equal(isoDateOrEmpty("01.09.2026"), "2026-09-01");
    assert.equal(isoDateOrEmpty("2026-03-01"), "2026-03-01");
  });

  it("новый урок берёт 1 сентября — 1 марта у первого, не май", () => {
    const got = inheritRegularPeriod({
      siblings: [{ id: 1176, b_date: "01.09.2026", e_date: "01.03.2027" }],
      groupFrom: "2026-09-01",
      groupTo: "2027-05-31",
    });
    assert.deepEqual(got, { bDate: "2026-09-01", eDate: "2027-03-01" });
  });

  it("без соседних уроков берёт период группы, не academicEnd", () => {
    const got = inheritRegularPeriod({
      siblings: [],
      groupFrom: "01.09.2026",
      groupTo: "01.03.2027",
    });
    assert.deepEqual(got, { bDate: "2026-09-01", eDate: "2027-03-01" });
  });

  it("preferId выбирает первый урок, не чужой период", () => {
    const got = inheritRegularPeriod({
      siblings: [
        { id: 9, b_date: "2026-09-01", e_date: "2027-05-31" },
        { lessonId: 80, bDate: "01.09.2026", eDate: "01.03.2027" },
      ],
      groupFrom: "2026-09-01",
      groupTo: "2027-06-30",
      preferId: 80,
    });
    assert.deepEqual(got, { bDate: "2026-09-01", eDate: "2027-03-01" });
  });

  it("урок со своими датами не растягивается до мая", () => {
    const got = inheritRegularPeriod({
      siblings: [{ b_date: "01.09.2026", e_date: "01.03.2027" }],
      groupFrom: "2026-09-01",
      groupTo: "2027-05-31",
    });
    assert.equal(got.eDate, "2027-03-01");
  });

  it("без дат группы — конец учебного года от старта", () => {
    const got = inheritRegularPeriod({ groupFrom: "2026-09-01" });
    assert.deepEqual(got, { bDate: "2026-09-01", eDate: "2027-05-31" });
  });

  it("ruDate приводит ISO к д.м.г", () => {
    assert.equal(ruDate("2026-09-01"), "01.09.2026");
    assert.equal(ruDate("01.03.2027"), "01.03.2027");
    assert.equal(ruDate(""), "");
  });

  it("новая группа: даты занятий идут за периодом, пока их не правили", () => {
    const linked = stampBeatsPeriodIfFollow(
      [{ day: 2, timeFrom: "16:00", timeTo: "18:00", lessonId: 0, bDate: "01.09.2026", eDate: "30.06.2027" }],
      "01.09.2026",
      "30.06.2027",
      "01.09.2026",
      "01.03.2027",
    );
    assert.equal(linked[0].eDate, "01.03.2027");
    const edited = stampBeatsPeriodIfFollow(
      [{ day: 2, timeFrom: "16:00", timeTo: "18:00", lessonId: 0, bDate: "01.09.2026", eDate: "01.03.2027" }],
      "01.09.2026",
      "30.06.2027",
      "01.09.2026",
      "31.05.2027",
    );
    assert.equal(edited[0].eDate, "01.03.2027");
    assert.equal(beatFollowsGroup({ bDate: "", eDate: "" }, "01.09.2026", "30.06.2027"), true);
    assert.equal(beatFollowsGroup({ bDate: "01.09.2026", eDate: "01.03.2027" }, "01.09.2026", "30.06.2027"), false);
  });
});
