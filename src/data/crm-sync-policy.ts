import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  POLICY_FACTORY,
  canSavePolicy,
  mergePolicyKeepRun,
  policyOf,
  type CrmSyncPolicy,
} from "./crm-sync-policy-core.ts";

export type { CrmSyncPolicy, HistorySchedule, HistoryPlanMode, HistoryWhen } from "./crm-sync-policy-core.ts";
export {
  HISTORY_PLAN_MODES,
  PLAN_RECHECK_OPTS,
  PLAN_FROM_OPTS,
  POLICY_FACTORY,
  canSavePolicy,
  emptyDraft,
  mergePolicyKeepRun,
  nextSlotAt,
  planFireDecision,
  planModeMeta,
  planRuleToJob,
  policyOf,
  whenLabel,
  ymdOf,
} from "./crm-sync-policy-core.ts";

function fileOf() {
  return join(process.cwd(), "storage", "crm-sync-policy.json");
}

export function loadSyncPolicy(): CrmSyncPolicy {
  try {
    if (!existsSync(fileOf())) return { ...POLICY_FACTORY, plan: [] };
    return policyOf(JSON.parse(readFileSync(fileOf(), "utf8")));
  } catch {
    return { ...POLICY_FACTORY, plan: [] };
  }
}

export function saveSyncPolicy(
  patch: Partial<CrmSyncPolicy> | CrmSyncPolicy,
  opts?: { keepRun?: boolean },
): { ok: true; policy: CrmSyncPolicy } | { ok: false; error: string; policy: CrmSyncPolicy } {
  const cur = loadSyncPolicy();
  let next = policyOf({
    planEnabled: patch.planEnabled ?? cur.planEnabled,
    plan: Array.isArray(patch.plan) ? patch.plan : cur.plan,
  });
  if (opts?.keepRun) next = mergePolicyKeepRun(cur, next);
  const gate = canSavePolicy(next);
  if (!gate.ok) return { ok: false, error: gate.error, policy: cur };
  const file = fileOf();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(next, null, 2) + "\n", "utf8");
  if (cur.planEnabled !== next.planEnabled) {
    void import("./crm-sync-plan-log.ts")
      .then(({ appendPlanLog }) =>
        appendPlanLog({
          kind: "toggle",
          text: next.planEnabled ? "Синхронизация расписания включена." : "Синхронизация расписания выключена.",
          reason: next.planEnabled ? "on" : "off",
        }),
      )
      .catch(() => undefined);
  }
  return { ok: true, policy: next };
}