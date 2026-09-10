import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  teacherIdSet,
  sameIdSet,
  teacherIdsPayload,
  beatTeacherIds,
  hydrateGroupTeachers,
  pickLessonTeacherIds,
  ownerOnlyTeacherIds,
  slotBeatTeacherIds,
} from "./crm-group-teachers-core.ts";
import { inspectGroupExport, weekdayIso } from "./crm-group-export-core.ts";

describe("наборы педагогов", () => {
  it("не режет массив до первого id", () => {
    assert.deepEqual(teacherIdSet([41, 12, 41, 0]), [41, 12]);
    assert.equal(sameIdSet([12, 41], [41, 12]), true);
    assert.equal(sameIdSet([12], [12, 41]), false);
    assert.deepEqual(teacherIdsPayload([]), {});
    assert.deepEqual(teacherIdsPayload([41, 12]), { teacher_ids: [41, 12] });
  });

  it("урок иначе бит, не ответственные", () => {
    assert.deepEqual(pickLessonTeacherIds([9], [1, 2]), [9]);
    assert.deepEqual(pickLessonTeacherIds([], [1, 2]), [1, 2]);
    assert.deepEqual(pickLessonTeacherIds([], []), []);
  });

  it("раскладка копирует массив целиком, повтор не склеивает", () => {
    const once = hydrateGroupTeachers({ teacherIds: [10, 11], teacher: "А, Б" });
    assert.deepEqual(once.ownerTeacherIds, [10, 11]);
    assert.deepEqual(once.teacherIds, [10, 11]);
    const split = hydrateGroupTeachers({
      teacherIds: [10],
      ownerTeacherIds: [99],
      beats: [{ day: 3, timeFrom: "18:00", timeTo: "19:30", teacherIds: [10, 11] }],
    });
    assert.deepEqual(split.ownerTeacherIds, [99]);
    assert.deepEqual(split.beats?.[0].teacherIds, [10, 11]);
    assert.deepEqual(slotBeatTeacherIds(split), [10, 11]);
    assert.deepEqual(ownerOnlyTeacherIds(split), [99]);
    assert.deepEqual(beatTeacherIds(split.beats![0], split), [10, 11]);
  });
});

describe("сверка экспорта", () => {
  it("пн на сайте и среды в календаре — окно дня, не полный экспорт", () => {
    const got = inspectGroupExport({
      beats: [{ day: 1, timeFrom: "18:00", timeTo: "19:30", teacherIds: [10], lessonId: 0 }],
      ownerTeacherIds: [10],
      calendar: [{ date: "2026-10-07" }, { date: "2026-10-14" }],
      alfaRegulars: [],
      alfaOwnerIds: [10],
      branchTeacherIds: [10],
    });
    assert.ok(got.issues.some((x) => x.code === "no-template-has-lessons" || x.code === "day-mismatch"));
    assert.equal(got.allowFull, false);
    assert.equal(got.allowGroup, true);
  });

  it("совпадающий шаблон с двумя педагогами — без окон", () => {
    const got = inspectGroupExport({
      beats: [{ day: 3, timeFrom: "18:00", timeTo: "19:30", teacherIds: [10, 41], lessonId: 80 }],
      ownerTeacherIds: [10],
      groupFrom: "2026-09-01",
      groupTo: "2027-06-30",
      calendar: [{ date: "2026-10-07" }],
      alfaRegulars: [
        { id: 80, day: 3, timeFrom: "18:00", timeTo: "19:30", teacherIds: [41, 10], bDate: "2026-09-01", eDate: "2027-06-30" },
      ],
      alfaOwnerIds: [10],
      branchTeacherIds: [10, 41],
    });
    assert.deepEqual(got.issues, []);
    assert.equal(got.allowFull, true);
  });

  it("пустой ответственный не равен Alfa, но ключ не обязателен — только предложение", () => {
    const got = inspectGroupExport({
      beats: [{ day: 3, timeFrom: "18:00", timeTo: "19:30", teacherIds: [10], lessonId: 80 }],
      ownerTeacherIds: [],
      calendar: [{ date: "2026-10-07" }],
      alfaRegulars: [{ id: 80, day: 3, timeFrom: "18:00", timeTo: "19:30", teacherIds: [10] }],
      alfaOwnerIds: [99],
      branchTeacherIds: [10, 99],
    });
    assert.equal(got.suggestOwner, true);
    assert.equal(got.allowFull, true);
  });

  it("среда 7 октября — день 3", () => {
    assert.equal(weekdayIso("2026-10-07"), 3);
  });
});

describe("экраны не берут первый id", () => {
  it("карточка и inbound без pickTeacherIds на слот", () => {
    const alfa = readFileSync(new URL("./alfacrm-schedule.ts", import.meta.url), "utf8");
    assert.doesNotMatch(alfa, /pickTeacherIds\(first\?\.teacher_ids, g.teacher_ids\)/);
    const sched = readFileSync(new URL("../components/admin-schedule.tsx", import.meta.url), "utf8");
    assert.match(sched, /Педагоги занятий/);
    assert.match(sched, /Ответственные педагоги/);
  });
});
