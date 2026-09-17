/** Сессия шага 5. Очередь шагов 1–4 не трогает. */

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
