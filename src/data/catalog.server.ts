import raw from "./catalog.json";
import cmsRaw from "./cms.json";
import { isPublishedTeacher, type Catalog, type SitePage } from "./catalog";
import {
  courseKey,
  normPath,
  scheduleFilterForPath,
  type CmsCourse,
  type CmsMaster,
  type CmsPayload,
  type CmsSession,
} from "./cms";
import { applyPageEdits, applyCmsEdits } from "./edits";

const catalog = raw as Catalog;
const cms = cmsRaw as CmsPayload;

const pageIndex = new Map<string, SitePage>();
for (const page of catalog.pages) {
  pageIndex.set(norm(page.path), page);
  pageIndex.set(norm(page.pathDecoded), page);
}

const courseByPath = new Map<string, CmsCourse>();
const courseById = new Map<string, CmsCourse>();
const courseByKey = new Map<string, CmsCourse>();
for (const course of cms.courses) {
  courseByPath.set(normPath(course.path), course);
  courseByPath.set(normPath(course.pathDecoded), course);
  courseById.set(course.id, course);
  courseByKey.set(courseKey(course.name), course);
}

const masterByPath = new Map<string, CmsMaster>();
for (const master of cms.masters) {
  masterByPath.set(normPath(master.path), master);
  masterByPath.set(normPath(master.pathDecoded), master);
}

function norm(input: string) {
  return normPath(input);
}

export function getPage(splat?: string | null): SitePage | undefined {
  const page = splat ? pageIndex.get(norm(splat)) : pageIndex.get("/");
  return page ? applyPageEdits(page) : undefined;
}

export function allPages() {
  return catalog.pages;
}

export function allTeachers() {
  return catalog.teachers.filter(isPublishedTeacher);
}

export function allCourses() {
  return catalog.courses;
}

export function getCmsCourse(splat?: string | null) {
  if (!splat) return undefined;
  const course = courseByPath.get(norm(splat));
  return course ? applyCmsEdits(course) : undefined;
}

export function getCmsMaster(splat?: string | null) {
  if (!splat) return undefined;
  return masterByPath.get(norm(splat));
}

export function allCmsCourses() {
  const order = cms.courseOrder;
  return [...cms.courses].sort((a, b) => {
    const ia = order.indexOf(a.name);
    const ib = order.indexOf(b.name);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

export function allCmsMasters() {
  return cms.masters.map((m) => ({
    id: m.id,
    name: m.name,
    path: m.path,
    pathDecoded: m.pathDecoded,
    short: m.short,
    image: m.image,
    ages: m.ages,
    sizes: m.sizes,
    directions: m.directions,
    places: m.places,
    long: "",
    whatHappens: "",
    learn: "",
    special: "",
    who: "",
    result: "",
    cta: "",
  }));
}

export function canonicalTrajectory() {
  return cms.canonicalTrajectory;
}

export function allSchedule() {
  return cms.schedule;
}

export function scheduleFor(splat?: string | null): CmsSession[] {
  if (!splat) return [];
  const decoded = norm(splat);
  if (decoded === "/programming-school") {
    const names = new Set(cms.courses.map((c) => c.name));
    return cms.schedule.filter((s) => names.has(s.courseFilter));
  }
  const course = courseByPath.get(decoded);
  if (course) {
    return cms.schedule.filter(
      (s) => s.courseFilter === course.name || s.courseId === course.id,
    );
  }
  const filter = scheduleFilterForPath(decoded);
  if (!filter) return [];
  return cms.schedule.filter((s) => s.courseFilter === filter);
}

export function coursePathByProgram(name: string) {
  const key = PROGRAM_TO_KEY[name] ?? courseKey(name);
  return courseByKey.get(key)?.pathDecoded;
}

const PROGRAM_TO_KEY: Record<string, string> = {
  START: "start",
  CREATE: "create-7",
  DEV: "dev",
  PYTHON: "python",
  GAMEDEV: "gamedev",
  "С++": "cpp",
};
