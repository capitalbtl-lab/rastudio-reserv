import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CARD_LESSON_TYPES } from "./crm-cards.ts";
import { isChudnovaAlexandra, PAY_TEST_NAME, planChudnovaPays } from "./crm-pay-test-core.ts";
import { planChudnovaTrial, TRIAL_TEST_DATE, TRIAL_TEST_TIME, TRIAL_TEST_ID } from "./crm-trial-test-core.ts";
import { trialCreateBody, trialAlfaCustomerBody, trialLocalId, trialNoteLine } from "./trial-disk.ts";
import {
  mergeExportJob,
  canRunExportJob,
  remapExportJobs,
  exportBody,
  exportPath,
  type CrmExportJob,
} from "./crm-export-queue-core.ts";

const LOCAL = trialLocalId(1_700_000_500);
const BRANCH = 1;
const GID = 76;
const SUBJECT = 92;
const ROOM = 3;
const TEACHER = 10;

function lessonJob(type: (typeof CARD_LESSON_TYPES)[number], i: number): Omit<CrmExportJob, "id" | "at" | "tries"> {
  const localLesson = -(200 + i);
  return {
    op: "lesson.create",
    branchId: BRANCH,
    entityId: LOCAL,
    body: {
      localId: localLesson,
      type: type.key,
      lesson_type_id: type.id,
      lesson_date: "08.09.2026",
      time_from: `${String(10 + (i % 8)).padStart(2, "0")}:00`,
      time_to: `${String(11 + (i % 8)).padStart(2, "0")}:30`,
      duration: 90,
      subject_id: SUBJECT,
      customer_ids: [LOCAL],
      group_ids: [GID],
      room_id: ROOM,
      teacher_ids: [TEACHER],
      note: `${type.name} rastudio.org · ${PAY_TEST_NAME}`,
    },
  };
}

