/** Фон «Истории из Alfa»: один шаг, пауза, следующий. Вкладка только смотрит. В Alfa не пишет. */

import { journalPullGroups, groupFillRow, journalPeopleSide, liveAdminGroups } from "./crm-journal-pull.ts";
import { historyLoadOne, historyPullKind } from "./crm-history-load.ts";
import { journalChunks, clampGrain, type Grain } from "./crm-journal-periods.ts";
import { clampRecheckDays, iceWindowOrNow, recheckWindowYmd, groupJournalGreen } from "./crm-inbound-core.ts";
import { loadSyncPolicy, saveSyncPolicyRun } from "./crm-sync-policy.ts";
import { appendPlanLog, loadPlanLog } from "./crm-sync-plan-log.ts";
import { observeJobClose, observeJobStart } from "./crm-step-run-log.ts";
import { markPlanDue, pickDueRule, planFireDecision, planRuleToJob, planRunText, packCheckName, scheduleOf, stampPlanFired, stampPlanSkip, stampPlanRun, stampPlanHandsExcept } from "./crm-sync-policy-core.ts";
import {
  emptyJournalJob,
  jobGapOf,
  jobGapLabel,
  jobPeriodDays,
  loadJournalJob,
  mergeJobPatch,
  peopleJobQueue,
  peopleNeedCashLoad,
  peopleNeedProbe,
  peopleRecheckAdvance,
  peopleSlowAdvance,
  groupsRecheckAdvance,
  rotateUnfinished,
  saveJournalJob,
  shouldRetryCash,
  shouldRetryOpenRecheck,
  shouldRetryShortPeople,
  recheckBusyErr,
  capRecheckAction,
  bumpJobWaits,
  resetJobWaits,
  is429Err,
  tryHistoryTickLock,
  touchHistoryTickLock,
  releaseHistoryTickLock,
  historyWorkerSilent,
  historyWorkerProcessAlive,
  stampHistoryWorkerBeat,
  stoppedJobMsg,
  shouldResumeStalledJob,
  jobRetryGapMs,
  jobShouldHalt,
  JOB_WAIT_CAP,
  isRecheckWaveMode,
  jobHasIce,
  jobItemSkipped,
  type JournalJob,
  type JournalJobItem,
  type JournalJobMode,
  type PeopleJobRow,
  type RecheckWave,
  type GroupWaveRow,
} from "./crm-journal-job-core.ts";

export {
  journalJobSnapshot,
  loadJournalJob,
  PEOPLE_JOB_GAP_MS,
  CATALOG_JOB_GAP_MS,
  AUDIT_JOB_GAP_MS,
  peopleJobQueue,
  peopleJobFinished,
  shouldRetryCash,
  jobGapMs,
  jobGapOf,
  jobGapLabel,
  JOURNAL_WINDOW_GAP_MS,
  mergeJobPatch,
  parseJobItems,
  JOB_WAIT_CAP,
  isRecheckWaveMode,
} from "./crm-journal-job-core.ts";

const g = globalThis as { __raJournalJobTick?: boolean; __raJournalWatch?: ReturnType<typeof setInterval> };

function pauseTxt(job: { mode?: JournalJobMode | ""; recheck?: boolean; recheckDays?: number; dateFrom?: string }) {
  return jobGapLabel(jobGapOf(job));
}

function notePlan(e: Parameters<typeof appendPlanLog>[0]) {
  try {
    appendPlanLog(e);
  } catch {
    /* диск лога не должен рвать очередь */
  }
}

function modeRu(mode: string, kind = "") {
  if (kind === "balance" || mode === "balance") return "шаг 4 · касса";
  if (mode === "roster" || mode === "roster-recheck") return "шаг 1 · состав";
  if (mode === "people" || mode === "people-recheck" || mode === "people-slow") return "шаг 2 · календарь";
  if (mode === "groups" || mode === "groups-recheck" || mode === "group-one") return "шаг 3 · группы";
  if (mode === "audit") return "шаг 5 · сверка";
  if (mode === "step6-recount") return "шаг 6 · пересчет лидов";
  if (mode === "step6-columns") return "шаг 6 · колонки";
  if (mode === "step6-cash") return "шаг 6 · касса";
  if (mode === "step7-list") return "шаг 7 · архив";
  if (mode === "step7-cash") return "шаг 7 · касса";
  if (mode === "archivesPupils") return "архив групп действующих";
  if (mode === "archives") return "архивные группы";
  return mode || "очередь";
}

/** Только процесс rastudio-history крутит очередь. Сайт пишет файл и читает статус. */
export function isHistoryWorker() {
  return process.env.RA_HISTORY_WORKER === "1";
}

function nowIso() {
  return new Date().toISOString();
}

function patch(extra: Partial<JournalJob>) {
  const cur = loadJournalJob();
  const next = { ...mergeJobPatch(cur, extra), lastAt: nowIso() };
  return saveJournalJob(next);
}

async function sleepGap(ms: number, id = "") {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (jobShouldHalt(id)) return;
    touchHistoryTickLock();
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** Стоп не ждёт ответ Alfa: шаг бросает ожидание, запрос догорает вхолостую. */
async function awaitWhileJob<T>(id: string, task: Promise<T>): Promise<{ stopped: true } | { value: T }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearInterval(iv);
      fn();
    };
    const iv = setInterval(() => {
      if (jobShouldHalt(id)) finish(() => resolve({ stopped: true }));
      else touchHistoryTickLock();
    }, 250);
    task.then(
      (value) => finish(() => resolve({ value })),
      (err) => finish(() => reject(err)),
    );
  });
}

function stoppedMsg(job?: JournalJob) {
  const j = job || loadJournalJob();
  return stoppedJobMsg(Number(j.n) || 0, Number(j.total) || 0);
}

function packGrain(parts: { key?: string; done?: boolean; weak?: boolean; rechecked?: boolean; empty?: boolean }[], grain: Grain) {
  const list = parts || [];
  const byKey = new Map(list.map((p) => [p.key, p]));
  const have = new Set(list.map((p) => p.key));
  return journalChunks(grain)
    .filter((c) => c.keys.some((k) => have.has(k)))
    .map((c) => {
      const present = c.keys.filter((k) => have.has(k));
      const done = present.every((k) => byKey.get(k)?.done);
      const weak = present.some((k) => byKey.get(k)?.weak);
      const rechecked = present.length > 0 && present.every((k) => byKey.get(k)?.rechecked);
      const empty = present.length > 0 && present.every((k) => byKey.get(k)?.empty);
      return { key: c.key, label: c.label, done, weak, rechecked, empty };
    });
}

function nextGroupPart(
  parts: { key: string; label: string; done: boolean; weak?: boolean; rechecked?: boolean; empty?: boolean; at?: string }[],
  grain: Grain,
  age?: string,
) {
  const chunks = packGrain(parts, clampGrain(age, grain));
  return chunks.find((c) => !c.empty && (!c.done || c.weak)) || null;
}

function fillFinished(parts: { done: boolean; weak?: boolean }[], grain: Grain, age?: string) {
  const chunks = packGrain(parts, clampGrain(age, grain));
  return chunks.length > 0 && chunks.every((c) => c.done && !c.weak);
}

function fillNeedsRecheck(parts: { done: boolean; weak?: boolean; rechecked?: boolean }[], grain: Grain, age?: string) {
  const chunks = packGrain(parts, clampGrain(age, grain));
  return fillFinished(parts, grain, age) && chunks.some((c) => !c.rechecked);
}

export type StartJournalJobOpts = {
  mode: JournalJobMode;
  kind?: string;
  study?: "1" | "2";
  recheck?: boolean;
  dateFrom?: string;
  dateTo?: string;
  recheckDays?: number;
  grain?: Grain;
  school?: string;
  groupId?: number;
  branchId?: number;
  customerId?: number;
  take?: number;
  filter?: string;
  probe?: boolean;
  name?: string;
  periodKey?: string;
  periodLabel?: string;
  items?: JournalJobItem[];
  archived?: boolean;
  pipe?: string[];
  src?: "hands" | "plan";
  fromPipe?: boolean;
  skipLeads?: boolean;
  oneName?: string;
  id?: string;
};

function emptyMsg(mode: JournalJobMode, recheck: boolean) {
  if (mode === "people" || mode === "people-recheck" || mode === "people-slow") {
    return recheck || mode === "people-recheck"
      ? "Некого: справа пусто и слева нет жёлтых."
      : mode === "people-slow"
        ? "Некого добирать. Слева пусто — ни розовых, ни жёлтых."
      : "Слева пусто. Нажмите «Перепроверить по одному» — пройдёт тех, кто справа.";
  }
  if (mode === "groups") return "Слева пусто. Нажмите «Перепроверить по одному» — пройдёт тех, кто справа.";
  if (mode === "groups-recheck") return "Некого: справа пусто и слева нет недогруженных групп.";
  if (mode === "audit") return "Нет текущих учеников на диске.";
  if (mode === "catalog") return "Архив клиентов: некого писать.";
  if (mode === "life") return "Сначала загрузите группы.";
  if (mode === "archives") return "Архивных групп нет.";
  if (mode === "archivesPupils") return "Новых архивных групп по карточкам нет.";
  if (mode === "probe") return "Нет текущих учеников в списке.";
  if (mode === "details") return "ДЗ грузить нечего.";
  if (mode === "count") return "Некого считать.";
  if (mode === "roster") return "Слева пусто. Состав групп уже на диске. «Перепроверить» — сверка cgi.";
  if (mode === "roster-recheck") return "Некого: состав справа пуст и слева нет групп без cgi.";
  return "грузить нечего";
}

