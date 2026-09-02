import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  hydratePrices,
  listPriceRows,
  normPath,
  type PriceRow,
} from "./prices-core";

export {
  formatRub,
  hydratePrices,
  listPriceRows,
  PRICE_DIRECTIONS,
  priceForPath,
  publicPriceLabel,
  type PriceRow,
} from "./prices-core";

function storagePath() {
  return join(process.cwd(), "storage", "prices.json");
}

export function ensureLivePrices() {
  try {
    if (existsSync(storagePath())) {
      hydratePrices(JSON.parse(readFileSync(storagePath(), "utf8")) as PriceRow[]);
    }
  } catch {
    /* seed already in memory */
  }
  return listPriceRows();
}

export function savePriceRows(rows: PriceRow[]) {
  hydratePrices(rows);
  try {
    const file = storagePath();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(listPriceRows(), null, 2), "utf8");
  } catch {
    /* memory only */
  }
  return listPriceRows();
}

export function updateOnePrice(
  path: string,
  patch: Partial<Pick<PriceRow, "all" | "kbm" | "tmx" | "mins" | "perWeek">>,
) {
  ensureLivePrices();
  const rows = listPriceRows().map((r) => ({ ...r }));
  const p = normPath(path);
  const i = rows.findIndex(
    (r) => normPath(r.courseId || r.path) === p || normPath(r.path) === p || r.id === path,
  );
  if (i < 0) return { ok: false as const, error: "Курс не найден" };
  if (patch.all != null) rows[i].all = Math.max(0, Math.round(patch.all));
  if (patch.kbm != null) rows[i].kbm = Math.max(0, Math.round(patch.kbm));
  if (patch.tmx != null) rows[i].tmx = Math.max(0, Math.round(patch.tmx));
  if (patch.mins != null) rows[i].mins = Math.max(0, Math.round(patch.mins));
  if (patch.perWeek != null) rows[i].perWeek = Math.max(0, Math.round(patch.perWeek));
  savePriceRows(rows);
  return { ok: true as const, row: rows[i] };
}

export function updateGroupPrice(opts: {
  direction?: string;
  query?: string;
  field: string;
  set?: number;
  delta?: number;
}) {
  ensureLivePrices();
  const rows = listPriceRows().map((r) => ({ ...r, extra: { ...(r.extra || {}) } }));
  const dir = (opts.direction || "").toLowerCase().trim();
  const q = (opts.query || "").toLowerCase().trim();
  const hit = rows.filter((r) => {
    if (dir && r.direction.toLowerCase() !== dir && !r.direction.toLowerCase().includes(dir)) return false;
    if (q && !`${r.name} ${r.direction} ${r.path}`.toLowerCase().includes(q)) return false;
    return Boolean(dir || q);
  });
  if (!hit.length) return { ok: false as const, error: "Нет курсов в этой группе", count: 0 };
  const fields: string[] =
    opts.field === "all-three" ? ["all", "kbm", "tmx"] : opts.field === "all-corps" ? ["kbm", "tmx"] : [opts.field];
  for (const row of hit) {
    for (const f of fields) {
      const cur = f === "all" || f === "kbm" || f === "tmx" ? Number(row[f] || 0) : Number(row.extra?.[f] || 0);
      const next = opts.set != null ? Math.max(0, Math.round(opts.set)) : Math.max(0, Math.round(cur + (opts.delta || 0)));
      if (f === "all" || f === "kbm" || f === "tmx") row[f] = next;
      else row.extra = { ...(row.extra || {}), [f]: next };
    }
  }
  savePriceRows(rows);
  return { ok: true as const, count: hit.length, names: hit.map((r) => r.name) };
}