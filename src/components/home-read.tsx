"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { normalizeHomeLayout, type HomeDevice, type HomeLayoutDoc } from "@/data/home-layout-core";
import type { EditorPageItem } from "@/data/page-layout-core";
import { cn } from "@/lib/utils";

export type HomeEditorCtxValue = {
  editing: boolean;
  selected: string | null;
  select: (id: string | null) => void;
  doc: HomeLayoutDoc;
  device: HomeDevice;
  setDevice: (d: HomeDevice) => void;
  setDoc: (next: HomeLayoutDoc, persist?: boolean) => void;
  text: (id: string, fallback: string) => string;
  setText: (id: string, value: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  dirty: string;
  path: string;
  pages: EditorPageItem[];
  goPage: (path: string) => void;
  saveNow: () => void;
  publish: () => void;
  preview: () => void;
  canPublish: boolean;
  phoneIssues: string[];
  rail: "elements" | "sections" | "pages" | "media" | "ai" | "agent" | null;
  setRail: (r: HomeEditorCtxValue["rail"]) => void;
  askScope: { id: string; typeId: string; label: string } | null;
  chooseScope: (scope: "one" | "type") => void;
  blockScope: (id: string) => "one" | "type" | null;
};

export const HomeEditorCtx = createContext<HomeEditorCtxValue | null>(null);

export function useHomeEditor() {
  return useContext(HomeEditorCtx);
}

const noop = () => {};

export function HomeReadProvider({
  initial,
  children,
}: {
  initial?: unknown;
  children: ReactNode;
}) {
  const doc = useMemo(() => normalizeHomeLayout(initial), [initial]);
  const value = useMemo<HomeEditorCtxValue>(
    () => ({
      editing: false,
      selected: null,
      select: noop,
      doc,
      device: "desktop",
      setDevice: noop,
      setDoc: noop,
      text: (id, fallback) => doc.texts[id] || fallback,
      setText: noop,
      undo: noop,
      redo: noop,
      canUndo: false,
      canRedo: false,
      dirty: "готово",
      path: "/",
      pages: [],
      goPage: noop,
      saveNow: noop,
      publish: noop,
      preview: noop,
      canPublish: false,
      phoneIssues: [],
      rail: null,
      setRail: noop,
      askScope: null,
      chooseScope: noop,
      blockScope: () => null,
    }),
    [doc],
  );
  return <HomeEditorCtx.Provider value={value}>{children}</HomeEditorCtx.Provider>;
}

export function EditText({
  id,
  as: Tag = "span",
  className,
  children,
}: {
  id: string;
  as?: "span" | "p" | "h1" | "h2" | "h3" | "div";
  className?: string;
  children: string;
}) {
  const ctx = useHomeEditor();
  const fallback = String(children).replace(/\s+/g, " ").trim();
  const value = ctx?.text(id, fallback) || fallback;
  const editing = Boolean(ctx?.editing);
  const slot = id.includes(".") ? id.slice(0, id.indexOf(".")) : id;
  const st = ctx?.doc.styles[slot];
  return (
    <Tag
      data-ve-key={id}
      data-ve-slot={slot}
      className={cn(className, editing && "ve-text")}
      contentEditable={editing}
      suppressContentEditableWarning
      style={{
        textAlign: st?.align,
        fontSize: st?.fontSize ? `${st.fontSize}px` : undefined,
        fontWeight: st?.bold ? 700 : undefined,
        fontStyle: st?.italic ? "italic" : undefined,
        textDecoration: st?.underline ? "underline" : undefined,
      }}
      onMouseDown={(e) => editing && e.stopPropagation()}
      onFocus={() => {
        if (editing) ctx?.select(slot);
      }}
      onBlur={(e) => {
        const next = (e.currentTarget.textContent || "").trim();
        if (next && next !== value) ctx?.setText(id, next);
      }}
    >
      {value}
    </Tag>
  );
}
