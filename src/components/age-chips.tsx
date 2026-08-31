import { AGE_BANDS } from "@/data/ages";
import { PageLink } from "@/components/page-link";
import { cn } from "@/lib/utils";

export function AgeChips({
  active,
  onDark = false,
  className,
}: {
  active?: string;
  onDark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {AGE_BANDS.map((band) => {
        const on = active === band.id;
        return (
          <PageLink
            key={band.id}
            to={`/allcourses?age=${band.id}`}
            className={cn(
              "inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors",
              onDark
                ? on
                  ? "bg-bg text-fg"
                  : "bg-white/10 text-header-fg hover:bg-white/16"
                : on
                  ? "bg-fg text-bg"
                  : "bg-surface text-fg shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]",
            )}
          >
            {band.label}
          </PageLink>
        );
      })}
    </div>
  );
}
