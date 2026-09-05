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
    assert.equal(/await import\("\.\/alfacrm"\)/.test(save), false);
    assert.equal(/upsertAlfaLead/.test(save), false);
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
    assert.match(sub, /isLocalSubject/);
    assert.match(sub, /nextLocalId/);
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
    const diskEnd = get.indexOf("if (customerId < 0)");
    const disk = get.slice(0, diskEnd > 0 ? diskEnd : get.length);
    assert.equal(/enqueueCustomerPacket/.test(disk), false);
    assert.match(get, /enqueueCustomerPacket/);
    assert.match(get, /fromCache: true/);
    assert.match(get, /wantAlfaPull\(data\.fresh\)/);
    assert.match(get, /Ученик не найден на сайте/);
    const memAt = src.indexOf('data.action === "groupMembers"');
    const memNext = src.indexOf("if (data.action ===", memAt + 10);
    const mem = src.slice(memAt, memNext > memAt ? memNext : memAt + 2000);
    assert.match(mem, /membersFromDisk/);
    assert.match(mem, /overlayCgiNeeded/);
    assert.match(mem, /diskOnly/);
    assert.equal(/loadGroupMembers/.test(mem), false);
    assert.equal(/await loadGroupMembers/.test(mem), false);
    const loadAt = src.indexOf("async function loadCustomerCard");
    const loadEnd = src.indexOf("\nfunction hm(", loadAt);
    const load = src.slice(loadAt, loadEnd > loadAt ? loadEnd : loadAt + 5000);
    assert.match(load, /journalForCustomer/);
    assert.equal(/lesson\/index/.test(load), false);
    assert.match(load, /mergeCgiGroupLinks|activeGroupsForCard/);
    assert.equal(/groupIdsFromCustomer/.test(load), false);
    assert.equal(/cgi\/index/.test(load), false);
    const gAt = src.indexOf('data.action === "groupGet"');
    const gNext = src.indexOf("if (data.action ===", gAt + 10);
    const g = src.slice(gAt, gNext > gAt ? gNext : gAt + 2500);
    assert.match(g, /Группа не на сайте/);
    assert.match(g, /fromCache: true/);
  });

  it("список клиентов с диска, поиск не ходит в Alfa", () => {
    const src = readFileSync(new URL("./admin-disk-run.ts", import.meta.url), "utf8");
    const at = src.indexOf('if (kind === "clients")');
    const next = src.indexOf("if (kind === \"prices\")", at);
    const chunk = src.slice(at, next > at ? next : at + 800);
    assert.match(chunk, /searchClientViews/);
    assert.match(chunk, /toClientListRow/);
    assert.match(chunk, /data.take/);
    assert.equal(/customer\/index/.test(chunk), false);
    assert.equal(/startLeadTicker/.test(src), false);
  });

  it("воронка лидов с диска, Alfa только force", () => {
    const src = readFileSync(new URL("./crm-leads.ts", import.meta.url), "utf8");
    const at = src.indexOf("export async function loadLeadsBoard");
    const next = src.indexOf("export function rememberCustomerAsLead");
    const chunk = src.slice(at, next > at ? next : at + 4000);
    assert.match(chunk, /boardFromDisk/);
    assert.match(chunk, /wantAlfaPull\(force\)/);
    assert.match(src, /export async function boardFromDisk/);
    assert.match(src, /с диска сайта/);
    const diskPart = chunk.slice(0, chunk.indexOf("if (delta"));
    assert.equal(/alfaToken/.test(diskPart), false);
    assert.equal(/syncLeadsDelta/.test(diskPart), false);
    const stages = readFileSync(new URL("./crm-leads-stages.ts", import.meta.url), "utf8");
    assert.match(stages, /export function leadCardFromView/);
    const save = readFileSync(new URL("./trial-save.ts", import.meta.url), "utf8");
    assert.match(save, /actor: "consultant"/);
    const exp = readFileSync(new URL("./crm-export-queue.ts", import.meta.url), "utf8");
    assert.match(exp, /logAdmin\(`Выгрузка CRM: \$\{q\.lastNote\}`, "sync"\)/);
  });

  it("этап 5: очередь Alfa — нет прямого API на запись, актор на выгрузке", () => {
    const leads = readFileSync(new URL("./crm-leads.ts", import.meta.url), "utf8");
    const moveAt = leads.indexOf("export async function moveLead");
    const move = leads.slice(moveAt, leads.indexOf("export async function archiveLead"));
    assert.match(move, /enqueueExport/);
    assert.match(move, /actor/);
    assert.equal(/alfaToken/.test(move), false);
    assert.equal(/patchLead/.test(move), false);
    const sortAt = leads.indexOf("export async function sortLeadStages");
    const sort = leads.slice(sortAt, leads.indexOf("export async function deleteLeadStage"));
    assert.match(sort, /diskSortLeadStages/);
    assert.match(sort, /lead-status.update/);
    assert.equal(/postCrmLeadStatusSort/.test(sort), false);
    assert.equal(/alfaToken/.test(sort), false);
    assert.match(leads, /export function diskSortLeadStages/);
    assert.equal(/async function patchLead/.test(leads), false);

    const sched = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    const sortSchedAt = sched.indexOf('data.action === "leadStageSort"');
    const sortSchedNext = sched.indexOf("if (data.action ===", sortSchedAt + 10);
    const sortSched = sched.slice(sortSchedAt, sortSchedNext > sortSchedAt ? sortSchedNext : sortSchedAt + 2500);
    assert.match(sortSched, /cachedLeadBoard/);
    assert.equal(/loadLeadsBoard/.test(sortSched), false);
    assert.match(sortSched, /"human"/);

    const auto = readFileSync(new URL("./funnel-auto.ts", import.meta.url), "utf8");
    assert.match(auto, /moveLead\(branch, id, statusId, undefined, "sync"\)/);

    const save = readFileSync(new URL("./trial-save.ts", import.meta.url), "utf8");
    assert.equal(/upsertAlfaLead/.test(save), false);
    assert.equal(/s20\.online/.test(save), false);
    assert.equal(/lead-form\/save/.test(save), false);

    const exp = readFileSync(new URL("./crm-export-queue.ts", import.meta.url), "utf8");
    assert.match(exp, /exportJobSnap/);
    const createdAt = exp.indexOf('if (job.op === "customer.create")');
    const created = exp.slice(createdAt, createdAt + 1800);
    assert.match(created, /op: "lesson.create"/);
    assert.equal(/await createAlfaLesson/.test(created), false);
  });

  it("этап 3: стык курс/предмет — одно правило, имя не ключ", () => {
    const core = readFileSync(new URL("./course-subject-core.ts", import.meta.url), "utf8");
    assert.match(core, /export function joinCourseSubject/);
    assert.match(core, /CourseSubjectGap/);
    assert.equal(/schoolFromHay/.test(core), false);
    assert.equal(/slotMismatch/.test(core), false);
    assert.equal(/from\s+["'][^"']*romashka/.test(core), false);
    assert.equal(/from\s+["']node:fs["']/.test(core), false);
    const ids = readFileSync(new URL("./ids.ts", import.meta.url), "utf8");
    assert.match(ids, /from "\.\/course-subject-core"/);
    assert.match(ids, /joinCourseSubject/);
    assert.equal(/export function joinCourseSubject/.test(ids), false);
    assert.equal(/schoolFromHay/.test(ids), false);
    assert.equal(/slotMismatch/.test(ids), false);
    const pub = readFileSync(new URL("./public-bind-core.ts", import.meta.url), "utf8");
    assert.match(pub, /from "\.\/course-subject-core\.ts"/);
    assert.match(pub, /resolveGroupCourseId/);
    assert.equal(/schoolFromHay/.test(pub), false);
    assert.equal(/from\s+["'][^"']*ids/.test(pub), false);
    const rules = readFileSync(new URL("./crm-disk-rules.ts", import.meta.url), "utf8");
    assert.match(rules, /id: "course"/);
    assert.match(rules, /schedule-map/);
    const settings = readFileSync(new URL("../components/admin-crm-settings.tsx", import.meta.url), "utf8");
    assert.match(settings, /ALFA_LINK_MODES/);
    assert.match(settings, /Связь с AlfaCRM/);
    const map = readFileSync(new URL("./schedule-map.ts", import.meta.url), "utf8");
    assert.match(map, /joinCourseSubject/);
    assert.match(map, /courseSubjectGapText/);
  });

  it("этап 6: свой id отрицательный, очередь переписывает одним правилом", () => {
    const local = readFileSync(new URL("./crm-local-id.ts", import.meta.url), "utf8");
    assert.match(local, /export function isLocalId/);
    assert.match(local, /export function nextLocalId/);
    assert.match(local, /export function isLocalSubject/);
    assert.equal(/from\s+["']node:fs["']/.test(local), false);
    const core = readFileSync(new URL("./crm-export-queue-core.ts", import.meta.url), "utf8");
    assert.match(core, /export function remapExportJobs/);
    const queue = readFileSync(new URL("./crm-export-queue.ts", import.meta.url), "utf8");
    assert.match(queue, /remapExportJobs/);
    assert.equal(/body\.subject_id\) === localId/.test(queue), false);
    const sub = readFileSync(new URL("./crm-subjects.ts", import.meta.url), "utf8");
    assert.match(sub, /nextLocalId/);
    assert.match(sub, /isLocalSubject/);
    const trial = readFileSync(new URL("./trial-disk.ts", import.meta.url), "utf8");
    assert.match(trial, /nextLocalId/);
    const cards = readFileSync(new URL("./group-cards.ts", import.meta.url), "utf8");
    assert.match(cards, /nextLocalId/);
    const leads = readFileSync(new URL("./crm-leads.ts", import.meta.url), "utf8");
    assert.match(leads, /nextLocalId/);
    const rules = readFileSync(new URL("./crm-disk-rules.ts", import.meta.url), "utf8");
    assert.match(rules, /id: "local"/);
    assert.match(rules, /stage: 6/);
    const settings = readFileSync(new URL("../components/admin-crm-settings.tsx", import.meta.url), "utf8");
    assert.match(settings, /ALFA_LINK_MODES/);
    const sched = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    assert.match(sched, /isLocalSubject/);
  });

  it("этап 7: журнал уроков — customerIds на диске, не cgi", () => {
    const core = readFileSync(new URL("./crm-journal-core.ts", import.meta.url), "utf8");
    assert.match(core, /export function stampJournal/);
    assert.match(core, /export function journalForCustomer/);
    assert.equal(/from\s+["']node:fs["']/.test(core), false);
    const save = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    const saveAt = save.indexOf('data.action === "lessonSave"');
    const saveNext = save.indexOf("if (data.action ===", saveAt + 10);
    const chunk = save.slice(saveAt, saveNext > saveAt ? saveNext : saveAt + 4000);
    assert.match(chunk, /stampJournal/);
    const stAt = save.indexOf('data.action === "lessonStatus"');
    const stNext = save.indexOf("if (data.action ===", stAt + 10);
    const st = save.slice(stAt, stNext > stAt ? stNext : stAt + 2500);
    assert.match(st, /stampJournal/);
    assert.match(st, /rememberLessons/);
    const card = readFileSync(new URL("./customer-card-disk.ts", import.meta.url), "utf8");
    assert.match(card, /journalForCustomer/);
    assert.match(card, /clientLessonFromJournal/);
    const lessons = readFileSync(new URL("./crm-lessons.ts", import.meta.url), "utf8");
    assert.match(lessons, /journalAttend/);
    const rules = readFileSync(new URL("./crm-disk-rules.ts", import.meta.url), "utf8");
    assert.match(rules, /id: "journal"/);
    assert.match(rules, /stage: 7/);
    const inbound = readFileSync(new URL("./crm-journal-inbound.ts", import.meta.url), "utf8");
    assert.match(inbound, /pendingExportIds/);
    assert.match(inbound, /mergeLocalCalendar/);
    assert.match(inbound, /"union"/);
    assert.match(inbound, /date_from/);
    const pack = readFileSync(new URL("./crm-packet-queue.ts", import.meta.url), "utf8");
    assert.match(pack, /kind === "journal"/);
    assert.match(pack, /inboundJournalChunk/);
    assert.match(pack, /skipJournal/);
  });

  it("этап 8: деньги — журнал на диске, Alfa касса очередь", () => {
    const core = readFileSync(new URL("./crm-pay-core.ts", import.meta.url), "utf8");
    assert.match(core, /export function payEffect/);
    assert.match(core, /export function balanceOf/);
    assert.match(core, /export function mergePayInbound/);
    assert.equal(/from\s+["']node:fs["']/.test(core), false);
    const pay = readFileSync(new URL("./crm-pay.ts", import.meta.url), "utf8");
    assert.match(pay, /appendPay/);
    assert.match(pay, /applyCreatedPay/);
    assert.match(pay, /inboundCustomerPays/);
    assert.match(pay, /pendingExportIds/);
    const save = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    const at = save.indexOf('data.action === "customerPay"');
    const next = save.indexOf("if (data.action ===", at + 10);
    const chunk = save.slice(at, next > at ? next : at + 3500);
    assert.match(chunk, /appendPay/);
    assert.match(chunk, /pay.create/);
    assert.match(chunk, /localId/);
    const card = readFileSync(new URL("./customer-card-disk.ts", import.meta.url), "utf8");
    assert.match(card, /customerBalance/);
    const rules = readFileSync(new URL("./crm-disk-rules.ts", import.meta.url), "utf8");
    assert.match(rules, /id: "money"/);
    assert.match(rules, /stage: 8/);
    const queue = readFileSync(new URL("./crm-export-queue.ts", import.meta.url), "utf8");
    assert.match(queue, /applyCreatedPay/);
    assert.match(readFileSync(new URL("./customer-card-disk.ts", import.meta.url), "utf8"), /cardPays/);
  });

  it("этап 9: каналы консультанта — лента на диске, Alfa не F5", () => {
    const core = readFileSync(new URL("./crm-comms-core.ts", import.meta.url), "utf8");
    assert.match(core, /export function mergeCommsInbound/);
    assert.match(core, /export function packAlfaComm/);
    assert.equal(/from\s+["']node:fs["']/.test(core), false);
    const comms = readFileSync(new URL("./crm-comms.ts", import.meta.url), "utf8");
    assert.match(comms, /appendComm/);
    assert.match(comms, /inboundCustomerComms/);
    assert.match(comms, /rememberConsultantTurn/);
    const card = readFileSync(new URL("./customer-card-disk.ts", import.meta.url), "utf8");
    assert.match(card, /commsOf/);
    assert.match(card, /cardPays/);
    const load = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    const loadAt = load.indexOf("async function loadCustomerCard");
    const loadEnd = load.indexOf("\nfunction hm(", loadAt);
    const chunk = load.slice(loadAt, loadEnd > loadAt ? loadEnd : loadAt + 5000);
    assert.equal(/communication\/index/.test(chunk), false);
    assert.equal(/customer-tariff\/index/.test(chunk), false);
    const getAt = load.indexOf('data.action === "customerGet"');
    const getNext = load.indexOf("if (data.action ===", getAt + 10);
    const get = load.slice(getAt, getNext > getAt ? getNext : getAt + 3500);
    assert.match(get, /inboundCustomerComms/);
    const trial = readFileSync(new URL("./trial-save.ts", import.meta.url), "utf8");
    assert.match(trial, /appendComm/);
    assert.match(trial, /applyCreatedCommCustomer/);
    const chat = readFileSync(new URL("./agent-chat.ts", import.meta.url), "utf8");
    assert.match(chat, /rememberConsultantTurn/);
    assert.match(chat, /commsPrompt/);
    assert.match(chat, /phone\?: string/);
    const inbox = readFileSync(new URL("./agent-inbox.ts", import.meta.url), "utf8");
    assert.match(inbox, /rememberConsultantTurn/);
    assert.match(inbox, /stampComms/);
    const rules = readFileSync(new URL("./crm-disk-rules.ts", import.meta.url), "utf8");
    assert.match(rules, /id: "comms"/);
    assert.match(rules, /stage: 9/);
  });
});
