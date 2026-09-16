import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { mergePlanLog, planLogSyncs, PLAN_LOG_MAX, type PlanLogEvent } from "./crm-sync-plan-log.ts";

describe("лог пульта", () => {
  it("новые сверху, не больше 40, синхронизации — старт и готово", () => {
    const row = (n: number, kind: PlanLogEvent["kind"] = "start"): PlanLogEvent => ({
      at: `2026-09-16T${String(n).padStart(2, "0")}:00:00.000Z`,
      kind,
      text: `событие ${n}`,
      who: n === 1 ? "Епифанов" : "",
      cid: n === 1 ? 12 : 0,
    });
    const first = mergePlanLog([], row(1));
    assert.equal(first[0].who, "Епифанов");
    let cur: PlanLogEvent[] = [];
    for (let i = 0; i < 50; i += 1) cur = mergePlanLog(cur, row(i, i % 3 === 0 ? "done" : "start"));
    const syncs = planLogSyncs(cur, 10);
    assert.ok(syncs.length <= 10);
    assert.ok(syncs.every((e) => e.kind === "start" || e.kind === "done"));
  });

  it("пишет воркер, экран только читает", () => {
    const job = readFileSync(new URL("./crm-journal-job.ts", import.meta.url), "utf8");
    const pull = readFileSync(new URL("./crm-journal-pull.ts", import.meta.url), "utf8");
    const ui = readFileSync(new URL("../components/admin-history-plan.tsx", import.meta.url), "utf8");
    const pol = readFileSync(new URL("./crm-sync-policy.ts", import.meta.url), "utf8");
    assert.match(job, /appendPlanLog/);
    assert.match(job, /kind: "fail"/);
    assert.match(job, /kind: "skip"/);
    assert.match(pull, /planLog: loadPlanLog/);
    assert.match(pol, /kind: "toggle"/);
    assert.match(ui, /Последние синхронизации/);
    assert.match(ui, /События/);
    assert.doesNotMatch(ui, /from "\.\/crm-sync-plan-log"/);
  });
});
