import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  peopleJobQueue,
  peopleRecheckAdvance,
  peopleSlowAdvance,
  groupsRecheckAdvance,
  peopleNeedCashLoad,
  peopleNeedProbe,
  peopleJobFinished,
  shouldRetryCash,
  rotateUnfinished,
  shouldRetryOpenRecheck,
  shouldRetryShortPeople,
  recheckBusyErr,
  capRecheckAction,
  jobGapMs,
  jobGapOf,
  jobGapLabel,
  bumpJobWaits,
  resetJobWaits,
  is429Err,
  JOURNAL_MONTH_GAP_MS,
  JOURNAL_WINDOW_GAP_MS,
  mergeJobPatch,
  parseJobItems,
  emptyJournalJob,
  PEOPLE_JOB_GAP_MS,
  CATALOG_JOB_GAP_MS,
  JOB_WAIT_CAP,
  historyWorkerSilent,
  shouldResumeStalledJob,
  jobRetryGapMs,
  RECHECK_STALL_MS,
  stoppedJobMsg,
  isRecheckWaveMode,
  jobHasIce,
} from "./crm-journal-job-core.ts";

describe("фон истории из Alfa", () => {
  it("воркер молчит, если lastAt старше 30 с", () => {
    assert.equal(historyWorkerSilent({ ...emptyJournalJob(), running: false, lastAt: new Date(0).toISOString() }), false);
    assert.equal(historyWorkerSilent({ ...emptyJournalJob(), running: true, lastAt: new Date().toISOString() }), false);
    assert.equal(historyWorkerSilent({ ...emptyJournalJob(), running: true, lastAt: new Date(Date.now() - 60_000).toISOString() }), true);
    const stalled = {
      ...emptyJournalJob(),
      id: "r1",
      recheck: true,
      running: false,
      stop: false,
      n: 0,
      total: 75,
      lastAt: new Date(Date.now() - RECHECK_STALL_MS - 1000).toISOString(),
    };
    assert.equal(shouldResumeStalledJob(stalled), true);
    assert.equal(shouldResumeStalledJob({ ...stalled, stop: true }), false);
    assert.equal(shouldResumeStalledJob({ ...stalled, recheck: false, mode: "people" }), true);
    assert.equal(shouldResumeStalledJob({ ...stalled, recheck: false, mode: "roster" }), true);
    assert.equal(shouldResumeStalledJob({ ...stalled, recheck: false, mode: "groups" }), true);
    assert.equal(shouldResumeStalledJob({ ...stalled, n: 75 }), false);
    assert.equal(shouldResumeStalledJob({ ...stalled, waits: 9 }), false);
    assert.equal(shouldResumeStalledJob({ ...stalled, lastAt: new Date().toISOString() }), false);
    assert.equal(emptyJournalJob().dateTo, "");
    assert.equal(isRecheckWaveMode("people-recheck"), true);
    assert.equal(isRecheckWaveMode("groups-recheck"), true);
    assert.equal(isRecheckWaveMode("roster-recheck"), true);
    assert.equal(isRecheckWaveMode("people"), false);
    const waveEnd = {
      ...stalled,
      mode: "people-recheck" as const,
      idx: 80,
      items: Array.from({ length: 80 }, () => ({ name: "x" })),
      n: 79,
      total: 80,
      wave: "right" as const,
      running: false,
    };
    assert.equal(shouldResumeStalledJob(waveEnd), false);
    assert.equal(shouldResumeStalledJob(waveEnd, Date.now(), { wouldAdvance: true }), true);
    assert.equal(shouldResumeStalledJob({ ...waveEnd, wave: "right2" as const }, Date.now(), { wouldAdvance: false }), false);
    assert.equal(
      shouldResumeStalledJob({
        ...stalled,
        mode: "people-recheck" as const,
        n: 75,
        total: 75,
        idx: 0,
        items: [{ name: "a" }],
      }),
      true,
    );
    const iced = { ...emptyJournalJob(), dateFrom: "2026-08-13", dateTo: "2026-10-16", recheck: true };
    assert.equal(jobHasIce(iced), true);
    assert.equal(mergeJobPatch(iced, { n: 1 }).dateTo, "2026-10-16");
    assert.equal(mergeJobPatch(iced, { dateTo: "" }).dateTo, "");
    assert.equal(jobRetryGapMs("429 Too Many Requests"), 120_000);
    assert.equal(jobRetryGapMs("429 Too Many Requests", 0), 120_000);
    assert.equal(jobRetryGapMs("ок"), 5000);
    assert.equal(jobRetryGapMs("нет ответа", 14), 2000);
    assert.match(readFileSync(new URL("./crm-journal-job.ts", import.meta.url), "utf8"), /gap: jobRetryGapMs\(err \|\| "перепись не дошла", live\.recheck \? jobPeriodDays\(live\) : 0\)/);
  });
  it("очередь учеников: слева неготовые, справа перепроверка", () => {
    const people = [
      { cid: 1, branchId: 2, name: "А", journal: false, pays: false },
      { cid: 2, branchId: 2, name: "Б", journal: true, pays: true, rechecked: true, paysRechecked: true },
      { cid: 3, branchId: 2, name: "В", journal: true, pays: true, rechecked: false, paysRechecked: false },
      { cid: 4, branchId: 2, name: "Г", journal: true, pays: false, short: true },
    ];
    assert.deepEqual(peopleJobQueue(people, "students", false).map((x) => x.cid), [1, 4]);
    assert.deepEqual(peopleJobQueue(people, "students", true).map((x) => x.cid), [3]);
    assert.deepEqual(peopleJobQueue([{ ...people[1], dups: true }], "students", true).map((x) => x.cid), []);
    assert.deepEqual(peopleJobQueue([{ ...people[1], dups: true }], "students", false).map((x) => x.cid), [2]);
    assert.equal(peopleJobFinished(people[1], "balance"), true);
    assert.equal(peopleJobFinished({ cid: 5, branchId: 2, name: "Д", journal: false, pays: true, short: true }, "balance"), true);
    assert.equal(peopleJobFinished({ cid: 5, branchId: 2, name: "Д", journal: false, pays: false }, "balance"), false);
    assert.equal(peopleJobFinished({ cid: 5, branchId: 2, name: "Д", journal: false, pays: false, paysScanned: true }, "balance"), true);
    assert.equal(peopleNeedCashLoad({ cid: 5, branchId: 2, name: "Д", journal: false, pays: false }), true);
    assert.equal(peopleNeedCashLoad({ cid: 5, branchId: 2, name: "Д", journal: false, pays: false, paysScanned: true, cashRows: 0 }), false);
    assert.equal(peopleNeedCashLoad({ cid: 5, branchId: 2, name: "Д", journal: false, pays: false, paysScanned: true, paysEmpty: true, cashRows: 0 }), false);
    assert.equal(peopleNeedCashLoad({ cid: 5, branchId: 2, name: "Д", journal: false, pays: false, paysScanned: true, cashRows: 4 }), false);
    assert.equal(peopleNeedCashLoad({ cid: 5, branchId: 2, name: "Д", journal: false, pays: true }), false);
    assert.deepEqual(
      peopleJobQueue([{ cid: 5, branchId: 2, name: "Д", journal: false, pays: false, paysScanned: true, cashRows: 4 }], "balance", false).map((x) => x.cid),
      [],
    );
    assert.deepEqual(
      peopleJobQueue([{ cid: 5, branchId: 2, name: "Д", journal: false, pays: false, paysScanned: true, cashRows: 0 }], "balance", false).map((x) => x.cid),
      [],
    );
    assert.equal(peopleJobFinished(people[3], "students"), false);
    assert.equal(peopleJobFinished({ cid: 6, branchId: 2, name: "Е", journal: false, pays: false, dups: true }, "students"), false);
    assert.equal(peopleJobFinished({ cid: 6176, branchId: 1, name: "Баукина", journal: false, pays: false, short: true, dups: true }, "students"), false);
    assert.deepEqual(
      peopleJobQueue([{ cid: 6176, branchId: 1, name: "Баукина", journal: false, pays: false, short: true, dups: true }], "students", false).map((x) => x.cid),
      [6176],
    );
    assert.deepEqual(
      peopleJobQueue(
        [
          { cid: 699, branchId: 1, name: "розовая", journal: false, pays: false },
          { cid: 5115, branchId: 1, name: "жёлтая", journal: false, pays: false, short: true },
          { cid: 2124, branchId: 1, name: "справа", journal: true, pays: false },
          { cid: 17, branchId: 1, name: "галка", journal: false, pays: false, short: true, holeApproved: true },
        ],
        "students",
        false,
      ).map((x) => x.cid),
      [699, 5115],
    );
    assert.equal(peopleJobFinished({ cid: 2124, branchId: 1, name: "Г", journal: false, pays: false, short: true, holeApproved: true }, "students"), true);
    assert.equal(peopleJobFinished({ cid: 2124, branchId: 1, name: "Г", journal: false, pays: false, short: true }, "students"), false);
    assert.deepEqual(
      peopleJobQueue([{ cid: 2124, branchId: 1, name: "Г", journal: false, pays: false, short: true, holeApproved: true }], "students", false).map((x) => x.cid),
      [],
    );
    assert.deepEqual(
      peopleJobQueue([{ cid: 2124, branchId: 1, name: "Г", journal: false, pays: false, short: true, holeApproved: true, rechecked: false }], "students", true).map((x) => x.cid),
      [],
    );
    assert.equal(shouldRetryShortPeople("people", false, "students", { ok: true, student: { short: true, seated: 50, holeApproved: true } }), false);
    assert.equal(shouldRetryOpenRecheck(true, "students", { ok: true, student: { rechecked: false, holeApproved: true } }), false);
  });

  it("очередь с экрана читается и как массив, и как объект с индексами", () => {
    assert.deepEqual(parseJobItems([{ cid: 670, branchId: 2, name: "Чуднова" }]).map((x) => x.cid), [670]);
    assert.deepEqual(parseJobItems({ 0: { cid: 8037, name: "Анисичкин" }, 1: { cid: 34, name: "Антонов" } }).map((x) => x.cid), [8037, 34]);
    assert.equal(parseJobItems(null).length, 0);
    assert.equal(parseJobItems(undefined).length, 0);
  });

  it("касса: пачка не держит cid, ошибка Alfa — тот же", () => {
    assert.equal(shouldRetryCash("balance", false, { ok: true, student: { paysMore: true } }), false);
    assert.equal(shouldRetryCash("balance", false, { ok: true, extra: "ещё страницы" }), false);
    assert.equal(shouldRetryCash("balance", false, { ok: false, error: "Alfa не ответила, нажмите снова" }), true);
    assert.equal(shouldRetryCash("balance", false, { ok: true, student: { paysOk: false, paysMore: false } }), false);
    assert.equal(shouldRetryCash("balance", false, { ok: true, student: { paysOk: false, paysMore: true } }), false);
    assert.equal(shouldRetryCash("balance", false, { ok: true, student: { paysOk: true, paysMore: false } }), false);
    const rot = rotateUnfinished(
      [
        { cid: 5795, branchId: 1, name: "Крюкова" },
        { cid: 1, branchId: 1, name: "Следующий" },
      ],
      0,
    );
    assert.equal(rot.items[0]?.cid, 1);
    assert.equal(rot.items[1]?.cid, 5795);
    assert.equal(rot.idx, 0);
    assert.equal(shouldRetryCash("balance", true, { ok: true, student: { paysOk: true } }), false);
    assert.equal(shouldRetryCash("students", false, { ok: true }), false);
    assert.equal(shouldRetryCash("students", false, { ok: false, error: "Alfa не ответила, нажмите снова" }), false);
    assert.equal(shouldRetryCash("students", false, { ok: false, error: "уже грузим другого ученика" }), true);
    assert.equal(shouldRetryCash("students", false, { ok: false, error: "502" }), true);
    assert.equal(shouldRetryCash("group", false, { ok: false, error: "Alfa не ответила, нажмите снова" }), false);
    assert.equal(shouldRetryOpenRecheck(true, "students", { ok: true, student: { rechecked: false } }), false);
    assert.equal(shouldRetryOpenRecheck(true, "students", { ok: true, student: { rechecked: false, dups: true } }), false);
    assert.equal(shouldRetryOpenRecheck(true, "students", { ok: true, student: { rechecked: true } }), false);
    assert.equal(shouldRetryOpenRecheck(true, "students", { ok: true, student: { rechecked: true, short: true } }), false);
    assert.equal(shouldRetryOpenRecheck(true, "students", { ok: true, student: { rechecked: true, short: false } }), false);
    assert.equal(shouldRetryOpenRecheck(false, "students", { ok: true, student: { rechecked: false } }), false);
    assert.equal(shouldRetryOpenRecheck(true, "balance", { ok: true, student: { rechecked: true, paysRechecked: false } }), true);
    assert.equal(shouldRetryOpenRecheck(true, "balance", { ok: true, student: { paysRechecked: true } }), false);
    assert.equal(shouldRetryOpenRecheck(true, "balance", { ok: true, student: { paysRechecked: true, paysMore: true } }), true);
    assert.equal(peopleJobFinished({ cid: 5, branchId: 2, name: "Е", journal: false, pays: true, dups: true }, "balance"), true);
    assert.equal(peopleJobFinished({ cid: 5, branchId: 2, name: "Е", journal: false, pays: false, paysScanned: true, dups: true }, "balance"), true);
    assert.equal(shouldRetryOpenRecheck(true, "group", { ok: true, student: { rechecked: false } }), false);
    assert.equal(shouldRetryShortPeople("people", false, "students", { ok: true, student: { short: true, seated: 50 } }), true);
    assert.equal(shouldRetryShortPeople("person", false, "students", { ok: true, student: { short: true, seated: 19 } }), true);
    assert.equal(shouldRetryShortPeople("people", false, "students", { ok: true, student: { short: true, seated: 0 } }), false);
    assert.equal(shouldRetryShortPeople("people", false, "students", { ok: true, student: { short: true, seated: 0, dropped: 36 } }), true);
    assert.equal(shouldRetryShortPeople("people-recheck", false, "students", { ok: true, student: { short: false, dups: true, dropped: 4 } }), true);
    assert.equal(shouldRetryShortPeople("people-recheck", false, "students", { ok: true, student: { short: false, dups: true, seated: 0, dropped: 0 } }), false);
    assert.equal(shouldRetryShortPeople("people", true, "students", { ok: true, student: { short: true, seated: 50 } }), false);
    assert.equal(shouldRetryShortPeople("people", false, "balance", { ok: true, student: { short: true, seated: 50 } }), false);
    assert.equal(shouldRetryShortPeople("people-slow", false, "students", { ok: true, student: { short: true, seated: 50 } }), false);
    assert.equal(shouldRetryShortPeople("people-recheck", false, "students", { ok: true, student: { short: true, seated: 8 } }), true);
    assert.equal(shouldRetryShortPeople("people-recheck", true, "students", { ok: true, student: { short: true, seated: 8 } }), false);
    assert.equal(recheckBusyErr("429 Too Many Requests"), true);
    assert.equal(recheckBusyErr("на диске 12 · в Alfa 40 — не хватает, добрать"), false);
    assert.equal(capRecheckAction(true, "students"), "skip");
    assert.equal(capRecheckAction(true, "balance"), "skip");
    assert.equal(capRecheckAction(false, "students"), "skip");
    const jobSrc = readFileSync(new URL("./crm-journal-job.ts", import.meta.url), "utf8");
    assert.match(jobSrc, /people-slow/);
    assert.match(jobSrc, /slowFill: mode === "people-slow"/);
    assert.match(jobSrc, /mode !== "people-slow"/);
    assert.match(jobSrc, /peopleJobQueue\(people, "students", false\)/);
    assert.match(jobSrc, /opts.skipLeads \? \{ skipLeads: true \}/);
    assert.doesNotMatch(jobSrc, /skipLeads: kind === "balance"/);
    assert.match(jobSrc, /openRetry/);
    assert.match(jobSrc, /перепись не закрыта, ещё этот/);
    assert.match(jobSrc, /перепись не дошла/);
    assert.match(jobSrc, /skipAfterCap/);
    assert.match(jobSrc, /peopleSlowAdvance/);
    assert.match(jobSrc, /ещё круг/);
    assert.equal(JOB_WAIT_CAP, 8);
    assert.equal(is429Err("429 Too Many Requests"), true);
    assert.equal(is429Err("нет ответа"), false);
    const eight429 = bumpJobWaits(7, 3, "429");
    assert.equal(eight429.wait429, 8);
    assert.equal(eight429.waitOther, 3);
    assert.equal(eight429.cap, true);
    const mixed = bumpJobWaits(7, 7, "нет ответа");
    assert.equal(mixed.wait429, 7);
    assert.equal(mixed.waitOther, 8);
    assert.equal(mixed.cap, true);
    assert.deepEqual(resetJobWaits(), { wait429: 0, waitOther: 0, waits: 0 });
  });

  it("медленный добор снова берёт слева, пока очередь не пустая", () => {
    const left = { cid: 2, branchId: 1, name: "жёлтая", journal: false, pays: false, short: true };
    const right = { cid: 1, branchId: 1, name: "справа", journal: true, pays: false, rechecked: true };
    const hole = { cid: 3, branchId: 1, name: "галка", journal: false, pays: false, short: true, holeApproved: true };
    const again = peopleSlowAdvance([left, right, hole]);
    assert.equal(again.done, false);
    assert.deepEqual(again.items.map((x) => x.cid), [2]);
    const empty = peopleSlowAdvance([right, hole]);
    assert.equal(empty.done, true);
    assert.deepEqual(empty.items, []);
  });

  it("сверить счёт берёт зелёных, галку пропускает", () => {
    const left = { cid: 2, branchId: 1, name: "жёлтая", journal: false, pays: false, short: true };
    const right = { cid: 1, branchId: 1, name: "справа", journal: true, pays: false, rechecked: true };
    const hole = { cid: 3, branchId: 1, name: "галка", journal: false, pays: false, short: true, holeApproved: true };
    assert.deepEqual(peopleNeedProbe([left, right, hole]).map((x) => x.cid), [2, 1]);
    const jobSrc = readFileSync(new URL("./crm-journal-job.ts", import.meta.url), "utf8");
    assert.match(jobSrc, /peopleNeedProbe\(people\)/);
  });

  it("перепроверка по одному: сначала слева, потом справа, дырки после перепроверки добираем", () => {
    const right = { cid: 1, branchId: 1, name: "справа", journal: true, pays: false, rechecked: false };
    const left = { cid: 2, branchId: 1, name: "жёлтая", journal: false, pays: false, short: true };
    const hole = { cid: 3, branchId: 1, name: "галка", journal: false, pays: false, short: true, holeApproved: true };
    const start = peopleRecheckAdvance([right, left, hole], "students", "", []);
    assert.equal(start.wave, "preleft");
    assert.deepEqual(start.items.map((x) => x.cid), [2]);
    assert.equal(start.recheck, false);
    const afterHoles = peopleRecheckAdvance([right, left, hole], "students", "preleft", start.follow);
    assert.equal(afterHoles.wave, "right");
    assert.deepEqual(afterHoles.items.map((x) => x.cid), [1]);
    assert.equal(afterHoles.recheck, true);
    const already = { cid: 5, branchId: 1, name: "уже справа", journal: true, pays: false, rechecked: true };
    const greened = { cid: 6, branchId: 1, name: "позеленел", journal: true, pays: false, rechecked: false };
    const wave2All = peopleRecheckAdvance([already, greened, hole], "students", "preleft", []);
    assert.equal(wave2All.wave, "right");
    assert.deepEqual(wave2All.items.map((x) => x.cid).sort(), [5, 6]);
    const afterRight = peopleRecheckAdvance([right, left, hole], "students", "right", []);
    assert.equal(afterRight.wave, "left");
    assert.deepEqual(afterRight.items.map((x) => x.cid), [2]);
    assert.equal(afterRight.recheck, false);
    const stillYellow = peopleRecheckAdvance([right, left, hole], "students", "left", afterRight.follow);
    assert.equal(stillYellow.wave, "left2");
    assert.equal(stillYellow.done, false);
    assert.deepEqual(stillYellow.items.map((x) => x.cid), [2]);
    assert.equal(stillYellow.recheck, false);
    const loaded = { ...left, journal: true, short: false };
    const afterLeft = peopleRecheckAdvance([right, loaded, hole], "students", "left", afterRight.follow);
    assert.equal(afterLeft.wave, "right2");
    assert.deepEqual(afterLeft.items.map((x) => x.cid), [2]);
    assert.equal(afterLeft.recheck, true);
    const thrown = { cid: 4, branchId: 1, name: "перекинуло", journal: false, pays: false, short: true };
    const afterRight2 = peopleRecheckAdvance([right, loaded, hole, thrown], "students", "right2", afterLeft.follow);
    assert.equal(afterRight2.wave, "left2");
    assert.equal(afterRight2.recheck, false);
    assert.deepEqual(afterRight2.items.map((x) => x.cid), [4]);
    const afterLeft2 = peopleRecheckAdvance([right, loaded, hole, thrown], "students", "left2", afterRight2.follow);
    assert.equal(afterLeft2.done, true);
    const onlyLeft = peopleRecheckAdvance([left], "students", "", []);
    assert.equal(onlyLeft.wave, "preleft");
    assert.deepEqual(onlyLeft.items.map((x) => x.cid), [2]);
    const deferred = peopleRecheckAdvance([right, hole], "students", "right", [], [{ cid: 8, branchId: 1, name: "обрыв" }]);
    assert.equal(deferred.wave, "left");
    assert.equal(deferred.recheck, false);
    assert.deepEqual(deferred.items.map((x) => x.cid), [8]);
    const skipped = peopleRecheckAdvance(
      [{ cid: 9, branchId: 1, name: "слева", journal: false, pays: false, short: true }],
      "students",
      "preleft",
      [],
      [],
      [{ cid: 9, branchId: 1, name: "слева" }],
    );
    assert.ok(!skipped.items.some((x) => x.cid === 9));
    assert.equal(emptyJournalJob().defer.length, 0);
    assert.equal(emptyJournalJob().skip.length, 0);
    assert.equal(emptyJournalJob().wait429, 0);
    assert.equal(emptyJournalJob().waitOther, 0);
    const cashLeft = { cid: 9, branchId: 2, name: "касса", journal: true, pays: false };
    const cashStart = peopleRecheckAdvance([cashLeft], "balance", "", []);
    assert.equal(cashStart.wave, "preleft");
    const gRight = { groupId: 10, branchId: 1, name: "г", finished: true, needRecheck: true };
    const gLeft = { groupId: 11, branchId: 1, name: "н", finished: false, needRecheck: false };
    const g1 = groupsRecheckAdvance([gRight, gLeft], "", [], false);
    assert.equal(g1.wave, "preleft");
    assert.deepEqual(g1.items.map((x) => x.groupId), [11]);
    const gAfterPre = groupsRecheckAdvance([gRight, gLeft], "preleft", g1.follow, false);
    assert.equal(gAfterPre.wave, "right");
    assert.deepEqual(gAfterPre.items.map((x) => x.groupId), [10]);
    const g2 = groupsRecheckAdvance([gRight, gLeft], "right", [], false);
    assert.equal(g2.wave, "left");
    assert.deepEqual(g2.items.map((x) => x.groupId), [11]);
    const g3 = groupsRecheckAdvance([{ ...gLeft, finished: true, needRecheck: true }, gRight], "left", g2.follow, false);
    assert.deepEqual(g3.items.map((x) => x.groupId), [11]);
  });

  it("патч: Стоп липкий, чужой id не затирает диск", () => {
    const a = { ...emptyJournalJob(), id: "a", stop: true, running: true, n: 3, fill: { kind: "students", label: "Иванов", customerId: 1 } };
    const keepStop = mergeJobPatch(a, { id: "a", running: true, stop: false, n: 4 });
    assert.equal(keepStop.stop, true);
    assert.equal(keepStop.running, false);
    assert.equal(keepStop.n, 4);
    assert.match(keepStop.msg, /Остановили · прошло 4/);
    assert.equal(stoppedJobMsg(0, 75), "Остановили · прошло 0 из 75.");
    const other = mergeJobPatch(a, { id: "b", running: false, n: 0, msg: "чужой" });
    assert.equal(other.id, "a");
    assert.equal(other.n, 3);
    assert.equal(other.msg, "");
    const fillKeep = mergeJobPatch(a, { id: "a", n: 5 });
    assert.equal(fillKeep.fill, null);
    assert.equal(fillKeep.cur, "");
    assert.match(fillKeep.msg, /Остановили · прошло 5/);
    const live = mergeJobPatch({ ...emptyJournalJob(), id: "c", stop: false, running: true, cur: "Иванов", msg: "грузим" }, { id: "c", n: 1 });
    assert.equal(live.cur, "Иванов");
    assert.equal(live.msg, "грузим");
    const fillClear = mergeJobPatch(a, { id: "a", fill: null });
    assert.equal(fillClear.fill, null);
  });

  it("закон пауз: красная 5 с; синяя неделя/две 2 с, месяц 2,5 с, 3 мес 3 с, 6 мес 4 с, длинные 5 с", () => {
    assert.equal(PEOPLE_JOB_GAP_MS, 5000);
    assert.equal(CATALOG_JOB_GAP_MS, 5000);
    assert.equal(JOURNAL_WINDOW_GAP_MS, 2000);
    assert.equal(JOURNAL_MONTH_GAP_MS, 2500);
    assert.equal(jobGapMs("people"), 5000);
    assert.equal(jobGapMs("people-recheck"), 5000);
    assert.equal(jobGapMs("people-recheck", 7), 2000);
    assert.equal(jobGapMs("people-recheck", 14), 2000);
    assert.equal(jobGapMs("people-recheck", 31), 2500);
    assert.equal(jobGapMs("people-recheck", 32), 2500);
    assert.equal(jobGapMs("people-recheck", 92), 3000);
    assert.equal(jobGapMs("people-recheck", 182), 4000);
    assert.equal(jobGapMs("people-recheck", 1095), 5000);
    assert.equal(jobGapMs("people-recheck", 2555), 5000);
    assert.equal(jobGapMs("people-recheck", 4000), 5000);
    assert.equal(jobGapLabel(2500), "пауза 2.5 с");
    assert.equal(jobGapLabel(2000), "пауза 2 с");
    assert.equal(jobGapLabel(5000), "пауза 5 с");
    assert.equal(jobGapOf({ mode: "people-recheck", recheck: true, recheckDays: 7 }), 2000);
    assert.equal(jobGapOf({ mode: "people-recheck", recheck: true, recheckDays: 14 }), 2000);
    assert.equal(jobGapOf({ mode: "people-recheck", recheck: true, recheckDays: 32 }), 2500);
    assert.equal(jobGapOf({ mode: "people-recheck", recheck: true, recheckDays: 32, dateFrom: "2026-08-13", dateTo: "2026-10-16" }), 2500);
    assert.equal(jobGapOf({ mode: "people-recheck", recheck: true, recheckDays: 92 }), 3000);
    assert.equal(jobGapOf({ mode: "people-recheck", recheck: true, recheckDays: 182 }), 4000);
    assert.equal(jobGapOf({ mode: "people-recheck", recheck: true, recheckDays: 1095 }), 5000);
    assert.equal(jobGapOf({ mode: "people-recheck", recheck: true, recheckDays: 365 }), 5000);
    assert.equal(jobGapOf({ mode: "people-recheck", recheck: true, recheckDays: 730 }), 5000);
    assert.equal(jobGapOf({ mode: "person", recheck: true, recheckDays: 4000 }), 5000);
    assert.equal(jobGapOf({ mode: "people-recheck", recheck: false, recheckDays: 4000 }), 5000);
    assert.equal(jobGapOf({ mode: "people-recheck", recheck: false, recheckDays: 1095 }), 5000);
    assert.equal(jobGapOf({ mode: "people", recheck: false, dateFrom: "2023-09-15" }), 5000);
    assert.equal(jobGapOf({ mode: "person", recheck: true, recheckDays: 92 }), 3000);
    assert.equal(jobGapOf({ mode: "groups-recheck", recheck: true, recheckDays: 92 }), 3000);
    assert.equal(jobGapOf({ mode: "groups-recheck", recheck: true, recheckDays: 182 }), 4000);
    assert.equal(jobGapOf({ mode: "people", recheck: true, recheckDays: 32 }), 2500);
    assert.equal(jobGapOf({ mode: "people", recheck: true, recheckDays: 92 }), 3000);
    assert.equal(jobGapOf({ mode: "roster-recheck", recheck: true, recheckDays: 32 }), 2500);
    assert.equal(jobGapOf({ mode: "people", recheck: false, dateFrom: "2015-01-01" }), 5000);
    assert.equal(jobGapOf({ mode: "people-slow", recheck: false, dateFrom: "2015-01-01" }), 5000);
    assert.equal(jobGapOf({ mode: "people-recheck", recheck: false, dateFrom: "2015-01-01" }), 5000);
    assert.equal(jobGapMs("groups"), 5000);
    assert.equal(jobGapMs("catalog"), 5000);
    assert.equal(jobGapMs("audit"), 5000);
    assert.equal(jobGapMs("roster"), 5000);
    assert.equal(jobGapMs("roster-recheck", 32), 2500);
    assert.match(readFileSync(new URL("./crm-journal-job.ts", import.meta.url), "utf8"), /moreCash[\s\S]{0,900}live\.recheck \? jobGapOf\(live\) : 0/);
  });

  it("касса слева: fill.done не skip, complete без force — skip", () => {
    const skip = (filled: boolean, force: boolean, scanned = false, hasRowsOrEmpty = false) =>
      Boolean(!force && (filled || (scanned && hasRowsOrEmpty)));
    assert.equal(skip(false, false), false);
    assert.equal(skip(false, true), false);
    assert.equal(skip(true, false), true);
    assert.equal(skip(true, true), false);
    assert.equal(skip(false, false, true), false);
    assert.equal(skip(false, false, true, true), true);
    assert.equal(skip(false, true, true, true), false);
    const pay = readFileSync(new URL("./crm-pay.ts", import.meta.url), "utf8");
    const load = readFileSync(new URL("./crm-history-load.ts", import.meta.url), "utf8");
    assert.match(pay, /if \(!opts\?\.force && filled\) return paysOf/);
    assert.match(pay, /payFillEmpty\(customerId\)/);
    assert.doesNotMatch(pay, /if \(!hit\) markPayJournalComplete/);
    assert.match(pay, /keepAll: true/);
    assert.match(load, /export function historyCashSkip/);
    assert.match(load, /jobKind === "balance"\) return "balance"/);
  });

  it("сервер крутит цикл, вкладка только старт/стоп/прогресс", () => {
    const job = readFileSync(new URL("./crm-journal-job.ts", import.meta.url), "utf8");
    const core = readFileSync(new URL("./crm-journal-job-core.ts", import.meta.url), "utf8");
    const pull = readFileSync(new URL("./crm-journal-pull.ts", import.meta.url), "utf8");
    const ui = readFileSync(new URL("../components/admin-crm-settings.tsx", import.meta.url), "utf8");
    const api = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    const pack = readFileSync(new URL("./crm-packet-queue.ts", import.meta.url), "utf8");
    const load = readFileSync(new URL("./crm-history-load.ts", import.meta.url), "utf8");
    const eco = readFileSync(new URL("../../ecosystem.config.cjs", import.meta.url), "utf8");
    const worker = readFileSync(new URL("../../scripts/crm-history-worker.mjs", import.meta.url), "utf8");
    const deploy = readFileSync(new URL("../../scripts/beget-deploy.sh", import.meta.url), "utf8");
    const plan = readFileSync(new URL("../components/admin-history-plan.tsx", import.meta.url), "utf8");
    assert.match(job, /export function startJournalJob/);
    assert.match(job, /export function stopJournalJob/);
    assert.match(job, /export function startJournalJobWatch/);
    assert.match(job, /export function isHistoryWorker/);
    assert.match(job, /RA_HISTORY_WORKER === "1"/);
    assert.match(job, /export async function runHistoryWorker/);
    assert.match(job, /kickHistoryTick/);
    assert.match(job, /tickHistoryPlan/);
    assert.match(job, /saveSyncPolicyRun/);
    assert.match(job, /stampHistoryWorkerBeat/);
    assert.match(job, /Готово с пропусками/);
    assert.match(job, /appendPlanLog/);
    assert.match(job, /markPlanDue/);
    assert.match(job, /planFireDecision/);
    assert.match(job, /const moreCash = pullKind === "balance" && Boolean\(res.student\?\.paysMore\)/);
    assert.doesNotMatch(job, /moreCash = pullKind === "balance" && !live.recheck/);
    assert.match(job, /if \(moreCash\) \{[\s\S]*?return \{ done: false, gap: live.recheck \? jobGapOf\(live\) : 0 \}/);
    assert.match(job, /if \(!isHistoryWorker\(\)\) return/);
    assert.match(job, /resumeJournalJobFromDisk/);
    assert.match(job, /resumeStalledRecheck/);
    assert.match(core, /shouldResumeStalledJob/);
    assert.match(job, /setInterval/);
    assert.match(core, /process.kill\(pid, 0\)/);
    assert.doesNotMatch(core, /age < 90_000/);
    assert.doesNotMatch(job, /STALE_LOCK_MS/);
    assert.match(job, /beats % 40/);
    assert.match(job, /advanceJobWave/);
    assert.match(job, /shouldResumeStalledJob\(cur\)/);
    assert.match(job, /NODE_ENV === "test"/);
    assert.doesNotMatch(api, /startJournalJobWatch/);
    assert.doesNotMatch(api, /resumeJournalJob/);
    assert.match(api, /keepRun: true/);
    assert.doesNotMatch(pack, /startJournalJobWatch/);
    assert.doesNotMatch(pack, /resumeJournalJob/);
    assert.match(pull, /resumeJournalJob\(\)/);
    assert.match(core, /tryHistoryTickLock/);
    assert.match(core, /historyWorkerSilent/);
    assert.match(core, /workerSilent: stop \? false : historyWorkerSilent/);
    assert.match(job, /if \(!isHistoryWorker\(\) && !historyWorkerSilent/);
    assert.match(ui, /процесс истории молчит/);
    assert.match(worker, /RA_HISTORY_WORKER = "1"/);
    assert.match(worker, /ts-ext-hook\.mjs/);
    assert.match(worker, /runHistoryWorker/);
    assert.match(worker, /history-worker/);
    assert.match(eco, /name: "rastudio-history"/);
    assert.match(eco, /ts-ext-register\.mjs/);
    assert.match(deploy, /pm2 restart rastudio-history/);
    assert.match(ui, /F5 ничего не сбрасывает/);
    assert.match(ui, /HINT\.plan/);
    assert.match(ui, /вкладку можно закрыть|страницу можно закрыть/);
    assert.match(job, /historyLoadOne/);
    assert.match(job, /mode === "count"/);
    assert.match(load, /export async function historyLoadOne/);
    assert.match(load, /lite: true/);
    assert.match(ui, /jobMode: "count"/);
    assert.doesNotMatch(ui, /runJournal\(\{ kind: "archiveCount" \}\)/);
    assert.doesNotMatch(job, /journalPull\(/);
    assert.match(job, /await sleepGap/);
    assert.match(job, /sleepGap\(step.gap, id\)/);
    assert.match(job, /касса · ещё/);
    assert.match(job, /касса · \$\{item.name\}/);
    assert.match(job, /берём следующего/);
    assert.match(job, /peopleNeedCashLoad\(row\)/);
    assert.match(job, /сбой · ещё этот|перепись не дошла/);
    assert.doesNotMatch(job, /Остановились на «\$\{item\.name\}»\. Нажмите ещё раз/);
    assert.match(job, /bumpJobWaits/);
    assert.match(job, /skipAfterCap/);
    assert.match(job, /finishWaveOrStop/);
    assert.match(job, /wave: isRecheckWaveMode\(job.mode\) \? "left2"/);
    assert.match(job, /dateTo: job.dateTo/);
    assert.match(job, /iceWindowOrNow/);
    assert.match(job, /ensureJobIce/);
    assert.match(job, /freezeIce/);
    assert.match(job, /defer/);
    assert.match(core, /export function bumpJobWaits/);
    assert.match(core, /mergeDeferItems/);
    assert.match(core, /dateTo: ""/);
    assert.match(core, /export function isRecheckWaveMode/);
    assert.match(core, /export function jobHasIce/);
    assert.match(core, /export function shouldRetryShortPeople/);
    assert.match(job, /не хватает, ещё этот/);
    assert.match(job, /pauseTxt/);
    assert.match(job, /jobGapOf/);
    assert.match(load, /lite: true/);
    assert.match(job, /function continueAutoPipe/);
    assert.match(job, /fromPipe: true/);
    assert.match(job, /Alfa не ответил/);
    assert.match(job, /pipe: Array.isArray\(opts.pipe\)/);
    assert.match(core, /pipe: \[\]/);
    assert.doesNotMatch(job, /enqueueExport/);
    assert.doesNotMatch(core, /enqueueExport/);
    assert.match(core, /renameSync/);
    assert.match(pull, /kind === "jobStart"/);
    assert.match(pull, /kind === "jobStatus"/);
    assert.match(pull, /function journalJobView/);
    assert.match(pull, /function litePullState/);
    assert.match(pull, /job: journalJobSnapshot/);
    assert.match(api, /kind !== "jobStart"/);
    assert.match(api, /kind !== "jobStatus"/);
    assert.match(api, /if \(kind !== "jobStatus"\) logAdmin/);
    assert.match(ui, /kind: "jobStart"/);
    assert.match(ui, /kind: "jobStatus"/);
    assert.match(ui, /jobMode: "auto"/);
    assert.match(plan, /Перепроверить шаги 1–5 сейчас/);
    assert.match(plan, /Архив действующих групп/);
    assert.match(plan, /Активные группы/);
    assert.match(plan, /Лиды действующих групп/);
    assert.match(plan, /Окно перепроверки/);
    assert.match(plan, /mode === "auto"/);
    assert.match(plan, /planFromIdToRecheckDays/);
    assert.match(plan, /Сброс настроек/);
    assert.match(plan, /Синхронизация расписания/);
    assert.match(plan, /процесс истории молчит/);
    assert.match(plan, /Последние синхронизации/);
    assert.match(plan, /setLogOpen/);
    assert.match(plan, />\s*Лог\s*</);
    assert.match(pull, /AUTO_PIPE_FULL/);
    assert.doesNotMatch(pull, /saveRosterPolicy\(\{ leads/);
    assert.match(plan, /role="switch"/);
    assert.match(plan, /appearance-none/);
    assert.match(plan, /translate-x-5/);
    assert.match(plan, /Лиды/);
    assert.match(pull, /opts.jobMode === "auto"/);
    assert.match(job, /skipLeads/);
    assert.match(pull, /leads=0/);
    assert.match(job, /mode: "people-recheck"/);
    assert.match(pull, /archGroups=1/);
    assert.match(job, /groups-archived/);
    assert.match(ui, /function ServerJobStrip/);
    assert.match(ui, /На сервере:/);
    assert.match(ui, /setInterval\(\(\) => void tick\(\), 1200\)/);
    assert.match(ui, /crmTab !== "history"/);
    assert.match(ui, /startedJobId/);
    assert.match(core, /stoppedJobMsg/);
    assert.match(core, /msg: stop \? stoppedJobMsg/);
    assert.match(ui, /function stoppedLine/);
    assert.doesNotMatch(ui, /останавливаем после текущего/);
    assert.match(job, /historyWorkerSilent\(j, 2500\)/);
    assert.match(ui, /function requestStop/);
    assert.match(ui, /setSchoolRun\(null\)/);
    assert.match(job, /running: false/);
    assert.match(job, /Остановили · прошло/);
    assert.match(job, /awaitWhileJob/);
    assert.match(job, /stopped: true/);
    assert.match(ui, /stopSchool.current && src === "poll"/);
    assert.match(ui, /job.running\) && !job.stop/);
    assert.match(ui, /function startHistJob/);
    assert.match(ui, /periodKey: opts.periodKey/);
    assert.match(ui, /periodLabel: opts.periodLabel/);
    assert.match(ui, /Загрузить по одному/);
    assert.match(ui, /Перепроверить по одному/);
    assert.match(ui, /PEOPLE_LOAD_GAP_MS = 5000/);
    assert.match(ui, /function pauseFive/);
    assert.match(ui, /async function recheckSchool/);
    assert.match(ui, /async function recheckPeople/);
    assert.match(ui, /async function pullAudit/);
    const schoolAt = ui.indexOf("async function recheckSchool");
    const schoolFn = ui.slice(schoolAt, ui.indexOf("async function recheckGroupsOne"));
    assert.match(schoolFn, /holdFill\.current = true/);
    assert.doesNotMatch(schoolFn, /recheck: true/);
    assert.match(ui, /jobMode: "people-recheck"/);
    assert.match(ui, /jobMode: "groups"/);
    assert.match(ui, /jobMode: "catalog"/);
    assert.match(ui, /jobMode: "audit"/);
    assert.match(ui, /jobMode: "life"/);
    assert.match(ui, /jobMode: "archives"/);
    assert.match(ui, /jobMode: "archivesPupils"/);
    assert.match(ui, /jobMode: "details"/);
    assert.match(ui, /jobMode: "roster"/);
    assert.match(ui, /jobMode: "roster-recheck"/);
    assert.match(ui, /onLoad=\{\(row, part, recheck\) =>\s*void startHistJob/);
    assert.doesNotMatch(ui, /onLoad=\{\(row, part, recheck\) =>\s*void runJournal/);
    assert.match(ui, /st\?\.job\?\.running/);
    assert.match(core, /function peopleNeedCashLoad/);
    assert.match(ui, /function peopleNeedCashLoad/);
    assert.doesNotMatch(core, /res.student\?\.paysOk === false/);
    assert.match(ui, /if \(kind === "balance"\) return Boolean\(row.paysScanned \|\| row.pays\)/);
    assert.match(ui, /if \(journal\?\.job\?\.running && !journal.job.stop && !stopSchool.current\)/);
    assert.match(ui, /Уже идёт/);
    assert.match(ui, /h === "audit"/);
    assert.match(ui, /archived: groupArchived/);
    assert.match(job, /wantArch \? Boolean\(g\.archived\)/);
    assert.match(job, /Кто слева — ещё жёлтые/);
    assert.match(job, /mode === "details"/);
    assert.match(job, /mode === "roster"/);
    assert.match(job, /liveAdminGroups\(school\)/);
    assert.match(job, /ещё ДЗ/);
    assert.match(ui, /function peopleQueue/);
    assert.match(ui, /if \(kind === "students" && r.short && r.holeApproved\) return false/);
    assert.doesNotMatch(ui, /r.short && r.holeApproved\) return true/);
    assert.match(ui, /loadPerson\(row, "students", peopleStudy, false, "2015-01-01"\)/);
    assert.match(pull, /const journal = lessonsJournalReady\(sync\)/);
    assert.doesNotMatch(pull, /diskN > 0 \|\| Boolean\(sync.lessonsFull\)/);
    assert.match(ui, /jobItems: queue.map/);
    assert.match(ui, /jobItems: opts.jobItems/);
    assert.match(ui, /opts.kind === "jobStart"/);
    assert.match(job, /given.length && mode !== "audit"/);
    assert.match(pull, /parseJobItems\(opts.jobItems\)/);
    assert.match(api, /parseJobItems/);
    assert.match(ui, /paintJob\(res.job, "load"\)/);
    assert.match(ui, /jobLive/);
    assert.match(ui, /startedJobId.current === "pending" && src === "poll"/);
    assert.match(ui, /setSchoolRun\(\{ cur: queue\[0\].name/);
    assert.match(ui, /journal\.job\.kind === "balance"/);
    assert.doesNotMatch(ui, /run && schoolRun \? schoolRun.cur : "Загрузить по одному"/);
    assert.doesNotMatch(ui, /for \(let i = 0; i < queue.length/);
    assert.doesNotMatch(job, /queue.slice\(0, take\)/);
    assert.match(job, /loopPullKind/);
    assert.match(pull, /needProbe.slice\(0, 1\)/);
  });
});
