import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isSyncFresh,
  lessonFillStart,
  lessonFillAdvance,
  lessonFillOf,
  CUSTOMER_SYNC_TTL_MS,
  LESSON_INBOUND_RUN,
  LESSON_STATUSES,
  lessonsCountShort,
  lessonsJournalReady,
} from "./crm-customer-sync.ts";

describe("штамп входа ученика", () => {
  it("свежий штамп не старше TTL, пустой — нет", () => {
    assert.equal(isSyncFresh(""), false);
    assert.equal(isSyncFresh(undefined), false);
    const now = Date.parse("2026-09-08T00:00:00.000Z");
    assert.equal(isSyncFresh(new Date(now - 60_000).toISOString(), now), true);
    assert.equal(isSyncFresh(new Date(now - CUSTOMER_SYNC_TTL_MS - 1).toISOString(), now), false);
  });

  it("история занятий: короткая страница двигает статус, потом филиал, потом done", () => {
    assert.deepEqual(lessonFillStart(2), { bid: 2, statusIdx: 0, page: 0 });
    assert.deepEqual(lessonFillAdvance({ bid: 1, statusIdx: 0, page: 0 }, false, [1, 2]), { bid: 1, statusIdx: 0, page: 1 });
    assert.deepEqual(lessonFillAdvance({ bid: 1, statusIdx: 0, page: 2 }, true, [1, 2]), { bid: 1, statusIdx: 1, page: 0 });
    assert.deepEqual(lessonFillAdvance({ bid: 1, statusIdx: 2, page: 0 }, true, [1, 2]), { bid: 2, statusIdx: 0, page: 0 });
    assert.equal(lessonFillAdvance({ bid: 2, statusIdx: 2, page: 1 }, true, [1, 2]).done, true);
    assert.equal(lessonFillOf({ bid: 3, statusIdx: 1, page: 4 })?.statusIdx, 1);
    assert.equal(LESSON_INBOUND_RUN, 8);
    assert.equal(LESSON_STATUSES[0], 3);
  });

  it("счёт сошёлся — готово, даже без обхода филиалов", () => {
    assert.equal(lessonsCountShort(8, 8, true), false);
    assert.equal(lessonsCountShort(329, 273, true), false);
    assert.equal(lessonsCountShort(0, 71, true), true);
    assert.equal(lessonsCountShort(5, 20, true), true);
    assert.equal(lessonsJournalReady({ lessonsAlfaAt: "x", lessonsAlfa: 8, lessonsDisk: 8 }), true);
    assert.equal(lessonsJournalReady({ lessonsAlfaAt: "x", lessonsAlfa: 273, lessonsDisk: 329 }), true);
    assert.equal(lessonsJournalReady({ lessonsAlfaAt: "x", lessonsAlfa: 71, lessonsDisk: 0 }), false);
    assert.equal(lessonsJournalReady({ lessonsFull: true, lessonsAttend: true, lessonsDisk: 3 }), true);
    assert.equal(lessonsJournalReady({ lessonsDisk: 47 }), false);
  });
});