function buildItems(opts: StartJournalJobOpts): JournalJobItem[] {
  const mode = opts.mode;
  const pinnedGroups = (opts.items || [])
    .map((r) => ({
      groupId: Number(r.groupId) || 0,
      branchId: Number(r.branchId) || 0,
      name: String(r.name || ""),
    }))
    .filter((r) => r.groupId);
  if ((pinnedGroups.length || String(opts.oneName || "").trim()) && (mode === "roster-recheck" || mode === "groups-recheck")) return pinnedGroups;
  if (mode === "person") {
    const cid = Number(opts.customerId) || 0;
    if (!cid) return [];
    if (opts.study !== "2") {
      const side = journalPeopleSide("1");
      const hit = (side.people || []).find((p) => p.cid === cid);
      const raw = hit ? hit.study : undefined;
      if (raw === 0) return [];
    }
    return [{ cid, branchId: Number(opts.branchId) || 1, name: opts.name || opts.oneName || `№${cid}` }];
  }
  if (mode === "count") return [{ name: "отбор архива" }];
  if (mode === "people" || mode === "people-recheck" || mode === "people-slow" || mode === "probe" || mode === "audit") {
    const given = (opts.items || [])
      .map((r) => ({ cid: Number(r.cid) || 0, branchId: Number(r.branchId) || 1, name: String(r.name || "") }))
      .filter((r) => r.cid);
    const study = opts.study === "2" ? "2" : "1";
    const kind = opts.kind === "balance" ? "balance" : "students";
    if (given.length && mode !== "audit" && mode !== "people-slow" && mode !== "people-recheck") {
      if (kind === "balance" && mode === "people") {
        const side = journalPeopleSide(study, opts.skipLeads ? { skipLeads: true } : undefined);
        const by = new Map((side.people || []).map((p) => [p.cid, p as PeopleJobRow]));
        return given.filter((g) => {
          const row = by.get(g.cid);
          return row ? peopleNeedCashLoad(row) : true;
        });
      }
      return given;
    }
    const side = journalPeopleSide(study, opts.skipLeads ? { skipLeads: true } : undefined);
    let people = (side.people || []) as (PeopleJobRow & { study?: number })[];
    if (study !== "2" && (mode === "people" || mode === "people-recheck" || mode === "people-slow" || mode === "probe" || mode === "audit")) {
      people = people.filter((p) => p.study !== 0);
    }
    if (mode === "audit") {
      const one = Number(opts.customerId) || 0;
      if (one) {
        const hit = people.find((r) => r.cid === one);
        if (!hit && study !== "2") {
          const raw = ((journalPeopleSide(study).people || []) as { cid: number; study?: number }[]).find((p) => p.cid === one);
          if (raw && raw.study === 0) return [];
        }
        return [{
          cid: one,
          branchId: Number(hit?.branchId) || Number(opts.branchId) || 1,
          name: String(hit?.name || opts.name || `№${one}`),
        }];
      }
      return people.map((r) => ({ cid: r.cid, branchId: r.branchId, name: r.name }));
    }
    if (mode === "probe") {
      const queue = peopleNeedProbe(people);
      return queue.map((r) => ({ cid: r.cid, branchId: r.branchId, name: r.name }));
    }
    if (mode === "people-slow") {
      const queue = peopleJobQueue(people, "students", false);
      return queue.map((r) => ({ cid: r.cid, branchId: r.branchId, name: r.name }));
    }
    const queue = peopleJobQueue(people, kind, mode === "people-recheck" || Boolean(opts.recheck));
    return queue.map((r) => ({ cid: r.cid, branchId: r.branchId, name: r.name }));
  }
  if (mode === "details") {
    const groups = journalPullGroups();
    const hit =
      groups.find((g) => g.groupId === Number(opts.groupId) && (!opts.branchId || g.branchId === Number(opts.branchId))) ||
      groups.find((g) => g.groupId === Number(opts.groupId));
    if (!hit) return [];
    if (opts.periodKey) {
      return [{ groupId: hit.groupId, branchId: hit.branchId, name: hit.name, periodKey: opts.periodKey, periodLabel: opts.periodLabel || opts.periodKey }];
    }
    const row = groupFillRow(hit);
    return (row.parts || [])
      .filter((p) => (Number(p.needDetails) || 0) > 0)
      .map((p) => ({ groupId: hit.groupId, branchId: hit.branchId, name: hit.name, periodKey: p.key, periodLabel: p.label }));
  }
  if (mode === "groups" || mode === "groups-recheck" || mode === "group-one") {
    const grain = (opts.grain || "quarter") as Grain;
    const school = String(opts.school || "");
    const wantArch = Boolean(opts.archived);
    const groups = journalPullGroups().filter((g) => {
      if (school && g.school !== school) return false;
      return wantArch ? Boolean(g.archived) : !g.archived;
    });
    const givenG = (opts.items || [])
      .map((r) => ({
        groupId: Number(r.groupId) || 0,
        branchId: Number(r.branchId) || 0,
        name: String(r.name || ""),
        periodKey: r.periodKey,
        periodLabel: r.periodLabel,
      }))
      .filter((r) => r.groupId);
    if (givenG.length && mode === "groups" && givenG.every((r) => r.periodKey)) return givenG;
    if (mode === "group-one") {
      const all = journalPullGroups();
      const hit = all.find((g) => g.groupId === Number(opts.groupId) && (!opts.branchId || g.branchId === Number(opts.branchId))) || all.find((g) => g.groupId === Number(opts.groupId));
      if (!hit) return [];
      if (opts.periodKey) {
        return [{ groupId: hit.groupId, branchId: hit.branchId, name: hit.name, periodKey: opts.periodKey, periodLabel: opts.periodLabel || opts.periodKey }];
      }
      const row = groupFillRow(hit);
      if (opts.recheck) {
        return [{ groupId: hit.groupId, branchId: hit.branchId, name: hit.name, periodKey: groupJournalGreen(row) ? "" : "whole", periodLabel: groupJournalGreen(row) ? "окно" : "целиком" }];
      }
      const chunks = packGrain(row.parts || [], clampGrain(row.age, grain));
      return chunks
        .filter((c) => !c.empty && (!c.done || c.weak))
        .map((c) => ({ groupId: hit.groupId, branchId: hit.branchId, name: hit.name, periodKey: c.key, periodLabel: c.label }));
    }
    const rows = groups.map((g) => groupFillRow(g));
    if (mode === "groups-recheck") {
      const need = rows.filter((r) => !groupJournalGreen(r));
      const done = rows.filter((r) => groupJournalGreen(r));
      const queue = need.length || done.length ? [...need, ...done] : [];
      return queue.map((r) => ({ groupId: r.groupId, branchId: r.branchId, name: r.name }));
    }
    const items: JournalJobItem[] = [];
    const wantG = givenG.length ? new Set(givenG.map((r) => r.groupId)) : null;
    for (const r of rows) {
      if (wantG && !wantG.has(r.groupId)) continue;
      if (groupJournalGreen(r)) continue;
      const chunks = packGrain(r.parts || [], clampGrain(r.age, grain));
      for (const c of chunks) {
        if (c.empty) continue;
        if (c.done && !c.weak) continue;
        items.push({ groupId: r.groupId, branchId: r.branchId, name: r.name, periodKey: c.key, periodLabel: c.label });
      }
    }
    return items;
  }
  if (mode === "catalog") return [{ name: "архив клиентов" }];
  if (mode === "life") return [{ name: "сроки групп" }];
  if (mode === "archives") return [{ name: "архивные группы" }];
  if (mode === "archivesPupils") return [{ name: "архив групп учеников" }];
  if (mode === "roster" || mode === "roster-recheck") {
    const school = String(opts.school || "");
    const wantArch = Boolean(opts.archived);
    const groups = wantArch
      ? journalPullGroups().filter((g) => g.archived && (!school || g.school === school))
      : liveAdminGroups(school);
    const given = (opts.items || [])
      .map((r) => ({ groupId: Number(r.groupId) || 0, branchId: Number(r.branchId) || 0, name: String(r.name || "") }))
      .filter((r) => r.groupId);
    if (given.length && mode !== "roster-recheck") return given;
    const rows = groups.map((g) => groupFillRow(g));
    const need = rows.filter((r) => (mode === "roster-recheck" ? Boolean(r.roster) : !r.roster));
    const done = rows.filter((r) => Boolean(r.roster));
    const queue = mode === "roster-recheck" ? (need.length ? need : done) : need;
    return queue.map((r) => ({ groupId: r.groupId, branchId: r.branchId, name: r.name }));
  }
  return [];
}

