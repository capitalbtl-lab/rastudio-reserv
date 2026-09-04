import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SCHOOLS, SCHOOL_COURSE_MATCH } from "./site";
import { listPriceRows, splitCourseAge, tidyCourseName } from "./prices-core";
import type { CrmSlot } from "./crm-slots-core";
import { groupAssignKey } from "./ids";

export type TreeSchool = { id: string; label: string; href: string };
export type TreeCourse = { id: string; schoolId: string; label: string; href: string; age: string };
export type SiteTree = { schools: TreeSchool[]; courses: TreeCourse[]; assign: Record<string, string> };

function fileOf() {
  return join(process.cwd(), "storage", "site-tree.json");
}

function prettyAge(age: string) {
  return String(age || "")
    .replace(/^Курс для (детей|девочек)\s*/i, "")
    .replace(/^Для детей\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function courseLabel(name: string, age: string) {
  const n = tidyCourseName(name) || String(name || "").trim();
  const a = prettyAge(age);
  if (!a) return n;
  if (n.toLowerCase().includes(a.toLowerCase().slice(0, 6))) return n;
  return `${n} · ${a}`;
}

export function slotTreeKey(s: { id?: string; groupId?: number; branchId?: number }) {
  return groupAssignKey(s);
}

function seed(): SiteTree {
  const schools: TreeSchool[] = SCHOOLS.map((s) => ({ id: s.href, label: s.label, href: s.href }));
  const courses: TreeCourse[] = [];
  const seen = new Set<string>();
  for (const r of listPriceRows()) {
    const href = r.path || "";
    if (!href || seen.has(href)) continue;
    const school =
      schools.find((s) => s.label === r.direction) ||
      schools.find((s) => s.href !== href && SCHOOL_COURSE_MATCH[s.href]?.(href));
    if (!school || school.href === href) continue;
    seen.add(href);
    courses.push({
      id: href,
      schoolId: school.id,
      label: courseLabel(r.name, r.age),
      href,
      age: prettyAge(r.age),
    });
  }
  return { schools, courses, assign: {} };
}

function merge(raw: Partial<SiteTree>): SiteTree {
  const base = seed();
  const schools = [...base.schools];
  for (const s of raw.schools || []) {
    if (!s?.id || !s.label) continue;
    const i = schools.findIndex((x) => x.id === s.id);
    if (i >= 0) schools[i] = { ...schools[i], ...s };
    else schools.push({ id: s.id, label: s.label, href: s.href || s.id });
  }
  const courses = [...base.courses];
  for (const c of raw.courses || []) {
    if (!c?.id || !c.label) continue;
    const i = courses.findIndex((x) => x.id === c.id);
    if (i >= 0) courses[i] = { ...courses[i], ...c };
    else courses.push({ id: c.id, schoolId: c.schoolId, label: c.label, href: c.href || "", age: c.age || "" });
  }
  const removed = new Set((raw as { removed?: string[] }).removed || []);
  return {
    schools: schools.filter((s) => !removed.has(s.id)),
    courses: courses.filter((c) => !removed.has(c.id) && schools.some((s) => s.id === c.schoolId)),
    assign: raw.assign && typeof raw.assign === "object" ? { ...raw.assign } : {},
  };
}

export function loadSiteTree(): SiteTree {
  try {
    if (!existsSync(fileOf())) return seed();
    return merge(JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<SiteTree>);
  } catch {
    return seed();
  }
}

export function saveSiteTree(tree: SiteTree) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  const next: SiteTree = {
    schools: tree.schools || [],
    courses: tree.courses || [],
    assign: tree.assign || {},
  };
  writeFileSync(fileOf(), JSON.stringify(next, null, 2));
  return next;
}

/** courseId группы: assign[gid:branch:group] либо slot.courseId, если курс есть в дереве. Имя не смотрим. */
export function courseIdOf(s: CrmSlot, tree: SiteTree) {
  const key = slotTreeKey(s);
  const assigned = key ? tree.assign[key] : "";
  const id = assigned || s.courseId || "";
  return tree.courses.some((c) => c.id === id) ? id : "";
}

export function addTreeSchool(label: string, href?: string) {
  const tree = loadSiteTree();
  const id = (href || `/school-${Date.now()}`).replace(/\s+/g, "-");
  if (tree.schools.some((s) => s.id === id || s.label === label.trim())) return tree;
  tree.schools.push({ id, label: label.trim(), href: href || id });
  return saveSiteTree(tree);
}

export function addTreeCourse(schoolId: string, label: string, href?: string, age?: string) {
  const tree = loadSiteTree();
  const school = tree.schools.find((s) => s.id === schoolId);
  if (!school) return tree;
  const id = (href || `${schoolId}#${Date.now()}`).trim();
  tree.courses.push({
    id,
    schoolId,
    label: label.trim(),
    href: href || "",
    age: prettyAge(age || splitCourseAge(label).age),
  });
  return saveSiteTree(tree);
}

export function deleteTreeCourse(courseId: string) {
  const tree = loadSiteTree();
  tree.courses = tree.courses.filter((c) => c.id !== courseId);
  for (const k of Object.keys(tree.assign)) {
    if (tree.assign[k] === courseId) delete tree.assign[k];
  }
  return saveSiteTree(tree);
}

export function deleteTreeSchool(schoolId: string) {
  const tree = loadSiteTree();
  const ids = new Set(tree.courses.filter((c) => c.schoolId === schoolId).map((c) => c.id));
  tree.schools = tree.schools.filter((s) => s.id !== schoolId);
  tree.courses = tree.courses.filter((c) => c.schoolId !== schoolId);
  for (const k of Object.keys(tree.assign)) {
    if (ids.has(tree.assign[k])) delete tree.assign[k];
  }
  return saveSiteTree(tree);
}

export function moveSlotsToCourse(slots: CrmSlot[], ids: string[], courseId: string) {
  const tree = loadSiteTree();
  const course = tree.courses.find((c) => c.id === courseId);
  if (!course) return { tree, slots };
  const school = tree.schools.find((s) => s.id === course.schoolId);
  const want = new Set(ids);
  const next = slots.map((s) => {
    if (!want.has(s.id)) return s;
    const key = slotTreeKey(s);
    if (key) tree.assign[key] = course.id;
    return {
      ...s,
      courseId: course.id,
      schoolId: school?.id || s.schoolId,
      school: school?.label || s.school,
      course: course.label,
      path: course.href || s.path,
      age: s.age || course.age,
    };
  });
  return { tree: saveSiteTree(tree), slots: next };
}
