"use client";

import { useEffect, useState } from "react";
import { PageLink } from "@/components/page-link";
import { SeoImage } from "@/components/seo-image";

const SHOTS = [
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
] as const;

function nextFree(current: number[], slot: number) {
  const used = new Set(current.filter((_, i) => i !== slot));
  let i = (current[slot] + 1) % SHOTS.length;
  for (let n = 0; n < SHOTS.length; n += 1) {
    if (!used.has(i)) return i;
    i = (i + 1) % SHOTS.length;
  }
  return i;
}

function ShotCard({ index }: { index: number }) {
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

  const current = SHOTS[shown];
  const next = incoming !== null ? SHOTS[incoming] : null;

  return (
    <PageLink to={current.href} className="shot-card bg-header" aria-label={current.alt}>
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
    </PageLink>
  );
}

export function HeroCollage() {
  const [slots, setSlots] = useState([0, 1, 2]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let slot = 0;
    const id = window.setInterval(() => {
      setSlots((prev) => {
        const next = [...prev];
        next[slot] = nextFree(next, slot);
        slot = (slot + 1) % 3;
        return next;
      });
    }, 2400);
    return () => window.clearInterval(id);
  }, []);

  return (
    <>
      <div className="relative hidden lg:block">
        <div className="photo-stack">
          {slots.map((index, slot) => (
            <div key={slot} className="shot">
              <ShotCard index={index} />
            </div>
          ))}
        </div>
      </div>
      <div className="snap-row lg:hidden">
        {SHOTS.slice(0, 4).map((shot) => (
          <PageLink key={shot.src} to={shot.href} className="snap-card overflow-hidden rounded-3xl">
            <SeoImage
              src={shot.src}
              alt={shot.alt}
              filename={shot.filename}
              className="aspect-4/5"
              loading="eager"
            />
          </PageLink>
        ))}
      </div>
    </>
  );
}
