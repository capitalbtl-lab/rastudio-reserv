import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isSyncFresh,
  lessonFillStart,
  lessonFillAdvance,
  lessonFillOf,
  lessonFillForWindow,
  lessonFillStartMonth,
  prevMonthChunk,
  monthChunkNow,
  LESSON_FILL_FLOOR,
  CUSTOMER_SYNC_TTL_MS,
  LESSON_INBOUND_RUN,
  LESSON_STATUSES,
  lessonsCountShort,
  lessonsCountExtra,
  lessonsJournalReady,
  wasLessonGreen,
  lessonsStampShort,
  lessonsStampExtra,
  stampLessonSetGap,
  tryLockStudentAlfa,
  unlockStudentAlfa,
  ownsStudentAlfa,
  studentAlfaOwner,
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
    const mid = { bid: 1, statusIdx: 1, page: 2, from: "2019-09-11" };
    assert.deepEqual(lessonFillForWindow(mid, "2019-09-11", 1), mid);
    assert.deepEqual(lessonFillForWindow(mid, "2015-01-01", 2), { bid: 2, statusIdx: 0, page: 0, from: "2015-01-01" });
    const old = { bid: 1, statusIdx: 1, page: 2 };
    assert.equal(lessonFillForWindow(old, "2019-09-11", 1).page, 2);
    assert.equal(lessonFillForWindow(old, "2019-09-11", 1).from, "2019-09-11");
    assert.deepEqual(lessonFillForWindow(old, "2015-01-01", 2), { bid: 2, statusIdx: 0, page: 0, from: "2015-01-01" });
    assert.equal(lessonFillAdvance({ ...mid }, false, [1]).from, "2019-09-11");
    assert.equal(lessonFillOf({ bid: 1, statusIdx: 0, page: 1, from: "2015-01-01" })?.from, "2015-01-01");
    assert.equal(LESSON_FILL_FLOOR, "2015-01-01");
    assert.deepEqual(prevMonthChunk("2026-09-01"), { from: "2026-08-01", to: "2026-08-31" });
    assert.equal(prevMonthChunk("2015-01-01"), null);
    const m = lessonFillStartMonth(1, new Date(2026, 8, 13));
    assert.equal(m.from, "2026-09-01");
    assert.equal(m.to, "2026-09-13");
    const nextM = lessonFillAdvance({ bid: 2, statusIdx: 2, page: 0, from: "2026-09-01", to: "2026-09-13" }, true, [1, 2]);
    assert.equal(nextM.from, "2026-08-01");
    assert.equal(nextM.to, "2026-08-31");
    assert.equal(nextM.bid, 1);
    assert.equal(nextM.page, 0);
    const keepMonth = { bid: 1, statusIdx: 1, page: 2, from: "2026-09-01", to: "2026-09-13" };
    assert.deepEqual(lessonFillForWindow(keepMonth, "2015-01-01", 2), keepMonth);
    assert.equal(monthChunkNow(new Date(2026, 0, 5)).from, "2026-01-01");
  });

  it("счёт сошёлся — готово, даже без обхода филиалов", () => {
    assert.equal(lessonsCountShort(8, 8, true), false);
    assert.equal(lessonsCountShort(329, 273, true), false);
    assert.equal(lessonsCountExtra(329, 273, true), true);
    assert.equal(lessonsCountExtra(47, 47, true), false);
    assert.equal(lessonsCountExtra(84, 47, true), true);
    assert.equal(lessonsCountShort(0, 71, true), true);
    assert.equal(lessonsCountShort(5, 20, true), true);
    assert.equal(lessonsJournalReady({ lessonsAlfaAt: "x", lessonsAlfa: 8, lessonsDisk: 8 }), true);
    assert.equal(lessonsJournalReady({ lessonsAlfaAt: "x", lessonsAlfa: 273, lessonsDisk: 329 }), false);
    assert.equal(lessonsJournalReady({ lessonsAlfaAt: "x", lessonsAlfa: 47, lessonsDisk: 84, lessonsFull: true, lessonsAttend: true }), false);
    assert.equal(lessonsJournalReady({ lessonsAlfaAt: "x", lessonsAlfa: 71, lessonsDisk: 0 }), false);
    assert.equal(lessonsJournalReady({ lessonsFull: true, lessonsAttend: true, lessonsDisk: 3 }), true);
    assert.equal(lessonsJournalReady({ lessonsDisk: 47 }), false);
    assert.equal(wasLessonGreen({ lessonsRecheckAt: "x" }), true);
    assert.equal(wasLessonGreen({ lessonsFull: true }), true);
    assert.equal(wasLessonGreen({ lessonsAlfaAt: "x", lessonsAlfa: 491, lessonsDisk: 491 }), true);
    assert.equal(wasLessonGreen({ lessonsAlfaAt: "x", lessonsAlfa: 491, lessonsDisk: 495 }), false);
    assert.equal(wasLessonGreen({ lessonsAlfaAt: "x", lessonsAlfa: 491, lessonsDisk: 400 }), false);
    assert.equal(wasLessonGreen({}), false);
    assert.equal(lessonsStampShort({ lessonsAlfaAt: "x", lessonsAlfa: 2, lessonsDisk: 2, lessonsHoleN: 1 }), true);
    assert.equal(lessonsStampExtra({ lessonsAlfaAt: "x", lessonsAlfa: 2, lessonsDisk: 2, lessonsSeenIds: [1, 2], lessonsExtraN: 1 }), true);
    assert.equal(lessonsJournalReady({ lessonsAlfaAt: "x", lessonsAlfa: 2, lessonsDisk: 2, lessonsHoleN: 1 }), false);
    assert.equal(lessonsJournalReady({ lessonsAlfaAt: "x", lessonsAlfa: 2, lessonsDisk: 2, lessonsSeenIds: [1, 2], lessonsHoleN: 0, lessonsExtraN: 0 }), true);
    assert.deepEqual(stampLessonSetGap({ lessonsSeenIds: [1, 2] }, [1, 3], []), { lessonsHoleN: 1, lessonsExtraN: 1 });
    assert.deepEqual(stampLessonSetGap({ lessonsSeenIds: [1, 2] }, [1, 2, 9], [9]), { lessonsHoleN: 0, lessonsExtraN: 0 });
  });

  it("штамп дырки: ключ ISO, пустая строка снимает, проба не пишет", () => {
    const sync = readFileSync(new URL("./crm-customer-sync.ts", import.meta.url), "utf8");
    const pull = readFileSync(new URL("./crm-journal-pull.ts", import.meta.url), "utf8");
    assert.match(sync, /journalHoleApprovedAt\?: string/);
    assert.match(sync, /if \(patch.journalHoleApprovedAt === ""\) delete next.journalHoleApprovedAt/);
    assert.match(sync, /if \(patch.lessonsRecheckAt === ""\) delete next.lessonsRecheckAt/);
    assert.match(pull, /"holeApprove" \| "holeApproveClear" \| "lessonsReset"/);
    assert.match(pull, /kind === "holeApprove" \|\| kind === "holeApproveClear"/);
    assert.match(pull, /kind === "lessonsReset"/);
    assert.match(pull, /journalHoleApprovedAt: on \? new Date\(\)\.toISOString\(\) : ""/);
    assert.match(pull, /holeApproved: Boolean\(sync.journalHoleApprovedAt\)/);
    const markAt = pull.indexOf("const mark = ");
    const markEnd = pull.indexOf("return { short, extra, closed }", markAt);
    const mark = pull.slice(markAt, markEnd > markAt ? markEnd : markAt + 800);
    assert.doesNotMatch(mark, /journalHoleApprovedAt:/);
    const holeAt = pull.indexOf('kind === "holeApprove"');
    const holeEnd = pull.indexOf('kind === "lessonsReset"', holeAt);
    const hole = pull.slice(holeAt, holeEnd > holeAt ? holeEnd : holeAt + 900);
    assert.doesNotMatch(hole, /pullOneStudent/);
    assert.doesNotMatch(hole, /inboundCustomerLessons/);
    assert.doesNotMatch(hole, /probeCustomerLessons/);
    assert.match(hole, /stampCustomerSync\(cid, \{ journalHoleApprovedAt:/);
  });

  it("сброс диска жёлтой: keep Alfa в 0, курсор снять, без пробы в том же клике", () => {
    const inbound = readFileSync(new URL("./crm-journal-inbound.ts", import.meta.url), "utf8");
    const pull = readFileSync(new URL("./crm-journal-pull.ts", import.meta.url), "utf8");
    const ui = readFileSync(new URL("../components/admin-crm-settings.tsx", import.meta.url), "utf8");
    const fnAt = inbound.indexOf("export function resetStudentLessonDisk");
    const fn = inbound.slice(fnAt, fnAt + 900);
    assert.match(fn, /pruneCalendarToAlfaIds\(prev, \[\], hold, \[\], ""\)/);
    assert.match(fn, /lessonsAlfa: 0/);
    assert.match(fn, /lessonsFull: false/);
    assert.match(fn, /lessonsRecheckAt: ""/);
    assert.match(fn, /lessonsAlfaAt: ""/);
    assert.doesNotMatch(fn, /token\(|request\(|v2api/);
    const resetAt = pull.indexOf('kind === "lessonsReset"');
    const reset = pull.slice(resetAt, resetAt + 1600);
    assert.match(reset, /resetStudentLessonDisk\(cid\)/);
    assert.doesNotMatch(reset, /probeCustomerLessons/);
    assert.doesNotMatch(reset, /lessonsAlfa: first/);
    assert.doesNotMatch(reset, /pullOneStudent/);
    assert.match(ui, /kind: "lessonsReset"/);
    assert.match(ui, /С нуля/);
    assert.match(ui, /loadPerson\(row, "students", peopleStudy, false, "2015-01-01"\)/);
  });

  it("замок ученика: два cid сразу, файл, свой pid не блокирует", () => {
    const sync = readFileSync(new URL("./crm-customer-sync.ts", import.meta.url), "utf8");
    assert.match(sync, /flag: "wx"/);
    assert.match(sync, /crm-student-\$\{id\}\.lock/);
    assert.match(sync, /export function ownsStudentAlfa/);
    assert.equal(tryLockStudentAlfa(900001), true);
    assert.equal(tryLockStudentAlfa(900002), true);
    assert.equal(ownsStudentAlfa(900001), true);
    assert.equal(ownsStudentAlfa(900002), true);
    unlockStudentAlfa(900001);
    assert.equal(ownsStudentAlfa(900001), false);
    assert.equal(ownsStudentAlfa(900002), true);
    assert.equal(tryLockStudentAlfa(900001), true);
    unlockStudentAlfa(900001);
    unlockStudentAlfa(900002);
    assert.equal(studentAlfaOwner(), 0);
    assert.equal(ownsStudentAlfa(900001), false);
    assert.equal(ownsStudentAlfa(900002), false);
  });

  it("вход с Alfa дописывает диск; keep растёт только если диск уже больше Alfa", () => {
    const sync = readFileSync(new URL("./crm-customer-sync.ts", import.meta.url), "utf8");
    const cards = readFileSync(new URL("./group-cards.ts", import.meta.url), "utf8");
    const inbound = readFileSync(new URL("./crm-journal-inbound.ts", import.meta.url), "utf8");
    assert.match(sync, /export function noteAlfaLessonsLanded/);
    assert.match(sync, /bumpAlfaFromLanded\(keep, add\)/);
    assert.match(sync, /add = keep > 0 \? Math.max\(0, diskN - keep\) : 0/);
    assert.doesNotMatch(sync, /fresh.length > 0 \? fresh.length : gap/);
    assert.match(sync, /held \? \{ lessonsAlfa: nextAlfa, lessonsAlfaAt: at, lessonsFull: false \}/);
    assert.match(cards, /noteAlfaLessonsLanded\(cid, countAlfaLessonUniq\(prev\), added\)/);
    assert.match(cards, /noteAlfaLessonsLanded\(id, countAlfaLessonUniq\(list\)/);
    assert.match(inbound, /noteAlfaLessonsLanded\(/);
    assert.doesNotMatch(sync, /lessonsFull: true/);
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
    assert.match(inbound, /ymd\(opts\?\.dateFrom\) \|\| "2015-01-01"/);
    assert.match(inbound, /LESSON_RECENT_DAYS/);
    assert.match(inbound, /mergeLocalCalendar/);
    assert.match(inbound, /"union"/);
    assert.match(inbound, /customerLessonsFresh/);
    assert.match(inbound, /lessonFillForWindow/);
    assert.match(inbound, /lessonFillAdvance/);
    assert.match(inbound, /packLessonPupils/);
    assert.match(inbound, /uniqueBranches/);
    assert.match(inbound, /lessonsAttend/);
    assert.match(inbound, /customerLessonsNeedAttend/);
    assert.match(inbound, /inboundCustomerLessonsChunk/);
    assert.match(inbound, /listDossierCrm/);
    assert.match(inbound, /pull\(1, dateFrom, dateTo, 8, 100\)/);
    assert.match(inbound, /status: Number\(l.status\) \|\| 3/);
    assert.doesNotMatch(inbound, /lesson_id: l.lessonId/);
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
    const chunk = pay.slice(payAt, payAt + 9000);
    assert.match(chunk, /uniqueBranches\(branchId\)/);
    assert.match(chunk, /PAY_INBOUND_RUN/);
    assert.match(chunk, /pay_type_id: typeId/);
    assert.match(chunk, /\[5, 6, 9\]/);
    assert.match(chunk, /b === branches.length - 1 && lastShort/);
    assert.doesNotMatch(chunk, /lastShort && !overBudget\(\)\) done/);
    assert.match(chunk, /if \(!failed && b === branches.length - 1 && lastShort\) done = true/);
    assert.doesNotMatch(chunk, /filled \? 1 : PAY_INBOUND_RUN/);
    assert.doesNotMatch(chunk, /filled \? \[Number\(branchId\)/);
  });

  it("событие на сайте сразу в очередь Alfa", () => {
    const q = readFileSync(new URL("./crm-export-queue.ts", import.meta.url), "utf8");
    assert.match(q, /tickExportQueue\(1,/);
    assert.match(q, /customer\.update|lesson\.update|pay\.create/);
  });
});
