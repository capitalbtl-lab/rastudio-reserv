/** Фон «Истории из Alfa»: один шаг, пауза, следующий. Вкладка только смотрит. В Alfa не пишет. */

import { journalPull, journalPullGroups, groupFillRow, journalPeopleSide } from "./crm-journal-pull";
import { journalChunks, clampGrain, type Grain } from "./crm-journal-periods";
import {
  emptyJournalJob,
  jobGapMs,
  loadJournalJob,
  peopleJobQueue,
  saveJournalJob,
  shouldRetryCash,
  type JournalJob,
  type JournalJobItem,
  type JournalJobMode,
  type PeopleJobRow,
} from "./crm-journal-job-core";

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
} from "./crm-journal-job-core";

const g = globalThis as { __raJournalJobTick?: boolean };

function nowIso() {
  return new Date().toISOString();
}

function patch(job: JournalJob, extra: Partial<JournalJob>) {
  const next = { ...job, ...extra, lastAt: nowIso() };
  return saveJournalJob(next);
}

async function sleepGap(ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (loadJournalJob().stop) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}

function packGrain(parts: { key: string; label: string; from: string; to: string; done: boolean; weak?: boolean; rechecked?: boolean; lessons?: number; needDetails?: number; conducted?: number; at?: string; err?: string }[], grain: Grain) {
  const list = parts || [];
  const byKey = new Map(list.map((p) => [p.key, p]));
  const have = new Set(list.map((p) => p.key));
  return journalChunks(grain)
    .filter((c) => c.keys.some((k) => have.has(k)))
    .map((c) => {
      const kids = c.keys.map((k) => byKey.get(k)).filter(Boolean) as typeof list;
      const present = c.keys.filter((k) => have.has(k));
      const done = present.every((k) => byKey.get(k)?.done);
      const weak = present.some((k) => byKey.get(k)?.weak);
      const rechecked = present.length > 0 && present.every((k) => byKey.get(k)?.rechecked);
      return { key: c.key, label: c.label, done, weak, rechecked };
    });
}

function nextGroupPart(
  parts: { key: string; label: string; done: boolean; weak?: boolean; rechecked?: boolean; at?: string }[],
  grain: Grain,
  age?: string,
) {
  const chunks = packGrain(parts, clampGrain(age, grain));
  const hole = chunks.find((c) => !c.done || c.weak);
  if (hole) return hole;
  const unverified = chunks.find((c) => !c.rechecked);
  if (unverified) return unverified;
  return chunks[0] || null;
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
  grain?: Grain;
  school?: string;
  groupId?: number;
  branchId?: number;
  customerId?: number;
  take?: number;
  filter?: string;
  probe?: boolean;
  name?: string;
};

function emptyMsg(mode: JournalJobMode, recheck: boolean) {
  if (mode === "people" || mode === "people-recheck") {
    return recheck || mode === "people-recheck"
      ? "Справа никого перепроверять. Сначала красная «Загрузить по одному»."
      : "Слева пусто. Нажмите «Перепроверить по одному» — пройдёт тех, кто справа.";
  }
  if (mode === "groups") return "Слева пусто. Нажмите «Перепроверить по одному» — пройдёт тех, кто справа.";
  if (mode === "groups-recheck") return "Справа никого перепроверять. Сначала красная «Загрузить по одному».";
  if (mode === "audit") return "Нет текущих учеников на диске.";
  if (mode === "catalog") return "Архив клиентов: некого писать.";
  if (mode === "probe") return "Нет текущих учеников в списке.";
  return "грузить нечего";
}

