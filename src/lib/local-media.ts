import map from "@/data/wix-local.json";

const WIX = /wixstatic\.com\/media\/([^/]+)\.(jpg|jpeg|png|webp|gif)/i;

const FALLBACK: Record<string, string> = {
  "4e33b6_01e95de87f744507b89f20b89ab04210~mv2": "/media/courses/englishlanguagegg/01.jpg",
  "4e33b6_deac3767666449fd82a199db32af65a3~mv2": "/media/courses/englishlanguagesm/01.jpg",
  "4e33b6_4b72e80680bb410c84406d58144a922f~mv2": "/media/courses/vitaminkorean/01.jpg",
  "4e33b6_6bb5835ebc2143d1a77bd2bb22d484c9~mv2": "/media/courses/japanese/01.jpg",
  "4e33b6_249ecaef035e4b90a9bd6bbae83ef0e7~mv2": "/media/home/shot-art.jpg",
  "4e33b6_ad35cfe6e7b3470cbd4ee2f7f00c5a64~mv2": "/courses/drones.jpg",
  "4e33b6_ee279b39a0474c758cf1ce1ba5682fef~mv2": "/media/courses/digitalartschool/01.jpg",
  "4e33b6_f2ad590e9ec6430ebf5e09f86a8a98b4~mv2": "/media/courses/digitalartschool/02.jpg",
  "4e33b6_f656d85e7ada49babdd0a9d18cc63d77~mv2": "/media/courses/digitalartschool/03.jpg",
  "11062b_e2ae833a8eaa43e38e4aa6d32eb3b8f7f000": "/media/courses/englishlanguagegg/01.jpg",
  "4e33b6_562c01970b714565ac3c564af8248290~mv2": "/brand/logo-white.png",
};

const ids = map as Record<string, string>;

export function localSrc(src?: string | null) {
  const value = String(src || "");
  if (!value) return "";
  if (!value.includes("wixstatic")) return value;
  const hit = value.match(WIX);
  if (!hit) return "/media/home/shot-art.jpg";
  const key = hit[1];
  return ids[key] || FALLBACK[key] || "/media/home/shot-art.jpg";
}

export function localizeTree<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => localizeTree(item)) as T;
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (typeof item === "string" && (key === "src" || key === "photo" || key === "ogImage" || key === "image" || key === "logo")) {
        next[key] = localSrc(item);
      } else {
        next[key] = localizeTree(item);
      }
    }
    return next as T;
  }
  if (typeof value === "string" && value.includes("wixstatic")) return localSrc(value) as T;
  return value;
}
