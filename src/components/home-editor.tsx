"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Eye, EyeOff, GripVertical, Monitor, Redo2, Smartphone, Tablet, Undo2 } from "lucide-react";
import { debugSession } from "@/data/debug-fn";
import { debugEmit } from "@/data/debug-client";
import { saveHomeLayoutFn } from "@/data/home-layout-fn";
import {
  emptyHomeLayout,
  homeBlockLabel,
  moveHomeBlock,
  normalizeHomeLayout,
  patchHomeStyle,
  placeHomeBlock,
  setHomeText,
  setHomeMedia,
  type HomeBg,
  type HomeBlockId,
  type HomeDevice,
  type HomeLayoutDoc,
} from "@/data/home-layout-core";
import { StudioPanel } from "@/components/home-studio";
import { HomeEditorCtx, useHomeEditor, type HomeEditorCtxValue } from "@/components/home-read";
import { useHomeSlots, slotBg } from "@/components/home-public";
import { endMediaDrag, mediaFromDrop, moveMediaDrag } from "@/lib/media-drag";
import { cn } from "@/lib/utils";
import "./home-editor.css";

export { EditText, useHomeEditor } from "@/components/home-read";

const KEY = "ra_debug";

function debugToken() {
  try {
    return sessionStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function HomeEditorProvider({
  initial,
  children,
}: {
  initial?: unknown;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [doc, setDocState] = useState(() => normalizeHomeLayout(initial));
  const [device, setDevice] = useState<HomeDevice>("desktop");
  const [dirty, setDirty] = useState("готово");
  const hist = useRef<HomeLayoutDoc[]>([normalizeHomeLayout(initial)]);
  const histAt = useRef(0);
  const timer = useRef<number>(0);

  useEffect(() => {
    setDocState(normalizeHomeLayout(initial));
    hist.current = [normalizeHomeLayout(initial)];
    histAt.current = 0;
  }, [initial]);

  useEffect(() => {
    const check = () => {
      const t = debugToken();
      if (!t) {
        setEditing(false);
        return;
      }
      void debugSession({ data: { token: t } }).then((res) => {
        const door = /(?:\?|&)edit=1(?:&|$)/.test(location.search);
        setEditing(Boolean(res.ok && "tools" in res && (door || res.tools.layout !== false)));
      });
    };
    check();
    window.addEventListener("ra-debug-session", check);
    return () => window.removeEventListener("ra-debug-session", check);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("home-editing", editing);
    if (editing) root.dataset.homeDevice = device;
    else delete root.dataset.homeDevice;
    return () => {
      root.classList.remove("home-editing");
      delete root.dataset.homeDevice;
    };
  }, [editing, device]);

  const persist = useCallback((next: HomeLayoutDoc, now = false) => {
    const token = debugToken();
    if (!token) return;
    window.clearTimeout(timer.current);
    const write = () => {
      setDirty("сохраняем…");
      void saveHomeLayoutFn({ data: { token, layout: next } }).then((res) => {
        setDirty(res.ok ? "на сайте" : res.error || "ошибка");
        debugEmit("layout", { ok: res.ok, error: res.ok ? "" : res.error });
      });
    };
    if (now) {
      write();
      return;
    }
    setDirty("есть правки");
    timer.current = window.setTimeout(write, 280);
  }, []);

  const setDoc = useCallback(
    (next: HomeLayoutDoc, write = true) => {
      const norm = normalizeHomeLayout(next);
      setDocState(norm);
      if (write) {
        const cut = hist.current.slice(0, histAt.current + 1);
        cut.push(norm);
        hist.current = cut.slice(-40);
        histAt.current = hist.current.length - 1;
        persist(norm);
      }
    },
    [persist],
  );

  const undo = useCallback(() => {
    if (histAt.current <= 0) return;
    histAt.current -= 1;
    const next = hist.current[histAt.current];
    setDocState(next);
    persist(next);
  }, [persist]);

  const redo = useCallback(() => {
    if (histAt.current >= hist.current.length - 1) return;
    histAt.current += 1;
    const next = hist.current[histAt.current];
    setDocState(next);
    persist(next);
  }, [persist]);

  const publish = useCallback(() => {
    persist(hist.current[histAt.current] || emptyHomeLayout(), true);
  }, [persist]);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement | null)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === "Escape") setSelected(null);
      if (typing) return;
      if (!selected) return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setDoc({ ...doc, order: moveHomeBlock(doc.order, selected, -1) });
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setDoc({ ...doc, order: moveHomeBlock(doc.order, selected, 1) });
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        setDoc(patchHomeStyle(doc, selected, { hidden: !doc.styles[selected]?.hidden }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, selected, doc, setDoc, undo, redo]);

  const value: HomeEditorCtxValue = {
    editing,
    selected,
    select: setSelected,
    doc,
    device,
    setDevice,
    setDoc,
    text: (id, fallback) => doc.texts[id] || fallback,
    setText: (id, v) => setDoc(setHomeText(doc, id, v)),
    undo,
    redo,
    canUndo: histAt.current > 0,
    canRedo: histAt.current < hist.current.length - 1,
    dirty,
    publish,
  };

  return <HomeEditorCtx.Provider value={value}>{children}</HomeEditorCtx.Provider>;
}

export function HomeEditorChrome() {
  const ctx = useHomeEditor();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<"layers" | "block" | "studio">("layers");
  if (!ctx?.editing) return null;
  const { doc, selected, select, setDoc, device, setDevice, undo, redo, canUndo, canRedo, dirty, publish } = ctx;
  const style = selected ? doc.styles[selected] || {} : {};

  function openSheet(tab: "layers" | "block" | "studio") {
    setSheetTab(tab);
    setSheetOpen(true);
  }

  return (
    <>
      <div className="ve-ui relative z-40">
        <div className="flex h-12 items-center gap-1.5 overflow-x-auto bg-header px-2 text-header-fg shadow-[0_12px_28px_-16px_rgba(0,0,0,.5)] sm:gap-2 sm:px-3">
          <p className="mr-1 hidden shrink-0 text-sm font-semibold lg:block">Редактор главной</p>
          <div className="flex shrink-0 rounded-full bg-white/10 p-0.5">
            {(
              [
                ["desktop", Monitor, "Компьютер"],
                ["tablet", Tablet, "Планшет"],
                ["phone", Smartphone, "Телефон"],
              ] as const
            ).map(([id, Icon, label]) => (
              <button
                key={id}
                type="button"
                title={label}
                className={cn("grid size-8 place-items-center rounded-full", device === id ? "bg-white text-primary" : "text-header-fg/70 hover:bg-white/10")}
                onClick={() => setDevice(id)}
              >
                <Icon className="size-3.5" />
              </button>
            ))}
          </div>
          <button type="button" className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-white/10 disabled:opacity-30" disabled={!canUndo} onClick={undo} title="Отменить">
            <Undo2 className="size-3.5" />
          </button>
          <button type="button" className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-white/10 disabled:opacity-30" disabled={!canRedo} onClick={redo} title="Повторить">
            <Redo2 className="size-3.5" />
          </button>
          <span className="ml-auto hidden shrink-0 text-[0.72rem] text-header-fg/55 sm:inline">{dirty}</span>
          <span className="ml-auto sm:hidden" />
          <button
            type="button"
            className="h-8 shrink-0 rounded-full bg-white px-3 text-[0.72rem] font-semibold text-primary"
            onClick={() => publish()}
          >
            {dirty === "на сайте" ? "На сайте" : "Готово"}
          </button>
          <button
            type="button"
            className="h-8 shrink-0 rounded-full bg-white/10 px-3 text-[0.72rem] font-semibold hover:bg-white/15 lg:hidden"
            onClick={() => openSheet(selected ? "block" : "layers")}
          >
            Панель
          </button>
          <button
            type="button"
            className="h-8 shrink-0 rounded-full bg-white/10 px-3 text-[0.72rem] font-semibold hover:bg-white/15"
            onClick={() => {
              if (window.confirm("Вернуть заводской порядок, тексты и отступы?")) setDoc(emptyHomeLayout());
            }}
          >
            Сброс
          </button>
        </div>
      </div>

      <aside className="ve-ui fixed bottom-4 left-3 top-[6.75rem] z-40 hidden w-56 overflow-auto rounded-2xl bg-header p-3 text-header-fg shadow-[0_16px_40px_-18px_rgba(0,0,0,.55)] sm:top-[7.75rem] md:top-[8.25rem] md:block">
        <p className="px-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-header-fg/45">Слои</p>
        <LayersList doc={doc} selected={selected} select={select} setDoc={setDoc} tone="dark" />
      </aside>

      <aside className="ve-ui fixed bottom-4 right-3 top-[6.75rem] z-40 hidden w-[22rem] overflow-auto rounded-2xl bg-header p-4 text-header-fg shadow-[0_16px_40px_-18px_rgba(0,0,0,.55)] sm:top-[7.75rem] md:top-[8.25rem] lg:block">
        <InspectorFields selected={selected} doc={doc} style={style} setDoc={setDoc} />
        <div className="mt-6 rounded-2xl bg-surface p-3 text-fg">
          <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">Медиа и ИИ</p>
          <p className="mb-3 text-[0.75rem] leading-relaxed text-muted">
            Клик по файлу ставит его в выбранный блок. DeepSeek подписывает фото для Ольги.
          </p>
          <StudioPanel
            slot={selected}
            onLayout={(layout) => setDoc(layout)}
            onPickMedia={(src) => {
              if (selected) setDoc(setHomeMedia(doc, selected, src));
            }}
          />
        </div>
        <p className="mt-6 text-[0.72rem] leading-relaxed text-header-fg/40">
          Изменения пишутся в JSON главной. Готово — сразу на сайте, без ожидания.
        </p>
      </aside>

      {sheetOpen ? (
        <div className="ve-ui fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Закрыть панель" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[min(82dvh,42rem)] flex-col rounded-t-3xl bg-surface text-fg shadow-[0_-18px_50px_-20px_rgba(0,0,0,.4)]">
            <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-3">
              <p className="text-sm font-semibold">Редактор</p>
              <button type="button" className="h-9 rounded-full px-3 text-[0.78rem] font-semibold text-muted" onClick={() => setSheetOpen(false)}>
                Закрыть
              </button>
            </div>
            <div className="mx-4 grid shrink-0 grid-cols-3 gap-1 rounded-full bg-surface-2 p-0.5">
              {(
                [
                  ["layers", "Слои"],
                  ["block", "Блок"],
                  ["studio", "Студия"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={cn("h-9 rounded-full text-[0.72rem] font-semibold", sheetTab === id ? "bg-primary text-primary-foreground" : "text-muted")}
                  onClick={() => setSheetTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              {sheetTab === "layers" ? (
                <LayersList
                  doc={doc}
                  selected={selected}
                  select={(id) => {
                    select(id);
                    if (id) setSheetTab("block");
                  }}
                  setDoc={setDoc}
                  tone="light"
                />
              ) : null}
              {sheetTab === "block" ? <InspectorFields selected={selected} doc={doc} style={style} setDoc={setDoc} light /> : null}
              {sheetTab === "studio" ? (
                <StudioPanel
                  slot={selected}
                  onLayout={(layout) => setDoc(layout)}
                  onPickMedia={(src) => {
                    if (selected) setDoc(setHomeMedia(doc, selected, src));
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function LayersList({
  doc,
  selected,
  select,
  setDoc,
  tone,
}: {
  doc: HomeLayoutDoc;
  selected: string | null;
  select: (id: string | null) => void;
  setDoc: (next: HomeLayoutDoc, persist?: boolean) => void;
  tone: "dark" | "light";
}) {
  const dark = tone === "dark";
  return (
    <ul className={cn("space-y-0.5", dark && "mt-2")}>
      {doc.order.map((id) => {
        const hidden = Boolean(doc.styles[id]?.hidden);
        return (
          <li key={id}>
            <div
              className={cn(
                "flex items-center gap-1 rounded-xl px-1.5 py-1 text-[0.78rem]",
                selected === id
                  ? dark
                    ? "bg-white text-primary"
                    : "bg-primary text-primary-foreground"
                  : dark
                    ? "hover:bg-white/10"
                    : "hover:bg-black/5",
                hidden && selected !== id && "opacity-45",
              )}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/home-block", id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = e.dataTransfer.getData("text/home-block") as HomeBlockId;
                if (from && from !== id) setDoc({ ...doc, order: placeHomeBlock(doc.order, from, id) });
              }}
            >
              <button type="button" className="min-h-9 min-w-0 flex-1 truncate text-left font-medium" onClick={() => select(id)}>
                {homeBlockLabel(id, doc.customs)}
              </button>
              <button
                type="button"
                className="grid size-9 place-items-center rounded-full hover:bg-black/10"
                title={hidden ? "Показать" : "Скрыть"}
                onClick={() => setDoc(patchHomeStyle(doc, id, { hidden: !hidden }))}
              >
                {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function InspectorFields({
  selected,
  doc,
  style,
  setDoc,
  light,
}: {
  selected: string | null;
  doc: HomeLayoutDoc;
  style: { hidden?: boolean; padTop?: number; padBottom?: number; bg?: HomeBg };
  setDoc: (next: HomeLayoutDoc, persist?: boolean) => void;
  light?: boolean;
}) {
  const muted = light ? "text-muted" : "text-header-fg/45";
  const chipOff = light ? "bg-surface-2 hover:bg-black/5" : "bg-white/10 hover:bg-white/15";
  if (!selected) {
    return (
      <p className={cn("text-sm leading-relaxed", light ? "text-muted" : "text-header-fg/70")}>
        Нажмите блок на странице или слой. Дальше: текст на холсте, отступы и фон, порядок перетаскиванием.
      </p>
    );
  }
  return (
    <>
      <p className={cn("text-[0.68rem] font-semibold uppercase tracking-[0.14em]", muted)}>Инспектор</p>
      <p className="mt-2 font-display text-xl leading-tight">{homeBlockLabel(selected, doc.customs)}</p>
      <p className={cn("mt-2 text-[0.78rem] leading-relaxed", light ? "text-muted" : "text-header-fg/60")}>
        Текст на холсте. Фото — вкладка «Студия». DeepSeek правит тексты и придумывает блоки там же.
      </p>
      <label className="mt-5 flex min-h-11 items-center justify-between gap-3 text-sm">
        <span>Виден на сайте</span>
        <input
          type="checkbox"
          checked={!style.hidden}
          onChange={(e) => setDoc(patchHomeStyle(doc, selected, { hidden: !e.target.checked }))}
        />
      </label>
      <p className={cn("mt-5 text-[0.68rem] font-semibold uppercase tracking-[0.14em]", muted)}>Отступ сверху</p>
      <input
        type="range"
        min={0}
        max={160}
        value={style.padTop || 0}
        className="mt-2 w-full"
        onChange={(e) => setDoc(patchHomeStyle(doc, selected, { padTop: Number(e.target.value) }))}
      />
      <p className={cn("text-right text-[0.7rem]", muted)}>{style.padTop || 0} px</p>
      <p className={cn("mt-3 text-[0.68rem] font-semibold uppercase tracking-[0.14em]", muted)}>Отступ снизу</p>
      <input
        type="range"
        min={0}
        max={160}
        value={style.padBottom || 0}
        className="mt-2 w-full"
        onChange={(e) => setDoc(patchHomeStyle(doc, selected, { padBottom: Number(e.target.value) }))}
      />
      <p className={cn("text-right text-[0.7rem]", muted)}>{style.padBottom || 0} px</p>
      <p className={cn("mt-4 text-[0.68rem] font-semibold uppercase tracking-[0.14em]", muted)}>Фон</p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {(
          [
            ["inherit", "Как было"],
            ["paper", "Белый"],
            ["surface", "Карточка"],
            ["ink", "Тёмный"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cn(
              "min-h-11 rounded-xl px-2 py-2 text-[0.72rem] font-semibold",
              (style.bg || "inherit") === id ? "bg-primary text-primary-foreground" : chipOff,
            )}
            onClick={() => setDoc(patchHomeStyle(doc, selected, { bg: id as HomeBg }))}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" className={cn("min-h-11 flex-1 rounded-xl text-[0.78rem] font-semibold", chipOff)} onClick={() => setDoc({ ...doc, order: moveHomeBlock(doc.order, selected, -1) })}>
          Выше
        </button>
        <button type="button" className={cn("min-h-11 flex-1 rounded-xl text-[0.78rem] font-semibold", chipOff)} onClick={() => setDoc({ ...doc, order: moveHomeBlock(doc.order, selected, 1) })}>
          Ниже
        </button>
      </div>
    </>
  );
}

export function HomeEditorSession({
  initial,
  children,
}: {
  initial?: unknown;
  children: ReactNode;
}) {
  return (
    <HomeEditorProvider initial={initial}>
      <HomeEditorInner>{children}</HomeEditorInner>
    </HomeEditorProvider>
  );
}

function HomeEditorInner({ children }: { children: ReactNode }) {
  const ctx = useHomeEditor();
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  useEffect(() => {
    if (!ctx?.editing) return;
    const move = (e: DragEvent) => moveMediaDrag(e.clientX, e.clientY);
    const end = () => endMediaDrag();
    window.addEventListener("dragover", move);
    window.addEventListener("dragend", end);
    window.addEventListener("drop", end);
    return () => {
      window.removeEventListener("dragover", move);
      window.removeEventListener("dragend", end);
      window.removeEventListener("drop", end);
      endMediaDrag();
    };
  }, [ctx?.editing]);

  if (!ctx) return children;
  const slots = useHomeSlots(children, true);
  const phone = ctx.editing && ctx.device === "phone";
  const tablet = ctx.editing && ctx.device === "tablet";

  return (
    <div className={cn(ctx.editing && "home-layout-on")}>
      {ctx.editing ? <HomeEditorChrome /> : null}
      <div className={cn(ctx.editing && "md:pl-[15.25rem] lg:pr-[23.25rem] md:py-6")}>
        <div
          className={cn(
            "min-w-0",
            phone && "home-device-phone mx-auto overflow-x-clip",
            tablet && "home-device-tablet mx-auto overflow-x-clip",
          )}
        >
          {slots.map((slot) => (
            <HomeSlotFrame
              key={slot.id}
              id={slot.id}
              drag={drag}
              over={over}
              onDragId={setDrag}
              onOver={setOver}
            >
              {slot.node}
            </HomeSlotFrame>
          ))}
        </div>
      </div>
    </div>
  );
}

function HomeSlotFrame({
  id,
  drag,
  over,
  onDragId,
  onOver,
  children,
}: {
  id: string;
  drag: string | null;
  over: string | null;
  onDragId: (id: string | null) => void;
  onOver: (id: string | null) => void;
  children: ReactNode;
}) {
  const ctx = useHomeEditor();
  const editing = Boolean(ctx?.editing);
  const selected = ctx?.selected === id;
  const style = ctx?.doc.styles[id];
  const bg = slotBg(style);

  if (!editing) {
    return (
      <div className={bg} style={{ paddingTop: style?.padTop || undefined, paddingBottom: style?.padBottom || undefined }}>
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative transition-[outline-color,opacity,box-shadow]",
        bg,
        selected ? "outline outline-2 outline-primary" : over ? "outline outline-2 outline-primary/50 ve-media-over" : "outline outline-1 outline-primary/20",
        drag === id && "opacity-40",
        style?.hidden && "opacity-50",
      )}
      style={{ paddingTop: style?.padTop || undefined, paddingBottom: style?.padBottom || undefined }}
      onClick={(e) => {
        e.stopPropagation();
        ctx?.select(id);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onOver(id);
      }}
      onDragLeave={() => onOver(null)}
      onDrop={(e) => {
        e.preventDefault();
        const media = mediaFromDrop(e);
        const from = e.dataTransfer.getData("text/home-block") as HomeBlockId;
        onOver(null);
        onDragId(null);
        endMediaDrag();
        if (media && ctx) {
          ctx.select(id);
          ctx.setDoc(setHomeMedia(ctx.doc, id, media));
          return;
        }
        if (from && from !== id && ctx) ctx.setDoc({ ...ctx.doc, order: placeHomeBlock(ctx.doc.order, from, id) });
      }}
    >
      <div className="ve-ui pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-2">
        <div
          className={cn(
            "pointer-events-auto flex items-center gap-1 rounded-full px-1.5 py-1 text-[0.7rem] font-semibold shadow-[0_10px_24px_-12px_rgba(0,0,0,.55)]",
            selected ? "bg-primary text-primary-foreground" : "bg-header text-header-fg",
          )}
        >
          <button
            type="button"
            draggable
            aria-label={`Переместить «${homeBlockLabel(id, ctx?.doc.customs)}»`}
            className="grid size-7 cursor-grab place-items-center rounded-full hover:bg-white/15 active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/home-block", id);
              e.dataTransfer.effectAllowed = "move";
              onDragId(id);
            }}
            onDragEnd={() => {
              onDragId(null);
              onOver(null);
            }}
          >
            <GripVertical className="size-3.5" />
          </button>
          <span className="px-1">{homeBlockLabel(id, ctx?.doc.customs)}</span>
          {style?.hidden ? <span className="pr-2 opacity-80">скрыт</span> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

