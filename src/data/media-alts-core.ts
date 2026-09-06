let alts: Record<string, string> = {};

export function hydrateMediaAlts(next: Record<string, string> = {}) {
  alts = next && typeof next === "object" ? { ...next } : {};
}

export function mediaAlt(src: string, fallback = "") {
  const hit = alts[String(src || "").split("?")[0]];
  return (hit || fallback || "").trim();
}

export function allMediaAlts() {
  return alts;
}
