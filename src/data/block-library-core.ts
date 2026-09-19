/** Библиотека типов: блоки, которые сайт уже рисует, плюс атомы. Контент страницы здесь не живёт. */

export const HOME_TYPE_IDS = [
  "hero",
  "ticker",
  "robot",
  "ages",
  "schools",
  "catalog",
  "about",
  "teachers",
  "reviews",
  "stories",
  "branches",
  "trial",
] as const;

export const PAGE_TYPE_IDS = [
  "course-hero",
  "convert-band",
  "video-grid",
  "course-story",
  "why",
  "program",
  "gallery",
  "school-courses",
  "trajectory",
  "page-reviews",
  "schedule",
  "related",
  "convert-aside",
  "sell-why",
  "sell-program",
  "trial-form",
] as const;

export const ATOM_TYPE_IDS = ["heading", "rich-text", "image", "video", "buttons", "two-col", "custom"] as const;

export type HomeTypeId = (typeof HOME_TYPE_IDS)[number];
export type PageTypeId = (typeof PAGE_TYPE_IDS)[number];
export type AtomTypeId = (typeof ATOM_TYPE_IDS)[number];
export type BlockTypeId = HomeTypeId | PageTypeId | AtomTypeId | `custom:${string}`;

export type BlockCategory = "система" | "контент" | "курс" | "навигация" | "ии";
export type PageKind = "home" | "school" | "course" | "plain" | "team" | "catalog" | "contacts" | "master";

export type FieldSpec = {
  key: string;
  label: string;
  kind: "text" | "plain" | "image" | "video" | "images" | "href" | "courseId" | "list";
};

export type BlockType = {
  typeId: string;
  label: string;
  category: BlockCategory;
  fields: FieldSpec[];
  locked?: boolean;
};

const TITLE: FieldSpec = { key: "title", label: "Заголовок", kind: "text" };
const TEXT: FieldSpec = { key: "text", label: "Текст", kind: "plain" };
const KICKER: FieldSpec = { key: "kicker", label: "Надзаголовок", kind: "text" };
const IMAGE: FieldSpec = { key: "image", label: "Фото", kind: "image" };
const VIDEO: FieldSpec = { key: "video", label: "Видео", kind: "video" };
const IMAGES: FieldSpec = { key: "images", label: "Фото (3 кадра)", kind: "images" };
const CTA: FieldSpec = { key: "ctaLabel", label: "Кнопка", kind: "text" };
const HREF: FieldSpec = { key: "ctaHref", label: "Ссылка", kind: "href" };
const COURSE: FieldSpec = { key: "courseId", label: "Курс", kind: "courseId" };

function t(typeId: string, label: string, category: BlockCategory, fields: FieldSpec[], locked?: boolean): BlockType {
  return { typeId, label, category, fields, locked };
}

export const BLOCK_LIBRARY: BlockType[] = [
  t("hero", "Шапка главной", "система", [KICKER, TITLE, TEXT, IMAGES, CTA, HREF], true),
  t("ticker", "Бегущая строка", "система", [TEXT]),
  t("robot", "Робототехника на английском", "курс", [TITLE, VIDEO]),
  t("ages", "Подбор по возрасту", "контент", [TITLE]),
  t("schools", "Семь школ", "навигация", [TITLE]),
  t("catalog", "Каталог курсов", "курс", [TITLE]),
  t("about", "О студии", "контент", [KICKER, TITLE, TEXT, IMAGE]),
  t("teachers", "Педагоги", "контент", [TITLE]),
  t("reviews", "Отзывы", "контент", [TITLE]),
  t("stories", "Проекты и события", "контент", [TITLE, TEXT, IMAGE, CTA, HREF]),
  t("branches", "Филиалы", "контент", [TITLE]),
  t("trial", "Заявка на пробное", "курс", [TITLE, TEXT, COURSE]),
  t("course-hero", "Чёрная шапка страницы", "система", [KICKER, TITLE, TEXT, IMAGES, COURSE], true),
  t("convert-band", "Полоса записи", "курс", [TITLE, CTA, COURSE]),
  t("video-grid", "Видео курса", "контент", [TITLE, VIDEO, COURSE]),
  t("course-story", "Текст страницы", "контент", [TITLE, TEXT]),
  t("why", "Зачем сейчас", "контент", [TITLE, TEXT]),
  t("program", "Программа", "курс", [TITLE, TEXT, COURSE]),
  t("gallery", "Галерея", "контент", [IMAGES]),
  t("school-courses", "Курсы школы", "курс", [TITLE, COURSE]),
  t("trajectory", "Траектория", "курс", [TITLE]),
  t("page-reviews", "Отзывы страницы", "контент", [TITLE]),
  t("schedule", "Расписание", "курс", [COURSE]),
  t("related", "Соседние возраста", "курс", [COURSE]),
  t("convert-aside", "Запись сбоку", "курс", [COURSE]),
  t("sell-why", "После «зачем»", "курс", [TEXT, COURSE]),
  t("sell-program", "После программы", "курс", [TEXT, COURSE]),
  t("trial-form", "Форма пробного", "курс", [TITLE, COURSE]),
  t("heading", "Заголовок", "контент", [TITLE]),
  t("rich-text", "Текст", "контент", [TEXT]),
  t("image", "Изображение", "контент", [IMAGE, TITLE]),
  t("video", "Видео", "контент", [VIDEO, TITLE]),
  t("buttons", "Кнопки", "контент", [CTA, HREF]),
  t("two-col", "Две колонки", "контент", [KICKER, TITLE, TEXT, IMAGE, CTA, HREF]),
  t("custom", "Свой блок", "ии", [KICKER, TITLE, TEXT, IMAGE, CTA, HREF]),
];

