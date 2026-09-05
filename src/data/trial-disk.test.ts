import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { trialAlfaCustomerBody, trialCreateBody, trialLeadCard, trialLocalId, trialNoteLine, trialPhoneDigits } from "./trial-disk.ts";
import { mergeExportJob, exportPath, exportBody, sameExportJob } from "./crm-export-queue-core.ts";
import { formatRuPhone } from "./ru-phone.ts";

describe("заявка с сайта: диск сразу", () => {
  it("локальный id отрицательный, телефон 10 цифр", () => {
    assert.ok(trialLocalId(1_700_000_123) < 0);
    assert.equal(trialPhoneDigits("+7 (916) 123-45-67"), "9161234567");
  });

  it("тело create без localId/lesson уходит в Alfa", () => {
    const body = trialCreateBody({
      localId: -12,
      child: "Иванов Иван",
      parent: "Иванова Анна",
      phone: "+79161234567",
      branchId: 2,
      statusId: 1,
      courseId: "/art-studio-10-14",
      subjectId: 14,
      gid: "580",
      note: trialNoteLine({ parent: "Иванова Анна", child: "Иванов Иван", kind: "пробное", gid: "580" }),
      lesson: { type: "trial", subjectId: 14, gid: "580", date: "08.09.2026", time: "16:00" },
    });
    assert.equal(body.localId, -12);
    assert.equal(body.lesson?.type, "trial");
    assert.deepEqual(body.group_ids, [580]);
    const alfa = trialAlfaCustomerBody(body);
    assert.equal("localId" in alfa, false);
    assert.equal("lesson" in alfa, false);
    assert.equal("courseId" in alfa, false);
    assert.equal(alfa.is_study, 0);
    assert.equal(alfa.lead_source_id, 2);
    const card = trialLeadCard({ localId: -12, branchId: 2, child: "Иванов Иван", phone: "+79161234567", statusId: 1 });
    assert.equal(card.id, -12);
    assert.equal(card.branchId, 2);
  });

  it("две заявки с одним телефоном сливаются, разные — нет", () => {
    let jobs = mergeExportJob([], {
      op: "customer.create",
      branchId: 2,
      entityId: -1,
      body: { phone: ["+79160000000"], name: "А" },
    });
    jobs = mergeExportJob(jobs, {
      op: "customer.create",
      branchId: 2,
      entityId: -2,
      body: { phone: ["79160000000"], name: "А2" },
    });
    jobs = mergeExportJob(jobs, {
      op: "customer.create",
      branchId: 2,
      entityId: -3,
      body: { phone: ["79161111111"], name: "Б" },
    });
    assert.equal(jobs.length, 2);
    assert.equal(jobs[0].body.name, "А2");
    assert.equal(exportPath(jobs[0]), "/v2api/2/customer/create");
    assert.equal(exportBody(jobs[0]).localId, undefined);
    assert.equal(exportBody(jobs[0]).name, "А2");
    assert.equal(
      sameExportJob(
        { op: "customer.create", branchId: 2, entityId: 0, body: { phone: "79160000000" } },
        { op: "customer.create", branchId: 2, entityId: 1, body: { phone: ["+7 916 000-00-00"] } },
      ),
      true,
    );
  });
});

