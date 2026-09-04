import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  hydratePrices,
  listPriceRows,
  normPath,
  tidyCourseName,
  type PriceRow,
} from "./prices-core";
import { addTreeSchool, addTreeCourse, loadSiteTree } from "./site-tree";

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

/** Школа /model-school больше не курс: «Подиум» + макияж + личностный рост. Живой prices.json без этого шага оставит старый path. */
function migrateModelSchoolSplit(rows: PriceRow[]): { rows: PriceRow[]; changed: boolean } {
  const next = rows.map((r) => ({ ...r }));
  let changed = false;
  const podium = next.find((r) => r.id === "6001") || next.find((r) => r.path === "/model-school");
  if (podium && (podium.path === "/model-school" || podium.courseId === "/model-school")) {
    podium.path = "/model-school-podium";
    podium.courseId = "/model-school-podium";
    changed = true;
  }
  const add = (id: string, name: string, age: string, path: string) => {
    if (next.some((r) => r.id === id || r.path === path)) return;
    next.push({
      id,
      name,
      age,
      path,
      direction: "Модельная школа",
      all: podium?.all || 0,
      kbm: podium?.kbm || 0,
      tmx: podium?.tmx || 0,
    });
    changed = true;
  };
  add("6002", "Макияж", "Курс для девочек 13-17 лет", "/model-school-makeup");
  add("6003", "Личностный рост", "Курс для девочек 13-17 лет", "/model-school-growth");
  return { rows: next, changed };
}

export function ensureLivePrices() {
  try {
    if (existsSync(storagePath())) {
      hydratePrices(JSON.parse(readFileSync(storagePath(), "utf8")) as PriceRow[]);
    }
  } catch {
    /* seed already in memory */
  }
  const { rows, changed } = migrateModelSchoolSplit(listPriceRows());
  if (changed) savePriceRows(rows);
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

export function priceRowFromCourse(
  school: { id: string; label: string },
  course: { id: string; label: string; href?: string; age?: string },
): PriceRow {
  const split = tidyCourseName(course.label) || course.label;
  return {
    id: course.id,
    name: split,
    age: course.age || "",
    path: course.href || course.id,
    courseId: course.id,
    direction: school.label,
    all: 0,
    kbm: 0,
    tmx: 0,
    mins: 0,
    perWeek: 0,
    extra: {},
  };
}

export function addPriceSchool(label: string) {
  const name = String(label || "").trim();
  if (name.length < 2) return { ok: false as const, error: "Название школы — минимум 2 символа." };
  addTreeSchool(name);
  return { ok: true as const, tree: loadSiteTree(), rows: listPriceRows() };
}

export function addPriceCourse(schoolId: string, name: string, age: string) {
  const school = loadSiteTree().schools.find((s) => s.id === schoolId);
  if (!school) return { ok: false as const, error: "Сначала выберите школу — ту же, что в разделе «Группы»." };
  const n = String(name || "").trim();
  if (n.length < 2) return { ok: false as const, error: "Название курса — минимум 2 символа." };
  const a = String(age || "").trim();
  const label = a && !n.toLowerCase().includes(a.toLowerCase().slice(0, 5)) ? `${n} · ${a}` : n;
  const before = new Set(loadSiteTree().courses.map((c) => c.id));
  addTreeCourse(school.id, label, undefined, a);
  const tree = loadSiteTree();
  const created = tree.courses.find((c) => c.schoolId === school.id && !before.has(c.id));
  if (!created) return { ok: false as const, error: "Не удалось создать курс в дереве сайта." };
  ensureLivePrices();
  const rows = listPriceRows().map((r) => ({ ...r }));
  if (!rows.some((r) => r.courseId === created.id || r.path === created.id)) {
    rows.push(priceRowFromCourse(school, created));
    savePriceRows(rows);
  }
  return { ok: true as const, tree, rows: listPriceRows(), courseId: created.id };
}