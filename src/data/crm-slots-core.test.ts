import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inheritRegularPeriod, isoDateOrEmpty, ruDate, beatFollowsGroup, stampBeatsPeriodIfFollow, maskHm, maskRuDate, mergeLessonRoster, lessonRestLabel, lessonRestLeft, pupilNameOk, lessonRosterThin, mergeLessonPupils } from "./crm-slots-core.ts";

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

  it("время — 4 цифры и двоеточие, дата — 8 цифр и точки", () => {
    assert.equal(maskHm("18"), "18:");
    assert.equal(maskHm("1800"), "18:00");
    assert.equal(maskHm("18:00"), "18:00");
    assert.equal(maskHm("8:00"), "8:00");
    assert.equal(maskHm("18:0099"), "18:00");
    assert.equal(maskHm("123456"), "12:34");
    assert.equal(maskRuDate("01092026"), "01.09.2026");
    assert.equal(maskRuDate("01.09.2026"), "01.09.2026");
    assert.equal(maskRuDate("01.09.2026999"), "01.09.2026");
    assert.equal(maskRuDate("0109"), "01.09.");
    assert.equal(maskRuDate("01"), "01.");
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

describe("карточка занятия группы: весь состав", () => {
  it("берёт всех учеников группы, имена с диска, лидов не тащит", () => {
    const rows = mergeLessonRoster(
      { customerIds: [9624, 670] },
      [
        { id: 9624, name: "Кудрявцева Александра", rest: "0 ост", status: "учится" },
        { id: 670, name: "Чуднова Александра", rest: "128 ост", status: "учится" },
        { id: 1, name: "Новый лид", status: "лид" },
        { id: 8729, name: "Барковская Ксения", rest: "0 / 8 ост", status: "учится" },
      ],
    );
    assert.equal(rows.length, 3);
    assert.equal(rows[0].name, "Барковская Ксения");
    assert.equal(rows.find((p) => p.customerId === 670)?.rest, "128 ост");
    assert.equal(rows.some((p) => p.customerId === 1), false);
  });

  it("остаток как в Alfa: 0 / 8 ост и цвет по первому числу", () => {
    assert.equal(lessonRestLabel({ rest: 0, lessons: 8 }), "0 / 8 ост");
    assert.equal(lessonRestLabel({ rest: 128, lessons: 0 }), "128 ост");
    assert.equal(lessonRestLabel({ rest: 0, lessons: 6, eDate: "27.06.2026" }), "0 / 6 ост, 27.06");
    assert.equal(lessonRestLeft("0 / 8 ост"), 0);
    assert.equal(lessonRestLeft("128 ост"), 128);
    assert.equal(pupilNameOk("клиент 5842"), "");
    assert.equal(pupilNameOk("Рыбаков Николай Павлович"), "Рыбаков Николай Павлович");
    assert.equal(lessonRosterThin({ status: 3, pupils: [{ customerId: 5842, attend: true }] }), true);
    assert.equal(lessonRosterThin({ status: 3, pupils: [{ customerId: 1, name: "Алехин", attend: true, amount: 1087.5 }] }), false);
    assert.equal(lessonRosterThin({ status: 1, customerIds: [1] }), false);
    const merged = mergeLessonPupils(
      [{ customerId: 1, name: "клиент 1", attend: true }],
      [
        { customerId: 1, name: "Алехин Дмитрий", attend: true, amount: 1087.5 },
        { customerId: 5842, name: "клиент 5842", attend: true, amount: 350 },
      ],
    );
    assert.equal(merged?.length, 2);
    assert.equal(merged?.find((p) => p.customerId === 1)?.name, "Алехин Дмитрий");
    assert.equal(merged?.find((p) => p.customerId === 1)?.amount, 1087.5);
    assert.equal(merged?.find((p) => p.customerId === 5842)?.amount, 350);
  });
});