function buildItems(opts: StartJournalJobOpts): JournalJobItem[] {
  const mode = opts.mode;
  if (mode === "person") {
    const cid = Number(opts.customerId) || 0;
    if (!cid) return [];
    return [{ cid, branchId: Number(opts.branchId) || 1, name: opts.name || `№${cid}` }];
  }
  if (mode === "people" || mode === "people-recheck" || mode === "probe" || mode === "audit") {
    const study = opts.study === "2" ? "2" : "1";
    const side = journalPeopleSide(study);
    const people = (side.people || []) as PeopleJobRow[];
    const kind = opts.kind === "balance" ? "balance" : "students";
    if (mode === "audit") {
      let queue = [...people];
      const take = Number(opts.take) || 0;
      const one = Number(opts.customerId) || 0;
      if (one) queue = queue.filter((r) => r.cid === one);
      if (!one && take > 0 && queue.length > take) {
        for (let i = queue.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          const t = queue[i];
          queue[i] = queue[j];
          queue[j] = t;
        }
        queue = queue.slice(0, take);
      }
      return queue.map((r) => ({ cid: r.cid, branchId: r.branchId, name: r.name }));
    }
    if (mode === "probe") {
      const unseen = people.filter((r) => (r as { alfa?: number }).alfa == null);
      const hole = people.filter((r) => r.short);
      const row = unseen[0] || hole[0] || people[0];
      return row ? [{ cid: row.cid, branchId: row.branchId, name: row.name }] : [];
    }
    const queue = peopleJobQueue(people, kind, mode === "people-recheck" || Boolean(opts.recheck));
    return queue.map((r) => ({ cid: r.cid, branchId: r.branchId, name: r.name }));
  }
  if (mode === "groups" || mode === "groups-recheck" || mode === "group-one") {
    const grain = (opts.grain || "quarter") as Grain;
    const school = String(opts.school || "");
    const groups = journalPullGroups().filter((g) => !school || g.school === school);
    if (mode === "group-one") {
      const hit = groups.find((g) => g.groupId === Number(opts.groupId) && (!opts.branchId || g.branchId === Number(opts.branchId))) || groups.find((g) => g.groupId === Number(opts.groupId));
      if (!hit) return [];
      const row = groupFillRow(hit);
      const chunks = packGrain(row.parts || [], clampGrain(row.age, grain));
      return chunks.map((c) => ({ groupId: hit.groupId, branchId: hit.branchId, name: hit.name, periodKey: c.key, periodLabel: c.label }));
    }
    const rows = groups.map((g) => groupFillRow(g));
    const need = rows.filter((r) => (mode === "groups-recheck" ? fillNeedsRecheck(r.parts || [], grain, r.age) : !fillFinished(r.parts || [], grain, r.age) || (r.parts || []).some((p) => p.weak)));
    const done = rows.filter((r) => fillFinished(r.parts || [], grain, r.age));
    const queue = mode === "groups-recheck" ? (need.length ? need : done) : need;
    return queue.map((r) => ({ groupId: r.groupId, branchId: r.branchId, name: r.name }));
  }
  if (mode === "catalog") return [{ name: "архив клиентов" }];
  return [];
}

export function startJournalJob(opts: StartJournalJobOpts): JournalJob {
  const cur = loadJournalJob();
  if (cur.running && !cur.stop) return cur;
  const mode = opts.mode;
  const kind =
    opts.kind ||
    (mode === "audit" ? "audit" : mode === "catalog" ? "archiveCatalog" : mode === "groups" || mode === "groups-recheck" || mode === "group-one" ? "group" : mode === "people" || mode === "people-recheck" || mode === "person" || mode === "probe" ? String(opts.kind || "students") : "students");
  const recheck = Boolean(opts.recheck) || mode === "people-recheck" || mode === "groups-recheck" || mode === "group-one";
  const items = buildItems({ ...opts, kind, recheck });
  if (!items.length && mode !== "catalog") {
    return saveJournalJob({
      ...emptyJournalJob(),
      mode,
      kind,
      study: opts.study === "2" ? "2" : "1",
      msg: emptyMsg(mode, recheck),
      lastAt: nowIso(),
    });
  }
  const first = items[0];
  const job: JournalJob = {
    ...emptyJournalJob(),
    running: true,
    stop: false,
    mode,
    kind,
    study: opts.study === "2" ? "2" : "1",
    recheck,
    dateFrom: String(opts.dateFrom || ""),
    grain: opts.grain === "half" || opts.grain === "year" ? opts.grain : "quarter",
    school: String(opts.school || opts.filter || ""),
    groupId: Number(opts.groupId) || Number(first?.groupId) || 0,
    branchId: Number(opts.branchId) || Number(first?.branchId) || 0,
    customerId: Number(opts.customerId) || Number(first?.cid) || 0,
    take: Number(opts.take) || 0,
    filter: String(opts.filter || ""),
    catalogFirst: mode === "catalog",
    items,
    idx: 0,
    cur: first?.name || "",
    n: 0,
    total: mode === "catalog" ? 0 : items.length,
    msg: mode === "people-recheck" || (mode === "people" && recheck) ? `${first?.name}: перепроверяем. Потом пауза 5 с.` : mode === "audit" ? `${first?.name}: сверяем. Потом пауза 1 с.` : `${first?.name}: грузим. Потом пауза 5 с.`,
    fill: fillOf(mode, kind, first),
    startedAt: nowIso(),
    lastAt: nowIso(),
  };
  saveJournalJob(job);
  void tickJob();
  return job;
}

