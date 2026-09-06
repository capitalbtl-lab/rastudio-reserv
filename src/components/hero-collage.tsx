"use client";

import { useEffect, useMemo, useState } from "react";
import { PageLink } from "@/components/page-link";
import { SeoImage } from "@/components/seo-image";
import { collageShotsFor, HOME_SHOTS, type CollageShot } from "@/data/hero-shots";

export type { CollageShot };
export { collageShotsFor, HOME_SHOTS };

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
