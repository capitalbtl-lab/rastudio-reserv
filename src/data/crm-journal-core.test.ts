import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  stampJournal,
  journalAttend,
  lessonHasCustomer,
  journalForCustomer,
  lessonStatusLabel,
  clientLessonFromJournal,
  calendarLessonForCard,
  isCustomerTrialLesson,
  lessonBranchOf,
  tallyPaysByBranch,
  tallyLessonsByBranch,
  formatPayTally,
  formatLessonTally,
} from "./crm-journal-core.ts";

describe("журнал уроков", () => {
  it("явка = customerIds, пустой список виден всей группе", () => {
    const stamped = stampJournal({ date: "2026-09-05", from: "16:00", status: 1 }, [12, 13]);
    assert.deepEqual(stamped.customerIds, [12, 13]);
    assert.equal(stamped.attend, 2);
    assert.equal(stamped.total, 2);
    assert.deepEqual(journalAttend(stamped), { attend: 2, total: 2 });
    assert.equal(lessonHasCustomer(stamped, 12), true);
    assert.equal(lessonHasCustomer(stamped, 99), false);
    assert.equal(lessonHasCustomer({ date: "2026-09-05" }, 12), true);
    assert.equal(lessonStatusLabel(3), "проведено");
    assert.equal(lessonStatusLabel(2), "отмена");
    assert.equal(lessonStatusLabel(1), "план");
  });

  it("карточка ученика берёт только свои занятия", () => {
    const cal = [
      stampJournal({ date: "2026-09-01", from: "16:00", lessonId: 1, group: "А" }, [10]),
      stampJournal({ date: "2026-09-02", from: "16:00", lessonId: 2, group: "А" }, [11]),
      { date: "2026-09-03", from: "16:00", lessonId: 3, group: "А" },
    ];
    const mine = journalForCustomer(cal, 10);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].lessonId, 1);
    const row = clientLessonFromJournal(mine[0], "Роботы");
    assert.equal(row.id, 1);
    assert.equal(row.group, "Роботы");
    const charged = clientLessonFromJournal(
      {
        date: "2026-09-01",
        lessonId: 9,
        amount: 850,
        cttId: 4412,
        status: 3,
        customerIds: [1, 2],
        pupils: [
          { customerId: 1, name: "Усов Александр", attend: true, amount: 350 },
          { customerId: 2, name: "Чуднова Александра", attend: true, amount: 350 },
        ],
        topic: "Перспектива",
        homework: "натюрморт",
        note: "молодец",
      },
      "Роботы",
    );
    assert.equal(charged.amount, 850);
    assert.equal(charged.cttId, 4412);
    assert.equal(charged.pupils?.length, 2);
    assert.equal(charged.customerIds?.length, 2);
    assert.equal(charged.pupils?.[0].name, "Усов Александр");
    assert.equal(charged.topic, "Перспектива");
    assert.equal(charged.homework, "натюрморт");
    assert.equal(charged.note, "молодец");
  });

  it("карточка: только её группа, python и пустое имя не входят", () => {
    const groups = [{ id: 80, name: "2026 Художественная школа (10-14 лет)" }];
    assert.equal(calendarLessonForCard({ group: "2026 Художественная школа (10-14 лет)" }, groups), true);
    assert.equal(calendarLessonForCard({ group: 'IT-Школа: "Программирование на Python с CodeBOOK"' }, groups), false);
    assert.equal(calendarLessonForCard({ group: "" }, groups), false);
    assert.equal(calendarLessonForCard({ group: "Python", groupIds: [465] }, groups), false);
    assert.equal(calendarLessonForCard({ group: "Python", groupIds: [80] }, groups), true);
    assert.equal(
      calendarLessonForCard({ group: "Робототехника", customerIds: [7913] }, groups, 7913),
      true,
    );
    assert.equal(calendarLessonForCard({ group: "Робототехника", pupils: [{ customerId: 7913 }] }, groups, 7913), true);
    assert.equal(isCustomerTrialLesson({ type: "Пробное", typeId: 3 }), true);
    assert.equal(calendarLessonForCard({ type: "Пробное", typeId: 3, group: "Пробное" }, groups), true);
    const stamped = stampJournal(
      {
        date: "2026-12-06",
        from: "09:30",
        status: 3,
        pupils: [
          { customerId: 1, attend: true, amount: 743.75 },
          { customerId: 2, attend: false, amount: 743.75 },
        ],
      },
    );
    assert.equal(stamped.attend, 1);
    assert.equal(stamped.total, 2);
    assert.deepEqual(stamped.customerIds, [1, 2]);
  });

  it("Архиреева: платежи и уроки по филиалам, 0/0 не рисуем", () => {
    const pays = [
      ...Array.from({ length: 9 }, (_, i) => ({ branchId: 2, id: i + 1 })),
      { branchId: 4, id: 10 },
    ];
    const payRows = tallyPaysByBranch(pays, 2);
    assert.equal(formatPayTally(payRows), "9 шт ЦМИТ, 1 шт Лето");
    const lessons = [
      ...Array.from({ length: 23 }, () => ({ status: 3, branchId: 2 })),
      ...Array.from({ length: 17 }, () => ({ status: 1, branchId: 2 })),
      { status: 2, branchId: 4 },
    ];
    const lessonRows = tallyLessonsByBranch(lessons, 2);
    assert.equal(formatLessonTally(lessonRows), "п 40 / ф 23 ЦМИТ");
    assert.equal(lessonRows.some((r) => r.id === 4), false);
    const groups = [
      { id: 588, branchId: 2, name: "Художественная школа 2025 (3 группа)" },
      { id: 560, branchId: 4, name: "Арт-Экспедиция" },
    ];
    assert.equal(lessonBranchOf({ groupIds: [588] }, groups, 1), 2);
    assert.equal(lessonBranchOf({ group: "Арт-Экспедиция" }, groups, 1), 4);
    assert.equal(lessonBranchOf({ branchId: 4, groupIds: [588] }, groups, 1), 4);
    const row = clientLessonFromJournal({ date: "2026-09-01", lessonId: 5, branchId: 4, status: 3 }, "Лето");
    assert.equal(row.branchId, 4);
    const ids = readFileSync(new URL("./ids.ts", import.meta.url), "utf8");
    assert.match(ids, /short: "ЦМИТ"/);
    assert.match(ids, /short: "Лето"/);
  });
});
