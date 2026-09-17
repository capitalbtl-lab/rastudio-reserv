/** Лог пульта синхронизации. Диск, без Alfa. */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type PlanLogKind = "start" | "skip" | "fail" | "stop" | "done" | "pipe" | "toggle";

export type PlanLogEvent = {
  at: string;
  kind: PlanLogKind;
  text: string;
  who?: string;
  cid?: number;
  mode?: string;
  reason?: string;
  jobId?: string;
  src?: "hands" | "plan";
};

const KINDS = new Set<PlanLogKind>(["start", "skip", "fail", "stop", "done", "pipe", "toggle"]);
export const PLAN_LOG_MAX = 40;
export const PLAN_LOG_SYNCS = 10;

function fileOf() {
  return join(process.cwd(), "storage", "crm-sync-plan-log.json");
}

function eventOf(raw: unknown): PlanLogEvent | null {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const kind = String(r.kind || "") as PlanLogKind;
  if (!KINDS.has(kind)) return null;
  const text = String(r.text || "").trim().slice(0, 280);
  if (!text) return null;
  const cid = Number(r.cid) || 0;
  const who = String(r.who || "").trim().slice(0, 80);
  return {
    at: String(r.at || ""),
    kind,
    text,
    who: who || undefined,
    cid: cid || undefined,
    mode: String(r.mode || "") || undefined,
    reason: String(r.reason || "") || undefined,
    jobId: String(r.jobId || "") || undefined,
    src: r.src === "plan" || r.src === "hands" ? r.src : undefined,
  };
}

export function mergePlanLog(cur: PlanLogEvent[], row: PlanLogEvent, max = PLAN_LOG_MAX): PlanLogEvent[] {
  return [row, ...cur.filter((e) => e.at !== row.at || e.text !== row.text || e.kind !== row.kind)].slice(0, max);
}

export function planLogSyncs(log: PlanLogEvent[], n = PLAN_LOG_SYNCS): PlanLogEvent[] {
  const out: PlanLogEvent[] = [];
  const seen = new Set<string>();
  for (const e of log) {
    if (e.kind !== "start" && e.kind !== "done" && e.kind !== "fail" && e.kind !== "stop") continue;
    const key = e.jobId || `${e.at}|${e.kind}`;
    if (e.jobId && seen.has(e.jobId)) continue;
    if (e.jobId) seen.add(e.jobId);
    const pair =
      e.jobId && e.kind === "start"
        ? log.find((x) => x.jobId === e.jobId && (x.kind === "done" || x.kind === "fail" || x.kind === "stop"))
        : e.jobId && e.kind !== "start"
          ? log.find((x) => x.jobId === e.jobId && x.kind === "start")
          : undefined;
    if (e.kind === "start" && pair) {
      out.push({
        ...e,
        kind: pair.kind === "done" ? "done" : pair.kind,
        text: `${e.text} → ${pair.text}`,
      });
    } else if (e.kind !== "start" && pair) {
      out.push({
        ...pair,
        kind: e.kind === "done" ? "done" : e.kind,
        text: `${pair.text} → ${e.text}`,
        at: pair.at || e.at,
      });
    } else {
      out.push(e);
    }
    if (out.length >= n) break;
  }
  return out;
}

export function loadPlanLog(): PlanLogEvent[] {
  try {
    if (!existsSync(fileOf())) return [];
    const raw = JSON.parse(readFileSync(fileOf(), "utf8"));
    const list = Array.isArray(raw) ? raw : [];
    return list.map(eventOf).filter((e): e is PlanLogEvent => Boolean(e)).slice(0, PLAN_LOG_MAX);
  } catch {
    return [];
  }
}

export function appendPlanLog(patch: Omit<PlanLogEvent, "at"> & { at?: string }): PlanLogEvent[] {
  const row = eventOf({ ...patch, at: patch.at || new Date().toISOString() });
  if (!row) return loadPlanLog();
  const next = mergePlanLog(loadPlanLog(), row);
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify(next) + "\n", "utf8");
  return next;
}
