"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, MapPin } from "lucide-react";
import type { CmsSession } from "@/data/cms";
import { AGE_BANDS, type AgeBandId } from "@/data/ages";
import { cn } from "@/lib/utils";
import {
  branchMeta,
  branchRank,
  compactWhen,
  matchesAgeBand,
} from "@/lib/schedule";

export function ScheduleBlock({ sessions, heading = true }: { sessions: CmsSession[]; heading?: boolean }) {
  const cities = useMemo(
    () => [...new Set(sessions.map((s) => branchMeta(s).city).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")),
    [sessions],
  );

  const [city, setCity] = useState("");
  const [age, setAge] = useState<AgeBandId | "">("");

  if (!sessions.length) return null;

  const filtered = sessions.filter((s) => {
    const meta = branchMeta(s);
    if (city && meta.city !== city) return false;
    if (age && !matchesAgeBand(s.age, age)) return false;
    return true;
  });

  const ordered = [...filtered].sort((a, b) => {
    const br = branchRank(a) - branchRank(b);
    if (br) return br;
    return compactWhen(a.when).localeCompare(compactWhen(b.when), "ru");
  });

  const groups: { city: string; address: string; items: CmsSession[] }[] = [];
  for (const session of ordered) {
    const meta = branchMeta(session);
    const last = groups[groups.length - 1];
    if (last && last.city === meta.city && last.address === meta.address) last.items.push(session);
    else groups.push({ city: meta.city, address: meta.address, items: [session] });
  }

  return (
    <section className="mt-10">
      {heading ? (
        <>
          <p className="kicker">Расписание</p>
          <h2 className="display mt-2 text-xl md:text-2xl">Группы этого курса</h2>
        </>
      ) : null}

      {cities.length > 1 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <FilterChip on={!city} onClick={() => setCity("")}>
            Все города
          </FilterChip>
          {cities.map((item) => (
            <FilterChip key={item} on={city === item} onClick={() => setCity(item)}>
              {item}
            </FilterChip>
          ))}
        </div>
      ) : null}

      <div className={cn("flex flex-wrap gap-2", cities.length > 1 ? "mt-2" : "mt-4")}>
        <FilterChip on={!age} onClick={() => setAge("")}>
          Все возраста
        </FilterChip>
        {AGE_BANDS.map((band) => (
          <FilterChip key={band.id} on={age === band.id} onClick={() => setAge(band.id)}>
            {band.label}
          </FilterChip>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {groups.length ? (
          groups.map((group) => (
            <div
              key={`${group.city}-${group.address}`}
              className="overflow-hidden rounded-[1.35rem] bg-surface shadow-[var(--shadow-border)]"
            >
              <div className="flex items-center gap-3 px-3.5 pb-2 pt-3.5 md:px-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <MapPin className="size-4" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">{group.city}</p>
                  <p className="text-sm font-semibold leading-tight">{group.address}</p>
                </div>
              </div>
              <ul>
                {group.items.map((s) => {
                  const row = (
                    <span className="flex items-center gap-3 px-3.5 py-2.5 md:gap-4 md:px-4">
                      <span className="inline-flex min-w-[4.75rem] justify-center rounded-full bg-primary/10 px-2 py-1 text-[0.68rem] font-semibold text-primary">
                        {s.age || "группа"}
                      </span>
                      <span className="min-w-0 flex-1 text-[0.95rem] font-medium leading-snug">
                        {compactWhen(s.when)}
                      </span>
                      {s.signup ? (
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-fg text-bg transition-colors duration-[var(--motion-fast)] group-hover:bg-primary">
                          <ArrowUpRight className="size-3.5" strokeWidth={2.2} />
                        </span>
                      ) : null}
                    </span>
                  );
                  return (
                    <li key={s.id} className="border-t border-border/70">
                      {s.signup ? (
                        <a href={s.signup} className="group block transition-colors hover:bg-[#f3f5f8]">
                          {row}
                        </a>
                      ) : (
                        row
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        ) : (
          <p className="rounded-[1.35rem] bg-surface px-4 py-5 text-sm text-muted shadow-[var(--shadow-border)]">
            Нет групп с такими фильтрами.
          </p>
        )}
      </div>
    </section>
  );
}

function FilterChip({
  on,
  children,
  onClick,
}: {
  on: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold transition-colors",
        on ? "bg-fg text-bg" : "bg-surface text-fg shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]",
      )}
    >
      {children}
    </button>
  );
}
