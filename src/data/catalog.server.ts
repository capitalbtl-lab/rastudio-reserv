import raw from "./catalog.json";
import cmsRaw from "./cms.json";
import extrasRaw from "../../content/course-extras.json";
import galleriesRaw from "./course-galleries.json";
import { isPublishedTeacher, type Catalog, type SiteImage, type SitePage } from "./catalog";
import { videoPack } from "./page-media";
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
import { publicCoursesMeta } from "./public-bind";
import { localizeTree } from "@/lib/local-media";
import { lastPathSlug, pageLookupKeys } from "./catalog-path";

const extras = extrasRaw as Record<string, SitePage["images"]>;
const galleries = galleriesRaw as Record<string, string[]>;
const source = raw as Catalog;

function folderOf(path: string) {
  const decoded = normPath(path);
  const slug = decoded.split("/").filter(Boolean).pop() || "";
  if (galleries[slug]) return slug;
  if (decoded === "/art-studio") return "art-studio";
  if (decoded === "/programming-school") return "programming-school";
  if (decoded === "/promising-professions") return "promising-professions";
  if (decoded === "/model-school" || decoded.startsWith("/model-school-")) return "model-school";
  if (decoded === "/master-class") return "master-class";
  if (decoded === "/team") return "team";
  return slug;
}

function folderShots(path: string, alt: string): SiteImage[] {
  const folder = folderOf(path);
  const files = galleries[folder];
  if (!files?.length) return [];
  return files.map((name) => ({
    src: `/media/courses/${folder}/${name}`,
    filename: name,
    alt,
  }));
}

function withLocalGallery(page: SitePage): SitePage {
  const next = localizeTree(page);
  const extra = extras[page.path] || extras[page.pathDecoded];
  const alt = next.h1 || next.title || "Занятия в Студии Развивайся";
  const pack = videoPack(page.pathDecoded || page.path);
  const incoming = [...(extra || []), ...folderShots(page.pathDecoded || page.path, alt)];
  const images = [...(next.images || [])];
  const have = new Set(images.map((img) => img.src.split("?")[0]));
  for (const img of incoming) {
    const key = img.src.split("?")[0];
    if (have.has(key)) continue;
    have.add(key);
    images.push(img);
  }
  return {
    ...next,
    images,
    video: pack.hero || next.video || null,
    videos: pack.clips?.length ? [...pack.clips] : next.videos,
  };
}

const catalog: Catalog = {
  ...source,
  pages: source.pages.map(withLocalGallery),
  teachers: localizeTree(source.teachers),
  courses: localizeTree(source.courses),
  homeHero: source.homeHero ? localizeTree(source.homeHero) : null,
};
const cms = localizeTree(cmsRaw as CmsPayload);

const pageIndex = new Map<string, SitePage>();
const pageBySlug = new Map<string, SitePage>();
function indexPage(key: string, page: SitePage) {
  const n = norm(key);
  if (n && n !== "/" && !pageIndex.has(n)) pageIndex.set(n, page);
}
for (const page of catalog.pages) {
  indexPage(page.path, page);
  indexPage(page.pathDecoded, page);
  const slug = lastPathSlug(page.pathDecoded || page.path);
  if (slug && !pageBySlug.has(slug)) pageBySlug.set(slug, page);
}

const ALIAS: Record<string, string> = {
  "/gamedev": "/kursy-shkoly-programmirovaniya/it-школа-разработка-игр-на-unity",
  "/unity": "/kursy-shkoly-programmirovaniya/it-школа-разработка-игр-на-unity",
  "/python": "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-python",
  "/cpp": "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-си",
};

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
  if (!splat) return pageIndex.get("/") || catalog.pages.find((p) => p.pathDecoded === "/");
  const alias = ALIAS[norm(splat)];
  if (alias) return getPage(alias);
  for (const key of pageLookupKeys(splat)) {
    const hit = pageIndex.get(key) || pageBySlug.get(lastPathSlug(key));
    if (hit) return finishPage(hit);
  }
  const slug = lastPathSlug(splat);
  const bySlug = slug ? pageBySlug.get(slug) : undefined;
  return bySlug ? finishPage(bySlug) : undefined;
}

function finishPage(page: SitePage) {
  const edited = applyPageEdits(page);
  if (norm(edited.pathDecoded || edited.path) === "/art-studio-9-13") {
    return {
      ...edited,
      title: "Художественная школа 10–15 лет в Коломне | Студия «Развивайся»",
      ogTitle: "Художественная школа 10–15 лет в Коломне",
    };
  }
  return edited;
}

export function allPages() {
  return catalog.pages;
}

export function allTeachers() {
  return catalog.teachers.filter(isPublishedTeacher);
}

export function allCourses() {
  let meta: { courseId: string; age: string; cities?: string[]; mins?: number }[] = [];
  try {
    meta = publicCoursesMeta();
  } catch {
    meta = [];
  }
  return catalog.courses.map((c) => {
    const hit = meta.find((m) => m.courseId === c.href);
    const age = hit?.age || (c.href === "/art-studio-9-13" ? "10–15 лет" : c.age);
    const label = c.href === "/art-studio-9-13" ? "Художественная школа 10–15 лет" : c.label;
    return { ...c, label, age, cities: hit?.cities, mins: hit?.mins };
  });
}

export function getCmsCourse(splat?: string | null) {
  if (!splat) return undefined;
  const alias = ALIAS[norm(splat)];
  if (alias) return getCmsCourse(alias);
  for (const key of pageLookupKeys(splat)) {
    const course = courseByPath.get(key);
    if (course) return applyCmsEdits(course);
  }
  return undefined;
}

export function getCmsMaster(splat?: string | null) {
  if (!splat) return undefined;
  for (const key of pageLookupKeys(splat)) {
    const master = masterByPath.get(key);
    if (master) return master;
  }
  return undefined;
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
