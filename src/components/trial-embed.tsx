"use client";

export function TrialEmbed({ src, title = "Запись на пробное", className = "" }: { src: string; title?: string; className?: string }) {
  if (!src) return null;
  return (
    <iframe
      title={title}
      src={src}
      width="100%"
      height="100%"
      frameBorder={0}
      scrolling="no"
      className={`overflow-hidden ${className}`.trim()}
    />
  );
}