function loopPullKind(mode: JournalJobMode | ""): "archiveCatalog" | "life" | "archives" | "archivesPupils" | "" {
  if (mode === "catalog") return "archiveCatalog";
  if (mode === "life" || mode === "archives" || mode === "archivesPupils") return mode;
  return "";
}

function peopleRowsFor(study: "1" | "2", kind: string, skipLeads = false): PeopleJobRow[] {
  const side = journalPeopleSide(study, skipLeads ? { skipLeads: true } : undefined);
  return (side.people || []) as PeopleJobRow[];
}

function groupRowsFor(opts: { school?: string; archived?: boolean; grain?: Grain }): GroupWaveRow[] {
  const school = String(opts.school || "");
  const wantArch = Boolean(opts.archived);
  void opts.grain;
  const groups = journalPullGroups().filter((g) => {
    if (school && g.school !== school) return false;
    return wantArch ? Boolean(g.archived) : !g.archived;
  });
  return groups.map((g) => {
    const row = groupFillRow(g);
    const green = groupJournalGreen(row);
    return {
      groupId: row.groupId,
      branchId: row.branchId,
      name: row.name,
      finished: green,
      needRecheck: false,
      roster: Boolean(row.roster),
    };
  });
}

function rosterRowsFor(opts: { school?: string; archived?: boolean }): GroupWaveRow[] {
  const school = String(opts.school || "");
  const wantArch = Boolean(opts.archived);
  const groups = wantArch
    ? journalPullGroups().filter((g) => g.archived && (!school || g.school === school))
    : liveAdminGroups(school);
  return groups.map((g) => {
    const row = groupFillRow(g);
    return {
      groupId: row.groupId,
      branchId: row.branchId,
      name: row.name,
      finished: Boolean(row.roster),
      needRecheck: Boolean(row.roster),
      roster: Boolean(row.roster),
    };
  });
}

function waveStartMsg(wave: RecheckWave, name: string, recheck: boolean, job?: JournalJob) {
  const pause = jobGapLabel(jobGapOf({ ...(job || emptyJournalJob()), recheck }));
  if (wave === "left" || wave === "preleft" || wave === "left2") return `${name}: слева, добираем. Потом ${pause}.`;
  if (wave === "right2") return `${name}: снова справа, те же после добора. Потом ${pause}.`;
  return recheck ? `${name}: справа, перепроверяем. Потом ${pause}.` : `${name}: грузим. Потом ${pause}.`;
}

