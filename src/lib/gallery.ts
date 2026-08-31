import type { SiteImage } from "@/data/catalog";

const SKIP =
  /развивайся\s*-|фон\s*кнон|робошкола|мс\.png|кнопк|планета-steam|беспилотная авиация/i;

const SKIP_IDS = /11062b_4402568a97474297baea6f7a1f16a2b2f000/i;

export function galleryPhotos(images: SiteImage[]) {
  const seen = new Set<string>();
  const out: SiteImage[] = [];
  for (const img of images) {
    const key = (img.filename || img.src).split("?")[0].toLowerCase();
    if (!img.src || seen.has(key)) continue;
    seen.add(key);
    const blob = `${img.filename} ${img.alt} ${img.src}`;
    if (SKIP.test(blob) || SKIP_IDS.test(blob)) continue;
    if (img.src.startsWith("/courses/")) continue;
    out.push(img);
  }
  return out;
}
