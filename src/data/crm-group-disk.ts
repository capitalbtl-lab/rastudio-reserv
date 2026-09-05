/** Связь ученика с группой на диске сайта: только ID, не имя. */
export function groupLinkHits(links: { id: number; branchId?: number }[] | undefined, branchId: number, groupId: number) {
  const gid = Number(groupId) || 0;
  const bid = Number(branchId) || 0;
  if (!gid) return false;
  return (links || []).some((g) => Number(g.id) === gid && (!bid || !g.branchId || Number(g.branchId) === bid));
}

type DiskLink = { id: number; branchId?: number; active?: boolean };

/** Счётчик состава: живые связи groupLinks, не явка. Ключ branchId:groupId. */
export function takenMapFromLinks(items: { groupLinks?: DiskLink[] }[]) {
  const map = new Map<string, number>();
  for (const d of items) {
    for (const g of d.groupLinks || []) {
      const gid = Number(g.id) || 0;
      if (!gid || g.active === false) continue;
      const key = `${Number(g.branchId) || 0}:${gid}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
  }
  return map;
}

export function takenOfGroup(map: Map<string, number>, branchId: number, groupId: number, fallback = 0) {
  const gid = Number(groupId) || 0;
  if (!gid) return fallback;
  const bid = Number(branchId) || 0;
  const exact = map.get(`${bid}:${gid}`);
  if (exact != null) return exact;
  const loose = map.get(`0:${gid}`);
  return loose != null ? loose : fallback;
}

/** cgi в Alfa не нужен, если состав уже на диске или группа пустая. */
export function overlayCgiNeeded(diskCount: number, taken: number) {
  return Number(diskCount) <= 0 && Number(taken) > 0;
}

export function groupLinkKey(branchId: number | undefined, groupId: number) {
  return `${Number(branchId) || 0}:${Number(groupId) || 0}`;
}

type CgiLink = {
  id: number;
  branchId?: number;
  name?: string;
  school?: string;
  active?: boolean;
  subjectId?: number;
  courseId?: string;
};

/** Полный cgi человека: эти группы активны, остальные на диске — нет. Пустой cgi ничего не гасит. */
export function mergeCgiGroupLinks<T extends CgiLink>(prev: T[] | undefined, cgi: T[]): T[] {
  const was = prev || [];
  if (!cgi.length) return [...was];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const g of cgi) {
    const gid = Number(g.id) || 0;
    if (!gid) continue;
    const key = groupLinkKey(g.branchId, gid);
    if (seen.has(key)) continue;
    seen.add(key);
    const old = was.find((x) => groupLinkKey(x.branchId, x.id) === key);
    out.push({ ...(old as T), ...g, id: gid, active: true });
  }
  for (const old of was) {
    const gid = Number(old.id) || 0;
    if (!gid) continue;
    const key = groupLinkKey(old.branchId, gid);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...old, active: false });
  }
  return out;
}
