/**
 * Соответствие абонемента курсу сайта. Только локально:
 * tariffId (AlfaCRM) → schoolId + courseId (дерево сайта).
 * В CRM не выгружается.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadScheduleMap } from "./schedule-map";
import { loadSiteTree } from "./site-tree";
import { canonCourseId, canonSchoolId } from "./ids";

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
  const seen = new Set<string>();
  for (const x of items) {
    const id = Number(x.tariffId);
    if (!Number.isFinite(id) || id === 0) continue;
    const courseId = canonCourseId(tree, String(x.courseId || ""));
    if (!courseId) {
      if (!packed.some((p) => p.tariffId === id && !p.courseId)) packed.push({ tariffId: id, courseId: "", schoolId: canonSchoolId(tree, x.schoolId) });
      continue;
    }
    const key = `${id}::${courseId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    packed.push({
      tariffId: id,
      courseId,
      schoolId: tree.courses.find((c) => c.id === courseId)?.schoolId || canonSchoolId(tree, x.schoolId),
    });
  }
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify({ items: packed }, null, 2));
  mem = { mtime: Date.now(), items: packed };
  return packed;
}

export function linksOfTariff(tariffId: number, items: TariffLink[]) {
  return items.filter((x) => x.tariffId === tariffId && x.courseId);
}

export function guessTariffLinks(
  tariffs: { id: number; subjectIds: number[]; archive?: boolean }[],
  saved = readTariffMap(),
): TariffLink[] {
  const tree = loadSiteTree();
  const savedBy = new Map<number, TariffLink[]>();
  for (const s of saved) {
    const list = savedBy.get(s.tariffId) || [];
    list.push(s);
    savedBy.set(s.tariffId, list);
  }
  const out: TariffLink[] = [];
  const seen = new Set<number>();
  function pack(id: number, row: TariffLink): TariffLink {
    const courseId = canonCourseId(tree, row.courseId);
    const course = courseId ? tree.courses.find((c) => c.id === courseId) : undefined;
    return {
      tariffId: id,
      courseId: courseId,
      schoolId: course?.schoolId || canonSchoolId(tree, row.schoolId),
    };
  }
  for (const t of tariffs) {
    if (!t.id || t.archive) continue;
    if (t.id < 0 && !savedBy.get(t.id)) continue;
    seen.add(t.id);
    const prev = (savedBy.get(t.id) || []).filter((p) => p.courseId);
    if (prev.length) {
      for (const p of prev) out.push(pack(t.id, p));
      continue;
    }
    out.push({ tariffId: t.id, courseId: "", schoolId: "" });
  }
  for (const prev of saved) {
    if (prev.tariffId >= 0 || seen.has(prev.tariffId)) continue;
    if (!prev.courseId && !prev.schoolId) continue;
    out.push(pack(prev.tariffId, prev));
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
    const course = tree.courses.find((x) => x.id === c.courseId);
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
