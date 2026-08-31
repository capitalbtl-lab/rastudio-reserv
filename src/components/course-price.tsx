import { priceInfo, formatAmount } from "@/data/prices-core";
import { cn } from "@/lib/utils";

export function CoursePrice({
  path,
  tone = "page",
}: {
  path: string;
  tone?: "hero" | "page" | "row" | "card" | "overlay";
}) {
  const info = priceInfo(path);
  if (!info) return null;
  const sum = `${info.from ? "от " : ""}${formatAmount(info.amount)} ₽`;

  if (tone === "hero") {
    return (
      <div className="hero-in mt-5">
        <p className="font-display text-[1.85rem] leading-none tracking-tight text-header-fg">{sum}</p>
        <p className="mt-1.5 text-sm text-header-fg/65">за 4 недели · пробное без абонемента</p>
      </div>
    );
  }

  if (tone === "row") {
    return (
      <span className="shrink-0 text-right">
        <span className="block text-[0.95rem] font-semibold leading-none">{sum}</span>
        <span className="mt-1 block text-[0.65rem] text-muted">за 4 нед.</span>
      </span>
    );
  }

  if (tone === "card") {
    return (
      <p className="mt-2 text-[0.92rem] font-semibold text-primary">
        {sum} <span className="font-medium text-muted">/ 4 нед.</span>
      </p>
    );
  }

  if (tone === "overlay") {
    return <span className="font-semibold text-white">{sum} / 4 нед.</span>;
  }

  return (
    <div className={cn("rounded-2xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]")}>
      <p className="font-display text-2xl leading-none">{sum}</p>
      <p className="mt-1 text-xs text-muted">за 4 недели · пробное без абонемента</p>
    </div>
  );
}
