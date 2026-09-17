/** Сессия шага 5. Очередь шагов 1–4 не трогает. */

import { step5CanSverka } from "./crm-step5-canon";

let stop = false;
let kind = "";
const complete = new Set<number>();

export function step5SessionStart(nextKind: string) {
  stop = false;
  kind = String(nextKind || "");
  complete.clear();
}

export function step5SessionStop() {
  stop = true;
}

export function step5SessionStopped() {
  return stop;
}

export function step5SessionKind() {
  return kind;
}

export function step5CompleteAdd(cid: number) {
  const id = Number(cid) || 0;
  if (id) complete.add(id);
}

export function step5CompleteHas(cid: number) {
  return complete.has(Number(cid) || 0);
}

export function step5CompleteClear() {
  complete.clear();
}

export async function step5WaitOrStop(ms: number) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (stop) return false;
    const left = ms - (Date.now() - t0);
    await new Promise((r) => setTimeout(r, Math.min(1000, Math.max(0, left))));
  }
  return !stop;
}

export function step5QueueMode(name?: string, recheck?: boolean) {
  const raw = String(name || "");
  if (/stale=1/.test(raw)) return "stale" as const;
  if (recheck || /recheck=1/.test(raw)) return "blue" as const;
  return "red" as const;
}

export function step5QueuePass(p: {
  hasDossier: boolean;
  payFilled: boolean;
  livePays: number;
  isStudy: unknown;
  removed: unknown;
  inArchiveSet: boolean;
  pending: boolean;
  hasH: boolean;
  c: boolean;
  mode: "red" | "blue" | "stale";
}) {
  if (!step5CanSverka(p)) return false;
  if (p.pending) return false;
  if (p.mode === "red") return !p.hasH;
  if (p.mode === "blue") return p.hasH && !p.c;
  return p.hasH && p.c;
}
