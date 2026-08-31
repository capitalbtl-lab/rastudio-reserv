import type { SiteImage } from "@/data/catalog";

const SKIP =
  /фон\s*кнон|робошкола|мс\.png|кнопк|логотип|обои|нейросеть/i;
const SKIP_IDS = /11062b_/i;

const MEDIA: Record<string, string[]> = {
  "art-3-4": ["01.jpg"],
  "art-5-6": ["01.jpg"],
  "art-7-9": ["01.jpg"],
  "art-9-13": ["01.jpg"],
  blender: ["01.jpg", "02.jpg", "03.jpg", "04.jpg"],
  cpp: ["01.jpg", "02.jpg", "03.jpg", "04.jpg"],
  "create-5-7": ["01.jpg", "02.jpg", "03.jpg", "04.jpg"],
  "create-7-9": ["01.jpg", "02.jpg", "03.jpg", "04.jpg"],
  "dev-9-10": ["01.jpg", "02.jpg", "03.jpg", "04.jpg"],
  "digital-art": ["01.jpg", "02.jpg", "03.jpg", "04.jpg"],
  drones: ["01.jpg"],
  hudvuz: ["01.jpg"],
  "intro-pc": ["01.jpg"],
  kinder: ["01.jpg", "02.jpg", "03.jpg"],
  kompas: ["01.jpg", "02.jpg"],
  lego: ["01.jpg", "02.jpg", "03.jpg"],
  manga: ["01.jpg"],
  minecraft: ["01.jpg"],
  model: ["01.jpg", "02.jpg", "03.jpg", "04.jpg"],
  "prep-school": ["01.jpg"],
  "prog-3in1": ["01.jpg", "02.jpg"],
  python: ["01.jpg", "02.jpg", "03.jpg", "04.jpg"],
  radio: ["01.jpg", "02.jpg", "03.jpg", "04.jpg"],
  "robot-10-14": ["01.jpg"],
  "robot-5-6": ["01.jpg"],
  "robot-7-9": ["01.jpg"],
  "robot-en": ["01.jpg", "02.jpg"],
  science: ["01.jpg"],
  sculpture: ["01.jpg", "02.jpg", "03.jpg", "04.jpg"],
  steam: ["01.jpg"],
  tesla: ["01.jpg", "02.jpg", "03.jpg", "04.jpg"],
  unity: ["01.jpg", "02.jpg", "03.jpg", "04.jpg"],
};

const FOLDER_FOR_PATH: Record<string, string> = {
  "/art-studio": "art-9-13",
  "/art-studio-3-4": "art-3-4",
  "/art-studio-5-6": "art-5-6",
  "/art-studio-7-8": "art-7-9",
  "/art-studio-9-13": "art-9-13",
  "/digitalartschool": "digital-art",
  "/gamedesign": "blender",
  "/3d-modeling": "kompas",
  "/happybricks": "lego",
  "/kinder-master": "kinder",
  "/model-school": "model",
  "/sculptural-studio": "sculpture",
  "/podgotovka-v-hudvuz": "hudvuz",
  "/preparation-for-school": "prep-school",
  "/science-course": "science",
  "/teslaphysics": "tesla",
  "/radioengineering": "radio",
  "/robototehnika-5-7": "robot-5-6",
  "/robototehnika-7-9": "robot-7-9",
  "/robototehnika-10-14": "robot-10-14",
  "/robototehnika-v-kolomne": "robot-7-9",
  "/roboticsinenglish": "robot-en",
  "/programming-school": "python",
  "/promising-professions": "tesla",
  "/early-childhood-care": "prep-school",
  "/kursy-shkoly-programmirovaniya/it-школа-разработка-игр-на-unity": "unity",
  "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-python": "python",
  "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-си": "cpp",
  "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-5-7-лет": "create-5-7",
  "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-7-9-лет": "create-7-9",
  "/kursy-shkoly-programmirovaniya/it-лаборатория-dev-для-детей-9-10-лет": "dev-9-10",
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
  if (FOLDER_FOR_PATH[`/${slug}`]) return FOLDER_FOR_PATH[`/${slug}`];
  return "";
}

function mediaImages(path?: string, alt = "Занятия в Студии Развивайся"): SiteImage[] {
  if (!path) return [];
  const folder = folderFor(path);
  const files = folder ? MEDIA[folder] : undefined;
  if (!files?.length) return [];
  return files.map((name) => ({
    src: `/media/heroes/${folder}/${name}`,
    filename: name,
    alt,
  }));
}

type Shot = { src: string; filename: string; alt?: string };

export function galleryPhotos(images: Shot[], path?: string, mode: "hero" | "gallery" = "gallery") {
  const seen = new Set<string>();
  const out: SiteImage[] = [];

  function add(img: Shot) {
    if (!img?.src) return;
    const key = img.src.split("?")[0].toLowerCase();
    if (seen.has(key)) return;
    const blob = `${img.filename || ""} ${img.alt || ""} ${img.src}`;
    if (SKIP.test(blob) || SKIP_IDS.test(blob)) return;
    if (img.src.startsWith("/courses/")) return;
    if (/wixstatic|11062b_/i.test(img.src)) return;
    seen.add(key);
    out.push({ src: img.src, filename: img.filename, alt: img.alt || "Занятия в Студии Развивайся" });
  }

  const heroes = mediaImages(path);
  if (mode === "hero") {
    for (const img of heroes) add(img);
    for (const img of images) add(img);
    return out.slice(0, 6);
  }
  for (const img of images) add(img);
  if (out.length < 4) {
    for (const img of heroes) add(img);
  }
  return out.slice(0, 16);
}