describe("форма записи не тащит AlfaCRM в браузер", () => {
  it("телефон +7(916)… без CRM", () => {
    assert.equal(formatRuPhone("89161234567"), "+7(916)123-45-67");
    assert.equal(formatRuPhone("9161234567"), "+7(916)123-45-67");
  });

  it("филиалы — только числовой id, без CRM", () => {
    const pub = readFileSync(new URL("./trial-public.ts", import.meta.url), "utf8");
    assert.match(pub, /id: "2"/);
    assert.match(pub, /id: "1"/);
    assert.match(pub, /id: "3"/);
    assert.match(pub, /id: "4"/);
    assert.equal(/alfacrm|server-env|node:fs/.test(pub), false);
  });

  it("trial.ts только RPC, CRM живёт в trial-save", () => {
    const trial = readFileSync(new URL("./trial.ts", import.meta.url), "utf8");
    const pub = readFileSync(new URL("./trial-public.ts", import.meta.url), "utf8");
    const phone = readFileSync(new URL("./ru-phone.ts", import.meta.url), "utf8");
    const save = readFileSync(new URL("./trial-save.ts", import.meta.url), "utf8");
    for (const src of [trial, pub, phone]) {
      assert.equal(/from\s+["'][^"']*alfacrm["']/.test(src), false);
      assert.equal(/from\s+["'][^"']*server-env["']/.test(src), false);
      assert.equal(/from\s+["']node:fs["']/.test(src), false);
      assert.equal(/await import\(/.test(src), false);
    }
    assert.match(trial, /createServerFn/);
    assert.match(save, /await import\("\.\/alfacrm"\)/);
    assert.match(save, /enqueueExport/);
  });

  it("главная не импортирует диск и CRM напрямую", () => {
    const files = [
      "./trial.ts",
      "./trial-public.ts",
      "./ru-phone.ts",
      "./debug-client.ts",
      "./debug-fn.ts",
      "./chat-logs-fn.ts",
      "./agent-config-fn.ts",
    ];
    for (const f of files) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      assert.equal(/from\s+["']node:fs["']/.test(src), false, f);
      assert.equal(/from\s+["'][^"']*server-env["']/.test(src), false, f);
    }
  });
});

describe("кабинет: новый ученик диск сразу", () => {
  it("customerCreate не ждёт Alfa, тело create без localId/дат группы", () => {
    const src = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    const start = src.indexOf('data.action === "customerCreate"');
    const next = src.indexOf("if (data.action ===", start + 10);
    const chunk = src.slice(start, next > start ? next : start + 3500);
    assert.match(chunk, /trialLocalId/);
    assert.match(chunk, /enqueueExport/);
    assert.match(chunk, /op: "customer.create"/);
    assert.match(chunk, /is_study: 1/);
    assert.equal(/await request/.test(chunk), false);
    const body = exportBody({
      id: "e1",
      op: "customer.create",
      branchId: 2,
      entityId: -9,
      at: "",
      tries: 0,
      body: { name: "Иван", is_study: 1, localId: -9, group_ids: [580], bDate: "2026-09-01", eDate: "2027-05-31" },
    });
    assert.equal(body.localId, undefined);
    assert.equal(body.bDate, undefined);
    assert.equal(body.is_study, 1);
    assert.deepEqual(body.group_ids, [580]);
  });

  it("предмет создаётся на диске, Alfa — очередь subject.create", () => {
    const src = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    const start = src.indexOf('data.action === "subjectCreate"');
    const next = src.indexOf("if (data.action ===", start + 10);
    const chunk = src.slice(start, next > start ? next : start + 2000);
    assert.match(chunk, /createLocalSubject/);
    assert.match(chunk, /op: "subject.create"/);
    assert.equal(/ensureCrmSubject/.test(chunk), false);
    const sub = readFileSync(new URL("./crm-subjects.ts", import.meta.url), "utf8");
    assert.match(sub, /export function createLocalSubject/);
    assert.match(sub, /export function nextLocalSubjectId/);
    assert.match(sub, /id >= 9000/);
  });

  it("этап воронки на диске, Alfa — очередь lead-status.*", () => {
    const src = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    const createAt = src.indexOf('data.action === "leadStageCreate"');
    const createNext = src.indexOf("if (data.action ===", createAt + 10);
    const create = src.slice(createAt, createNext > createAt ? createNext : createAt + 2500);
    assert.match(create, /diskCreateLeadStage/);
    assert.match(create, /op: "lead-status.create"/);
    assert.match(create, /cachedLeadBoard/);
    assert.equal(/await createLeadStage/.test(create), false);
    assert.equal(/loadLeadsBoard/.test(create), false);
    const saveAt = src.indexOf('data.action === "leadStageSave"');
    const saveNext = src.indexOf("if (data.action ===", saveAt + 10);
    const save = src.slice(saveAt, saveNext > saveAt ? saveNext : saveAt + 2500);
    assert.match(save, /diskSaveLeadStage/);
    assert.match(save, /lead-status.create/);
    assert.match(save, /lead-status.update/);
    assert.equal(/await saveLeadStage/.test(save), false);
    const delAt = src.indexOf('data.action === "leadStageDelete"');
    const delNext = src.indexOf("if (data.action ===", delAt + 10);
    const del = src.slice(delAt, delNext > delAt ? delNext : delAt + 2000);
    assert.match(del, /diskDeleteLeadStage/);
    assert.match(del, /op: "lead-status.delete"/);
    assert.equal(/await deleteLeadStage/.test(del), false);
    const leads = readFileSync(new URL("./crm-leads.ts", import.meta.url), "utf8");
    assert.match(leads, /export function diskCreateLeadStage/);
    assert.match(leads, /export function applyCreatedLeadStage/);
    const queue = readFileSync(new URL("./crm-export-queue.ts", import.meta.url), "utf8");
    assert.match(queue, /applyCreatedLeadStage/);
    const core = readFileSync(new URL("./crm-export-queue-core.ts", import.meta.url), "utf8");
    assert.match(core, /"lead-status.create"/);
    assert.match(core, /lead-status.delete/);
  });

  it("занятие на диск календаря, Alfa — очередь lesson.create", () => {
    const src = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    const clAt = src.indexOf('data.action === "customerLesson"');
    const clNext = src.indexOf("if (data.action ===", clAt + 10);
    const cl = src.slice(clAt, clNext > clAt ? clNext : clAt + 4000);
    assert.match(cl, /nextLocalLessonId/);
    assert.match(cl, /upsertGroupCalendar/);
    assert.match(cl, /op: "lesson.create"/);
    assert.match(cl, /localId/);
    assert.equal(/id: 0/.test(cl), false);
    const saveAt = src.indexOf('data.action === "lessonSave"');
    const saveNext = src.indexOf("if (data.action ===", saveAt + 10);
    const save = src.slice(saveAt, saveNext > saveAt ? saveNext : saveAt + 3500);
    assert.match(save, /nextLocalLessonId/);
    assert.match(save, /upsertGroupCalendar/);
    assert.match(save, /lesson.create/);
    assert.equal(/Нет номера занятия/.test(save), false);
    const cards = readFileSync(new URL("./group-cards.ts", import.meta.url), "utf8");
    assert.match(cards, /export function nextLocalLessonId/);
    assert.match(cards, /export function applyCreatedCalendarLesson/);
    assert.match(cards, /export function mergeLocalCalendar/);
    const queue = readFileSync(new URL("./crm-export-queue.ts", import.meta.url), "utf8");
    assert.match(queue, /applyCreatedCalendarLesson/);
    const core = readFileSync(new URL("./crm-export-queue-core.ts", import.meta.url), "utf8");
    assert.match(core, /body.localId/);
  });

  it("абонементы учеников: состав с диска, cgi только если группы нет", () => {
    const src = readFileSync(new URL("./dossiers.ts", import.meta.url), "utf8");
    const at = src.indexOf("export async function overlayMembershipChunk");
    const next = src.indexOf("export async function overlayMembershipFromCrm", at + 10);
    const chunk = src.slice(at, next > at ? next : at + 8000);
    assert.match(chunk, /overlayCgiNeeded/);
    assert.match(chunk, /диск/);
    assert.match(chunk, /dossiersInGroup/);
    assert.match(chunk, /\[\.\.\.list, \.\.\.keep\]/);
    assert.equal(/active: false/.test(chunk), false);
    const disk = readFileSync(new URL("./crm-group-disk.ts", import.meta.url), "utf8");
    assert.match(disk, /export function overlayCgiNeeded/);
    const live = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    const liveAt = live.indexOf('data.action === "clientsLiveTariffs"');
    const liveNext = live.indexOf("if (data.action ===", liveAt + 10);
    const liveChunk = live.slice(liveAt, liveNext > liveAt ? liveNext : liveAt + 2000);
    assert.match(liveChunk, /liveTariffIdsFromStore/);
    assert.match(liveChunk, /fromCache: true/);
    assert.equal(/stampLiveTariffsFromBranches/.test(liveChunk), false);
    assert.equal(/overlayMembershipChunk/.test(liveChunk), false);
    assert.match(liveChunk, /if \(force\)/);
    assert.equal(/enqueueCrmOverlay\(force\)/.test(liveChunk), false);
  });

  it("карточка человека и состав группы с диска, group_ids не состав", () => {
    const src = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    const getAt = src.indexOf('data.action === "customerGet"');
    const getNext = src.indexOf("if (data.action ===", getAt + 10);
    const get = src.slice(getAt, getNext > getAt ? getNext : getAt + 2500);
    assert.match(get, /cardFromDossier/);
    assert.match(get, /customer-card-disk/);
    assert.equal(/enqueueCustomerPacket/.test(get), false);
    assert.match(get, /fromCache: true/);
    const memAt = src.indexOf('data.action === "groupMembers"');
    const memNext = src.indexOf("if (data.action ===", memAt + 10);
    const mem = src.slice(memAt, memNext > memAt ? memNext : memAt + 2000);
    assert.match(mem, /membersFromDisk/);
    assert.match(mem, /overlayCgiNeeded/);
    assert.equal(/loadGroupMembers/.test(mem), false);
    assert.equal(/await loadGroupMembers/.test(mem), false);
    const loadAt = src.indexOf("async function loadCustomerCard");
    const loadNext = src.indexOf("async function ", loadAt + 20);
    const load = src.slice(loadAt, loadNext > loadAt ? loadNext : loadAt + 5000);
    assert.match(load, /activeGroupsForCard/);
    assert.match(load, /mergeCgiGroupLinks/);
    assert.equal(/groupIdsFromCustomer/.test(load), false);
    const cgiAt = src.indexOf("async function cgiAndLessonGroups");
    const cgiNext = src.indexOf("async function ", cgiAt + 20);
    const cgi = src.slice(cgiAt, cgiNext > cgiAt ? cgiNext : cgiAt + 2500);
    assert.equal(/regular-lesson/.test(cgi), false);
    const gAt = src.indexOf('data.action === "groupGet"');
    const gNext = src.indexOf("if (data.action ===", gAt + 10);
    const g = src.slice(gAt, gNext > gAt ? gNext : gAt + 2500);
    assert.match(g, /Группа не на сайте/);
    assert.match(g, /fromCache: true/);
  });
});
