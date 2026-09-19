/** Конструктор: одни стили на любой [data-ve-frame], не на конкретную страницу. */

export type VeStyle = {
  hidden?: boolean;
  padTop?: number;
  padBottom?: number;
  bg?: string;
  h?: number;
  align?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

const BG: Record<string, string> = {
  ink: "var(--header, #111827)",
  paper: "#fff",
  surface: "var(--surface, #f4f1ea)",
};

export function paintVeFrame(el: HTMLElement, st: VeStyle | undefined, mode: "edit" | "live") {
  if (mode === "live" && st?.hidden) {
    el.style.display = "none";
    return;
  }
  if (el.style.display === "none") el.style.display = "";
  el.style.opacity = mode === "edit" && st?.hidden ? "0.45" : "";
  el.style.paddingTop = st?.padTop ? `${st.padTop}px` : "";
  el.style.paddingBottom = st?.padBottom ? `${st.padBottom}px` : "";
  el.style.minHeight = st?.h ? `${st.h}px` : "";
  el.style.textAlign = (st?.align as CanvasTextAlign) || "";
  el.style.background = st?.bg && st.bg !== "inherit" ? BG[st.bg] || "" : "";
  if (st?.fontSize) el.style.fontSize = `${st.fontSize}px`;
  el.style.fontWeight = st?.bold ? "700" : "";
  el.style.fontStyle = st?.italic ? "italic" : "";
  el.style.textDecoration = st?.underline ? "underline" : "";
}

export function paintVeFrames(styles: Record<string, VeStyle | undefined> | undefined, mode: "edit" | "live") {
  if (typeof document === "undefined") return;
  document.querySelectorAll<HTMLElement>("[data-ve-frame]").forEach((el) => {
    const id = el.getAttribute("data-ve-frame") || "";
    paintVeFrame(el, styles?.[id], mode);
  });
}

export function hasVeStyles(styles: Record<string, VeStyle | undefined> | undefined) {
  return Boolean(styles && Object.keys(styles).length);
}
