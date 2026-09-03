"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const TIP_BOX =
  "rounded-[19.6px] bg-[#12141a] px-5 py-4 text-left text-[0.78rem] font-normal leading-relaxed text-white shadow-[0_10px_28px_rgba(15,23,42,0.28)]";

export function InfoTip({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("relative inline-flex align-top", className)}>
      <button
        type="button"
        className="peer grid size-[15px] place-items-center rounded-full bg-black/[0.06] text-[0.5rem] font-bold leading-none text-muted/80 ring-1 ring-black/10 hover:bg-black/10 hover:text-fg"
        aria-label="Подсказка"
      >
        i
      </button>
      <span className={cn("pointer-events-none absolute left-1/2 top-6 z-50 hidden w-[22rem] -translate-x-1/2 peer-hover:block peer-focus:block md:w-[26rem]", TIP_BOX)}>
        {text}
      </span>
    </span>
  );
}

export function TipWrap({ children, text }: { children: ReactNode; text: string }) {
  return (
    <span className="inline-flex items-start gap-1">
      {children}
      <InfoTip text={text} className="mt-1" />
    </span>
  );
}
