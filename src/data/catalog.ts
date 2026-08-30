import raw from "./catalog.json";
import { pageHead as buildHead } from "./seo";

export type SiteImage = {
  src: string;
  alt: string;
  filename: string;
};

export type RelatedLink = { href: string; text: string };

export type SitePage = {
  path: string;
  pathDecoded: string;
  kind: string;
  title: string;
  description: string;
  ogTitle: string;
  ogImage: string;
  canonical: string;
  h1: string;
  headings: { tag: string; text: string }[];
  paragraphs: string[];
  images: SiteImage[];
  related: RelatedLink[];
};

export type TeacherCard = {
  name: string;
  role: string;
  photo: string;
  alt: string;
  filename: string;
  href: string;
};

export type CourseCard = {
  href: string;
  label: string;
  title: string;
  description: string;
  image: string;
  alt: string;
  filename: string;
};

type Catalog = {
  pages: SitePage[];
  teachers: TeacherCard[];
  courses: CourseCard[];
  homeHero: SiteImage | null;
};

const catalog = raw as Catalog;

const pageIndex = new Map<string, SitePage>();
for (const page of catalog.pages) {
  pageIndex.set(norm(page.path), page);
  pageIndex.set(norm(page.pathDecoded), page);
}

function norm(input: string) {
  let value = input.trim();
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1) value = value.replace(/\/+$/, "");
  try {
    value = decodeURIComponent(value);
  } catch {
    /* keep */
  }
  return value;
}

export function isPublishedTeacher(t: TeacherCard) {
  return t.href !== "/team" && !/день открытых|дети развивайся/i.test(t.name);
}

export function getPage(splat?: string | null): SitePage | undefined {
  if (!splat) return pageIndex.get("/");
  return pageIndex.get(norm(splat));
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

export function homeHero() {
  return catalog.homeHero;
}

export function pageHead(page: SitePage) {
  return buildHead(page);
}
