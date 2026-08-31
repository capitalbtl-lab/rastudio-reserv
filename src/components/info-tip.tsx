"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
      <span className="pointer-events-none absolute left-1/2 top-6 z-50 hidden w-[22rem] -translate-x-1/2 rounded-2xl bg-[#12141a] px-3.5 py-3 text-left text-[0.78rem] font-normal leading-relaxed text-white shadow-xl peer-hover:block peer-focus:block md:w-[26rem]">
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
