"use client";

import { useRef } from "react";
import { videoPack } from "@/data/page-media";
import { cn } from "@/lib/utils";

const DEFAULT = videoPack("/roboticsinenglish").clips || [];

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

export function RobotEnglishVideos() {
  return (
    <PageVideoGrid
      clips={[...DEFAULT]}
      titles={["Педагог курса", "Занятие", "Практика", "Лаборатория"]}
    />
  );
}