export function stopJournalJob() {
  const j = loadJournalJob();
  if (!j.running) return j;
  j.stop = true;
  j.msg = j.msg || "Останавливаем после текущего…";
  saveJournalJob(j);
  return j;
}

export function resumeJournalJob() {
  const j = loadJournalJob();
  if (j.running && !j.stop) void tickJob();
  return j;
}

function fillOf(mode: JournalJobMode | "", kind: string, item?: JournalJobItem | null) {
  if (!item) return null;
  if (mode === "catalog") return { kind: "archiveCatalog", label: item.name };
  if (mode === "audit") return { kind: "audit", label: item.name, customerId: item.cid };
  if (mode === "groups" || mode === "groups-recheck" || mode === "group-one") {
    return { kind: "group", groupId: item.groupId, branchId: item.branchId, periodKey: item.periodKey, label: item.periodLabel || item.name };
  }
  return { kind: kind === "balance" ? "balance" : "students", label: item.name, customerId: item.cid };
}

async function runStep(job: JournalJob): Promise<{ done: boolean; gap: number; msg?: string }> {
  const mode = job.mode;
  if (mode === "catalog") {
    const res = await journalPull({
      kind: "archiveCatalog",
      probe: job.catalogFirst,
      school: job.school || job.filter,
    });
    const cat = res.lastArchiveCatalog as { name?: string; step?: string; more?: boolean } | undefined;
    const label = cat?.name && cat.name !== "пропуск" ? cat.name : cat?.step || "архив";
    const n = job.n + (res.ok ? 1 : 0);
    if (!res.ok) {
      if (/уже грузим|нет ответа|нет входа/i.test(String(res.error || ""))) {
        patch(job, { cur: "пауза 5 с · Alfa", n, fill: { kind: "archiveCatalog", label: "пауза 5 с · Alfa" }, msg: String(res.error || res.extra || "") });
        return { done: false, gap: 5000 };
      }
      patch(job, { running: false, n, cur: "", fill: null, msg: String(res.error || "Архив клиентов не ответил.") });
      return { done: true, gap: 0, msg: String(res.error || "") };
    }
    patch(loadJournalJob(), {
      catalogFirst: false,
      n,
      total: n,
      cur: label,
      fill: { kind: "archiveCatalog", label },
      msg: String(res.extra || ""),
    });
    if (!res.more) {
      const j = loadJournalJob();
      patch(j, { running: false, cur: "", fill: null, msg: j.msg });
      return { done: true, gap: 0 };
    }
    patch(loadJournalJob(), { cur: `пауза 1 с · ${label}`, fill: { kind: "archiveCatalog", label: `пауза 1 с · ${label}` } });
    return { done: false, gap: jobGapMs("catalog") };
  }

  if (job.idx >= job.items.length) {
    return { done: true, gap: 0, msg: doneMsg(job) };
  }
  let item = job.items[job.idx];
  if ((mode === "groups" || mode === "groups-recheck") && item.groupId) {
    const g = journalPullGroups().find((x) => x.groupId === item.groupId && x.branchId === item.branchId) || journalPullGroups().find((x) => x.groupId === item.groupId);
    if (g) {
      const row = groupFillRow(g);
      const part = nextGroupPart(row.parts || [], job.grain, row.age);
      if (!part) {
        patch(job, { idx: job.idx + 1, n: job.n + 1 });
        return { done: false, gap: 0 };
      }
      item = { ...item, periodKey: part.key, periodLabel: part.label };
    }
  }
  const pullKind = mode === "audit" ? "audit" : mode === "groups" || mode === "groups-recheck" || mode === "group-one" ? "group" : job.kind === "balance" ? "balance" : "students";
  const curLabel =
    pullKind === "group" && item.periodLabel ? `${item.name} · ${item.periodLabel}` : item.name;
  patch(job, {
    cur: curLabel,
    fill: fillOf(mode, job.kind, item),
    msg: job.recheck ? `${item.name}: перепроверяем. Потом пауза 5 с.` : `${item.name}: грузим. Потом пауза 5 с.`,
  });
  const res = await journalPull({
    kind: pullKind as "students" | "balance" | "group" | "audit",
    study: job.study,
    customerId: Number(item.cid) || 0,
    branchId: Number(item.branchId) || job.branchId,
    groupId: Number(item.groupId) || 0,
    periodKey: item.periodKey || "",
    grain: job.grain,
    recheck: job.recheck || mode === "people-recheck" || mode === "groups-recheck" || mode === "group-one",
    dateFrom: job.dateFrom,
    probe: mode === "probe",
  });
  const live = loadJournalJob();
  if (live.stop) return { done: true, gap: 0, msg: `Остановили · прошло ${live.n} из ${live.total}.` };
  const retry = shouldRetryCash(pullKind, live.recheck, res);
  if (retry && pullKind === "balance" && !live.recheck) {
    patch(live, {
      cur: `касса · ещё «${item.name}»`,
      fill: { kind: "balance", label: item.name, customerId: item.cid },
      msg: String(res.extra || res.error || `«${item.name}»: касса не дочитана.`),
    });
    return { done: false, gap: jobGapMs("people") };
  }
  if (!res.ok) {
    if (retry || /уже грузим|429|502|ответила|нет ответа/i.test(String(res.error || ""))) {
      patch(live, { cur: `пауза 5 с · ещё «${item.name}»`, msg: String(res.error || res.extra || `«${item.name}»: Alfa не ответила, нажмите снова`) });
      return { done: false, gap: jobGapMs("people") };
    }
    patch(live, { running: false, cur: "", fill: null, msg: res.error || `Остановились на «${item.name}». Нажмите ещё раз — продолжит со следующего.` });
    return { done: true, gap: 0, msg: live.msg };
  }
  const n = live.n + 1;
  const idx = live.idx + 1;
  const more = idx < live.items.length;
  const nextName = more ? live.items[idx]?.name || "" : "";
  const gap = more ? jobGapMs(mode) : 0;
  const pauseCur = more ? (mode === "audit" ? `пауза 1 с · дальше ${nextName}` : `пауза 5 с · дальше ${nextName}`) : "";
  patch(live, {
    n,
    idx,
    cur: pauseCur || "",
    fill: more ? live.fill : null,
    msg: more ? pauseCur : doneMsg({ ...live, n }),
    running: more,
  });
  return { done: !more, gap, msg: more ? "" : doneMsg({ ...live, n }) };
}

