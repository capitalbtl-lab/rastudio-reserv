"use client";

import { useRef, useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  src: string;
  title?: string;
  mode?: "ambient" | "watch";
  className?: string;
  poster?: string;
};

export function SiteVideo({ src, title, className, poster }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  if (!src) return null;

  function mute(el: HTMLVideoElement) {
    el.muted = true;
    el.volume = 0;
  }

  async function start() {
    const el = ref.current;
    if (!el) return;
    mute(el);
    try {
      el.currentTime = 0;
    } catch {
      /* */
    }
    try {
      await el.play();
      setOn(true);
    } catch {
      setOn(false);
    }
  }

  return (
    <div className={cn("relative overflow-hidden bg-header", className)}>
      <video
        ref={ref}
        src={src}
        poster={poster}
        className="h-full w-full object-cover"
        muted
        playsInline
        preload="metadata"
        controls={on}
        onLoadedMetadata={() => {
          const el = ref.current;
          if (!el || on) return;
          try {
            if (el.currentTime < 0.05) el.currentTime = 0.1;
          } catch {
            /* первый кадр */
          }
        }}
        onPlay={() => {
          if (ref.current) mute(ref.current);
          setOn(true);
        }}
        onPause={() => setOn(false)}
        onEnded={() => {
          setOn(false);
          try {
            if (ref.current) ref.current.currentTime = 0;
          } catch {
            /* */
          }
        }}
        onVolumeChange={() => {
          if (ref.current) mute(ref.current);
        }}
        aria-label={title || "Видео Студии Развивайся"}
      />
      {!on ? (
        <button
          type="button"
          className="absolute inset-0 grid place-items-center bg-header/30"
          onClick={() => void start()}
          aria-label={title ? `Смотреть: ${title}` : "Смотреть видео"}
        >
          <span className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-border-hover)] transition-transform duration-[var(--motion-fast)] hover:scale-105">
            <Play className="ml-0.5 size-7" fill="currentColor" />
          </span>
        </button>
      ) : null}
    </div>
  );
}
