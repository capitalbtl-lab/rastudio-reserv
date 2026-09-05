import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_CACHE_RULES, type CacheKind, type CachePolicy, type CacheRule } from "./crm-cache-policy-core";

export type { CacheKind, CachePolicy, CacheRule };
export { CACHE_KIND_META, DEFAULT_CACHE_RULES } from "./crm-cache-policy-core";

function fileOf() {
  return join(process.cwd(), "storage", "crm-cache-policy.json");
}

function empty(): CachePolicy {
  return { at: "", overlayAt: "", overlayNext: 0, overlayTotal: 0, journalAt: "", journalNext: 0, journalTotal: 0, rules: { ...DEFAULT_CACHE_RULES } };
}

export function loadCachePolicy(): CachePolicy {
  const base = empty();
  try {
    if (!existsSync(fileOf())) return base;
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<CachePolicy>;
    const rules = { ...DEFAULT_CACHE_RULES };
    for (const k of Object.keys(DEFAULT_CACHE_RULES) as CacheKind[]) {
      const r = raw.rules?.[k];
      if (!r) continue;
      rules[k] = {
        cache: typeof r.cache === "boolean" ? r.cache : DEFAULT_CACHE_RULES[k].cache,
        ttlMin: Math.max(1, Math.min(240, Number(r.ttlMin) || DEFAULT_CACHE_RULES[k].ttlMin)),
      };
    }
    return {
      at: String(raw.at || ""),
      overlayAt: String(raw.overlayAt || ""),
      overlayNext: Math.max(0, Number(raw.overlayNext) || 0),
      overlayTotal: Math.max(0, Number(raw.overlayTotal) || 0),
      journalAt: String(raw.journalAt || ""),
      journalNext: Math.max(0, Number(raw.journalNext) || 0),
      journalTotal: Math.max(0, Number(raw.journalTotal) || 0),
      rules,
    };
  } catch {
    return base;
  }
}

export function saveCachePolicy(next: CachePolicy) {
  const cur = loadCachePolicy();
  const file = fileOf();
  mkdirSync(dirname(file), { recursive: true });
  const clean: CachePolicy = {
    at: new Date().toISOString(),
    overlayAt: String(next.overlayAt || cur.overlayAt || ""),
    overlayNext: Number.isFinite(Number(next.overlayNext)) ? Math.max(0, Number(next.overlayNext)) : cur.overlayNext,
    overlayTotal: Number.isFinite(Number(next.overlayTotal)) ? Math.max(0, Number(next.overlayTotal)) : cur.overlayTotal,
    journalAt: String(next.journalAt ?? cur.journalAt ?? ""),
    journalNext: Number.isFinite(Number(next.journalNext)) ? Math.max(0, Number(next.journalNext)) : cur.journalNext || 0,
    journalTotal: Number.isFinite(Number(next.journalTotal)) ? Math.max(0, Number(next.journalTotal)) : cur.journalTotal || 0,
    rules: { ...cur.rules },
  };
  for (const k of Object.keys(DEFAULT_CACHE_RULES) as CacheKind[]) {
    const r = next.rules?.[k] || DEFAULT_CACHE_RULES[k];
    clean.rules[k] = {
      cache: Boolean(r.cache),
      ttlMin: Math.max(1, Math.min(240, Number(r.ttlMin) || DEFAULT_CACHE_RULES[k].ttlMin)),
    };
  }
  writeFileSync(file, JSON.stringify(clean, null, 2), "utf8");
  return clean;
}

export function cacheFresh(kind: CacheKind, atIso: string, now = Date.now()) {
  const rule = loadCachePolicy().rules[kind];
  if (!rule.cache) return false;
  const t = Date.parse(atIso);
  if (!Number.isFinite(t) || t <= 0) return false;
  return now - t < rule.ttlMin * 60_000;
}

export function stampOverlay(next: number, total: number) {
  const cur = loadCachePolicy();
  cur.overlayAt = new Date().toISOString();
  cur.overlayNext = next;
  cur.overlayTotal = total;
  return saveCachePolicy(cur);
}

export function stampJournalCursor(next: number, total: number) {
  const cur = loadCachePolicy();
  cur.journalAt = new Date().toISOString();
  cur.journalNext = next;
  cur.journalTotal = total;
  return saveCachePolicy(cur);
}

export function journalStale(now = Date.now()) {
  const pol = loadCachePolicy();
  const ttl = Math.max(5, Number(pol.rules.lessons?.ttlMin) || 10);
  const t = Date.parse(pol.journalAt || "");
  if (!Number.isFinite(t) || t <= 0) return true;
  if (!pol.journalTotal || (Number(pol.journalNext) || 0) < pol.journalTotal) return true;
  return now - t >= ttl * 60_000;
}
