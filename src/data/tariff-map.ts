/**
 * Соответствие абонемента курсу сайта. Только локально:
 * tariffId (AlfaCRM) → schoolId + courseId (дерево сайта).
 * В CRM не выгружается.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadScheduleMap } from "./schedule-map";
import { loadSiteTree } from "./site-tree";

export type TariffLink = {
  tariffId: number;
  schoolId: string;
  courseId: string;
};

type File = { items: TariffLink[] };
let mem: { mtime: number; items: TariffLink[] } | null = null;

function fileOf() {
  return join(process.cwd(), "storage", "tariff-map.json");
}

export function readTariffMap(): TariffLink[] {
  try {
    if (!existsSync(fileOf())) return mem?.items || [];
    const mtime = statSync(fileOf()).mtimeMs;
    if (mem && mem.mtime === mtime) return mem.items;
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<File>;
    const items = (raw.items || [])
      .map((x) => ({
        tariffId: Number(x.tariffId) || 0,
        schoolId: String(x.schoolId || ""),
        courseId: String(x.courseId || ""),
      }))
      .filter((x) => x.tariffId > 0);
    mem = { mtime, items };
    return items;
  } catch {
    return mem?.items || [];
  }
}

export function saveTariffMap(items: TariffLink[]) {
  const tree = loadSiteTree();
  const packed: TariffLink[] = [];
  const seen = new Set<number>();
  for (const x of items) {
    const id = Number(x.tariffId);
    if (!Number.isFinite(id) || id === 0 || seen.has(id)) continue;
    seen.add(id);
    const course = tree.courses.find((c) => c.id === x.courseId || c.href === x.courseId);
    packed.push({
      tariffId: id,
      courseId: course?.id || "",
      schoolId: course?.schoolId || (tree.schools.some((s) => s.id === x.schoolId) ? x.schoolId : ""),
    });
  }
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify({ items: packed }, null, 2));
  mem = { mtime: Date.now(), items: packed };
  return packed;
}

export function guessTariffLinks(
  tariffs: { id: number; subjectIds: number[]; archive?: boolean }[],
  saved = readTariffMap(),
): TariffLink[] {
  const tree = loadSiteTree();
  const byId = new Map(saved.map((x) => [x.tariffId, x]));
  const out: TariffLink[] = [];
  const seen = new Set<number>();
  for (const t of tariffs) {
    if (!t.id || t.archive) continue;
    if (t.id < 0 && !byId.get(t.id)) continue;
    seen.add(t.id);
    const prev = byId.get(t.id);
    if (prev) {
      const course = tree.courses.find((c) => c.id === prev.courseId);
      out.push({
        tariffId: t.id,
        courseId: course?.id || prev.courseId || "",
        schoolId: course?.schoolId || prev.schoolId || "",
      });
      continue;
    }
    out.push({ tariffId: t.id, courseId: "", schoolId: "" });
  }
  for (const prev of saved) {
    if (prev.tariffId >= 0 || seen.has(prev.tariffId)) continue;
    if (!prev.courseId && !prev.schoolId) continue;
    const course = tree.courses.find((c) => c.id === prev.courseId);
    out.push({
      tariffId: prev.tariffId,
      courseId: course?.id || prev.courseId || "",
      schoolId: course?.schoolId || prev.schoolId || "",
    });
  }
  return out;
}

/** Первый запуск: посеять карту из subjectId → courseId админки и записать файл. */
export function seedTariffMapIfEmpty(tariffs: { id: number; subjectIds: number[]; archive?: boolean }[]) {
  if (existsSync(fileOf()) && readTariffMap().length) return guessTariffLinks(tariffs);
  const tree = loadSiteTree();
  const bySub = new Map<number, { courseId: string; schoolId: string }>();
  for (const c of loadScheduleMap().courses) {
    if (!c.subjectId || !c.courseId) continue;
    const course = tree.courses.find((x) => x.id === c.courseId || x.href === c.siteHref);
    if (!course) continue;
    bySub.set(c.subjectId, { courseId: course.id, schoolId: course.schoolId });
  }
  const seeded = guessTariffLinks(tariffs, []).map((row) => {
    const t = tariffs.find((x) => x.id === row.tariffId);
    const hit = t?.subjectIds.map((id) => bySub.get(id)).find(Boolean);
    return hit ? { tariffId: row.tariffId, courseId: hit.courseId, schoolId: hit.schoolId } : row;
  });
  return saveTariffMap(seeded);
}

export function linkOfTariff(tariffId: number, list = readTariffMap()) {
  return list.find((x) => x.tariffId === tariffId) || null;
}
