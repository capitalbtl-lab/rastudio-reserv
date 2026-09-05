/** Вход из Alfa. Невыгруженная очередь старше. Свои id < 0 не затираем. */

export function inboundTake(opts: { pending?: boolean }) {
  return opts.pending ? ("skip" as const) : ("alfa" as const);
}

export function pendingEntityIds(
  jobs: { op: string; entityId?: number; body?: { localId?: number } }[],
  ops?: string[],
) {
  const hold = new Set<number>();
  for (const j of jobs) {
    if (ops && !ops.includes(j.op)) continue;
    const id = Number(j.entityId) || 0;
    if (id) hold.add(id);
    const local = Number(j.body?.localId) || 0;
    if (local) hold.add(local);
  }
  return hold;
}

function lessonKey(x: { lessonId?: number; date?: string; from?: string }) {
  const lid = Number(x.lessonId) || 0;
  return lid ? `id:${lid}` : `d:${x.date || ""}|${x.from || ""}`;
}

function held(x: { lessonId?: number }, hold: Set<number>) {
  const lid = Number(x.lessonId) || 0;
  return lid < 0 || hold.has(lid);
}

export function mergeJournalInbound<T extends { lessonId?: number; date?: string; from?: string }>(
  pulled: T[],
  prev: T[] | undefined,
  holdIds: Iterable<number> = [],
  mode: "replace" | "union" = "replace",
): T[] {
  const hold = new Set([...holdIds].map(Number).filter((n) => n));
  if (mode === "union") {
    const map = new Map<string, T>();
    for (const x of prev || []) map.set(lessonKey(x), x);
    for (const p of pulled) {
      if (held(p, hold)) continue;
      const k = lessonKey(p);
      const cur = map.get(k);
      if (cur && held(cur, hold)) continue;
      map.set(k, p);
    }
    return [...map.values()].sort(
      (a, b) => String(a.date).localeCompare(String(b.date)) || String(a.from || "").localeCompare(String(b.from || "")),
    );
  }
  const keep = (prev || []).filter((x) => held(x, hold));
  if (!keep.length) return pulled;
  const out = [...pulled];
  for (const loc of keep) {
    const k = lessonKey(loc);
    const i = out.findIndex((c) => lessonKey(c) === k);
    if (i >= 0) out[i] = loc;
    else out.push(loc);
  }
  return out.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.from || "").localeCompare(String(b.from || "")));
}

export function journalFingerprint(lessons: { lessonId?: number; status?: number; date?: string; from?: string; customerIds?: number[] }[]) {
  return (lessons || [])
    .map((x) => `${x.lessonId || 0}|${x.date || ""}|${x.from || ""}|${x.status || 0}|${(x.customerIds || []).join(",")}`)
    .sort()
    .join(";");
}
