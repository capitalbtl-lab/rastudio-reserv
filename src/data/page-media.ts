const ROBOT_EN = [
  "/media/home/robot-en-1.mp4",
  "/media/home/robot-en-2.mp4",
  "/media/home/robot-en-3.mp4",
  "/media/home/robot-en-4.mp4",
] as const;

export type VideoPack = { hero?: string; clips?: string[] };

const ART_INTRO = "/media/courses/art-studio-9-13/intro.mp4";

export const PAGE_VIDEOS: Record<string, VideoPack> = {
  "/": { hero: "/media/home/hero.mp4", clips: [...ROBOT_EN] },
  "/art-studio": { hero: ART_INTRO },
  "/art-studio-3-4": { hero: "/media/courses/art-studio-3-4/intro.mp4" },
  "/art-studio-5-6": { hero: "/media/courses/art-studio-5-6/intro.mp4" },
  "/art-studio-7-8": { hero: "/media/courses/art-studio-7-8/intro.mp4" },
  "/art-studio-9-13": { hero: ART_INTRO },
  "/sculptural-studio": { hero: "/media/courses/sculptural-studio/intro.mp4" },
  "/podgotovka-v-hudvuz": { hero: "/media/courses/podgotovka-v-hudvuz/intro.mp4" },
  "/digitalartschool": {
    hero: "/media/courses/digitalartschool/intro.mp4",
    clips: [
      "/media/courses/digitalartschool/intro.mp4",
      "/media/courses/digitalartschool/intro-2.mp4",
    ],
  },
  "/roboticsinenglish": {
    hero: "/media/home/robot-english.mp4",
    clips: [...ROBOT_EN],
  },
  "/roboticsinenglish1": { hero: "/media/home/robot-en-1.mp4" },
  "/roboticsinenglish2": { hero: "/media/home/robot-en-2.mp4" },
  "/roboticsinenglish3": { hero: "/media/home/robot-en-3.mp4" },
  "/roboticsinenglish4": { hero: "/media/home/robot-en-4.mp4" },
  "/robototehnika-v-kolomne": { hero: "/media/home/robot-english.mp4" },
};

function decode(path = "") {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function videoPack(path = ""): VideoPack {
  const decoded = decode(path);
  return PAGE_VIDEOS[path] || PAGE_VIDEOS[decoded] || PAGE_VIDEOS[`/${decoded.replace(/^\//, "")}`] || {};
}

export function teaser(text: string, max = 280) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const dot = cut.lastIndexOf(". ");
  const sp = cut.lastIndexOf(" ");
  const end = dot > 90 ? dot + 1 : sp > 90 ? sp : max;
  return `${cut.slice(0, end).trim()}…`;
}
