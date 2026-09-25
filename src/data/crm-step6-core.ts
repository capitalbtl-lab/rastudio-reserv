export function isApiLeadStudy(raw: unknown) {
  return raw === false || raw === 0 || raw === "0";
}

export function isApiClientStudy(raw: unknown) {
  return raw === true || raw === 1 || raw === "1";
}

/** Номер колонки. null — в колонку не класть. «Не разобрано» только если такое имя на этой доске ровно одно. */
export function step6ColumnId(leadStatusIds: unknown, stages: { id: number; name: string }[]): number | null {
  const raw = leadStatusIds;
  if (Array.isArray(raw)) {
    if (raw.length > 1) return null;
    if (raw.length === 1) {
      const n = Number(raw[0]);
      return Number.isFinite(n) ? n : null;
    }
  } else if (raw != null && raw !== "") {
    return null;
  }
  const named = stages.filter((s) => String(s.name || "").trim() === "Не разобрано");
  return named.length === 1 ? named[0].id : null;
}
