import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  POLICY_FACTORY,
  canSavePolicy,
  fromMsk,
  markPlanDue,
  mergePolicyKeepRun,
  mergePolicyRunStamps,
  mskWall,
  nextSlotAt,
  pickDueRule,
  planDateFrom,
  planFromIdToRecheckDays,
  planHorizon,
  planFireDecision,
  planRuleToJob,
  stampPlanSkip,
  planLogSessions,
  policyOf,
  scheduleOf,
  slotOpen,
  stampPlanFired,
  whenHits,
  whenLabel,
  ymdOf,
} from "./crm-sync-policy-core.ts";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "crm-sync-policy-core.ts"), "utf8");

/** Стена МСК как Date (UTC+3). */
function msk(y: number, mo0: number, d: number, h: number, min: number) {
  return fromMsk(y, mo0 + 1, d, h, min);
}

describe("пульт Истории", () => {
  it("ядро без fs и Alfa", () => {
    assert.doesNotMatch(src, /from ["']node:fs["']/);
    assert.doesNotMatch(src, /s20\.online/);
    assert.doesNotMatch(src, /alfacrm/);
    assert.match(src, /Europe\/Moscow/);
    assert.match(src, /id: "auto"/);
    assert.match(src, /AUTO_PIPE/);
    assert.match(src, /AUTO_PIPE_FULL/);
    assert.match(src, /mergePolicyRunStamps/);
  });

  it("завод — автомат выкл, план пуст", () => {
    const p = policyOf({});
    assert.equal(p.planEnabled, false);
    assert.equal(p.plan.length, 0);
    assert.equal(POLICY_FACTORY.planEnabled, false);
  });

  it("без времени и без дня недели не сохранить", () => {
    const badDay = policyOf({
      plan: [{ id: "a", mode: "people-recheck", when: { kind: "weekly", days: [] }, at: "04:00" }],
    });
    assert.equal(canSavePolicy(badDay).ok, false);
    const ok = policyOf({
      plan: [{ id: "a", mode: "people-recheck", when: { kind: "weekly", days: [1] }, at: "04:00" }],
    });
    assert.equal(canSavePolicy(ok).ok, true);
  });

  it("± неделя в карточке жива, мусор → 32", () => {
    assert.equal(scheduleOf({ id: "a", recheckDays: 7 }).recheckDays, 7);
    assert.equal(scheduleOf({ id: "a", recheckDays: 8 }).recheckDays, 32);
  });

  it("выкл автомат не ставит due", () => {
    const p = policyOf({
      planEnabled: false,
      plan: [{ id: "n", on: true, mode: "people-recheck", when: { kind: "daily" }, at: "04:00" }],
    });
    const now = msk(2026, 8, 15, 4, 3);
    const next = markPlanDue(p, now);
    assert.equal(next.plan[0].dueAt, "");
    assert.equal(pickDueRule(next), null);
  });

  it("слот после at по МСК в тот же день ставит due", () => {
    const p = policyOf({
      planEnabled: true,
      plan: [{ id: "n", on: true, mode: "people-recheck", when: { kind: "daily" }, at: "04:00" }],
    });
    const miss = markPlanDue(p, msk(2026, 8, 15, 3, 59));
    assert.equal(miss.plan[0].dueAt, "");
    const hit = markPlanDue(p, msk(2026, 8, 15, 4, 5));
    assert.ok(hit.plan[0].dueAt);
    assert.equal(pickDueRule(hit)?.id, "n");
    const late = markPlanDue(p, msk(2026, 8, 15, 4, 40));
    assert.ok(late.plan[0].dueAt);
    assert.equal(slotOpen(msk(2026, 8, 15, 4, 14), "04:00"), true);
    assert.equal(slotOpen(msk(2026, 8, 15, 4, 15), "04:00"), false);
    assert.equal(ymdOf(msk(2026, 8, 15, 4, 5)), "2026-09-15");
    assert.equal(mskWall(msk(2026, 8, 15, 4, 5)).h, 4);
  });

  it("пн и полгода — разные карточки", () => {
    const p = policyOf({
      planEnabled: true,
      plan: [
        { id: "full", mode: "people-recheck", when: { kind: "interval", every: 6, unit: "month" }, at: "04:00", recheckDays: 4000 },
        { id: "week", mode: "people-recheck", when: { kind: "daily" }, at: "04:15", recheckDays: 7 },
        { id: "mon", mode: "people-recheck", when: { kind: "weekly", days: [1] }, at: "18:00", recheckDays: 32 },
      ],
    });
    assert.equal(p.plan.length, 3);
    assert.equal(whenLabel(p.plan[0].when), "каждые 6 мес");
    const monday = msk(2026, 8, 14, 18, 2);
    assert.equal(whenHits(p.plan[2].when, monday), true);
    assert.equal(whenHits(p.plan[2].when, msk(2026, 8, 15, 18, 2)), false);
    const job = planRuleToJob(p.plan[1]);
    assert.equal(job.mode, "people-recheck");
    assert.equal(job.recheck, true);
    assert.equal(job.recheckDays, 7);
  });

  it("автомат в слот жмёт полный прогон живых", () => {
    const r = scheduleOf({ id: "a", mode: "auto", when: { kind: "daily" }, at: "04:00", dateFromId: "1" });
    assert.equal(r.mode, "auto");
    const job = planRuleToJob(r, msk(2026, 8, 15, 12, 0));
    assert.equal(job.mode, "roster-recheck");
    assert.equal(job.recheck, true);
    assert.equal(job.recheckDays, 365);
    assert.deepEqual(job.pipe, ["people", "groups", "archivesPupils", "groups-archived", "balance", "audit"]);
    const arch = scheduleOf({ id: "b", mode: "auto", study: "2", when: { kind: "daily" }, at: "04:00", dateFromId: "1" });
    assert.deepEqual(planRuleToJob(arch).pipe, ["people", "groups", "balance", "audit"]);
    assert.match(job.dateFrom, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("касса идёт тем же people + kind balance", () => {
    const r = scheduleOf({ id: "pay", mode: "balance", when: { kind: "daily" }, at: "05:00", dateFromId: "1" });
    const job = planRuleToJob(r, msk(2026, 8, 15, 12, 0));
    assert.equal(job.mode, "people");
    assert.equal(job.kind, "balance");
    assert.equal(job.recheck, false);
    assert.match(job.dateFrom, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("медленный добор берёт годы с карточки, не 2015 молча", () => {
    const r = scheduleOf({ id: "slow", mode: "people-slow", when: { kind: "daily" }, at: "04:00", dateFromId: "1" });
    const job = planRuleToJob(r, msk(2026, 8, 15, 12, 0));
    assert.equal(job.mode, "people-slow");
    assert.equal(job.dateFrom, "2025-09-15");
  });

  it("архив пульта: «с 2015» это 2015, два года — два", () => {
    const r = scheduleOf({ id: "a", mode: "people", study: "2", when: { kind: "daily" }, at: "04:00", dateFromId: "2015" });
    const job = planRuleToJob(r, msk(2026, 8, 15, 12, 0));
    assert.equal(job.study, "2");
    assert.equal(job.dateFrom, "2015-01-01");
    const two = scheduleOf({ id: "b", mode: "people", study: "2", when: { kind: "daily" }, at: "04:00", dateFromId: "2" });
    assert.equal(planRuleToJob(two, msk(2026, 8, 15, 12, 0)).dateFrom, "2024-09-15");
    const six = scheduleOf({ id: "c", mode: "auto", when: { kind: "daily" }, at: "04:00", dateFromId: "m6" });
    assert.equal(planRuleToJob(six, msk(2026, 8, 15, 12, 0)).dateFrom, "2026-03-15");
    assert.equal(planRuleToJob(six, msk(2026, 8, 15, 12, 0)).recheckDays, 182);
    const one = scheduleOf({ id: "d", mode: "people", when: { kind: "daily" }, at: "04:00", dateFromId: "m1" });
    assert.equal(planRuleToJob(one, msk(2026, 2, 31, 12, 0)).dateFrom, "2026-02-28");
  });

  it("окно чипа доезжает до джоба: месяцы не становятся одним, загрузка берёт дату", () => {
    const now = msk(2026, 8, 23, 12, 0);
    const ids = ["2015", "7", "3", "2", "1", "m6", "m4", "m2", "m1"] as const;
    for (const id of ids) {
      const days = planFromIdToRecheckDays(id);
      const auto = planRuleToJob(scheduleOf({ id: "a", mode: "auto", when: { kind: "daily" }, at: "04:00", dateFromId: id, recheckDays: days }), now);
      assert.equal(auto.recheckDays, days, id);
      assert.equal(auto.dateFrom, planDateFrom(id, now), id);
      const cal = planRuleToJob(scheduleOf({ id: "b", mode: "people", when: { kind: "daily" }, at: "04:00", dateFromId: id }), now);
      assert.equal(cal.recheck, false);
      assert.equal(cal.dateFrom, planDateFrom(id, now));
      const pay = planRuleToJob(scheduleOf({ id: "c", mode: "balance", when: { kind: "daily" }, at: "04:00", dateFromId: id }), now);
      assert.equal(pay.kind, "balance");
      assert.equal(pay.dateFrom, planDateFrom(id, now));
    }
    assert.equal(scheduleOf({ id: "m", mode: "auto", when: { kind: "daily" }, at: "04:00", dateFromId: "m2", recheckDays: 62 }).recheckDays, 62);
    assert.equal(scheduleOf({ id: "n", mode: "auto", when: { kind: "daily" }, at: "04:00", dateFromId: "m4", recheckDays: 122 }).recheckDays, 122);
    const slow = planRuleToJob(scheduleOf({ id: "s", mode: "people-slow", when: { kind: "daily" }, at: "04:00", dateFromId: "m6" }), now);
    assert.equal(slow.dateFrom, "2026-03-23");
    const step = planRuleToJob(scheduleOf({ id: "g", mode: "groups", when: { kind: "daily" }, at: "04:00", dateFromId: "7" }), now);
    assert.equal(step.dateFrom, "");
    const blue = planRuleToJob(scheduleOf({ id: "r", mode: "people-recheck", when: { kind: "weekly", days: [1] }, at: "18:00", recheckDays: 122 }), now);
    assert.equal(blue.recheck, true);
    assert.equal(blue.recheckDays, 122);
  });

  it("сохранение с экрана не затирает due воркера", () => {
    const disk = policyOf({
      planEnabled: true,
      plan: [{ id: "n", on: true, mode: "people-recheck", when: { kind: "daily" }, at: "04:00", dueAt: "2026-09-15T01:00:00.000Z", lastFiredAt: "prev" }],
    });
    const ui = policyOf({
      planEnabled: true,
      plan: [{ id: "n", on: false, mode: "people-recheck", when: { kind: "daily" }, at: "04:00" }],
    });
    const merged = mergePolicyKeepRun(disk, ui);
    assert.equal(merged.plan[0].on, false);
    assert.equal(merged.plan[0].dueAt, "2026-09-15T01:00:00.000Z");
    assert.equal(merged.plan[0].lastFiredAt, "prev");
    const moved = policyOf({
      planEnabled: true,
      plan: [{ id: "n", on: false, mode: "people-recheck", when: { kind: "daily" }, at: "18:00" }],
    });
    const shifted = mergePolicyKeepRun(disk, moved);
    assert.equal(shifted.plan[0].at, "18:00");
    assert.equal(shifted.plan[0].dueAt, "");
    assert.equal(shifted.plan[0].lastFiredAt, "prev");
  });

  it("воркер не затирает тумблер и новые карточки", () => {
    const disk = policyOf({
      planEnabled: false,
      plan: [
        { id: "n", on: true, mode: "people", when: { kind: "daily" }, at: "04:00" },
        { id: "new", on: true, mode: "audit", when: { kind: "daily" }, at: "05:00" },
      ],
    });
    const run = policyOf({
      planEnabled: true,
      plan: [{ id: "n", on: true, mode: "people", when: { kind: "daily" }, at: "04:00", dueAt: "2026-09-16T01:00:00.000Z", lastSkip: "hands" }],
    });
    const merged = mergePolicyRunStamps(disk, run.plan);
    assert.equal(merged.planEnabled, false);
    assert.equal(merged.plan.length, 2);
    assert.equal(merged.plan[0].dueAt, "2026-09-16T01:00:00.000Z");
    assert.equal(merged.plan[0].lastSkip, "hands");
    assert.equal(merged.plan[1].id, "new");
  });

  it("чужой джоб не считает карточку сработавшей", () => {
    assert.equal(planFireDecision({ id: "old", running: false }, { id: "new", running: true }), "fired");
    assert.equal(planFireDecision({ id: "old", running: false }, { id: "old", running: true }), "hands");
    assert.equal(planFireDecision({ id: "old", running: false }, { id: "new", running: false }), "empty");
    assert.equal(whenLabel({ kind: "nthWeekday", n: -1, day: 1 }), "последний пн месяца");
  });

  it("после старта due снимается, повтор в тот же день нет", () => {
    const p = markPlanDue(
      policyOf({
        planEnabled: true,
        plan: [{ id: "n", on: true, mode: "people", when: { kind: "daily" }, at: "04:00" }],
      }),
      msk(2026, 8, 15, 4, 1),
    );
    const fired = stampPlanFired(p, "n", "job-1", msk(2026, 8, 15, 4, 2));
    assert.equal(fired.plan[0].dueAt, "");
    assert.equal(fired.plan[0].lastJobId, "job-1");
    const again = markPlanDue(fired, msk(2026, 8, 15, 4, 10));
    assert.equal(again.plan[0].dueAt, "");
  });

  it("каждый день: догон вчера не даёт второй прогон до 04:00", () => {
    const ran = policyOf({
      planEnabled: true,
      plan: [
        {
          id: "n",
          on: true,
          mode: "people-recheck",
          when: { kind: "daily" },
          at: "04:00",
          lastFiredAt: msk(2026, 8, 13, 4, 5).toISOString(),
        },
      ],
    });
    assert.equal(markPlanDue(ran, msk(2026, 8, 15, 3, 30)).plan[0].dueAt, "");
    assert.ok(markPlanDue(ran, msk(2026, 8, 15, 4, 5)).plan[0].dueAt);
    const today = stampPlanFired(ran, "n", "j2", msk(2026, 8, 15, 3, 10));
    assert.equal(markPlanDue(today, msk(2026, 8, 15, 4, 5)).plan[0].dueAt, "");
  });

  it("пн 18:00: новая карточка во вт не стартует, уже бегавшая — догоняет <36 ч", () => {
    const fresh = policyOf({
      planEnabled: true,
      plan: [{ id: "mon", on: true, mode: "people-recheck", when: { kind: "weekly", days: [1] }, at: "18:00" }],
    });
    const tue = msk(2026, 8, 15, 8, 0);
    assert.equal(markPlanDue(fresh, tue).plan[0].dueAt, "");
    const ran = policyOf({
      planEnabled: true,
      plan: [
        {
          id: "mon",
          on: true,
          mode: "people-recheck",
          when: { kind: "weekly", days: [1] },
          at: "18:00",
          lastFiredAt: msk(2026, 8, 7, 18, 5).toISOString(),
        },
      ],
    });
    const catchUp = markPlanDue(ran, tue);
    assert.ok(catchUp.plan[0].dueAt);
    const tooLate = markPlanDue(ran, msk(2026, 8, 16, 10, 0));
    assert.equal(tooLate.plan[0].dueAt, "");
  });

  it("полгода — календарные месяцы, не 180 дней", () => {
    const fired = stampPlanFired(
      policyOf({
        planEnabled: true,
        plan: [{ id: "full", on: true, mode: "people-recheck", when: { kind: "interval", every: 6, unit: "month" }, at: "04:00", recheckDays: 4000 }],
      }),
      "full",
      "j1",
      msk(2026, 2, 15, 4, 2),
    );
    assert.equal(markPlanDue(fired, msk(2026, 8, 14, 4, 5)).plan[0].dueAt, "");
    assert.ok(markPlanDue(fired, msk(2026, 8, 15, 4, 5)).plan[0].dueAt);
  });

  it("полгода: пропуск старше 36 ч не хоронит карточку навсегда", () => {
    const fired = stampPlanFired(
      policyOf({
        planEnabled: true,
        plan: [{ id: "full", on: true, mode: "people-recheck", when: { kind: "interval", every: 6, unit: "month" }, at: "04:00", recheckDays: 4000 }],
      }),
      "full",
      "j1",
      msk(2026, 2, 15, 4, 2),
    );
    const late = markPlanDue(fired, msk(2026, 8, 17, 10, 0));
    assert.equal(late.plan[0].dueAt, "");
    const nxt = nextSlotAt(fired.plan[0], msk(2026, 8, 17, 10, 0));
    assert.equal(ymdOf(nxt!), "2027-03-15");
    assert.ok(markPlanDue(fired, msk(2027, 2, 15, 4, 5)).plan[0].dueAt);
  });

  it("ночной автомат без лидов — skipLeads", () => {
    const r = scheduleOf({ id: "a", mode: "auto", leads: false, when: { kind: "daily" }, at: "04:00", dateFromId: "1" });
    assert.equal(r.leads, false);
    assert.equal(planRuleToJob(r).skipLeads, true);
    const on = scheduleOf({ id: "b", mode: "auto", when: { kind: "daily" }, at: "04:00" });
    assert.equal(on.leads, true);
    assert.equal(Boolean(planRuleToJob(on).skipLeads), false);
  });

  it("14 дней: ежедневный слот и пауза видны", () => {
    const plan = [
      scheduleOf({ id: "night", on: true, label: "Ночь", mode: "audit", when: { kind: "daily" }, at: "04:00" }),
      scheduleOf({ id: "off", on: false, label: "Пауза", mode: "people-recheck", when: { kind: "weekly", days: [1] }, at: "05:00" }),
    ];
    const days = planHorizon(plan, 14, msk(2026, 8, 14, 3, 0));
    const withHits = days.filter((d) => d.hits.some((h) => h.id === "night"));
    assert.equal(withHits.length, 14);
    assert.ok(days.some((d) => d.hits.some((h) => h.id === "off" && h.on === false)));
    const interval = [
      scheduleOf({ id: "slow", on: true, mode: "people-recheck", when: { kind: "interval", every: 6, unit: "month" }, at: "04:00" }),
    ];
    const bare = planHorizon(interval, 14, msk(2026, 8, 14, 3, 0));
    assert.equal(bare.reduce((n, d) => n + d.hits.length, 0), 0);
  });

  it("руки не сжигают слот: due снимается, на завтра due снова", () => {
    const due = msk(2026, 8, 15, 4, 0).toISOString();
    const p = policyOf({
      planEnabled: true,
      plan: [{ id: "n", on: true, mode: "auto", when: { kind: "daily" }, at: "04:00", dueAt: due }],
    });
    const skipped = stampPlanSkip(p, "hands", msk(2026, 8, 15, 4, 5));
    assert.equal(skipped.plan[0].dueAt, "");
    assert.equal(skipped.plan[0].lastSkip, "hands");
    const same = markPlanDue(skipped, msk(2026, 8, 15, 12, 0));
    assert.equal(same.plan[0].dueAt, "");
    const nxt = markPlanDue(skipped, msk(2026, 8, 16, 4, 1));
    assert.ok(nxt.plan[0].dueAt);
    assert.notEqual(nxt.plan[0].lastSkip, "expired");
  });

  it("две карточки 04:00: руки на второй не expired через 36 ч", () => {
    const old = msk(2026, 8, 14, 4, 0).toISOString();
    const p = policyOf({
      planEnabled: true,
      plan: [{ id: "b", on: true, mode: "auto", when: { kind: "daily" }, at: "04:00", dueAt: old, lastSkip: "hands" }],
    });
    const marked = markPlanDue(p, msk(2026, 8, 16, 12, 0));
    assert.equal(marked.plan[0].lastSkip, "hands");
    assert.notEqual(marked.plan[0].lastSkip, "expired");
    assert.equal(marked.plan[0].dueAt, "");
  });

  it("лог сессии — старт и done с одним jobId одна строка", () => {
    const rows = planLogSessions([
      { at: "2", kind: "done", text: "готово", jobId: "j1" },
      { at: "1", kind: "start", text: "старт автомат", jobId: "j1" },
      { at: "0", kind: "start", text: "другой", jobId: "j2" },
    ], 10);
    assert.equal(rows.length, 2);
    assert.match(String(rows[0].text), /старт автомат/);
    assert.match(String(rows[0].text), /готово/);
  });


  it("ночной автомат без архива групп — короткая труба", () => {
    const r = scheduleOf({ id: "a", mode: "auto", archGroups: false, when: { kind: "daily" }, at: "04:00", dateFromId: "1" });
    assert.deepEqual(planRuleToJob(r).pipe, ["people", "groups", "balance", "audit"]);
  });

  it("интервал без lastFired не due сразу после 04:00", () => {
    const p = policyOf({
      planEnabled: true,
      plan: [{ id: "i", on: true, mode: "auto", when: { kind: "interval", every: 6, unit: "month" }, at: "04:00" }],
    });
    const marked = markPlanDue(p, msk(2026, 8, 15, 15, 0));
    assert.equal(marked.plan[0].dueAt, "");
    assert.ok(marked.plan[0].lastFiredAt);
  });

});
