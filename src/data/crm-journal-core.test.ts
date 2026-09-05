import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  stampJournal,
  journalAttend,
  lessonHasCustomer,
  journalForCustomer,
  lessonStatusLabel,
  clientLessonFromJournal,
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

  it("карточка ученика берёт только свои занятия, пустые — всей группе", () => {
    const cal = [
      stampJournal({ date: "2026-09-01", from: "16:00", lessonId: 1, group: "А" }, [10]),
      stampJournal({ date: "2026-09-02", from: "16:00", lessonId: 2, group: "А" }, [11]),
      { date: "2026-09-03", from: "16:00", lessonId: 3, group: "А" },
    ];
    const mine = journalForCustomer(cal, 10);
    assert.equal(mine.length, 2);
    assert.deepEqual(
      mine.map((x) => x.lessonId),
      [1, 3],
    );
    const row = clientLessonFromJournal(mine[0], "Роботы");
    assert.equal(row.id, 1);
    assert.equal(row.group, "Роботы");
  });
});
