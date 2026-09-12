"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { RA_POP } from "@/data/admin-ui";
import {
  filterGroupHistory,
  historyKindCounts,
  ruHistoryWhen,
  type GroupHistoryEvent,
  type GroupHistoryKind,
} from "@/data/crm-group-history-core";

const FILTERS: { id: "all" | GroupHistoryKind; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "group", label: "Группа" },
  { id: "lesson", label: "Занятия" },
  { id: "member", label: "Состав" },
];

function kindTone(kind: GroupHistoryKind, title: string) {
  if (kind === "member") return title.startsWith("Вышел") ? "bg-[#e8eaee] text-[#5c636c]" : "bg-amber-50 text-amber-900";
  if (kind === "lesson") {
    if (title.includes("проведено")) return "bg-[#d9f3ec] text-[#0e7c66]";
    if (title.includes("отменено")) return "bg-[#f3f3f4] text-neutral-500";
    return "bg-[#fff3d6] text-[#8a5a00]";
  }
  return "bg-sky-50 text-sky-900";
}

export function AdminGroupHistory({
  groupId,
  branchId,
  name,
  loading,
  error,
  events,
  onClose,
  onOpenClient,
}: {
  groupId: number;
  branchId: number;
  name?: string;
  loading?: boolean;
  error?: string;
  events: GroupHistoryEvent[];
  onClose: () => void;
  onOpenClient?: (customerId: number) => void;
}) {
  const [kind, setKind] = useState<"all" | GroupHistoryKind>("all");
  const shown = useMemo(() => filterGroupHistory(events, kind), [events, kind]);
  const counts = useMemo(() => historyKindCounts(events), [events]);
  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/45 p-3" onClick={onClose} data-op="group-history">
      <article
        className={cn("flex max-h-[min(92vh,40rem)] w-full max-w-[36rem] flex-col overflow-hidden", RA_POP)}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-black/[0.06] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-muted">
                История группы · card:group:{branchId}:{groupId}
              </p>
              <h2 className="mt-0.5 truncate font-display text-[1.15rem] font-semibold text-fg">{name || `группа ${groupId}`}</h2>
              <p className="mt-1 text-[0.72rem] text-muted">С диска за весь период. Явка и касса детей не входят — только вход и выход из группы.</p>
            </div>
            <button type="button" className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f3f5f8] text-lg text-muted hover:text-fg" onClick={onClose} aria-label="Закрыть">
              ×
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={cn(
                  "h-7 rounded-full px-2.5 text-[0.72rem] font-semibold ring-1",
                  kind === f.id ? "bg-primary text-white ring-primary" : "bg-white text-fg ring-black/10 hover:ring-primary/30",
                )}
                onClick={() => setKind(f.id)}
              >
                {f.label} · {f.id === "all" ? counts.all : counts[f.id]}
              </button>
            ))}
          </div>
        </header>
        <div className="pretty-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="text-sm text-muted">Собираю события с диска…</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : shown.length ? (
            <ol className="space-y-1.5">
              {shown.map((e) => (
                <li key={e.id} className="rounded-xl bg-[#f6f8fb] px-3 py-2 ring-1 ring-black/5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-[0.65rem] font-semibold", kindTone(e.kind, e.title))}>{e.title}</span>
                    <span className="text-[0.68rem] text-muted">{ruHistoryWhen(e.at)}</span>
                  </div>
                  <p className="mt-1 text-[0.78rem] leading-snug text-fg">{e.detail}</p>
                  {e.customerId && onOpenClient ? (
                    <button
                      type="button"
                      className="mt-1 text-[0.72rem] font-semibold text-primary hover:underline"
                      onClick={() => onOpenClient(e.customerId!)}
                    >
                      карточка customerId {e.customerId}
                    </button>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">На диске пока нет событий этой группы.</p>
          )}
        </div>
      </article>
    </div>
  );
}
