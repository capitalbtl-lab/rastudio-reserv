export function isApiLeadStudy(raw: unknown) {
  return raw === false || raw === 0 || raw === "0";
}

export function isApiClientStudy(raw: unknown) {
  return raw === true || raw === 1 || raw === "1";
}

/** Номер колонки. null — в колонку не класть. Пустой этап — «Не разобрано». */
export function step6ColumnId(leadStatusIds: unknown, stages: { id: number; name: string }[], leadStatusId?: unknown): number | null {
  if (!(leadStatusIds == null || leadStatusIds === "")) {
    const list = idList(leadStatusIds);
    const rawCount = Array.isArray(leadStatusIds)
      ? leadStatusIds.length
      : leadStatusIds && typeof leadStatusIds === "object"
        ? Object.keys(leadStatusIds as Record<string, unknown>).length
        : 1;
    if (rawCount > 0 && list.length === 0) return null;
    if (list.length > 1) return null;
    if (list.length === 1) return list[0];
  }
  if (leadStatusId != null && leadStatusId !== "" && leadStatusId !== false) {
    const n = Number(leadStatusId);
    if (Number.isFinite(n) && n > 0) return n;
    if (!Number.isFinite(n)) return null;
  }
  return unsortedColumn(stages);
}

function idList(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  if (raw && typeof raw === "object") {
    return Object.values(raw as Record<string, unknown>).map((x) => Number(x)).filter((n) => Number.isFinite(n));
  }
  const n = Number(raw);
  return Number.isFinite(n) ? [n] : [];
}

function unsortedColumn(stages: { id: number; name: string }[]): number | null {
  const named = stages.filter((s) => String(s.name || "").trim() === "Не разобрано");
  if (named.length > 1) return null;
  if (named.length === 1) return named[0].id;
  return 0;
}