function doneMsg(job: JournalJob) {
  if (job.stop) return `Остановили · прошло ${job.n} из ${job.total}.`;
  if (job.mode === "people-recheck" || (job.mode === "people" && job.recheck)) return `${job.n} перепроверили.`;
  if (job.mode === "people") return `Готово · ${job.n} учеников. Слева пусто.`;
  if (job.mode === "groups-recheck") return `${job.n} групп перепроверили.`;
  if (job.mode === "groups") return `Готово · ${job.n} групп. Слева пусто, если порции закрылись.`;
  if (job.mode === "group-one") return job.stop ? "Очередь группы остановлена." : "Группа перепроверена.";
  if (job.mode === "audit") return `Сверили ${job.n} текущих.`;
  if (job.mode === "probe") return `${job.items[0]?.name || ""}: счёт.`;
  if (job.mode === "person") return job.msg || "Пакет записан на сайт.";
  return `Готово · ${job.n}.`;
}

async function tickJob() {
  if (g.__raJournalJobTick) return;
  g.__raJournalJobTick = true;
  try {
    while (true) {
      const j = loadJournalJob();
      if (!j.running || j.stop) break;
      const step = await runStep(j);
      const now = loadJournalJob();
      if (now.stop) {
        patch(now, { running: false, cur: "", fill: null, msg: `Остановили · прошло ${now.n} из ${now.total}.` });
        break;
      }
      if (step.done) {
        const end = loadJournalJob();
        if (end.running) patch(end, { running: false, cur: "", fill: null, msg: step.msg || end.msg });
        break;
      }
      if (step.gap) await sleepGap(step.gap);
    }
  } catch (e) {
    const now = loadJournalJob();
    patch(now, { running: false, cur: "", fill: null, msg: e instanceof Error ? e.message : "Сбой фоновой загрузки." });
  } finally {
    g.__raJournalJobTick = false;
    const end = loadJournalJob();
    if (end.stop && end.running) patch(end, { running: false, cur: "", fill: null, msg: `Остановили · прошло ${end.n} из ${end.total}.` });
  }
}
