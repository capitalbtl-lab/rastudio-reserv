import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  POLICY_FACTORY,
  canSavePolicy,
  markPlanDue,
  pickDueRule,
  planRuleToJob,
  policyOf,
  scheduleOf,
  slotOpen,
  stampPlanFired,
  whenHits,
  whenLabel,
} from "./crm-sync-policy-core.ts";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "crm-sync-policy-core.ts"), "utf8");

describe("пульт Истории", () => {
  it("ядро без fs и Alfa", () => {
    assert.doesNotMatch(src, /from ["']node:fs["']/);
    assert.doesNotMatch(src, /s20\.online/);
    assert.doesNotMatch(src, /alfacrm/);
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
    const now = new Date(2026, 8, 15, 4, 3, 0);
    const next = markPlanDue(p, now);
    assert.equal(next.plan[0].dueAt, "");
    assert.equal(pickDueRule(next), null);
  });

  it("слот 04:00–04:14, потом due; руки не сжигают", () => {
    const p = policyOf({
      planEnabled: true,
      plan: [{ id: "n", on: true, mode: "people-recheck", when: { kind: "daily" }, at: "04:00" }],
    });
    const miss = markPlanDue(p, new Date(2026, 8, 15, 3, 59, 0));
    assert.equal(miss.plan[0].dueAt, "");
    const hit = markPlanDue(p, new Date(2026, 8, 15, 4, 5, 0));
    assert.ok(hit.plan[0].dueAt);
    assert.equal(pickDueRule(hit)?.id, "n");
    assert.equal(slotOpen(new Date(2026, 8, 15, 4, 14, 0), "04:00"), true);
    assert.equal(slotOpen(new Date(2026, 8, 15, 4, 15, 0), "04:00"), false);
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
    const monday = new Date(2026, 8, 14, 18, 2, 0);
    assert.equal(whenHits(p.plan[2].when, monday), true);
    assert.equal(whenHits(p.plan[2].when, new Date(2026, 8, 15, 18, 2, 0)), false);
    const job = planRuleToJob(p.plan[1]);
    assert.equal(job.mode, "people-recheck");
    assert.equal(job.recheck, true);
    assert.equal(job.recheckDays, 7);
  });

  it("касса идёт тем же people + kind balance", () => {
    const r = scheduleOf({ id: "pay", mode: "balance", when: { kind: "daily" }, at: "05:00", dateFromId: "1" });
    const job = planRuleToJob(r, new Date(2026, 8, 15));
    assert.equal(job.mode, "people");
    assert.equal(job.kind, "balance");
    assert.equal(job.recheck, false);
    assert.match(job.dateFrom, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("после старта due снимается, повтор в тот же день нет", () => {
    const p = markPlanDue(
      policyOf({
        planEnabled: true,
        plan: [{ id: "n", on: true, mode: "people", when: { kind: "daily" }, at: "04:00" }],
      }),
      new Date(2026, 8, 15, 4, 1, 0),
    );
    const fired = stampPlanFired(p, "n", "job-1", new Date(2026, 8, 15, 4, 2, 0));
    assert.equal(fired.plan[0].dueAt, "");
    assert.equal(fired.plan[0].lastJobId, "job-1");
    const again = markPlanDue(fired, new Date(2026, 8, 15, 4, 10, 0));
    assert.equal(again.plan[0].dueAt, "");
  });
});