describe("Чуднова Александра: занятия до Alfa", () => {
  it("это Александра, не Ольга; локальный id отрицательный", () => {
    assert.equal(isChudnovaAlexandra("Чуднова Александра Алексеевна"), true);
    assert.equal(isChudnovaAlexandra("Чуднова Ольга Сергеевна"), false);
    assert.ok(LOCAL < 0);
    assert.match(TRIAL_TEST_ID, /chudnova-11oct/);
    assert.equal(TRIAL_TEST_DATE, "11.10.2026");
    assert.equal(TRIAL_TEST_TIME, "18:10");
  });

  it("клиент на диске и в очереди create, в Alfa тело без localId/lesson", () => {
    const body = trialCreateBody({
      localId: LOCAL,
      child: PAY_TEST_NAME,
      parent: "Чуднова Ольга",
      phone: "89163389392",
      branchId: BRANCH,
      statusId: 1,
      courseId: "/art-studio-10-14",
      subjectId: SUBJECT,
      gid: String(GID),
      note: trialNoteLine({ parent: "Чуднова Ольга", child: PAY_TEST_NAME, kind: "пробное", gid: String(GID) }),
      lesson: { type: "trial", subjectId: SUBJECT, gid: String(GID), date: TRIAL_TEST_DATE, time: TRIAL_TEST_TIME },
    });
    assert.equal(body.localId, LOCAL);
    assert.equal(body.lesson?.type, "trial");
    const alfa = trialAlfaCustomerBody(body);
    assert.equal("localId" in alfa, false);
    assert.equal("lesson" in alfa, false);
    assert.deepEqual(alfa.branch_ids, [BRANCH]);
    assert.equal(alfa.is_study, 0);
  });

  it("все типы занятий пишутся в очередь и не уходят в Alfa, пока нет crmId", () => {
    let jobs = mergeExportJob([], {
      op: "customer.create",
      branchId: BRANCH,
      entityId: LOCAL,
      body: { name: PAY_TEST_NAME, localId: LOCAL, phone: ["89163389392"], is_study: 0 },
    });
    assert.equal(canRunExportJob(jobs[0]), true);
    assert.equal(exportPath(jobs[0]), `/v2api/${BRANCH}/customer/create`);

    for (const [i, type] of CARD_LESSON_TYPES.entries()) {
      jobs = mergeExportJob(jobs, lessonJob(type, i));
    }
    const lessons = jobs.filter((j) => j.op === "lesson.create");
    assert.equal(lessons.length, CARD_LESSON_TYPES.length);
    assert.ok(lessons.every((j) => canRunExportJob(j) === false));
    assert.ok(lessons.every((j) => (j.body.customer_ids as number[])[0] === LOCAL));
    assert.ok(lessons.every((j) => String(j.body.note).includes(PAY_TEST_NAME)));
    assert.equal(jobs.filter((j) => j.op === "customer.create").length, 1);
  });

  it("после номера из Alfa занятия получают customer_ids > 0 и идут в lesson/create", () => {
    let jobs = mergeExportJob([], {
      op: "customer.create",
      branchId: BRANCH,
      entityId: LOCAL,
      body: { name: PAY_TEST_NAME, localId: LOCAL },
    });
    for (const [i, type] of CARD_LESSON_TYPES.entries()) jobs = mergeExportJob(jobs, lessonJob(type, i));
    const createId = jobs[0].id;
    jobs = remapExportJobs(jobs, LOCAL, 670, createId);
    const lessons = jobs.filter((j) => j.op === "lesson.create");
    assert.equal(lessons.length, CARD_LESSON_TYPES.length);
    for (const j of lessons) {
      assert.equal(j.entityId, 670);
      assert.deepEqual(j.body.customer_ids, [670]);
      assert.equal(canRunExportJob(j), true);
      assert.equal(exportPath(j), `/v2api/${BRANCH}/lesson/create`);
      const sent = exportBody(j);
      assert.equal("localId" in sent, false);
      assert.equal(sent.lesson_type_id, j.body.lesson_type_id);
      assert.deepEqual(sent.customer_ids, [670]);
    }
    const keys = new Set(lessons.map((j) => j.body.type));
    assert.equal(keys.size, CARD_LESSON_TYPES.length);
    assert.ok(CARD_LESSON_TYPES.every((t) => keys.has(t.key)));
  });

  it("пробное и касса Чудновой: план есть, платёж без crmId не уходит", () => {
    const trial = planChudnovaTrial({ customerId: LOCAL, branchId: BRANCH, gid: GID, subjectId: SUBJECT, roomId: ROOM });
    assert.equal(trial?.type, "trial");
    assert.equal(trial?.customerId, LOCAL);
    assert.equal(trial?.date, TRIAL_TEST_DATE);
    const pays = planChudnovaPays(LOCAL, BRANCH, "06.09.2026");
    assert.equal(pays.length, 2);
    let jobs: CrmExportJob[] = [];
    for (const p of pays) {
      jobs = mergeExportJob(jobs, {
        op: "pay.create",
        branchId: p.branchId,
        entityId: LOCAL,
        body: { localId: -(300 + jobs.length), customer_id: LOCAL, income: 1, note: p.note },
      });
    }
    assert.equal(jobs.length, 2);
    assert.ok(jobs.every((j) => canRunExportJob(j) === false));
    jobs = remapExportJobs(jobs, LOCAL, 670);
    assert.ok(jobs.every((j) => canRunExportJob(j)));
    assert.ok(jobs.every((j) => Number(j.body.customer_id) === 670));
  });

  it("карточка пишет все типы и customerLesson ставит очередь", () => {
    const card = readFileSync(new URL("../components/crm-client-card.tsx", import.meta.url), "utf8");
    assert.match(card, /CARD_LESSON_TYPES/);
    assert.match(card, /customerLesson/);
    const types = readFileSync(new URL("./crm-cards.ts", import.meta.url), "utf8");
    for (const t of CARD_LESSON_TYPES) assert.match(types, new RegExp(`key: "${t.key}"`));
    const sched = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    assert.match(sched, /action === "customerLesson"/);
    assert.match(sched, /op: "lesson.create"/);
    assert.match(sched, /upsertCustomerCalendar/);
    assert.match(sched, /customer_ids: \[customerId\]/);
  });
});
