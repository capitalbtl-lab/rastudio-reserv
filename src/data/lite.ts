import raw from "./lite.json";

type Lite = {
  home: {
    title: string;
    description: string;
    ogTitle: string;
    ogImage: string;
    canonical: string;
    h1: string;
    paragraphs: string[];
    images: Array<{ src: string; alt: string; filename: string }>;
  };
  teachers: Array<{
    name: string;
    role: string;
    photo: string;
    alt: string;
    filename: string;
    href: string;
  }>;
  courses: Array<{
    href: string;
    label: string;
    title: string;
    description: string;
    image: string;
    alt: string;
    filename: string;
  }>;
};

const lite = raw as Lite;

export const homePage = lite.home;
export const liteTeachers = lite.teachers;
export const liteCourses = lite.courses;
