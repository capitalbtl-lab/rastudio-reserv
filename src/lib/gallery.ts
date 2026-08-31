import type { SiteImage } from "@/data/catalog";

const SKIP =
  /фон\s*кнон|робошкола|мс\.png|кнопк|планета-steam|беспилотная авиация/i;
const SKIP_IDS = /11062b_4402568a97474297baea6f7a1f16a2b2f000/i;

const MEDIA: Record<string, string[]> = {
  "3d-modeling": ["01.jpg", "02.jpg"],
  "art-studio-9-13": ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg"],
  digitalartschool: ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg"],
  englishlanguagegg: ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg"],
  englishlanguagesm: ["01.jpg"],
  gamedesign: ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg"],
  happybricks: ["01.jpg", "02.jpg"],
  "it-лаборатория-create-для-детей-5-7-лет": ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg"],
  "it-лаборатория-create-для-детей-7-9-лет": ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg"],
  "it-лаборатория-dev-для-детей-9-10-лет": ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg"],
  "it-школа-программирование-на-python": ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg"],
  "it-школа-программирование-на-си": ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg"],
  "it-школа-разработка-игр-на-unity": ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg"],
  japanese: ["01.jpg"],
  "kinder-master": ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg"],
  "master-class": ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg"],
  mentalarithmetic: ["01.jpg"],
  "model-school": ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg"],
  "programming-school": ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg"],
  radioengineering: ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg"],
  roboticsinenglish: ["01.jpg", "02.jpg", "03.jpg", "04.jpg"],
  "sculptural-studio": ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg"],
  teslaphysics: ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg"],
  tinkercad2025itogi: ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg"],
  vitaminkorean: ["01.jpg"],
};

const FOLDER_FOR_PATH: Record<string, string> = {
  "/art-studio": "art-studio-9-13",
  "/art-studio-3-4": "art-studio-9-13",
  "/art-studio-5-6": "art-studio-9-13",
  "/art-studio-7-8": "art-studio-9-13",
  "/art-studio-9-13": "art-studio-9-13",
  "/preparation-for-school": "happybricks",
  "/robototehnika-5-7": "roboticsinenglish",
  "/robototehnika-7-9": "roboticsinenglish",
  "/robototehnika-10-14": "roboticsinenglish",
  "/robototehnika-v-kolomne": "roboticsinenglish",
  "/podgotovka-v-hudvuz": "art-studio-9-13",
};

function decodePath(path: string) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function folderFor(path: string) {
  const clean = decodePath(path);
  if (FOLDER_FOR_PATH[clean]) return FOLDER_FOR_PATH[clean];
  const slug = clean.split("/").filter(Boolean).pop() || "";
  if (MEDIA[slug]) return slug;
  return "";
}

function mediaImages(path?: string, alt = "Занятия в Студии Развивайся"): SiteImage[] {
  if (!path) return [];
  const folder = folderFor(path);
  const files = folder ? MEDIA[folder] : undefined;
  if (!files?.length) return [];
  return files.map((name) => ({
    src: `/media/courses/${folder}/${name}`,
    filename: name,
    alt,
  }));
}

type Shot = { src: string; filename: string; alt?: string };

export function galleryPhotos(images: Shot[], path?: string) {
  const seen = new Set<string>();
  const out: SiteImage[] = [];

  function add(img: Shot) {
    if (!img?.src) return;
    const key = img.src.split("?")[0].toLowerCase();
    if (seen.has(key)) return;
    const blob = `${img.filename || ""} ${img.alt || ""} ${img.src}`;
    if (SKIP.test(blob) || SKIP_IDS.test(blob)) return;
    if (img.src.startsWith("/courses/")) return;
    seen.add(key);
    out.push({ src: img.src, filename: img.filename, alt: img.alt || "Занятия в Студии Развивайся" });
  }

  for (const img of mediaImages(path)) add(img);
  for (const img of images) add(img);
  return out;
}
