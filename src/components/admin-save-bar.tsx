import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Кнопка сохранения сразу под полями, справа, с тем же отступом, что у серого блока до края карточки. */
export function AdminSaveBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mt-5 flex flex-wrap items-center justify-end gap-2", className)}>
      {children}
    </div>
  );
}