"use client";

import { cn } from "@/lib/utils";

export function InfoTip({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("relative inline-flex align-middle", className)}>
      <button
        type="button"
        className="peer grid size-5 place-items-center rounded-full bg-primary/15 text-[0.68rem] font-bold leading-none text-primary ring-1 ring-primary/20 hover:bg-primary hover:text-white"
        aria-label="Подсказка"
      >
        i
      </button>
      <span className="pointer-events-none absolute left-1/2 top-7 z-50 hidden w-72 -translate-x-1/2 rounded-2xl bg-[#12141a] px-3.5 py-3 text-left text-[0.78rem] font-normal leading-relaxed text-white shadow-xl peer-hover:block peer-focus:block md:w-80">
        {text}
      </span>
    </span>
  );
}
