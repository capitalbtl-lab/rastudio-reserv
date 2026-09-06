/** Папка файла → курс/школа, чтобы DeepSeek и консультант понимали кадр без vision. */

export type MediaLabel = { id: string; label: string };

const HOME: Record<string, string> = {
  "hero.mp4": "видео ресепшн на главной",
  "shot-art.jpg": "кадр художественной студии",
  "shot-code.jpg": "кадр школы программирования",
  "shot-mc.jpg": "кадр мастер-класса",
  "shot-robot.jpg": "кадр робототехники",
  "shot-science.jpg": "кадр научной школы",
  "shot-sculpt.jpg": "кадр скульптуры",
  "shot-teacher.jpg": "кадр педагога",
  "robot-english.mp4": "робототехника на английском",
  "robot-en-1.mp4": "робототехника на английском, ролик 1",
  "robot-en-2.mp4": "робототехника на английском, ролик 2",
  "robot-en-3.mp4": "робототехника на английском, ролик 3",
  "robot-en-4.mp4": "робототехника на английском, ролик 4",
};

export function schoolSlug(id: string) {
  return String(id || "")
    .replace(/^\//, "")
    .split("/")[0]
    .replace(/[^a-zA-Z0-9._-а-яА-ЯёЁ-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function mediaFolder(src: string) {
  const clean = String(src || "").split("?")[0].replace(/^\/+/, "");
  const parts = clean.split("/").filter(Boolean);
  if (parts[0] !== "media") return "";
  if (parts[1] === "schools" && parts[2]) return parts[2];
  if (parts[1] === "courses" && parts[2]) return parts[2];
  if (parts[1] === "home") return "home";
  if (parts[1] === "uploads") return "uploads";
  if (parts[1] === "imported") return "imported";
  if (parts[1] === "heroes") return "heroes";
  return parts[1] || "";
}

export function mediaFileName(src: string) {
  const clean = String(src || "").split("?")[0];
  return clean.split("/").pop() || clean;
}

export function matchMediaLabel(folder: string, labels: MediaLabel[]) {
  const slug = decodeURIComponent(folder).toLowerCase();
  if (!slug) return null;
  return (
    labels.find((l) => l.id.replace(/^\//, "").toLowerCase() === slug) ||
    labels.find((l) => l.id.toLowerCase().endsWith("/" + slug)) ||
    labels.find((l) => slug.includes(l.id.replace(/^\//, "").toLowerCase()) && l.id.replace(/^\//, "").length > 4) ||
    null
  );
}

export function mediaSchoolId(
  src: string,
  schools: { id: string }[] = [],
  courses: { id: string; schoolId: string }[] = [],
) {
  const clean = String(src || "").split("?")[0].replace(/^\/+/, "");
  const parts = clean.split("/").filter(Boolean);
  if (parts[1] === "schools" && parts[2]) return `/${parts[2]}`;
  const folder = mediaFolder(src);
  const school = schools.find((s) => schoolSlug(s.id) === folder);
  if (school) return school.id;
  const course = courses.find((c) => schoolSlug(c.id) === folder);
  if (course?.schoolId) return course.schoolId;
  return "";
}

/** Куда писать загрузку: папка школы на диске, иначе uploads. */
export function mediaUploadRel(folder: string) {
  const slug = schoolSlug(folder);
  if (!slug || slug === "all") return "media/uploads";
  if (slug === "home") return "media/home";
  if (slug === "uploads") return "media/uploads";
  if (slug === "imported") return "media/imported";
  if (slug === "heroes") return "media/heroes";
  return `media/schools/${slug}`;
}

export function mediaContext(src: string, labels: MediaLabel[] = []) {
  const folder = mediaFolder(src);
  const name = mediaFileName(src);
  const hit = matchMediaLabel(folder, labels);
  let place = "медиатека сайта";
  if (folder === "home") place = HOME[name] || "главная страница";
  else if (folder === "uploads") place = "загрузка в редакторе сайта";
  else if (folder === "imported") place = "архив фото с прежнего сайта";
  else if (folder === "heroes") place = "обложка курса";
  else if (hit) place = hit.label;
  else if (folder) place = folder.replace(/-/g, " ");
  return {
    src,
    name,
    folder,
    place,
    courseId: hit?.id || "",
    kind: /\.mp4($|\?)/i.test(src) || /\.webm($|\?)/i.test(src) ? ("video" as const) : ("image" as const),
  };
}
