import type { DragEvent as ReactDragEvent } from "react";

const TYPE = "text/site-media";

let ghost: HTMLDivElement | null = null;

export function startMediaDrag(e: ReactDragEvent, src: string, kind: "image" | "video") {
  e.dataTransfer.setData(TYPE, src);
  e.dataTransfer.setData("text/plain", src);
  e.dataTransfer.effectAllowed = "copy";
  try {
    const blank = document.createElement("canvas");
    blank.width = 1;
    blank.height = 1;
    e.dataTransfer.setDragImage(blank, 0, 0);
  } catch {
    /* */
  }
  endMediaDrag();
  const rot = Math.round(Math.random() * 28 - 14);
  const skew = Math.round(Math.random() * 14 - 7);
  const shift = Math.round(Math.random() * 10 - 3);
  ghost = document.createElement("div");
  ghost.className = "ve-media-ghost";
  ghost.style.setProperty("--ve-rot", `${rot}deg`);
  ghost.style.setProperty("--ve-skew", `${skew}deg`);
  ghost.style.setProperty("--ve-shift", `${shift}px`);
  if (kind === "image") {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    ghost.appendChild(img);
  } else {
    const p = document.createElement("span");
    p.textContent = "видео";
    ghost.appendChild(p);
  }
  document.body.appendChild(ghost);
  moveMediaDrag(e.clientX, e.clientY);
}

export function moveMediaDrag(x: number, y: number) {
  if (!ghost) return;
  ghost.style.left = `${x - 42}px`;
  ghost.style.top = `${y - 28}px`;
}

export function endMediaDrag() {
  ghost?.remove();
  ghost = null;
}

export function mediaFromDrop(e: DragEvent | ReactDragEvent) {
  const dt = e.dataTransfer;
  if (!dt) return "";
  const own = dt.getData(TYPE) || "";
  if (own.startsWith("/media/")) return own;
  const plain = dt.getData("text/plain") || "";
  return plain.startsWith("/media/") ? plain : "";
}
