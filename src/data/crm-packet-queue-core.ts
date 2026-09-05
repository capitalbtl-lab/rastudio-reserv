export type CrmPacket =
  | { id: string; kind: "overlay"; offset: number }
  | { id: string; kind: "group"; branchId: number; groupId: number; name?: string }
  | { id: string; kind: "customers"; branchId: number; ids: number[] };

export type CrmQueueState = {
  packets: CrmPacket[];
  lastAt: string;
  lastNote: string;
};

export function emptyCrmQueue(): CrmQueueState {
  return { packets: [], lastAt: "", lastNote: "" };
}

export function nidPacket() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Один overlay в очереди, с меньшим offset. Группы без дублей. Ученики сливаются по филиалу. */
export function mergeCrmPacket(packets: CrmPacket[], incoming: Omit<CrmPacket, "id"> & { id?: string }): CrmPacket[] {
  const id = incoming.id || nidPacket();
  if (incoming.kind === "overlay") {
    const rest = packets.filter((p) => p.kind !== "overlay");
    const old = packets.find((p) => p.kind === "overlay");
    const offset = Math.min(Number(incoming.offset) || 0, old && old.kind === "overlay" ? old.offset : Number(incoming.offset) || 0);
    return [{ id: old?.id || id, kind: "overlay", offset }, ...rest];
  }
  if (incoming.kind === "group") {
    if (packets.some((p) => p.kind === "group" && p.groupId === incoming.groupId && p.branchId === incoming.branchId)) return packets;
    return [...packets, { id, kind: "group", branchId: incoming.branchId, groupId: incoming.groupId, name: incoming.name }];
  }
  const rest = packets.filter((p) => !(p.kind === "customers" && p.branchId === incoming.branchId));
  const old = packets.find((p) => p.kind === "customers" && p.branchId === incoming.branchId);
  const ids = [...new Set([...(old && old.kind === "customers" ? old.ids : []), ...incoming.ids])].filter((n) => n > 0).slice(0, 80);
  return [...rest, { id: old?.id || id, kind: "customers", branchId: incoming.branchId, ids }];
}

export function overlayStale(opts: { cache: boolean; ttlMin: number; overlayAt: string; overlayNext: number; overlayTotal: number; now?: number }) {
  if (!opts.cache) return true;
  if (!opts.overlayTotal || opts.overlayNext < opts.overlayTotal) return true;
  const t = Date.parse(opts.overlayAt);
  if (!Number.isFinite(t) || t <= 0) return true;
  return (opts.now || Date.now()) - t >= opts.ttlMin * 60_000;
}

export function pickNextPacket(packets: CrmPacket[]) {
  return packets.find((p) => p.kind !== "overlay") || packets[0] || null;
}

/** Не гонять cgi-круг заново, если он уже дошёл и TTL живой. */
export function overlayEnqueueOffset(opts: { fromStart?: boolean; overlayNext: number; overlayTotal: number; stale: boolean }) {
  const finished = opts.overlayTotal > 0 && opts.overlayNext >= opts.overlayTotal;
  if (!opts.fromStart && finished && !opts.stale) return { skip: true, offset: opts.overlayNext, restart: false };
  const restart = Boolean(opts.fromStart || (finished && opts.stale));
  return { skip: false, offset: restart ? 0 : Math.max(0, Number(opts.overlayNext) || 0), restart };
}
