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

export function mediaFolder(src: string) {
  const clean = String(src || "").split("?")[0].replace(/^\/+/, "");
  const parts = clean.split("/").filter(Boolean);
  if (parts[0] !== "media") return "";
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
