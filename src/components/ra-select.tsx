"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { RA_POP } from "@/data/admin-ui";

export type RaOption = { value: string; label: string; hint?: string };
export type RaGroup = { label: string; options: RaOption[] };

export function RaSelect({
  value,
  onChange,
  options,
  groups,
  placeholder = "выберите",
  disabled,
  className,
  menuMinWidth = 0,
}: {
  value: string;
  onChange: (v: string) => void;
  options?: RaOption[];
  groups?: RaGroup[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  menuMinWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 240, maxH: 280, up: false });

  const all = useMemo(() => (groups ? groups.flatMap((g) => g.options) : options) || [], [groups, options]);
  const current = all.find((o) => o.value === value);
  const qq = q.trim().toLowerCase();
  const match = (o: RaOption) => !qq || o.label.toLowerCase().includes(qq) || (o.hint || "").toLowerCase().includes(qq);
  const shownGroups = useMemo(() => {
    if (!groups) return [];
    return groups
      .map((g) => ({ ...g, options: g.options.filter(match) }))
      .filter((g) => g.options.length);
  }, [groups, qq]);
  const shownOpts = useMemo(() => (options || []).filter(match), [options, qq]);
  const total = groups ? groups.reduce((n, g) => n + g.options.length, 0) : (options || []).length;
  const searchable = total > 8;

  function place() {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(Math.max(r.width, menuMinWidth, 240), window.innerWidth - 16);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    const spaceBelow = window.innerHeight - r.bottom - 10;
    const spaceAbove = r.top - 10;
    const up = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxH = Math.min(340, Math.max(up ? spaceAbove : spaceBelow, 140));
    setPos({
      top: up ? r.top - 4 : r.bottom + 4,
      left,
      width,
      maxH,
      up,
    });
  }

  useEffect(() => {
    if (!open) return;
    place();
    setQ("");
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  const itemCls = (on: boolean) =>
    cn("flex w-full flex-col px-3 py-1.5 text-left text-[0.82rem] leading-snug hover:bg-[#eef4fb]", on && "bg-primary/10 font-semibold text-primary");

  const menu = open ? (
    <div
      ref={menuRef}
      className={cn("fixed z-[400] overflow-hidden", RA_POP)}
      style={{
        top: pos.up ? pos.top - pos.maxH : pos.top,
        left: pos.left,
        width: pos.width,
        maxHeight: pos.maxH,
      }}
    >
      {searchable ? (
        <div className="border-b border-black/8 p-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="поиск…"
            className="h-8 w-full rounded-full bg-[#f3f5f9] px-3 text-sm outline-none ring-1 ring-black/8 focus:ring-2 focus:ring-primary/35"
          />
        </div>
      ) : null}
      <ul className="pretty-scroll overflow-y-auto py-1" style={{ maxHeight: searchable ? pos.maxH - 48 : pos.maxH }}>
        <li className={groups?.length ? "border-b border-black/8 mb-1 pb-1" : undefined}>
          <button type="button" className={itemCls(!value)} onClick={() => pick("")}>
            <span className={value ? "text-muted" : "font-semibold"}>{placeholder}</span>
          </button>
        </li>
        {groups
          ? shownGroups.map((g) => (
              <li key={g.label}>
                <p className="px-3 pb-0.5 pt-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted">{g.label}</p>
                {g.options.map((o) => (
                  <button key={o.value} type="button" className={itemCls(o.value === value)} onClick={() => pick(o.value)}>
                    <span>{o.label}</span>
                    {o.hint ? <span className="text-[0.72rem] font-normal text-muted">{o.hint}</span> : null}
                  </button>
                ))}
              </li>
            ))
          : shownOpts.map((o) => (
              <li key={o.value}>
                <button type="button" className={itemCls(o.value === value)} onClick={() => pick(o.value)}>
                  <span>{o.label}</span>
                  {o.hint ? <span className="text-[0.72rem] font-normal text-muted">{o.hint}</span> : null}
                </button>
              </li>
            ))}
        {((groups && !shownGroups.length) || (!groups && !shownOpts.length)) && qq ? (
          <li className="px-3 py-3 text-center text-[0.78rem] text-muted">ничего не найдено</li>
        ) : null}
      </ul>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md bg-white px-2 text-left text-sm ring-1 ring-black/10 disabled:opacity-50",
          className,
        )}
      >
        <span className={cn("min-w-0 truncate", !current && "text-muted")}>{current?.label || placeholder}</span>
        <span className="shrink-0 text-[0.7rem] opacity-55">▾</span>
      </button>
      {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </>
  );
}
