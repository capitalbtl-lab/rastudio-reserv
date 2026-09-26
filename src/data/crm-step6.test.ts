import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isApiClientStudy, isApiLeadStudy, step6ColumnId, step6LessonDisk, mergeMissingLessons, lessonsAbsentFromAlfa, cashRetryPlan, cashAttemptMs, raceUntil, step67NullBalance } from "./crm-step6-core.ts";

describe("шаг 6", () => {
  it("лид по is_study, клиент не лид", () => {
    assert.equal(isApiLeadStudy(0), true);
    assert.equal(isApiLeadStudy(false), true);
    assert.equal(isApiLeadStudy("0"), true);
    assert.equal(isApiLeadStudy(1), false);
    assert.equal(isApiLeadStudy(true), false);
    assert.equal(isApiLeadStudy(undefined), false);
    assert.equal(isApiClientStudy(1), true);
    assert.equal(isApiClientStudy(true), true);
    assert.equal(isApiClientStudy(0), false);
  });

  it("колонка: одно число, несколько не кладём, пусто только по единственному имени", () => {
    const stages = [
      { id: 9, name: "Не разобрано" },
      { id: 2, name: "Ожидает старта" },
    ];
    assert.equal(step6ColumnId([2], stages), 2);
    assert.equal(step6ColumnId([2, 9], stages), null);
    assert.equal(step6ColumnId([], stages), 9);
    assert.equal(step6ColumnId(undefined, stages), 9);
    assert.equal(step6ColumnId([], [{ id: 1, name: "Не разобрано" }, { id: 2, name: "Не разобрано" }]), null);
    assert.equal(step6ColumnId([], [{ id: 1, name: "Ожидает старта" }]), 0);
    assert.equal(step6ColumnId(undefined, stages, 2), 2);
    assert.equal(step6ColumnId(undefined, stages, null), 9);
    assert.equal(step6ColumnId({ 0: 2 }, stages), 2);
    assert.equal(step6ColumnId(["x"], stages), 9);
  });

  it("ошибка чтения встаёт в конец три раза по 30 секунд", () => {
    assert.deepEqual(cashRetryPlan(0, false, true), { again: true, tries: 0, giveUp: false, pauseMs: 0 });
    assert.deepEqual(cashRetryPlan(0, true, true), { again: true, tries: 1, giveUp: false, pauseMs: 5000 });
    assert.deepEqual(cashRetryPlan(1, true, true), { again: true, tries: 2, giveUp: false, pauseMs: 5000 });
    assert.deepEqual(cashRetryPlan(2, true, true), { again: false, tries: 3, giveUp: true, pauseMs: 5000 });
    assert.deepEqual(cashRetryPlan(1, true, false), { again: false, tries: 1, giveUp: false, pauseMs: 5000 });
    assert.equal(cashRetryPlan(0, false, false).pauseMs, 0);
  });

  it("30 секунд обрывают запрос, а не ждут его конца", () => {
    assert.equal(cashAttemptMs(0, 1_000), 18_000);
    assert.equal(cashAttemptMs(5_000, 5_000), 0);
    assert.equal(cashAttemptMs(5_400, 5_000), 400);
    assert.equal(cashAttemptMs(30_000, 0), 18_000);
  });

  it("чужой запрос не держит попытку дольше 30 секунд", async () => {
    const hung = new Promise<number>(() => {});
    const start = Date.now();
    await assert.rejects(raceUntil(hung, start + 40), (e: unknown) => e instanceof Error && e.name === "CashCut");
    assert.ok(Date.now() - start < 500);
  });

  it("урок на диск: 0 пишется, без даты нет, явка не выдумывается", () => {
    const zero = step6LessonDisk(
      { id: 10, date: "2020-05-01", time_from: "10:00", branch_id: 2, group_ids: [7], customer_ids: [7333], details: [{ customer_id: 7333, commission: 0 }] },
      7333,
      0,
      1,
    );
    assert.equal(zero?.lessonId, 10);
    assert.equal(zero?.amount, 0);
    assert.equal(zero?.branchId, 2);
    assert.deepEqual(zero?.groupIds, [7]);
    assert.equal(zero?.pupils, undefined);
    assert.equal(zero?.status, 3);
    const absent = step6LessonDisk(
      { id: 11, date: "01.06.2020", details: [{ customer_id: 7333, is_attend: 0, ctt_id: 4, commission: 0 }] },
      7333,
      0,
      1,
    );
    assert.equal(absent?.pupils?.[0]?.attend, false);
    assert.equal(absent?.cttId, 4);
    assert.equal(step6LessonDisk({ id: 12, date: "" }, 7333, 0, 1), null);
    assert.equal(step6LessonDisk({ id: 13, date: "не дата" }, 7333, 0, 1), null);
  });

  it("тот же номер не со статусом 3 открывается, статус 3 не переписывается, потолка нет", () => {
    const prev = [
      { lessonId: 1, status: 1, amount: 100, date: "a", pupils: [{ customerId: 7, amount: 100 }] },
      { lessonId: 2, status: 3, amount: 50, date: "b" },
    ];
    const merged = mergeMissingLessons(prev, [
      { lessonId: 1, status: 3, amount: 0 },
      { lessonId: 2, status: 3, amount: 999 },
      { lessonId: 3, status: 3, amount: 0 },
    ], 7);
    assert.equal(merged.opened, 1);
    assert.equal(merged.wrote, 1);
    assert.equal(merged.list.length, 3);
    assert.equal(merged.list[0].status, 3);
    assert.equal(merged.list[0].amount, 0);
    assert.equal(merged.list[0].pupils?.[0].amount, 0);
    assert.equal(merged.list[1].amount, 50);
    assert.equal(merged.list[2].lessonId, 3);
  });

  it("проведённый номер, которого нет в Альфе, снимается; план и строка без номера остаются", () => {
    const rows = [
      { lessonId: 10, status: 3 },
      { lessonId: 11, status: 3 },
      { lessonId: 12, status: 1 },
      { status: 3 },
    ];
    const out = lessonsAbsentFromAlfa(rows, new Set([10]));
    assert.equal(out.removed, 1);
    assert.deepEqual(out.keep.map((x) => x.lessonId), [10, 12, undefined]);
  });

  it("на шагах 6 и 7 null в balance — ноль, отсутствие поля — не шапка", () => {
    assert.equal(step67NullBalance(true, null), 0);
    assert.equal(step67NullBalance(false, null), null);
    assert.equal(step67NullBalance(true, 0), null);
    assert.equal(step67NullBalance(true, 10), null);
  });
});
