"use client";

import { cn } from "@/lib/utils";

type Props = {
  src: string;
  title?: string;
  mode?: "ambient" | "watch";
  className?: string;
  poster?: string;
};

export function SiteVideo({ src, title, mode = "ambient", className, poster }: Props) {
  if (!src) return null;
  const ambient = mode === "ambient";
  return (
    <video
      src={src}
      poster={poster}
      className={cn("h-full w-full object-cover", className)}
      autoPlay={ambient}
      muted={ambient}
      loop={ambient}
      controls={!ambient}
      playsInline
      preload="metadata"
      aria-label={title || "Видео Студии Развивайся"}
    />
  );
}
