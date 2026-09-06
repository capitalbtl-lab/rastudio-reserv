"use client";

import { useRef } from "react";
import { videoPack } from "@/data/page-media";

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

  function onPlay(index: number) {
    refs.current.forEach((el, i) => {
      if (el && i !== index) el.pause();
    });
  }

  return (
    <div className={`grid gap-3 ${clips.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
      {clips.map((src, i) => (
        <div key={src} className="overflow-hidden rounded-2xl bg-black">
          <video
            ref={(el) => {
              refs.current[i] = el;
            }}
            src={src}
            className="aspect-video w-full object-cover"
            controls
            playsInline
            preload="metadata"
            onPlay={() => onPlay(i)}
            aria-label={titles?.[i] || `Видео ${i + 1}`}
          />
        </div>
      ))}
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