describe("карточка не ждёт Alfa", () => {
  it("customerGet: пустой журнал ждём, иначе диск сразу", () => {
    const src = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    const getAt = src.indexOf('data.action === "customerGet"');
    const getNext = src.indexOf("if (data.action ===", getAt + 10);
    const get = src.slice(getAt, getNext > getAt ? getNext : getAt + 3500);
    const diskEnd = get.indexOf("if (customerId < 0)");
    const disk = get.slice(0, diskEnd > 0 ? diskEnd : get.length);
    assert.match(get, /inboundCustomerLessons/);
    assert.match(disk, /cardFromDossier/);
    assert.match(disk, /fromCache: true/);
    assert.equal(/pullCustomerTariffs/.test(disk), false);
    assert.equal(/pullCustomerRegular/.test(disk), false);
    assert.equal(/inboundCustomerPays/.test(disk), false);
    assert.equal(/pullCustomerAccount/.test(disk), false);
    assert.match(get, /emptyCal/);
    assert.match(get, /if \(emptyCal\) await job/);
    assert.match(get, /else void job/);
    assert.equal(/await import\("\.\/crm-journal-inbound"\)/.test(get), false);
  });

  it("журнал ученика: полная история один раз, дальше окно и union", () => {
    const inbound = readFileSync(new URL("./crm-journal-inbound.ts", import.meta.url), "utf8");
    assert.match(inbound, /ymd\(ruShift\(-2600\)\)/);
    assert.match(inbound, /LESSON_RECENT_DAYS/);
    assert.match(inbound, /mergeLocalCalendar/);
    assert.match(inbound, /"union"/);
    assert.match(inbound, /customerLessonsFresh/);
    assert.match(inbound, /lessonFillAdvance/);
    assert.match(inbound, /packLessonPupils/);
    assert.match(inbound, /uniqueBranches/);
    assert.match(inbound, /lessonsAttend/);
    assert.match(inbound, /customerLessonsNeedAttend/);
    assert.match(inbound, /inboundCustomerLessonsChunk/);
    assert.match(inbound, /listDossierCrm/);
    assert.match(inbound, /pull\(1, dateFrom, dateTo, 8, 100\)/);
    assert.match(inbound, /lesson_id: l.lessonId/);
    assert.match(inbound, /mergeLessonPupils/);
    assert.match(inbound, /overlayAllowsCustomer/);
    const queue = readFileSync(new URL("./crm-packet-queue.ts", import.meta.url), "utf8");
    assert.match(queue, /kind: "lessons"/);
    assert.match(queue, /enqueueLessonsOverlay/);
    assert.match(queue, /clearLessonsAttendStamps/);
    assert.match(queue, /inboundCustomerLessonsChunk/);
    const run = readFileSync(new URL("./admin-disk-run.ts", import.meta.url), "utf8");
    assert.match(run, /local.counts\[bucket\]/);
    const dossiers = readFileSync(new URL("./dossiers.ts", import.meta.url), "utf8");
    const at = dossiers.indexOf("export async function syncAllFromCrm");
    const next = dossiers.indexOf("export async function syncNewLeadsFromCrm");
    const chunkAll = dossiers.slice(at, next > at ? next : at + 9000);
    assert.match(chunkAll, /removed: 2/);
    assert.match(dossiers, /reallyArchived/);
    assert.match(chunkAll, /archiveOnly/);
    const clientsUi = readFileSync(new URL("../components/admin-clients.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(clientsUi, /void pullKind\("clientsArchive"\)/);
    assert.doesNotMatch(clientsUi, /if \(!counts.архив\) void pullKind\("clientsArchive"\)/);
    assert.match(clientsUi, /История из Alfa/);
    assert.match(clientsUi, /\["архив", "Архив", counts.архив\]/);
    const cards = readFileSync(new URL("./group-cards.ts", import.meta.url), "utf8");
    assert.match(cards, /slice\(0, 2500\)/);
    const card = readFileSync(new URL("../components/crm-client-card.tsx", import.meta.url), "utf8");
    assert.match(card, /lessonsForCard\(card.calendar, card.regular, card.groups \|\| \[\], card.id\)/);
    const sync = readFileSync(new URL("./crm-customer-sync.ts", import.meta.url), "utf8");
    assert.match(sync, /clearLessonsAttendStamps/);
    const pay = readFileSync(new URL("./crm-pay.ts", import.meta.url), "utf8");
    const payAt = pay.indexOf("export async function inboundCustomerPays");
    const chunk = pay.slice(payAt, payAt + 2800);
    assert.match(chunk, /filled \? 1 : PAY_INBOUND_RUN/);
    assert.match(chunk, /!filled/);
  });

  it("событие на сайте сразу в очередь Alfa", () => {
    const q = readFileSync(new URL("./crm-export-queue.ts", import.meta.url), "utf8");
    assert.match(q, /tickExportQueue\(1,/);
    assert.match(q, /customer\.update|lesson\.update|pay\.create/);
  });
});
