"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { videoPack } from "@/data/page-media";
import { PageLink } from "@/components/page-link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEFAULT = videoPack("/roboticsinenglish").clips || [];
const LABELS = ["Педагог", "Занятие", "Практика", "Лаборатория"] as const;
const FACTS = ["9–13 лет", "Носитель языка", "Код · схемы · 3D"] as const;

export function PageVideoGrid({
  clips,
  titles,
}: {
  clips: string[];
  titles?: string[];
}) {
  const refs = useRef<Array<HTMLVideoElement | null>>([]);
  if (!clips.length) return null;
  const unique = [...new Set(clips)];
  const featured = unique[0];
  const rest = unique.slice(1);

  function onPlay(index: number) {
    refs.current.forEach((el, i) => {
      if (el && i !== index) el.pause();
    });
  }

  function Clip({ src, index, className, title }: { src: string; index: number; className?: string; title?: string }) {
    return (
      <div className={cn("overflow-hidden rounded-3xl bg-ink", className)}>
        <video
          ref={(el) => {
            refs.current[index] = el;
          }}
          src={src}
          className="aspect-video w-full object-cover"
          controls
          playsInline
          preload="metadata"
          onPlay={() => onPlay(index)}
          aria-label={title || `Видео ${index + 1}`}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <Clip src={featured} index={0} title={titles?.[0]} />
      {rest.length ? (
        <div className={cn("grid gap-3", rest.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
          {rest.map((src, i) => (
            <Clip key={src} src={src} index={i + 1} title={titles?.[i + 1]} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LangPulse() {
  const [en, setEn] = useState(true);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setEn((v) => !v), 2200);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-header-fg">
      <span className={cn("transition-opacity duration-[var(--motion-slow)]", en ? "opacity-100" : "opacity-35")}>EN</span>
      <span className="opacity-35">·</span>
      <span className={cn("transition-opacity duration-[var(--motion-slow)]", en ? "opacity-35" : "opacity-100")}>RU</span>
    </span>
  );
}

export function RobotEnglishVideos() {
  const clips = [...new Set(DEFAULT)];
  const [active, setActive] = useState(0);
  const [watching, setWatching] = useState(false);
  const src = clips[active] || clips[0];
  if (!src) return null;

  return (
    <section className="page-wrap pt-10 pb-2 md:pt-14">
      <div className="overflow-hidden rounded-[2rem] bg-ink text-header-fg shadow-[var(--shadow-border)]">
        <div className="grid lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="flex flex-col justify-center px-6 py-8 md:px-10 md:py-12">
            <div className="flex flex-wrap items-center gap-2">
              <p className="kicker text-header-fg/50">Билингвальный курс</p>
              <LangPulse />
            </div>
            <h2 className="section-title mt-4 text-header-fg">Робототехника на английском</h2>
            <p className="mt-4 max-w-md text-[1.02rem] leading-relaxed text-header-fg/70">
              Занятие ведёт носитель языка, рядом — педагог-переводчик. Дети собирают, программируют, читают схемы и моделируют в 3D — сразу на двух языках.
            </p>
            <p className="mt-5 flex flex-wrap gap-2">
              {FACTS.map((item) => (
                <span key={item} className="rounded-full bg-white/10 px-3 py-1 text-[0.78rem] font-semibold text-header-fg">
                  {item}
                </span>
              ))}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <PageLink to="/roboticsinenglish">Смотреть курс</PageLink>
              </Button>
              <Button asChild size="lg" variant="outline">
                <PageLink to="/roboticsinenglish#trial">Пробное занятие</PageLink>
              </Button>
            </div>
          </div>

          <div className="relative flex min-h-[16rem] flex-col bg-header lg:min-h-full">
            <div className="relative aspect-video min-h-[14rem] flex-1 lg:aspect-auto">
              <video
                key={`${src}-${watching ? "on" : "off"}`}
                src={src}
                className="absolute inset-0 h-full w-full object-cover"
                autoPlay
                muted={!watching}
                loop={!watching}
                controls={watching}
                playsInline
                preload="metadata"
                aria-label={LABELS[active]}
                onPlay={() => setWatching(true)}
              />
              {!watching ? (
                <button
                  type="button"
                  className="absolute inset-0 grid place-items-center bg-header/25"
                  onClick={() => setWatching(true)}
                  aria-label={`Смотреть: ${LABELS[active]}`}
                >
                  <span className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-border-hover)] transition-transform duration-[var(--motion-fast)] hover:scale-105">
                    <Play className="ml-0.5 size-7" fill="currentColor" />
                  </span>
                </button>
              ) : null}
            </div>
            {clips.length > 1 ? (
              <div className="grid shrink-0 grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">
                {clips.map((clip, i) => (
                  <button
                    key={clip}
                    type="button"
                    onClick={() => {
                      setActive(i);
                      setWatching(true);
                    }}
                    className={cn(
                      "px-3 py-3 text-left transition-colors duration-[var(--motion-fast)]",
                      i === active ? "bg-white/12 text-header-fg" : "bg-header text-header-fg/55 hover:bg-white/8 hover:text-header-fg",
                    )}
                  >
                    <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-header-fg/40">
                      0{i + 1}
                    </span>
                    <span className="mt-1 block text-sm font-semibold">{LABELS[i] || `Серия ${i + 1}`}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
