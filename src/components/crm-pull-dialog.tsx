"use client";

import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { RA_POP } from "@/data/admin-ui";
import { cn } from "@/lib/utils";

export type CrmPullState = {
  open: boolean;
  kind: "subjects" | "groups" | "tariffs" | "clients" | "prices";
  step: string;
  done: boolean;
  error: string;
  lines: { ok: boolean; text: string }[];
  added: number;
  updated: number;
  total: number;
};

const TITLES: Record<CrmPullState["kind"], string> = {
  subjects: "Подтягиваю предметы из Alfa",
  groups: "Подтягиваю группы из Alfa",
  tariffs: "Подтягиваю абонементы из Alfa",
  clients: "Подтягиваю клиентов из Alfa",
  prices: "Подтягиваю цены из Alfa",
};

export function emptyPull(kind: CrmPullState["kind"]): CrmPullState {
  return { open: false, kind, step: "", done: false, error: "", lines: [], added: 0, updated: 0, total: 0 };
}

export function CrmPullDialog({ pull, onClose }: { pull: CrmPullState; onClose: () => void }) {
  if (!pull.open || typeof document === "undefined") return null;
  const title = pull.done ? (pull.error ? "Не получилось" : "Готово") : TITLES[pull.kind];
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={() => pull.done && onClose()}>
      <div className={cn("w-full max-w-md p-6", RA_POP)} onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-2xl">{title}</p>
        {!pull.done ? (
          <div className="mt-5 flex items-start gap-3">
            <span className="mt-0.5 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            <p className="text-sm text-fg">{pull.step || "Соединяюсь с Alfa…"}</p>
          </div>
        ) : (
          <div className="mt-4 space-y-2 text-sm">
            {pull.error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-red-700">{pull.error}</p> : null}
            {pull.lines.map((line) => (
              <p key={line.text} className={`rounded-2xl px-4 py-3 ${line.ok ? "bg-[#f3f5f8]" : "bg-red-50 text-red-700"}`}>
                {line.text}
              </p>
            ))}
            {!pull.lines.length && !pull.error ? (
              <p className="rounded-2xl bg-[#f3f5f8] px-4 py-3">
                Загружено: <b>{pull.total || pull.added}</b>
              </p>
            ) : null}
          </div>
        )}
        {pull.done ? (
          <div className="mt-5 flex justify-end">
            <Button type="button" onClick={onClose}>
              Закрыть
            </Button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