export const HOME_BLOCKS = HOME_TYPE_IDS.map((id) => ({
  id,
  label: BLOCK_LIBRARY.find((b) => b.typeId === id)?.label || id,
}));

const KIND_ORDER: Record<PageKind, string[]> = {
  home: [...HOME_TYPE_IDS],
  school: ["course-hero", "convert-band", "video-grid", "course-story", "gallery", "school-courses", "page-reviews", "schedule", "trial-form"],
  course: ["course-hero", "convert-band", "video-grid", "course-story", "why", "program", "gallery", "sell-why", "sell-program", "trajectory", "page-reviews", "schedule", "related", "trial-form"],
  plain: ["course-hero", "course-story", "gallery", "related", "trial-form"],
  team: ["course-hero", "teachers", "trial-form"],
  catalog: ["course-hero", "ages", "catalog", "trial-form"],
  contacts: ["course-hero", "branches", "trial-form"],
  master: ["course-hero", "course-story", "gallery", "trial-form"],
};

const STATIC_KIND: Record<string, PageKind> = {
  "/": "home",
  "/allcourses": "catalog",
  "/schedule": "plain",
  "/team": "team",
  "/master-class": "master",
  "/contacts": "contacts",
  "/o-nas": "plain",
};

export function libraryType(typeId: string): BlockType | undefined {
  if (typeId.startsWith("custom:")) return { ...BLOCK_LIBRARY.find((b) => b.typeId === "custom")!, typeId, label: "Свой блок" };
  return BLOCK_LIBRARY.find((b) => b.typeId === typeId);
}

export function isLockedType(typeId: string) {
  return Boolean(libraryType(typeId)?.locked);
}

/** Блок из библиотеки, которого нет в JSX витрины — рисуется из JSON страницы. */
export function isCanvasExtra(typeId: string, id = "") {
  if (isLockedType(typeId)) return false;
  if (isAtomType(typeId)) return true;
  if (/^inst_/i.test(id) || /^c_/i.test(id)) {
    return !(PAGE_TYPE_IDS as readonly string[]).includes(typeId) && !(HOME_TYPE_IDS as readonly string[]).includes(typeId);
  }
  return false;
}

export function isHomeType(typeId: string): typeId is HomeTypeId {
  return (HOME_TYPE_IDS as readonly string[]).includes(typeId);
}

export function isAtomType(typeId: string) {
  return (ATOM_TYPE_IDS as readonly string[]).includes(typeId) || typeId.startsWith("custom:") || /^c_[a-z0-9]+$/i.test(typeId);
}

export function kindOrder(kind: PageKind): string[] {
  return KIND_ORDER[kind] || KIND_ORDER.plain;
}

export function pageKindOf(path: string, schools: string[] = [], courses: string[] = []): PageKind {
  const p = path.replace(/\/+$/, "") || "/";
  if (STATIC_KIND[p]) return STATIC_KIND[p];
  if (schools.includes(p)) return "school";
  if (courses.includes(p)) return "course";
  return "plain";
}

export const EDITOR_STATIC_PAGES: { path: string; title: string; kind: PageKind }[] = [
  { path: "/", title: "Главная", kind: "home" },
  { path: "/allcourses", title: "Курсы", kind: "catalog" },
  { path: "/schedule", title: "Расписание", kind: "plain" },
  { path: "/team", title: "Педагоги", kind: "team" },
  { path: "/master-class", title: "Мастер-классы", kind: "master" },
  { path: "/o-nas", title: "О нас", kind: "plain" },
  { path: "/contacts", title: "Контакты", kind: "contacts" },
];
