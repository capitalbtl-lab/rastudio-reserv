import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeExportJob, exportPath, exportBody, type CrmExportJob } from "./crm-export-queue-core.ts";

describe("очередь выгрузки в Alfa", () => {
  it("две правки одной группы сливаются, приоритет последней", () => {
    let jobs: CrmExportJob[] = [];
    jobs = mergeExportJob(jobs, { op: "group.update", branchId: 1, entityId: 580, body: { custom_prioritet: 0 } });
    jobs = mergeExportJob(jobs, { op: "group.update", branchId: 1, entityId: 580, body: { custom_prioritet: 1, status_id: 2 } });
    assert.equal(jobs.length, 1);
    assert.deepEqual(jobs[0].body, { custom_prioritet: 1, status_id: 2 });
    assert.equal(exportPath(jobs[0]), "/v2api/1/group/update");
    assert.equal(exportBody(jobs[0]).id, 580);
  });

  it("разные группы не склеиваются", () => {
    let jobs: CrmExportJob[] = [];
    jobs = mergeExportJob(jobs, { op: "group.update", branchId: 1, entityId: 580, body: { custom_prioritet: 1 } });
    jobs = mergeExportJob(jobs, { op: "group.update", branchId: 1, entityId: 581, body: { custom_prioritet: 1 } });
    assert.equal(jobs.length, 2);
  });

  it("карточка клиента сливается отдельно от группы", () => {
    let jobs: CrmExportJob[] = [];
    jobs = mergeExportJob(jobs, { op: "group.update", branchId: 1, entityId: 7759, body: { custom_prioritet: 1 } });
    jobs = mergeExportJob(jobs, { op: "customer.update", branchId: 1, entityId: 7759, body: { name: "Фролов" } });
    jobs = mergeExportJob(jobs, { op: "customer.update", branchId: 1, entityId: 7759, body: { is_study: 0 } });
    assert.equal(jobs.length, 2);
    const card = jobs.find((j) => j.op === "customer.update");
    assert.deepEqual(card?.body, { name: "Фролов", is_study: 0 });
    assert.equal(exportPath(card!), "/v2api/1/customer/update?id=7759");
  });

  it("урок группы уходит отдельным путём", () => {
    const jobs = mergeExportJob([], {
      op: "regular-lesson.update",
      branchId: 2,
      entityId: 4412,
      body: { related_id: 580, time_from_v: "16:00" },
    });
    assert.equal(exportPath(jobs[0]), "/v2api/2/regular-lesson/update?id=4412");
    assert.equal(exportBody(jobs[0]).related_id, 580);
  });

  it("состав: добавить и снять одну пару схлопывается в последнее", () => {
    let jobs: CrmExportJob[] = [];
    jobs = mergeExportJob(jobs, { op: "cgi.apply", branchId: 1, entityId: 7759, body: { groupId: 580, drop: false } });
    jobs = mergeExportJob(jobs, { op: "cgi.apply", branchId: 1, entityId: 7759, body: { groupId: 581, drop: false } });
    jobs = mergeExportJob(jobs, { op: "cgi.apply", branchId: 1, entityId: 7759, body: { groupId: 580, drop: true } });
    assert.equal(jobs.length, 2);
    const g580 = jobs.find((j) => Number(j.body.groupId) === 580);
    assert.equal(g580?.body.drop, true);
    assert.equal(exportPath(g580!), "");
  });

  it("абонемент: тот же тариф и дата не дублируются", () => {
    let jobs: CrmExportJob[] = [];
    jobs = mergeExportJob(jobs, {
      op: "customer-tariff.create",
      branchId: 1,
      entityId: 7759,
      body: { tariffId: 12, bDate: "01.09.2026", calcType: 1 },
    });
    jobs = mergeExportJob(jobs, {
      op: "customer-tariff.create",
      branchId: 1,
      entityId: 7759,
      body: { tariffId: 12, bDate: "01.09.2026", calcType: 1, note: "повтор" },
    });
    jobs = mergeExportJob(jobs, {
      op: "customer-tariff.create",
      branchId: 1,
      entityId: 7759,
      body: { tariffId: 12, bDate: "15.09.2026" },
    });
    assert.equal(jobs.length, 2);
    assert.equal(jobs[0].body.note, "повтор");
  });

  it("снятие абонемента схлопывается, занятие уходит своим путём", () => {
    let jobs: CrmExportJob[] = [];
    jobs = mergeExportJob(jobs, { op: "customer-tariff.clear", branchId: 1, entityId: 7759, body: { mode: "close", eDate: "01.09.2026" } });
    jobs = mergeExportJob(jobs, { op: "customer-tariff.clear", branchId: 1, entityId: 7759, body: { mode: "delete" } });
    jobs = mergeExportJob(jobs, { op: "customer-tariff.create", branchId: 1, entityId: 7759, body: { tariffId: 12, bDate: "01.09.2026" } });
    assert.equal(jobs.length, 2);
    const clear = jobs.find((j) => j.op === "customer-tariff.clear");
    assert.equal(clear?.body.mode, "delete");
    assert.equal(exportPath(clear!), "");
    const lesson = mergeExportJob([], { op: "lesson.update", branchId: 1, entityId: 56762, body: { status: 3 } });
    assert.equal(exportPath(lesson[0]), "/v2api/1/lesson/update?id=56762");
    const payA = mergeExportJob([], { op: "pay.create", branchId: 1, entityId: 7759, body: { customer_id: 7759, income: 1000 } });
    const payB = mergeExportJob(payA, { op: "pay.create", branchId: 1, entityId: 7759, body: { customer_id: 7759, income: 500 } });
    assert.equal(payB.length, 2);
    assert.equal(exportPath(payB[0]), "/v2api/1/pay/create");
    assert.equal(exportBody(payB[0]).customer_id, 7759);
    assert.equal(exportBody(payB[0]).id, undefined);
    const created = mergeExportJob([], { op: "lesson.create", branchId: 1, entityId: 7759, body: { subject_id: 12, customer_ids: [7759] } });
    assert.equal(exportPath(created[0]), "/v2api/1/lesson/create");
    assert.equal(exportBody(created[0]).subject_id, 12);
    let cal = mergeExportJob([], {
      op: "lesson.create",
      branchId: 1,
      entityId: -21,
      body: { localId: -21, subject_id: 12, customer_ids: [7759], lesson_date: "01.09.2026" },
    });
    cal = mergeExportJob(cal, {
      op: "lesson.create",
      branchId: 1,
      entityId: -21,
      body: { localId: -21, subject_id: 12, customer_ids: [7759, 8001], topic: "тема" },
    });
    cal = mergeExportJob(cal, {
      op: "lesson.create",
      branchId: 1,
      entityId: 7759,
      body: { via: "createAlfaLesson", type: "trial" },
    });
    assert.equal(cal.length, 2);
    assert.equal(exportBody(cal[0]).localId, undefined);
    assert.equal(exportBody(cal[0]).via, undefined);
    assert.equal(exportBody(cal[0]).topic, "тема");
    assert.deepEqual(exportBody(cal[0]).customer_ids, [7759, 8001]);
    let groups = mergeExportJob([], {
      op: "group.create",
      branchId: 1,
      entityId: 0,
      body: { slotId: "local-a", name: "А", subject_id: 13, beats: [{ day: 1, timeFrom: "16:00" }] },
    });
    groups = mergeExportJob(groups, {
      op: "group.create",
      branchId: 1,
      entityId: 0,
      body: { slotId: "local-a", name: "А2", subject_id: 13 },
    });
    groups = mergeExportJob(groups, {
      op: "group.create",
      branchId: 1,
      entityId: 0,
      body: { slotId: "local-b", name: "Б", subject_id: 14 },
    });
    assert.equal(groups.length, 2);
    assert.equal(groups[0].body.name, "А2");
    assert.equal(exportPath(groups[0]), "/v2api/1/group/create");
    assert.equal(exportBody(groups[0]).slotId, undefined);
    assert.equal(exportBody(groups[0]).name, "А2");
    const lessonNew = mergeExportJob([], {
      op: "regular-lesson.create",
      branchId: 1,
      entityId: 580,
      body: { slotId: "gid:1:580", related_id: 580, day: 1, time_from_v: "16:00" },
    });
    assert.equal(exportPath(lessonNew[0]), "/v2api/1/regular-lesson/create");
    assert.equal(exportBody(lessonNew[0]).slotId, undefined);
    assert.equal(exportBody(lessonNew[0]).related_id, 580);
    let subjects = mergeExportJob([], {
      op: "subject.create",
      branchId: 2,
      entityId: 9001,
      body: { name: "Роботы 7-9", localId: 9001 },
    });
    subjects = mergeExportJob(subjects, {
      op: "subject.create",
      branchId: 2,
      entityId: 9002,
      body: { name: "роботы  7-9", localId: 9002 },
    });
    subjects = mergeExportJob(subjects, {
      op: "subject.create",
      branchId: 2,
      entityId: 9003,
      body: { name: "Blender", localId: 9003 },
    });
    assert.equal(subjects.length, 2);
    assert.equal(exportPath(subjects[0]), "/v2api/2/subject/create");
    assert.equal(exportBody(subjects[0]).localId, undefined);
    assert.equal(exportBody(subjects[0]).name, "роботы  7-9");
    assert.equal(exportBody(subjects[0]).weight, 1);
    let stages = mergeExportJob([], {
      op: "lead-status.create",
      branchId: 1,
      entityId: -11,
      body: { name: "Ждём звонка", localId: -11, color: "#2563eb" },
    });
    stages = mergeExportJob(stages, {
      op: "lead-status.create",
      branchId: 1,
      entityId: -11,
      body: { name: "Ждём звонка", localId: -11, color: "#00aa00", color_id: 4 },
    });
    stages = mergeExportJob(stages, {
      op: "lead-status.create",
      branchId: 1,
      entityId: -12,
      body: { name: "ждём   звонка", localId: -12 },
    });
    stages = mergeExportJob(stages, {
      op: "lead-status.create",
      branchId: 1,
      entityId: -13,
      body: { name: "Отказ", localId: -13 },
    });
    assert.equal(stages.length, 2);
    assert.equal(exportPath(stages[0]), "/v2api/1/lead-status/create");
    assert.equal(exportBody(stages[0]).localId, undefined);
    assert.equal(exportBody(stages[0]).name, "ждём   звонка");
    assert.equal(exportBody(stages[0]).pipeline_id, 1);
    assert.equal(exportBody(stages[0]).is_enabled, 1);
    assert.equal(exportBody(stages[0]).id, undefined);
    const renamed = mergeExportJob(stages, {
      op: "lead-status.update",
      branchId: 1,
      entityId: 7,
      body: { name: "Отложен на месяц" },
    });
    assert.equal(exportPath(renamed[renamed.length - 1]), "/v2api/1/lead-status/update");
    assert.equal(exportBody(renamed[renamed.length - 1]).id, 7);
    assert.equal(exportBody(renamed[renamed.length - 1]).pipeline_id, 1);
    const dropped = mergeExportJob(stages, {
      op: "lead-status.delete",
      branchId: 1,
      entityId: -11,
      body: { id: -11 },
    });
    assert.equal(dropped.length, 1);
    assert.equal(dropped[0].body.name, "Отказ");
    const realDel = mergeExportJob([], {
      op: "lead-status.delete",
      branchId: 1,
      entityId: 7,
      body: { id: 7 },
    });
    assert.equal(exportPath(realDel[0]), "/v2api/1/lead-status/delete");
    assert.deepEqual(exportBody(realDel[0]), { id: 7 });
  });
});
