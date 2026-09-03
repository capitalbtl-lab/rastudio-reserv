import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { LEAD_STAGES } from "./crm-leads-stages";
import { FUNNEL_AUTO_DEFAULT, type FunnelAuto, type FunnelAutoEvent } from "./funnel-auto-core";

export { FUNNEL_AUTO_DEFAULT, type FunnelAuto, type FunnelAutoEvent } from "./funnel-auto-core";

function fileOf() {
  return join(process.cwd(), "storage", "funnel-auto.json");
}

function asRule(raw: Partial<FunnelAuto> | null | undefined): FunnelAuto {
  const n = (v: unknown, fallback: number) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? x : fallback;
  };
  return {
    siteOn: raw?.siteOn !== false,
    siteStageId: n(raw?.siteStageId, FUNNEL_AUTO_DEFAULT.siteStageId),
    groupOn: raw?.groupOn !== false,
    groupStageId: n(raw?.groupStageId, FUNNEL_AUTO_DEFAULT.groupStageId),
    tariffOn: raw?.tariffOn !== false,
    tariffStageId: n(raw?.tariffStageId, FUNNEL_AUTO_DEFAULT.tariffStageId),
    skipIfPaid: raw?.skipIfPaid !== false,
  };
}

export function loadFunnelAuto(): FunnelAuto {
  try {
    if (!existsSync(fileOf())) return { ...FUNNEL_AUTO_DEFAULT };
    return asRule(JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<FunnelAuto>);
  } catch {
    return { ...FUNNEL_AUTO_DEFAULT };
  }
}

export function saveFunnelAuto(patch: Partial<FunnelAuto>): FunnelAuto {
  const next = asRule({ ...loadFunnelAuto(), ...patch });
  const file = fileOf();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(next, null, 2), "utf8");
  return next;
}

function paidId(rules: FunnelAuto) {
  return Number(rules.tariffStageId) || 4;
}

function stageOn(rules: FunnelAuto, event: FunnelAutoEvent) {
  if (event === "site") return rules.siteOn ? rules.siteStageId : null;
  if (event === "group") return rules.groupOn ? rules.groupStageId : null;
  return rules.tariffOn ? rules.tariffStageId : null;
}

/** null — не двигать. Только лиды (is_study 0 или клиент, которого вернули в воронку). */
export function resolveFunnelAuto(
  event: FunnelAutoEvent,
  ctx: { isStudy?: number; statusId?: number },
  rules: FunnelAuto = FUNNEL_AUTO_DEFAULT,
): number | null {
  if (Number(ctx.isStudy) === 2) return null;
  if (Number(ctx.isStudy) === 1 && !Number(ctx.statusId)) return null;
  const target = stageOn(rules, event);
  if (target == null || !Number.isFinite(Number(target))) return null;
  const to = Number(target);
  const from = Number(ctx.statusId);
  if (Number.isFinite(from) && from === to) return null;
  if (event === "group" && rules.skipIfPaid && Number.isFinite(from) && from === paidId(rules)) return null;
  return to;
}

export function funnelAutoHint(rules: FunnelAuto = FUNNEL_AUTO_DEFAULT) {
  const name = (id: number) => LEAD_STAGES.find((s) => s.id === id)?.name || `этап ${id}`;
  return {
    site: rules.siteOn ? `заявка с сайта → ${name(rules.siteStageId)}` : "заявка с сайта: вручную",
    group: rules.groupOn ? `в группу → ${name(rules.groupStageId)}` : "в группу: этап не менять",
    tariff: rules.tariffOn ? `абонемент или оплата → ${name(rules.tariffStageId)}` : "оплата: этап не менять",
  };
}

export async function applyFunnelAuto(
  event: FunnelAutoEvent,
  ctx: { customerId: number; branchId: number; isStudy?: number; statusId?: number },
) {
  const id = Number(ctx.customerId) || 0;
  const branch = Number(ctx.branchId) || 0;
  if (!id || !branch) return { ok: true as const, skipped: true as const };
  const rules = loadFunnelAuto();
  const statusId = resolveFunnelAuto(event, ctx, rules);
  if (statusId == null) return { ok: true as const, skipped: true as const };
  try {
    const { moveLead } = await import("./crm-leads");
    await moveLead(branch, id, statusId);
    return { ok: true as const, statusId };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "не сдвинула этап" };
  }
}