export function startJournalJob(opts: StartJournalJobOpts): JournalJob {
  const cur = loadJournalJob();
  if (cur.running && !cur.stop) {
    kickHistoryTick();
    return cur;
  }
  if (!cur.stop && shouldResumeStalledJob(cur)) {
    const live = cur.running ? cur : saveJournalJob({ ...cur, running: true, lastAt: nowIso(), msg: cur.msg || "Продолжаем с того же." });
    kickHistoryTick();
    return live;
  }
  const mode = opts.mode;
  const kind =
    mode === "audit"
      ? "audit"
      : mode === "catalog"
        ? "archiveCatalog"
        : mode === "life"
          ? "life"
          : mode === "archives"
            ? "archives"
            : mode === "archivesPupils"
              ? "archivesPupils"
              : mode === "details"
                ? "details"
              : mode === "count"
                ? "archiveCount"
              : mode === "groups" || mode === "groups-recheck" || mode === "group-one"
                ? "group"
              : mode === "roster" || mode === "roster-recheck"
                ? "roster"
                : opts.kind || "students";
  const study = opts.study === "2" ? "2" : "1";
  const skipLeads = Boolean(opts.skipLeads) || /(?:^|&)leads=0(?:&|$)/.test(String(opts.name || ""));
  const personOnly = Boolean(String(opts.oneName || "").trim()) && (mode === "roster-recheck" || mode === "groups-recheck");
  const pinnedGroups = personOnly || (opts.items || []).some((r) => Number(r.groupId));
  let recheck =
    opts.recheck === false
      ? false
      : Boolean(opts.recheck) || mode === "people-recheck" || mode === "groups-recheck" || mode === "roster-recheck" || (mode === "group-one" && !opts.periodKey);
  const span = Boolean(String(opts.dateFrom || "").trim() && String(opts.dateTo || "").trim());
  const freezeIce = Boolean(recheck) || span;
  let items = buildItems({ ...opts, kind, recheck, skipLeads });
  let wave: RecheckWave = "";
  let follow: JournalJobItem[] = [];
  const archived = Boolean(opts.archived);
  if (mode === "people-recheck") {
    const nxt = peopleRecheckAdvance(peopleRowsFor(study, kind, skipLeads), kind === "balance" ? "balance" : "students", "", []);
    items = nxt.items;
    wave = nxt.wave;
    follow = nxt.follow;
    recheck = nxt.recheck;
  } else if (mode === "groups-recheck" && !pinnedGroups) {
    const nxt = groupsRecheckAdvance(groupRowsFor({ school: opts.school, archived, grain: opts.grain }), "", [], false);
    items = nxt.items;
    wave = nxt.wave;
    follow = nxt.follow;
    recheck = nxt.recheck;
  } else if (mode === "roster-recheck" && !pinnedGroups) {
    const nxt = groupsRecheckAdvance(rosterRowsFor({ school: opts.school, archived }), "", [], true);
    items = nxt.items;
    wave = nxt.wave;
    follow = nxt.follow;
    recheck = nxt.recheck;
  }
  if (mode === "step6-recount" || mode === "step6-columns" || mode === "step6-cash") {
    items = [{ name: mode === "step6-cash" ? "касса лидов" : mode === "step6-recount" ? "пересчет лидов" : "колонки лидов" }];
  }
  if (mode === "step7-list" || mode === "step7-cash") {
    items = [{ name: mode === "step7-cash" ? "касса архива" : "архив без живых групп" }];
  }
  if (!items.length && !loopPullKind(mode)) {
    const saved = saveJournalJob({
      ...emptyJournalJob(),
      id: opts.fromPipe && opts.id ? String(opts.id) : `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      mode,
      kind,
      study,
      dateFrom: String(opts.dateFrom || ""),
      archived,
      skipLeads,
      pipe: Array.isArray(opts.pipe) ? opts.pipe.map(String).filter(Boolean) : [],
      customerId: Number(opts.customerId) || 0,
      branchId: Number(opts.branchId) || 0,
      oneName: String(opts.oneName || opts.name || ""),
      msg: emptyMsg(mode, recheck),
      lastAt: nowIso(),
    });
    notePlan({
      kind: "skip",
      text: emptyMsg(mode, recheck),
      mode,
      reason: "empty",
      src: opts.src || (saved.pipe.length ? "plan" : "hands"),
      jobId: saved.id,
    });
    continueAutoPipe(saved);
    const live = loadJournalJob();
    if (!live.running && !(live.pipe || []).length) {
      notePlan({
        kind: "done",
        text: `Готово с пропусками · ${emptyMsg(mode, recheck)}`,
        mode,
        jobId: saved.id,
        reason: "empty",
        src: opts.src || "hands",
      });
    }
    return loadJournalJob();
  }
  const first = items[0];
  const days = clampRecheckDays(opts.recheckDays);
  const ice = iceWindowOrNow(freezeIce, opts.dateFrom, String(opts.dateTo || ""), days);
  const job: JournalJob = {
    ...emptyJournalJob(),
    id: opts.fromPipe && opts.id ? String(opts.id) : `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    running: true,
    stop: false,
    mode,
    kind,
    study,
    recheck,
    dateFrom: ice.from,
    dateTo: ice.to,
    recheckDays: days,
    grain: opts.grain === "half" || opts.grain === "year" ? opts.grain : "quarter",
    school: String(opts.school || opts.filter || ""),
    groupId: Number(opts.groupId) || Number(first?.groupId) || 0,
    branchId: Number(opts.branchId) || Number(first?.branchId) || 0,
    customerId: Number(opts.customerId) || Number(first?.cid) || 0,
    oneName: String(opts.oneName || opts.name || ""),
    take: Number(opts.take) || 0,
    filter: String(opts.filter || ""),
    catalogFirst: mode === "catalog",
    skipLeads,
    items,
    idx: 0,
    waits: 0,
    wait429: 0,
    waitOther: 0,
    cur: first?.name || "",
    n: 0,
    total: loopPullKind(mode) ? 0 : items.length,
    msg: (() => {
      const pause = pauseTxt({
        mode,
        recheck,
        recheckDays: days,
        dateFrom: ice.from,
      });
      if (mode === "people-slow") return `${first?.name}: медленный добор, до 10 мин. Курсор не сбрасываем.`;
      if (mode === "people-recheck" || mode === "groups-recheck" || mode === "roster-recheck") {
        return waveStartMsg(wave, first?.name || "", recheck, {
          ...emptyJournalJob(),
          mode,
          recheck,
          recheckDays: days,
          dateFrom: ice.from,
        });
      }
      if (mode === "people" && recheck) return `${first?.name}: перепроверяем. Потом ${pause}.`;
      if (mode === "audit") return `${first?.name}: сверяем. Потом ${pause}.`;
      return `${first?.name}: грузим. Потом ${pause}.`;
    })(),
    fill: fillOf(mode, kind, first),
    startedAt: nowIso(),
    lastAt: nowIso(),
    wave,
    follow,
    archived,
    pipe: Array.isArray(opts.pipe) ? opts.pipe.map(String).filter(Boolean) : [],
  };
  saveJournalJob(job);
  try {
    observeJobStart(job);
  } catch {
    /* лог */
  }
  if (!opts.fromPipe) {
    const stamp = planRunText(String(opts.name || ""));
    notePlan({
      kind: "start",
      text: `${stamp ? `${stamp}. ` : ""}${modeRu(mode, kind)} · ${study === "2" ? "архив" : "ходят"} · ${first?.name || "очередь"}${job.total ? ` · ${job.total}` : ""}${job.pipe.length ? ` · дальше ${job.pipe.length}` : ""}`.slice(0, 270),
      who: first?.name || "",
      cid: Number(first?.cid) || 0,
      mode,
      jobId: job.id,
      src: opts.src || (job.pipe.length ? "plan" : "hands"),
    });
  }
  kickHistoryTick();
  return job;
}

function pipeShouldContinue(job: JournalJob) {
  if (job.stop) return false;
  if (!(job.pipe || []).length) return false;
  const msg = String(job.msg || "");
  if (/Alfa не ответил|нет входа|429|502|Сбой фоновой|Остановились/i.test(msg)) return false;
  return true;
}

function closePlanSlot(job: JournalJob, ok: boolean) {
  const pol = loadSyncPolicy();
  const card = pol.plan.find((r) => r.lastJobId && r.lastJobId === job.id && r.lastSkip === "run");
  if (!card) return;
  if (ok) {
    saveSyncPolicyRun(stampPlanFired(pol, card.id, job.id || "", new Date()).plan);
    return;
  }
  const now = new Date();
  saveSyncPolicyRun(
    pol.plan.map((r) => {
      if (r.id !== card.id) return r;
      if (r.when.kind === "ymd") return { ...r, lastSkip: "pipe", lastFiredAt: now.toISOString() };
      return { ...r, dueAt: "", lastSkip: "pipe", lastFiredAt: now.toISOString(), lastJobId: job.id || r.lastJobId };
    }),
  );
  notePlan({
    kind: "fail",
    text: `${card.label || modeRu(card.mode)}: труба оборвалась · ${job.msg || "стоп"}`.slice(0, 280),
    mode: card.mode,
    jobId: job.id,
    reason: "pipe",
    src: "plan",
  });
}

/** Один человек: календарь, касса, сверка. Состав и группы школы сюда не входят. */
export function startOnePersonStep(p: {
  step: number;
  pipe?: string[];
  customerId: number;
  branchId?: number;
  oneName?: string;
  study?: "1" | "2";
  dateFrom?: string;
  recheckDays?: number;
  recheck?: boolean;
  id?: string;
  fromPipe?: boolean;
}) {
  const cid = Number(p.customerId) || 0;
  const name = String(p.oneName || `№${cid}`);
  if (p.step !== 2 && p.step !== 4 && p.step !== 5) {
    const rest = (p.pipe || []).map(String);
    const i = rest.findIndex((x) => /^one:[245]$/.test(x));
    if (i < 0) return;
    startOnePersonStep({ ...p, step: Number(rest[i].slice(4)), pipe: rest.slice(i + 1) });
    return;
  }
  const common = {
    study: p.study === "2" ? ("2" as const) : ("1" as const),
    customerId: cid,
    branchId: Number(p.branchId) || 1,
    name,
    oneName: name,
    dateFrom: p.dateFrom || "",
    recheckDays: p.recheckDays,
    recheck: p.recheck !== false,
    pipe: p.pipe || [],
    src: "hands" as const,
    fromPipe: p.fromPipe,
    id: p.id,
    archived: p.study === "2",
  };
  if (p.step === 2) {
    startJournalJob({ ...common, mode: "person", kind: "students" });
    return;
  }
  if (p.step === 4) {
    startJournalJob({ ...common, mode: "person", kind: "balance", dateFrom: "2015-01-01" });
    return;
  }
  startJournalJob({ ...common, mode: "audit", kind: "audit", recheck: false });
}

function continueAutoPipe(job: JournalJob) {
  const rawRest = (job.pipe || []).map(String).filter(Boolean);
  const full = rawRest.includes("depth=full");
  const rest = rawRest.filter((x) => x !== "depth=full");
  if (!rest.length) {
    closePlanSlot(job, true);
    return;
  }
  if (job.stop || /Остановились/i.test(String(job.msg || ""))) {
    closePlanSlot(job, true);
    return;
  }
  if (!pipeShouldContinue(job)) {
    closePlanSlot(job, false);
    return;
  }
  const next = rest[0];
  if (!next) {
    closePlanSlot(job, true);
    return;
  }
  const carry = full && rest.length > 1 ? ["depth=full"] : [];
  if (String(next).startsWith("one:")) {
    const step = Number(String(next).slice(4));
    startOnePersonStep({
      step,
      pipe: [...rest.slice(1), ...carry],
      customerId: job.customerId,
      branchId: job.branchId,
      oneName: job.oneName || job.cur,
      study: job.study,
      dateFrom: job.dateFrom,
      recheckDays: job.recheckDays,
      recheck: full ? false : true,
      id: job.id,
      fromPipe: true,
    });
    return;
  }
  notePlan({
    kind: "pipe",
    text: `Дальше ${modeRu(next === "groups-archived" ? "groups" : next, next === "groups-archived" || next === "balance" ? (next === "balance" ? "balance" : "group") : "")}.`,
    mode: next,
    jobId: job.id,
    src: "plan",
    reason: "pipe",
  });
  const days = Number(job.recheckDays) || 4000;
  const base = {
    id: job.id,
    study: job.study,
    dateFrom: job.dateFrom,
    dateTo: job.dateTo,
    recheckDays: days,
    pipe: [...rest.slice(1), ...carry],
    src: "plan" as const,
    fromPipe: true,
    skipLeads: job.skipLeads,
  };
  if (next === "archivesPupils" || next === "archives") {
    startJournalJob({
      ...base,
      mode: next as JournalJobMode,
      kind: next,
      recheck: false,
      archived: next === "archives" || job.archived,
    });
    return;
  }
  if (next === "groups-archived") {
    startJournalJob({
      ...base,
      mode: full ? "groups" : "groups-recheck",
      kind: "group",
      recheck: !full,
      archived: true,
    });
    return;
  }
  if (!full && (next === "people" || next === "people-recheck")) {
    startJournalJob({ ...base, mode: "people-recheck", kind: "students", recheck: true, archived: job.archived });
    return;
  }
  if (next === "people" || next === "people-recheck") {
    startJournalJob({ ...base, mode: "people", kind: "students", recheck: false, archived: job.archived });
    return;
  }
  if (!full && (next === "groups" || next === "groups-recheck")) {
    startJournalJob({ ...base, mode: "groups-recheck", kind: "group", recheck: true, archived: job.archived });
    return;
  }
  if (next === "groups" || next === "groups-recheck") {
    startJournalJob({ ...base, mode: "groups", kind: "group", recheck: false, archived: job.archived });
    return;
  }
  if (!full && next === "balance") {
    startJournalJob({ ...base, mode: "people-recheck", kind: "balance", recheck: true, archived: job.archived });
    return;
  }
  if (next === "balance") {
    startJournalJob({ ...base, mode: "people", kind: "balance", recheck: false, archived: job.archived });
    return;
  }
  if (next === "audit") {
    startJournalJob({ ...base, mode: "audit", kind: "audit", recheck: false, archived: job.archived, skipLeads: false });
    return;
  }
  if (next === "step6-recount" || next === "step6-columns" || next === "step6-cash" || next === "step7-list" || next === "step7-cash") {
    startJournalJob({
      ...base,
      mode: next,
      kind: "students",
      recheck: false,
      customerId: job.customerId,
    });
    return;
  }
  const rule = scheduleOf({
    id: "pipe",
    mode: next,
    study: job.study,
    dateFromId: "2015",
    at: "04:00",
    when: { kind: "daily" },
  });
  const opts = planRuleToJob(rule, new Date());
  startJournalJob({
    mode: opts.mode as JournalJobMode,
    kind: opts.kind,
    study: job.study,
    recheck: full ? false : true,
    recheckDays: days,
    dateFrom: job.dateFrom || opts.dateFrom,
    archived: opts.archived,
    pipe: [...rest.slice(1), ...carry],
    src: "plan",
    fromPipe: true,
    skipLeads: job.skipLeads,
  });
}

export function stopJournalJob() {
  const j = loadJournalJob();
  if (!j.running && !j.stop) {
    return j;
  }
  const who = String(j.cur || j.items?.[j.idx]?.name || "");
  if (j.running) {
    notePlan({
      kind: "stop",
      text: `Стоп${who ? ` · на «${who}»` : ""} · прошло ${j.n || 0} из ${j.total || 0}.`,
      who,
      cid: Number(j.items?.[j.idx]?.cid || j.customerId) || 0,
      mode: j.mode,
      jobId: j.id,
      reason: "stop",
    });
  }
  try {
    observeJobClose(j);
  } catch {
    /* лог */
  }
  return saveJournalJob({
    ...j,
    stop: true,
    running: false,
    cur: "",
    fill: null,
    lastAt: nowIso(),
    msg: stoppedMsg(j),
  });
}

/** Автомат пульта: due с диска, тот же startJournalJob. Без пульта не стартует. */
export function tickHistoryPlan(now = new Date()) {
  if (process.env.NODE_ENV === "test") return;
  const curPol = loadSyncPolicy();
  const marked = markPlanDue(curPol, now);
  const dueChanged = JSON.stringify(marked.plan.map((r) => [r.id, r.dueAt, r.lastSkip])) !== JSON.stringify(curPol.plan.map((r) => [r.id, r.dueAt, r.lastSkip]));
  if (dueChanged) saveSyncPolicyRun(marked.plan);
  if (dueChanged) {
    for (const r of marked.plan) {
      const prev = curPol.plan.find((x) => x.id === r.id);
      if (r.lastSkip === "expired" && prev?.lastSkip !== "expired") {
        notePlan({
          kind: "skip",
          text: `${r.label || modeRu(r.mode)}: слот сгорел (старше 36 ч).`,
          mode: r.mode,
          reason: "expired",
          src: "plan",
        });
      }
    }
  }
  const pol = loadSyncPolicy();
  const job = loadJournalJob();
  if (job.running && !job.stop) {
    const skipped = stampPlanHandsExcept(pol, job.id || "");
    if (JSON.stringify(skipped.plan.map((r) => r.lastSkip)) !== JSON.stringify(pol.plan.map((r) => r.lastSkip))) {
      saveSyncPolicyRun(skipped.plan);
      const who = String(job.cur || "");
      notePlan({
        kind: "skip",
        text: `Слот пропущен: уже идёт${who ? ` «${who}»` : " загрузка"}.`,
        who,
        mode: job.mode,
        reason: "hands",
        src: "plan",
        jobId: job.id,
      });
    }
    return;
  }
  const rule = pickDueRule(pol);
  if (!rule) return;
  const opts = planRuleToJob(rule, now);
  const tpl = (pol.templates || []).find((t) => t.id === rule.templateId);
  const before = job;
  const started = startJournalJob({
    mode: opts.mode as JournalJobMode,
    kind: opts.kind,
    study: opts.study,
    recheck: opts.recheck,
    recheckDays: opts.recheckDays,
    dateFrom: opts.dateFrom,
    archived: opts.archived,
    pipe: opts.pipe,
    src: "plan",
    skipLeads: Boolean((opts as { skipLeads?: boolean }).skipLeads),
    name: packCheckName({
      leads: !Boolean((opts as { skipLeads?: boolean }).skipLeads),
      archGroups: rule.archGroups !== false,
      steps: rule.steps || [],
      also: rule.also || [],
      depth: rule.depth === "full" ? "full" : "recheck",
      templateId: rule.templateId,
      meaning: tpl?.meaning || "",
      who: tpl?.name || rule.label,
      window: rule.dateFromId,
    }),
  });
  const dec = planFireDecision(before, started);
  const live = loadSyncPolicy();
  if (dec === "hands") {
    const skipped = stampPlanHandsExcept(live, started.id || job.id || "");
    if (JSON.stringify(skipped.plan.map((r) => r.lastSkip)) !== JSON.stringify(live.plan.map((r) => r.lastSkip))) {
      saveSyncPolicyRun(skipped.plan);
      notePlan({
        kind: "skip",
        text: `${rule.label || modeRu(rule.mode)}: слот пропущен, руки заняли очередь.`,
        mode: rule.mode,
        reason: "hands",
        src: "plan",
      });
    }
    return;
  }
  const liveJob = loadJournalJob();
  if (liveJob.running && !liveJob.stop) {
    saveSyncPolicyRun(stampPlanRun(live, rule.id, liveJob.id || started.id || "").plan);
    return;
  }
  saveSyncPolicyRun(stampPlanFired(live, rule.id, started.id || "", now).plan);
}

export function startJournalJobWatch() {
  if (process.env.NODE_ENV === "test") return;
  if (!isHistoryWorker()) return;
  if (g.__raJournalWatch) return;
  g.__raJournalWatch = setInterval(() => {
    stampHistoryWorkerBeat();
    resumeJournalJobFromDisk();
    resumeStalledRecheck();
    tickHistoryPlan();
  }, 1000);
  setTimeout(() => {
    stampHistoryWorkerBeat();
    resumeJournalJobFromDisk();
    resumeStalledRecheck();
    tickHistoryPlan();
  }, 200);
}

function resumeStalledRecheck() {
  const j = loadJournalJob();
  if (j.stop) return;
  const wouldAdvance = isRecheckWaveMode(j.mode) && (j.idx >= (j.items || []).length) ? Boolean(peekJobWave(j)?.items.length) : undefined;
  if (!shouldResumeStalledJob(j, Date.now(), wouldAdvance === undefined ? undefined : { wouldAdvance })) return;
  if (!j.running) {
    saveJournalJob({ ...j, running: true, lastAt: nowIso(), msg: j.msg || "Продолжаем с того же." });
  }
  void tickJob();
}

function kickHistoryTick() {
  if (process.env.NODE_ENV === "test") return;
  if (isHistoryWorker()) {
    startJournalJobWatch();
    if (!g.__raJournalJobTick) void tickJob();
    return;
  }
  setTimeout(() => {
    const j = loadJournalJob();
    if (!j.running || j.stop) return;
    if (historyWorkerProcessAlive()) return;
    if (historyWorkerSilent(j, 2500)) resumeJournalJobFromDisk();
  }, 3000);
}

function resumeJournalJobFromDisk() {
  const j = loadJournalJob();
  if (!j.running || j.stop) return;
  if (!isHistoryWorker() && historyWorkerProcessAlive()) return;
  if (!isHistoryWorker() && !historyWorkerSilent(j)) return;
  void tickJob();
}

export function resumeJournalJob() {
  if (isHistoryWorker()) {
    startJournalJobWatch();
    resumeJournalJobFromDisk();
    return loadJournalJob();
  }
  if (historyWorkerProcessAlive()) return loadJournalJob();
  if (historyWorkerSilent()) resumeJournalJobFromDisk();
  return loadJournalJob();
}

export async function runHistoryWorker() {
  process.env.RA_HISTORY_WORKER = "1";
  const bye = () => {
    try {
      releaseHistoryTickLock();
    } catch {
      /* */
    }
    process.exit(0);
  };
  process.once("SIGINT", bye);
  process.once("SIGTERM", bye);
  startJournalJobWatch();
  await new Promise(() => {});
}

function fillOf(mode: JournalJobMode | "", kind: string, item?: JournalJobItem | null) {
  if (!item) return null;
  if (mode === "catalog") return { kind: "archiveCatalog", label: item.name };
  if (mode === "count") return { kind: "archiveCount", label: item.name };
  if (mode === "life") return { kind: "life", label: item.name };
  if (mode === "archives") return { kind: "archives", label: item.name };
  if (mode === "archivesPupils") return { kind: "archivesPupils", label: item.name };
  if (mode === "audit") return { kind: "audit", label: item.name, customerId: item.cid };
  if (mode === "details") {
    return { kind: "details", groupId: item.groupId, branchId: item.branchId, periodKey: item.periodKey, label: item.periodLabel || item.name };
  }
  if (mode === "groups" || mode === "groups-recheck" || mode === "group-one") {
    return { kind: "group", groupId: item.groupId, branchId: item.branchId, periodKey: item.periodKey, label: item.periodLabel || item.name };
  }
  if (mode === "roster" || mode === "roster-recheck") {
    return { kind: "roster", groupId: item.groupId, branchId: item.branchId, label: item.name };
  }
  return { kind: kind === "balance" ? "balance" : "students", label: item.name, customerId: item.cid };
}

function peekJobWave(job: JournalJob): ReturnType<typeof peopleRecheckAdvance> | null {
  const mode = job.mode;
  if (mode === "people-recheck") {
    return peopleRecheckAdvance(
      peopleRowsFor(job.study, job.kind, job.skipLeads),
      job.kind === "balance" ? "balance" : "students",
      job.wave,
      job.follow,
      job.defer,
      job.skip,
    );
  }
  if (mode === "groups-recheck") {
    return groupsRecheckAdvance(groupRowsFor({ school: job.school, archived: job.archived, grain: job.grain }), job.wave, job.follow, false, job.defer, job.skip);
  }
  if (mode === "roster-recheck") {
    if (String(job.oneName || "").trim()) return null;
    return groupsRecheckAdvance(rosterRowsFor({ school: job.school, archived: job.archived }), job.wave, job.follow, true);
  }
  return null;
}

function advanceJobWave(job: JournalJob): { done: false; gap: number } | null {
  const mode = job.mode;
  if (mode === "people-slow") {
    const nxt = peopleSlowAdvance(peopleRowsFor(job.study, "students", job.skipLeads));
    if (nxt.done || !nxt.items.length) return null;
    const first = nxt.items[0];
    patch({
      id: job.id,
      items: nxt.items,
      idx: 0,
      waits: 0,
      n: job.n,
      total: job.n + nxt.items.length,
      running: true,
      recheck: false,
      cur: first?.name || "",
      fill: fillOf(mode, job.kind, first),
      msg: `${first?.name || ""}: медленный добор, ещё круг. Курсор не сбрасываем.`,
    });
    return { done: false, gap: jobGapOf({ ...job, mode, recheck: false }) };
  }
  const nxt = peekJobWave(job);
  if (!nxt || nxt.done || !nxt.items.length) return null;
  const first = nxt.items[0];
  patch({
    id: job.id,
    items: nxt.items,
    follow: nxt.follow,
    defer: job.defer,
    skip: job.skip,
    wave: nxt.wave,
    recheck: nxt.recheck,
    idx: 0,
    waits: 0,
    wait429: 0,
    waitOther: 0,
    n: job.n,
    total: job.n + nxt.items.length,
    running: true,
    cur: first?.name || "",
    fill: fillOf(mode, job.kind, first),
    msg: waveStartMsg(nxt.wave, first?.name || "", nxt.recheck, { ...job, recheck: nxt.recheck }),
  });
  return { done: false, gap: jobGapOf({ ...job, recheck: nxt.recheck }) };
}

function finishWaveOrStop(job: JournalJob, msg: string, n = job.n): { done: true; gap: number; msg: string } {
  patch({
    id: job.id,
    n,
    idx: Math.max(Number(job.idx) || 0, (job.items || []).length),
    waits: 0,
    wait429: 0,
    waitOther: 0,
    running: false,
    wave: isRecheckWaveMode(job.mode) ? "left2" : job.wave,
    follow: isRecheckWaveMode(job.mode) ? [] : job.follow,
    cur: "",
    fill: null,
    msg,
  });
  const fail = /Alfa не отвечает|не ответила|Сбой фоновой|нет входа/i.test(msg);
  const morePipe = !fail && (job.pipe || []).length > 0;
  if (fail) {
    notePlan({
      kind: "fail",
      text: msg,
      mode: job.mode,
      jobId: job.id,
      who: job.items?.[Math.min(job.idx, Math.max((job.items || []).length - 1, 0))]?.name || "",
      reason: "alfa",
    });
  } else if (!morePipe) {
    const log = loadPlanLog();
    const startAt = log.findIndex((e) => e.kind === "start");
    const window = startAt < 0 ? log : log.slice(0, startAt + 1);
    const recent = window.filter((e) => e.kind === "fail" || (e.kind === "skip" && e.reason === "empty"));
    const who = recent.find((e) => e.who)?.who || "";
    notePlan({
      kind: "done",
      text: recent.length ? `Готово с пропусками${who ? ` · ${who}` : ""} · ${msg}` : msg,
      mode: job.mode,
      jobId: job.id,
      reason: recent.length ? "skips" : "done",
    });
  }
  try {
    observeJobClose(job);
  } catch {
    /* лог */
  }
  return { done: true, gap: 0, msg };
}

function skipAfterCap(job: JournalJob, item: JournalJobItem): { done: boolean; gap: number; msg?: string } {
  const idx = job.idx + 1;
  const peopleBlue = job.mode === "people-recheck";
  const groupJob = job.mode === "groups" || job.mode === "groups-recheck" || job.mode === "group-one";
  const waveBlue = peopleBlue || job.mode === "groups-recheck";
  const itemKey = peopleBlue ? Number(item.cid) || 0 : Number(item.groupId) || 0;
  const keyOf = (x: JournalJobItem) => (peopleBlue ? Number(x.cid) || 0 : Number(x.groupId) || 0);
  const skipItem = groupJob ? { groupId: item.groupId, branchId: item.branchId, name: item.name } : item;
  const skip = waveBlue || groupJob
    ? [...(job.skip || []).filter((x) => keyOf(x) !== itemKey), skipItem]
    : job.skip || [];
  const defer = waveBlue
    ? (job.defer || []).filter((x) => keyOf(x) !== itemKey)
    : job.defer || [];
  const waits = resetJobWaits();
  const items = groupJob
    ? (job.items || []).filter((x, i) => i < job.idx || Number(x.groupId) !== Number(item.groupId) || i === job.idx)
    : job.items;
  const moreItems = idx < items.length;
  if (moreItems) {
    const nextName = items[idx]?.name || "";
    const msg = `«${item.name}»: Alfa не отвечает, берём следующего.`;
    notePlan({
      kind: "fail",
      text: msg,
      who: item.name,
      cid: Number(item.cid) || 0,
      mode: job.mode,
      reason: "cap",
      jobId: job.id,
    });
    patch({
      id: job.id,
      idx,
      items,
      n: job.n,
      defer,
      skip,
      ...waits,
      running: true,
      cur: `${pauseTxt(job)} · дальше ${nextName}`,
      fill: fillOf(job.mode, job.kind, items[idx]),
      msg,
    });
    return { done: false, gap: jobGapOf(job) };
  }
  const more = advanceJobWave({ ...job, idx, items, defer, skip, ...waits });
  if (more) return more;
  return finishWaveOrStop({ ...job, idx, items, defer, skip, ...waits }, `Alfa не отвечает на «${item.name}». Остановились.`);
}

/** Синий календарь: после cap — в конец очереди, не выкинуть навсегда. */
function rotateAfterCap(job: JournalJob, item: JournalJobItem): { done: boolean; gap: number; msg?: string } {
  const rot = rotateUnfinished(job.items, job.idx);
  const next = rot.items[rot.idx];
  const same = rot.items.length < 2 || (next && next.cid === item.cid && next.branchId === item.branchId);
  const msg = same
    ? `«${item.name}»: Alfa не отвечает, ещё этот.`
    : `«${item.name}»: Alfa не отвечает, в конец очереди. Дальше ${next?.name || ""}.`;
  notePlan({
    kind: "fail",
    text: msg,
    who: item.name,
    cid: Number(item.cid) || 0,
    mode: job.mode,
    reason: "cap-rotate",
    jobId: job.id,
  });
  patch({
    id: job.id,
    items: rot.items,
    idx: rot.idx,
    n: job.n,
    waits: 0,
    running: true,
    cur: same ? `${pauseTxt(job)} · ещё «${item.name}»` : `${pauseTxt(job)} · дальше ${next?.name || ""}`,
    fill: fillOf(job.mode, job.kind, next || item),
    msg,
  });
  return { done: false, gap: jobGapOf(job) };
}

function afterWaitCap(job: JournalJob, item: JournalJobItem, kind: string) {
  if (capRecheckAction(Boolean(job.recheck), kind) === "rotate") return rotateAfterCap(job, item);
  return skipAfterCap(job, item);
}

function loopLabel(
  pullKind: "archiveCatalog" | "life" | "archives" | "archivesPupils",
  res: {
    extra?: string;
    lastArchiveCatalog?: { name?: string; step?: string } | undefined;
    lastLife?: { left?: number } | undefined;
    lastArchives?: { branch?: string } | undefined;
    lastArchivesPupils?: { left?: number } | undefined;
  },
) {
  if (pullKind === "archiveCatalog") {
    const cat = res.lastArchiveCatalog;
    return cat?.name && cat.name !== "пропуск" ? cat.name : cat?.step || "архив";
  }
  if (pullKind === "life") {
    const left = Number(res.lastLife?.left) || 0;
    return left ? `сроки · ещё ${left}` : "сроки групп";
  }
  if (pullKind === "archives") {
    const branch = res.lastArchives?.branch;
    return branch ? `архив «${branch}»` : "архивные группы";
  }
  const left = Number(res.lastArchivesPupils?.left) || 0;
  return left ? `архив учеников · ещё ${left}` : "архив групп учеников";
}

function ensureJobIce(job: JournalJob): JournalJob {
  if (isRecheckWaveMode(job.mode) && job.mode !== "roster-recheck") {
    if (jobHasIce(job)) return job;
    const win = recheckWindowYmd(job.recheckDays);
    return patch({ id: job.id, dateFrom: win.from, dateTo: win.to });
  }
  if (!job.recheck) {
    if (String(job.dateTo || "")) return patch({ id: job.id, dateTo: "" });
    return job;
  }
  if (jobHasIce(job)) return job;
  const win = recheckWindowYmd(job.recheckDays);
  return patch({ id: job.id, dateFrom: win.from, dateTo: win.to });
}

async function runStep(job: JournalJob): Promise<{ done: boolean; gap: number; msg?: string }> {
  const id = job.id;
  const mode = job.mode;
  job = ensureJobIce(job);
  if (loadJournalJob().stop) return { done: true, gap: 0, msg: stoppedMsg() };
  if (mode === "count") {
    patch({ id, cur: "считаю отбор", fill: { kind: "archiveCount", label: "считаю отбор" } });
    const got = await awaitWhileJob(id, historyLoadOne({ kind: "archiveCount", school: job.school || job.filter, jobId: id, jobMode: mode }));
    if ("stopped" in got) return { done: true, gap: 0, msg: stoppedMsg() };
    const res = got.value;
    if (loadJournalJob().id !== id) return { done: true, gap: 0 };
    const msg = String(res.extra || res.error || "Отбор посчитан.");
    patch({ id, running: false, n: 1, total: 1, cur: "", fill: null, msg });
    return { done: true, gap: 0, msg };
  }
  if (mode === "step6-recount" || mode === "step6-columns" || mode === "step6-cash" || mode === "step7-list" || mode === "step7-cash") {
    if (mode === "step6-cash" || mode === "step7-cash") {
      const only = Number(job.customerId) || 0;
      const got = await awaitWhileJob(id, mode === "step7-cash" ? (await import("./crm-step6")).recheckStep7Cash(only) : (await import("./crm-step6")).recheckStep6Cash(only));
      if ("stopped" in got) return { done: true, gap: 0, msg: stoppedMsg() };
      const res = got.value;
      if (loadJournalJob().id !== id) return { done: true, gap: 0 };
      const n = job.n + 1;
      const note = "note" in res ? res.note : res.error || "";
      if (!res.ok || !("more" in res) || !res.more || only) {
        const msg = note || (mode === "step7-cash" ? "Касса архива снята." : "Касса лидов снята.");
        patch({ id, running: false, n, total: Math.max(Number(job.total) || 0, n), cur: "", fill: null, msg });
        return { done: true, gap: 0, msg };
      }
      patch({ id, n, total: Math.max(Number(job.total) || 0, n + 1), cur: note, msg: note });
      return { done: false, gap: 800 };
    }
    if (mode === "step7-list") {
      const { syncStep7List } = await import("./crm-step7");
      const got = await awaitWhileJob(id, syncStep7List());
      if ("stopped" in got) return { done: true, gap: 0, msg: stoppedMsg() };
      const res = got.value;
      if (loadJournalJob().id !== id) return { done: true, gap: 0 };
      const msg = res.note || "Архив шага 7 прочитан.";
      patch({ id, running: false, n: 1, total: 1, cur: "", fill: null, msg });
      return { done: true, gap: 0, msg };
    }
    const { syncStep6Columns } = await import("./crm-step6");
    const got = await awaitWhileJob(id, syncStep6Columns());
    if ("stopped" in got) return { done: true, gap: 0, msg: stoppedMsg() };
    const res = got.value;
    if (loadJournalJob().id !== id) return { done: true, gap: 0 };
    const msg = res.note || (mode === "step6-recount" ? "Лиды пересчитаны." : "Колонки прочитаны.");
    patch({ id, running: false, n: 1, total: 1, cur: "", fill: null, msg });
    return { done: true, gap: 0, msg };
  }
  const loopKind = loopPullKind(mode);
  if (loopKind) {
    const got = await awaitWhileJob(
      id,
      historyLoadOne({
        kind: loopKind,
        probe: job.catalogFirst && loopKind === "archiveCatalog",
        school: job.school || job.filter,
        study: job.study,
        jobId: id,
        jobMode: mode,
      }),
    );
    if ("stopped" in got) return { done: true, gap: 0, msg: stoppedMsg() };
    const res = got.value;
    if (loadJournalJob().id !== id) return { done: true, gap: 0 };
    const label = loopLabel(loopKind, res);
    const n = job.n + (res.ok ? 1 : 0);
    if (!res.ok) {
      const waits = (loadJournalJob().waits || 0) + 1;
      if (/уже грузим|нет ответа|нет входа|429|502/i.test(String(res.error || "")) && waits <= JOB_WAIT_CAP) {
        patch({ id, waits, cur: `${pauseTxt(job)} · Alfa`, fill: { kind: loopKind, label: `${pauseTxt(job)} · Alfa` }, msg: String(res.error || res.extra || "") });
        return { done: false, gap: jobGapOf(job) };
      }
      patch({ id, running: false, n, cur: "", fill: null, waits: 0, msg: String(res.error || "Alfa не ответила.") });
      notePlan({
        kind: "fail",
        text: String(res.error || "Alfa не ответила."),
        mode: job.mode,
        jobId: id,
        reason: "alfa",
      });
      return { done: true, gap: 0, msg: String(res.error || "") };
    }
    patch({
      id,
      catalogFirst: false,
      n,
      total: n,
      waits: 0,
      cur: label,
      fill: { kind: loopKind, label },
      msg: String(res.extra || ""),
    });
    if (!res.more) {
      patch({ id, running: false, cur: "", fill: null, msg: loadJournalJob().msg });
      return { done: true, gap: 0 };
    }
    patch({ id, cur: `${pauseTxt(job)} · ${label}`, fill: { kind: loopKind, label: `${pauseTxt(job)} · ${label}` } });
    return { done: false, gap: jobGapOf(job) };
  }

  if (job.idx >= job.items.length) {
    const more = advanceJobWave(job);
    if (more) return more;
    return finishWaveOrStop(job, doneMsg(job));
  }
  while (job.idx < job.items.length && jobItemSkipped(job.items[job.idx], job.skip)) {
    job = patch({ id, idx: job.idx + 1 });
  }
  if (job.idx >= job.items.length) {
    const more = advanceJobWave(job);
    if (more) return more;
    return finishWaveOrStop(job, doneMsg(job));
  }
  let item = job.items[job.idx];
  const singlePerson = (mode === "person" || (mode === "audit" && job.items.length === 1)) && (Number(item.cid) || 0) > 0;
  if (singlePerson) {
    try {
      const { ensureCustomerCard } = await import("./dossiers");
      const card = await ensureCustomerCard(Number(item.cid), Number(item.branchId) || Number(job.branchId) || 1);
      const fio = String(card?.child?.fio || "").trim();
      if (fio && fio !== item.name) {
        const items = job.items.slice();
        items[job.idx] = { ...item, name: fio };
        item = items[job.idx];
        job = patch({ id, items, oneName: fio });
      }
    } catch {
      /* карточка не открылась — шаг идёт как раньше */
    }
  }
  const blue = mode === "groups-recheck";
  const windowed = blue && job.recheck;
  if (mode === "groups" && item.groupId && !item.periodKey) {
    const g = journalPullGroups().find((x) => x.groupId === item.groupId && x.branchId === item.branchId) || journalPullGroups().find((x) => x.groupId === item.groupId);
    if (g) {
      const row = groupFillRow(g);
      const part = nextGroupPart(row.parts || [], job.grain, row.age);
      if (!part) {
        patch({ id, idx: job.idx + 1, n: job.n + 1, waits: 0 });
        return { done: false, gap: 0 };
      }
      item = { ...item, periodKey: part.key, periodLabel: part.label };
    }
  }
  const pullKind = historyPullKind(mode, job.kind);
  const curLabel =
    (pullKind === "group" || pullKind === "details") && item.periodLabel
      ? `${item.name} · ${item.periodLabel}`
      : pullKind === "balance"
        ? `касса · ${item.name}`
        : item.name;
  patch({
    id,
    cur: curLabel,
    fill: fillOf(mode, job.kind, item),
    msg: job.recheck ? `${item.name}: перепроверяем. Потом ${pauseTxt(job)}.` : `${item.name}: грузим. Потом ${pauseTxt(job)}.`,
  });
  if (loadJournalJob().stop) return { done: true, gap: 0, msg: stoppedMsg() };
  const got = await awaitWhileJob(
    id,
    historyLoadOne({
      kind: pullKind,
      study: job.study,
      customerId: Number(item.cid) || 0,
      branchId: Number(item.branchId) || job.branchId,
      groupId: Number(item.groupId) || 0,
      periodKey: blue && !windowed ? "whole" : item.periodKey || "",
      grain: job.grain,
      recheck: Boolean(job.recheck) || (mode === "group-one" && !item.periodKey),
      prune: blue || item.periodKey === "whole",
      dateFrom: blue ? (windowed ? job.dateFrom : "2015-01-01") : job.dateFrom,
      dateTo: blue ? (windowed ? job.dateTo || "" : "") : job.dateTo,
      recheckDays: job.recheckDays,
      probe: mode === "probe",
      school: job.school || job.filter,
      name: item.name,
      slowFill: mode === "people-slow",
      jobId: id,
      jobMode: mode,
    }),
  );
  if ("stopped" in got) return { done: true, gap: 0, msg: stoppedMsg() };
  const res = got.value;
  const live = loadJournalJob();
  if (live.id !== id) return { done: true, gap: 0 };
  if (live.stop) return { done: true, gap: 0, msg: `Остановили · прошло ${live.n} из ${live.total}.` };
  const moreCash = pullKind === "balance" && Boolean(res.student?.paysMore);
  if (moreCash) {
    const rot = rotateUnfinished(live.items, live.idx);
    const next = rot.items[rot.idx];
    const same = rot.items.length < 2 || (next && next.cid === item.cid && next.branchId === item.branchId);
    patch({
      id,
      items: rot.items,
      idx: rot.idx,
      ...resetJobWaits(),
      n: live.n,
      running: true,
      cur: same ? `касса · ещё «${item.name}»` : `${pauseTxt(live)} · дальше ${next?.name || ""}`,
      fill: fillOf(mode, job.kind, next || item),
      msg: same
        ? String(res.extra || res.error || `«${item.name}»: касса не дочитана.`)
        : `«${item.name}»: пачка кассы, дальше ${next?.name || ""}.`,
    });
    return { done: false, gap: live.recheck ? jobGapOf(live) : 0 };
  }
  const err = String(res.error || res.extra || "");
  const busy = recheckBusyErr(err);
  const cashRetry = shouldRetryCash(pullKind, live.recheck, res);
  const openRetry = shouldRetryOpenRecheck(live.recheck, pullKind, res);
  const shortRetry = shouldRetryShortPeople(mode, live.recheck, pullKind, res);
  const censusMiss = !res.ok || res.pagesComplete === false || (pullKind === "students" && busy && !res.ok);
  if (shortRetry && res.ok && !busy) {
    patch({
      id,
      ...resetJobWaits(),
      cur: `${pauseTxt(live)} · ещё «${item.name}»`,
      fill: fillOf(mode, job.kind, item),
      msg: `«${item.name}»: не хватает, ещё этот.`,
    });
    return { done: false, gap: jobGapOf(live) };
  }
  if (openRetry && res.ok && !busy) {
    patch({
      id,
      ...resetJobWaits(),
      cur: `${pauseTxt(live)} · ещё «${item.name}»`,
      fill: fillOf(mode, job.kind, item),
      msg: `«${item.name}»: перепись не закрыта, ещё этот.`,
    });
    return { done: false, gap: jobGapOf(live) };
  }
  if (censusMiss || cashRetry || !res.ok) {
    const bumped = bumpJobWaits(live.wait429 || 0, live.waitOther || 0, err || (res.ok ? "" : "перепись не дошла"));
    if (bumped.cap) {
      return afterWaitCap({ ...live, ...bumped }, item, pullKind);
    }
    const stay429 = is429Err(err);
    patch({
      id,
      wait429: bumped.wait429,
      waitOther: bumped.waitOther,
      waits: bumped.waits,
      cur: pullKind === "balance" && !live.recheck && !busy ? `касса · ещё «${item.name}»` : `${pauseTxt(live)} · ещё «${item.name}»`,
      fill: fillOf(mode, job.kind, item),
      msg: stay429
        ? `«${item.name}»: 429, ждём 2 мин, ещё этот.`
        : cashRetry
          ? String(res.extra || res.error || `«${item.name}»: касса не дочитана.`)
          : `«${item.name}»: перепись не дошла · ещё этот.`,
    });
    return { done: false, gap: jobRetryGapMs(err || "перепись не дошла", blue || live.recheck ? jobPeriodDays({ ...live, recheck: true }) : 0) };
  }
  if (pullKind === "group") {
    const holeN = Number(res.holeN) || 0;
    const extraN = Number(res.extraN) || 0;
    const seated = Number(res.seated) || 0;
    const staySame = () => {
      patch({
        id,
        ...resetJobWaits(),
        cur: `${pauseTxt(live)} · ещё «${item.name}»`,
        fill: fillOf(mode, job.kind, item),
        msg: String(res.extra || `«${item.name}»: не хватает, ещё этот.`),
      });
      return { done: false as const, gap: jobGapOf(live) };
    };
    if ((mode === "groups" || mode === "group-one") && !blue && holeN && seated) return staySame();
    if ((mode === "groups" || mode === "group-one") && !blue && holeN && !seated) {
      const skip = [...(live.skip || []), { groupId: item.groupId, branchId: item.branchId, name: item.name, periodKey: item.periodKey, periodLabel: item.periodLabel }];
      const idx = live.idx + 1;
      const n = live.n + 1;
      if (idx < live.items.length) {
        patch({
          id,
          skip,
          n,
          idx,
          ...resetJobWaits(),
          cur: `${pauseTxt(live)} · дальше ${live.items[idx]?.name || ""}`,
          fill: fillOf(mode, job.kind, live.items[idx]),
          msg: `«${item.name}»: порция спрошена, дырка не села. Дальше.`,
          running: true,
        });
        return { done: false, gap: jobGapOf(live) };
      }
      return finishWaveOrStop({ ...live, n, idx, skip, ...resetJobWaits() }, doneMsg({ ...live, n, idx }), n);
    }
    if (blue && !windowed && (holeN || extraN) && seated) return staySame();
  }
  if (mode === "details" && res.more) {
    patch({
      id,
      waits: 0,
      cur: `${pauseTxt(live)} · ещё ДЗ «${item.name}»`,
      fill: fillOf(mode, job.kind, item),
      msg: String(res.extra || `«${item.name}»: ДЗ не дочитано.`),
    });
    return { done: false, gap: jobGapOf(live) };
  }
  const n = live.n + 1;
  const idx = live.idx + 1;
  if (idx < live.items.length) {
    const nextName = live.items[idx]?.name || "";
    const pauseCur = `${pauseTxt(live)} · дальше ${nextName}`;
    patch({
      id,
      n,
      idx,
      ...resetJobWaits(),
      cur: pauseCur,
      fill: live.fill,
      msg: pauseCur,
      running: true,
    });
    return { done: false, gap: jobGapOf(live) };
  }
  const more = advanceJobWave({ ...live, n, idx, ...resetJobWaits() });
  if (more) return more;
  const finished = { ...live, n, idx };
  return finishWaveOrStop(finished, doneMsg(finished), n);
}

function doneMsg(job: JournalJob) {
  if (job.stop) return `Остановили · прошло ${job.n} из ${job.total}.`;
  if (job.mode === "people-recheck" || (job.mode === "people" && job.recheck)) return `${job.n} перепроверили.`;
  if (job.mode === "people") return `Готово · ${job.n} учеников. Кто слева — ещё жёлтые или без кассы.`;
  if (job.mode === "groups-recheck") return `${job.n} групп перепроверили.`;
  if (job.mode === "groups") return `Готово · ${job.n} порций. Кто слева — ещё не все кварталы.`;
  if (job.mode === "group-one") return job.recheck ? "Группа перепроверена." : "Порция группы записана.";
  if (job.mode === "details") return `${job.n} порций ДЗ.`;
  if (job.mode === "audit") return `Сверили ${job.n}. Пустая лента — нули, 0=0 вправо.`;
  if (job.mode === "probe") return job.msg || `${job.items[0]?.name || ""}: счёт.`;
  if (job.mode === "person") return job.msg || "Записали на сайт.";
  if (job.mode === "life") return job.msg || "Сроки групп уточнены.";
  if (job.mode === "archives") return job.msg || "Архивные группы на диске.";
  if (job.mode === "archivesPupils") return job.msg || "Архив групп учеников закрыт.";
  if (job.mode === "roster") return `Готово · ${job.n} групп. Состав с cgi на диске.`;
  if (job.mode === "roster-recheck") return `${job.n} групп перепроверили состав.`;
  return `Готово · ${job.n}.`;
}

async function tickJob() {
  if (g.__raJournalJobTick) return;
  if (!isHistoryWorker()) {
    if (historyWorkerProcessAlive()) return;
    if (!historyWorkerSilent()) return;
  }
  if (!tryHistoryTickLock()) return;
  g.__raJournalJobTick = true;
  let id = "";
  try {
    while (true) {
      touchHistoryTickLock();
      const j = loadJournalJob();
      if (id && j.id !== id) break;
      id = j.id;
      if (!j.running || j.stop) break;
      const step = await runStep(j);
      const now = loadJournalJob();
      if (now.id !== id) break;
      if (now.stop) {
        patch({ id, running: false, cur: "", fill: null, msg: `Остановили · прошло ${now.n} из ${now.total}.` });
        break;
      }
      if (step.done) {
        const end = loadJournalJob();
        if (end.id === id && end.running) patch({ id, running: false, cur: "", fill: null, msg: step.msg || end.msg });
        const done = loadJournalJob();
        if (done.id === id && !done.stop) continueAutoPipe(done);
        break;
      }
      if (step.gap) await sleepGap(step.gap, id);
    }
  } catch (e) {
    const now = loadJournalJob();
    const text = e instanceof Error ? `${e.name} ${e.message}` : String(e);
    const abort = (e instanceof Error && e.name === "AbortError") || /\bSIGTERM\b|\bSIGINT\b/.test(text);
    if (abort) {
      /* процесс сняли — «идёт» на диске, следующий процесс продолжит */
    } else if (now.id === id || !id) {
      const waits = (Number(now.waits) || 0) + 1;
      const giveUp = waits > JOB_WAIT_CAP;
      patch({
        id: now.id || id,
        waits,
        ...(giveUp ? { running: false, cur: "", fill: null } : {}),
        msg: e instanceof Error ? e.message : "Сбой фоновой загрузки.",
      });
      if (giveUp) {
        notePlan({
          kind: "fail",
          text: e instanceof Error ? e.message : "Сбой фоновой загрузки.",
          who: String(now.cur || ""),
          mode: now.mode,
          jobId: now.id || id,
          reason: "crash",
        });
      } else {
        await sleepGap(jobRetryGapMs(text, jobPeriodDays(now)), id);
      }
    }
  } finally {
    g.__raJournalJobTick = false;
    releaseHistoryTickLock();
    const end = loadJournalJob();
    if (end.id === id && end.stop && end.running) patch({ id, running: false, cur: "", fill: null, msg: `Остановили · прошло ${end.n} из ${end.total}.` });
    else if (end.running && !end.stop && isHistoryWorker()) void tickJob();
  }
}
