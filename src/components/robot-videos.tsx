"use client";

import { useRef } from "react";

const VIDEOS = [
  { src: "/media/home/robot-en-1.mp4", title: "Педагог курса" },
  { src: "/media/home/robot-en-2.mp4", title: "Занятие" },
  { src: "/media/home/robot-en-3.mp4", title: "Практика" },
  { src: "/media/home/robot-en-4.mp4", title: "Лаборатория" },
] as const;

export function RobotEnglishVideos() {
  const refs = useRef<Array<HTMLVideoElement | null>>([]);

  function onPlay(index: number) {
    refs.current.forEach((el, i) => {
      if (el && i !== index) el.pause();
    });
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {VIDEOS.map((clip, i) => (
        <div key={clip.src} className="overflow-hidden rounded-2xl bg-black">
          <video
            ref={(el) => {
              refs.current[i] = el;
            }}
            src={clip.src}
            className="aspect-video w-full object-cover"
            controls
            playsInline
            preload="metadata"
            onPlay={() => onPlay(i)}
            aria-label={clip.title}
          />
        </div>
      ))}
    </div>
  );
}
