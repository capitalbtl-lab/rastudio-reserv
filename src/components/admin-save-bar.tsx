import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Кнопки сохранения в правом нижнем углу белой карточки, с тем же отступом, что у серого поля до края. */
export function AdminSaveBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mt-auto flex flex-wrap items-center justify-end gap-2 pt-4", className)}>
      {children}
    </div>
  );
}