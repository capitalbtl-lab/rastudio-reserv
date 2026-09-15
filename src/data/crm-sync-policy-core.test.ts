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
  mskWall,
  nextSlotAt,
  pickDueRule,
  planFireDecision,
  planRuleToJob,
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
});
