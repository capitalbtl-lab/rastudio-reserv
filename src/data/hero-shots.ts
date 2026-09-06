export type CollageShot = {
  src: string;
  alt: string;
  filename?: string;
  href?: string;
};

export const HOME_SHOTS: CollageShot[] = [
  {
    href: "/art-studio",
    src: "/media/home/shot-art.jpg",
    alt: "Художественная школа в Студии Развивайся",
    filename: "shot-art.jpg",
  },
  {
    href: "/sculptural-studio",
    src: "/media/home/shot-sculpt.jpg",
    alt: "Скульптурная студия в Студии Развивайся",
    filename: "shot-sculpt.jpg",
  },
  {
    href: "/robototehnika-v-kolomne",
    src: "/media/home/shot-robot.jpg",
    alt: "Робототехника в Студии Развивайся",
    filename: "shot-robot.jpg",
  },
  {
    href: "/programming-school",
    src: "/media/home/shot-code.jpg",
    alt: "Компьютерный класс в Студии Развивайся",
    filename: "shot-code.jpg",
  },
  {
    href: "/promising-professions",
    src: "/media/home/shot-science.jpg",
    alt: "Наука и инженерия в Студии Развивайся",
    filename: "shot-science.jpg",
  },
  {
    href: "/master-class",
    src: "/media/home/shot-mc.jpg",
    alt: "Мастер-класс в Студии Развивайся",
    filename: "shot-mc.jpg",
  },
  {
    href: "/team",
    src: "/media/home/shot-teacher.jpg",
    alt: "Педагоги Студии Развивайся",
    filename: "shot-teacher.jpg",
  },
];

const THEME: { test: RegExp; pick: string[] }[] = [
  { test: /art-studio|sculptural|hudvuz|digitalart|manga/, pick: ["/art-studio", "/sculptural-studio"] },
  { test: /robot|dron/, pick: ["/robototehnika-v-kolomne"] },
  { test: /program|python|unity|scratch|create|dev-|cpp|minecraft|pascal/, pick: ["/programming-school"] },
  { test: /promising|tesla|science|3d-model|radio|kinder|mental|kompas/, pick: ["/promising-professions"] },
  { test: /model-school|makeup|podium/, pick: ["/master-class"] },
  { test: /language|english|japanese|korean|vitamin/, pick: ["/programming-school", "/art-studio"] },
  { test: /early|preparation|happybricks|steam/, pick: ["/art-studio", "/team"] },
  { test: /master/, pick: ["/master-class", "/art-studio"] },
  { test: /team|teacher|pedagog/, pick: ["/team"] },
  { test: /contact/, pick: ["/art-studio", "/robototehnika-v-kolomne", "/programming-school"] },
  { test: /schedule/, pick: ["/robototehnika-v-kolomne", "/programming-school", "/art-studio"] },
  { test: /allcourses|catalog|o-nas/, pick: [] },
];

export function collageShotsFor(path: string, images: CollageShot[] = []): CollageShot[] {
  const seen = new Set<string>();
  const out: CollageShot[] = [];
  function add(shot?: CollageShot | null) {
    if (!shot?.src) return;
    const key = shot.src.split("?")[0].toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      src: shot.src,
      alt: shot.alt || "Занятия в Студии Развивайся",
      filename: shot.filename,
      href: shot.href,
    });
  }
  for (const img of images) add(img);
  const p = String(path || "").toLowerCase();
  const theme = THEME.find((t) => t.test.test(p));
  for (const href of theme?.pick || []) {
    HOME_SHOTS.filter((s) => s.href === href).forEach(add);
  }
  for (const shot of HOME_SHOTS) add(shot);
  return out.slice(0, 7);
}
