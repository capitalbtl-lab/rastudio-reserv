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
  video?: string | null;
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
  age?: string;
};

export type Catalog = {
  pages: SitePage[];
  teachers: TeacherCard[];
  courses: CourseCard[];
  homeHero: SiteImage | null;
};

export function isPublishedTeacher(t: TeacherCard) {
  return t.href !== "/team" && !/день открытых|дети развивайся/i.test(t.name);
}
