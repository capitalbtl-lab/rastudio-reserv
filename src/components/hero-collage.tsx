"use client";

import { useEffect, useMemo, useState } from "react";
import { PageLink } from "@/components/page-link";
import { SeoImage } from "@/components/seo-image";

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

function byHref(href: string) {
  return HOME_SHOTS.filter((s) => s.href && href.includes(s.href.replace(/^\//, "")));
}

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

function nextFree(len: number, current: number[], slot: number) {
  if (len <= 3) return current[slot] % len;
  const used = new Set(current.filter((_, i) => i !== slot));
  let i = (current[slot] + 1) % len;
  for (let n = 0; n < len; n += 1) {
    if (!used.has(i)) return i;
    i = (i + 1) % len;
  }
  return i;
}

function ShotCard({ shots, index }: { shots: CollageShot[]; index: number }) {
  const [shown, setShown] = useState(index);
  const [incoming, setIncoming] = useState<number | null>(null);

  useEffect(() => {
    if (index === shown) return;
    setIncoming(index);
    const t = window.setTimeout(() => {
      setShown(index);
      setIncoming(null);
    }, 780);
    return () => window.clearTimeout(t);
  }, [index, shown]);

  const current = shots[shown] || shots[0];
  const next = incoming !== null ? shots[incoming] : null;
  if (!current) return null;
  const inner = (
    <>
      <SeoImage
        src={current.src}
        alt={current.alt}
        filename={current.filename}
        className="h-full w-full"
        imgClassName="h-full w-full object-cover"
        loading="eager"
      />
      {next ? (
        <SeoImage
          key={next.src}
          src={next.src}
          alt={next.alt}
          filename={next.filename}
          className="shot-fade h-full w-full"
          imgClassName="h-full w-full object-cover"
        />
      ) : null}
    </>
  );
  if (current.href) {
    return (
      <PageLink to={current.href} className="shot-card bg-header" aria-label={current.alt}>
        {inner}
      </PageLink>
    );
  }
  return (
    <div className="shot-card bg-header" aria-label={current.alt}>
      {inner}
    </div>
  );
}

export function HeroCollage({ shots }: { shots?: CollageShot[] }) {
  const pack = useMemo(() => {
    const list = shots?.length ? shots : HOME_SHOTS;
    return list.length >= 3 ? list : collageShotsFor("/", list);
  }, [shots]);
  const [slots, setSlots] = useState([0, 1, 2]);

  useEffect(() => {
    setSlots([0, 1, Math.min(2, pack.length - 1)]);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (pack.length < 4) return;
    let slot = 0;
    const id = window.setInterval(() => {
      setSlots((prev) => {
        const next = [...prev];
        next[slot] = nextFree(pack.length, next, slot);
        slot = (slot + 1) % 3;
        return next;
      });
    }, 2400);
    return () => window.clearInterval(id);
  }, [pack]);

  return (
    <>
      <div className="relative hidden lg:block">
        <div className="photo-stack">
          {slots.map((index, slot) => (
            <div key={slot} className="shot">
              <ShotCard shots={pack} index={index} />
            </div>
          ))}
        </div>
      </div>
      <div className="snap-row lg:hidden">
        {pack.slice(0, 4).map((shot) => {
          const card = (
            <SeoImage
              src={shot.src}
              alt={shot.alt}
              filename={shot.filename}
              className="aspect-4/5"
              loading="eager"
            />
          );
          return shot.href ? (
            <PageLink key={shot.src} to={shot.href} className="snap-card overflow-hidden rounded-3xl">
              {card}
            </PageLink>
          ) : (
            <div key={shot.src} className="snap-card overflow-hidden rounded-3xl">
              {card}
            </div>
          );
        })}
      </div>
    </>
  );
}
