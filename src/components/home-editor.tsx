"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Bot,
  ChevronDown,
  Eye,
  EyeOff,
  Files,
  Image as ImageIcon,
  Italic,
  LayoutTemplate,
  Monitor,
  Plus,
  Redo2,
  Smartphone,
  Sparkles,
  Tablet,
  Underline,
  Undo2,
} from "lucide-react";
import { debugEmit } from "@/data/debug-client";
import { loadPageDocFn, placeBlockFn, publishPageFn, savePageDraftFn, applyTypePatchFn } from "@/data/page-layout-fn";
import { BLOCK_LIBRARY, isAtomType, libraryType } from "@/data/block-library-core";
import { paintVeFrames } from "@/lib/ve-paint";
import { mediaFromDrop } from "@/lib/media-drag";
import {
  emptyHomeLayout,
  homeBlockLabel,
  isCustomBlockId,
  moveHomeBlock,
  normalizeHomeLayout,
  patchHomeStyle,
  placeHomeBlock,
  setHomeText,
  setHomeMedia,
  MAX_SECTION_H,
  type HomeBg,
  type HomeBlockStyle,
  type HomeBlockId,
  type HomeDevice,
  type HomeLayoutDoc,
} from "@/data/home-layout-core";
import { StudioPanel } from "@/components/home-studio";
import { HomeEditorCtx, useHomeEditor, type HomeEditorCtxValue } from "@/components/home-read";
import { changedBlockIds, typeIdOf } from "@/data/page-layout-core";
import { editorMenuTree, type EditorPageItem } from "@/data/page-layout-core";
import { cn } from "@/lib/utils";
import "./home-editor.css";

export { EditText, useHomeEditor } from "@/components/home-read";

const KEY = "ra_edit";

function debugToken() {
  try {
    return sessionStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

function flushCanvasText(doc: HomeLayoutDoc) {
  if (typeof document === "undefined") return doc;
  let next = doc;
  for (const el of document.querySelectorAll<HTMLElement>("[data-ve-key]")) {
    const key = el.getAttribute("data-ve-key") || "";
    const text = (el.textContent || "").trim();
    if (key && text) next = setHomeText(next, key, text);
  }
  return next;
}

function currentPath() {
  if (typeof window === "undefined") return "/";
  const page = new URLSearchParams(location.search).get("page");
  if (page?.startsWith("/")) return page;
  return location.pathname || "/";
}

function editUrl(path: string) {
  const raw = String(path || "/").trim() || "/";
  const p = (raw.startsWith("/") ? raw : `/${raw}`).replace(/\/+$/, "") || "/";
  return p === "/" ? "/?edit=1" : `${p}?edit=1`;
}

function revealBlock(id: string) {
  const find = () => {
    const el = document.querySelector(`[data-ve-frame="${CSS.escape(id)}"]`) as HTMLElement | null;
    if (el) return el;
    if (id === "trial-form") return document.getElementById("trial");
    return null;
  };
  const go = () => {
    const el = find();
    if (!el) return false;
    el.scrollIntoView({ behavior: "auto", block: "start", inline: "nearest" });
    return true;
  };
  if (go()) return;
  requestAnimationFrame(() => {
    if (go()) return;
    window.setTimeout(() => {
      if (go()) return;
      window.setTimeout(go, 180);
    }, 60);
  });
}

function VeHeightHandle({ id }: { id: string }) {
  const ctx = useHomeEditor();
  const style = ctx?.doc.styles[id];
  if (!ctx) return null;
  return (
    <button
      type="button"
      data-ve-h="sync"
      aria-label="Высота секции"
      className="absolute inset-x-[10%] bottom-0 z-30 flex h-4 cursor-ns-resize items-center justify-center"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const host = el.parentElement;
        const body = (host?.querySelector("[data-ve-body]") as HTMLElement | null) || host;
        const natural = Math.round(body?.getBoundingClientRect().height || 160);
        const startExtra = Math.max(0, (style?.h || 0) - natural);
        const startY = e.clientY;
        const base = ctx.doc;
        let last = base;
        const move = (ev: PointerEvent) => {
          const extra = Math.max(0, Math.min(MAX_SECTION_H - natural, startExtra + (ev.clientY - startY)));
          last = patchHomeStyle(base, id, { h: extra ? natural + extra : 0 });
          ctx.setDoc(last, false);
        };
        const up = () => {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
          ctx.setDoc(last, true);
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
      }}
    >
      <span className="h-1.5 w-14 rounded-full bg-primary" />
    </button>
  );
}

function VeSync() {
  const ctx = useHomeEditor();
  useLayoutEffect(() => {
    if (!ctx?.editing) return;
    const run = () => {
      paintVeFrames(ctx.doc.styles, "edit");
      document.querySelectorAll("[data-ve-frame]").forEach((el) => {
        el.classList.toggle("ve-frame-on", el.getAttribute("data-ve-frame") === ctx.selected);
      });
    };
    run();
    const root = document.getElementById("content") || document.body;
    const mo = new MutationObserver(run);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [ctx, ctx?.editing, ctx?.doc, ctx?.selected]);

  useEffect(() => {
    if (!ctx?.editing) return;
    const over = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest("[data-ve-frame]")) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      const frame = (e.target as HTMLElement | null)?.closest("[data-ve-frame]");
      const id = frame?.getAttribute("data-ve-frame");
      if (!id) return;
      const media = mediaFromDrop(e);
      const from = e.dataTransfer?.getData("text/home-block") || "";
      if (media) {
        e.preventDefault();
        ctx.select(id);
        ctx.setDoc(setHomeMedia(ctx.doc, id, media));
        return;
      }
      if (from && from !== id) {
        e.preventDefault();
        ctx.setDoc({ ...ctx.doc, order: placeHomeBlock(ctx.doc.order, from, id) });
      }
    };
    document.addEventListener("dragover", over);
    document.addEventListener("drop", drop);
    return () => {
      document.removeEventListener("dragover", over);
      document.removeEventListener("drop", drop);
    };
  }, [ctx]);

  const host =
    ctx?.selected && typeof document !== "undefined"
      ? (document.querySelector(`[data-ve-frame="${CSS.escape(ctx.selected)}"]`) as HTMLElement | null)
      : null;
  if (!host || host.querySelector('[data-ve-h="slot"]')) return null;
  return createPortal(<VeHeightHandle id={ctx!.selected!} />, host);
}

function VeStubBody({ id }: { id: string }) {
  const ctx = useHomeEditor();
  const title = ctx?.text(`${id}.title`, "") || "";
  const text = ctx?.text(`${id}.text`, "") || "";
  const media = ctx?.doc.media[id] || "";
  const video = /\.(mp4|webm|mov)(\?|$)/i.test(media);
  return (
    <div data-ve-body={id}>
      {title ? <h2 className="display mt-3 text-3xl leading-tight">{title}</h2> : null}
      {text ? <p className="mt-3 max-w-2xl text-lg leading-relaxed text-muted">{text}</p> : null}
      {media ? (
        video ? (
          <video className="mt-4 max-h-64 w-full rounded-2xl object-cover" src={media} muted playsInline />
        ) : (
          <img className="mt-4 max-h-64 w-full rounded-2xl object-cover" src={media} alt="" />
        )
      ) : null}
      {!title && !text && !media ? (
        <p className="mt-3 text-sm text-muted">Пустой блок этой страницы. Текст на холсте, фото — Студия.</p>
      ) : null}
    </div>
  );
}

function VeStubs() {
  const ctx = useHomeEditor();
  const [missing, setMissing] = useState<string[]>([]);
  useLayoutEffect(() => {
    if (!ctx?.editing) return;
    const scan = () => {
      const miss = ctx.doc.order.filter((id) => {
        const nodes = [...document.querySelectorAll(`[data-ve-frame="${CSS.escape(id)}"]`)];
        return !nodes.some((n) => n.getAttribute("data-ve-stub") !== "1");
      });
      setMissing((prev) => (prev.join("\0") === miss.join("\0") ? prev : miss));
    };
    scan();
    const root = document.getElementById("content") || document.body;
    const mo = new MutationObserver(scan);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [ctx, ctx?.editing, ctx?.doc.order]);
  const host = typeof document !== "undefined" ? document.getElementById("content") : null;
  if (!ctx?.editing || !host || !missing.length) return null;
  return createPortal(
    <div className="ve-stubs">
      {missing.map((id) => (
        <section key={id} data-ve-frame={id} data-ve-stub="1" className="relative border-t border-black/5">
          <div className="page-wrap py-10">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">
              {libraryType(id)?.label || homeBlockLabel(id, ctx.doc.customs)}
            </p>
            <VeStubBody id={id} />
          </div>
        </section>
      ))}
    </div>,
    host,
  );
}

function previewUrl(path: string) {
  return path === "/" ? "/?preview=1" : `${path}?preview=1`;
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
  const [dirty, setDirty] = useState("на сайте");
  const [path, setPath] = useState(currentPath);
  const [pages, setPages] = useState<EditorPageItem[]>([]);
  const [phoneIssues, setPhoneIssues] = useState<string[]>([]);
  const [rail, setRail] = useState<HomeEditorCtxValue["rail"]>(null);
  const hist = useRef<HomeLayoutDoc[]>([normalizeHomeLayout(initial)]);
  const histAt = useRef(0);
  const timer = useRef<number>(0);
  const docRef = useRef(doc);
  docRef.current = doc;
  const scopesRef = useRef<Record<string, "one" | "type">>({});
  const pendingRef = useRef<{ doc: HomeLayoutDoc; id: string } | null>(null);
  const [scopes, setScopes] = useState<Record<string, "one" | "type">>({});
  const [askScope, setAskScope] = useState<{ id: string; typeId: string; label: string } | null>(null);

  useEffect(() => {
    setDocState(normalizeHomeLayout(initial));
    hist.current = [normalizeHomeLayout(initial)];
    histAt.current = 0;
  }, [initial]);

  useEffect(() => {
    const check = () => setEditing(Boolean(debugToken()));
    check();
    window.addEventListener("ra-edit-session", check);
    return () => window.removeEventListener("ra-edit-session", check);
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

  useEffect(() => {
    if (!editing) return;
    const token = debugToken();
    if (!token) return;
    const here = currentPath();
    setPath(here);
    void loadPageDocFn({ data: { token, path: here } }).then((res) => {
      if (!res.ok) return;
      const next = normalizeHomeLayout(res.layout, here === "/");
      setDocState(next);
      docRef.current = next;
      hist.current = [next];
      histAt.current = 0;
      setPages(res.pages || []);
      setPhoneIssues(res.phoneIssues || []);
      setDirty(res.differ ? "есть правки" : "на сайте");
    });
  }, [editing]);

  const persist = useCallback(
    (next: HomeLayoutDoc) => {
      const token = debugToken();
      if (!token) return;
      window.clearTimeout(timer.current);
      setDirty("сохраняем…");
      timer.current = window.setTimeout(() => {
        void savePageDraftFn({ data: { token, path: currentPath(), layout: next } }).then((res) => {
          setDirty(res.ok ? "сохранено" : res.error || "ошибка");
          if (res.ok && "phoneIssues" in res) setPhoneIssues(res.phoneIssues || []);
          debugEmit("layout", { ok: res.ok, error: res.ok ? "" : res.error });
        });
      }, 800);
    },
    [],
  );

  const propagateType = useCallback((layout: HomeLayoutDoc, id: string) => {
    const token = debugToken();
    if (!token) return;
    setDirty("на все страницы…");
    void applyTypePatchFn({ data: { token, path: currentPath(), blockId: id, layout } }).then((res) => {
      if (!res.ok) {
        setDirty(res.error || "ошибка");
        return;
      }
      const name = libraryType(res.typeId)?.label || res.typeId;
      setDirty(`все «${name}»: ${res.pages} стр.`);
    });
  }, []);

  const setDoc = useCallback(
    (next: HomeLayoutDoc, write = true) => {
      const fill = currentPath() === "/";
      const prev = docRef.current;
      const norm = normalizeHomeLayout(next, fill);
      docRef.current = norm;
      setDocState(norm);
      if (!write) return;
      const cut = hist.current.slice(0, histAt.current + 1);
      cut.push(norm);
      hist.current = cut.slice(-40);
      histAt.current = hist.current.length - 1;
      const changed = changedBlockIds(prev, norm);
      const id = changed[0];
      if (id && !scopesRef.current[id]) {
        pendingRef.current = { doc: norm, id };
        const typeId = typeIdOf(id, norm);
        setAskScope({
          id,
          typeId,
          label: libraryType(typeId)?.label || homeBlockLabel(id, norm.customs),
        });
        return;
      }
      persist(norm);
      if (id && scopesRef.current[id] === "type") propagateType(norm, id);
    },
    [persist, propagateType],
  );

  const chooseScope = useCallback(
    (scope: "one" | "type") => {
      const pending = pendingRef.current;
      const id = pending?.id || selected;
      if (!id) {
        setAskScope(null);
        return;
      }
      scopesRef.current = { ...scopesRef.current, [id]: scope };
      setScopes({ ...scopesRef.current });
      setAskScope(null);
      const layout = pending?.doc || docRef.current;
      pendingRef.current = null;
      persist(layout);
      if (scope === "type") propagateType(layout, id);
    },
    [persist, propagateType, selected],
  );

  const undo = useCallback(() => {
    if (histAt.current <= 0) return;
    histAt.current -= 1;
    const next = hist.current[histAt.current];
    docRef.current = next;
    setDocState(next);
    persist(next);
  }, [persist]);

  const redo = useCallback(() => {
    if (histAt.current >= hist.current.length - 1) return;
    histAt.current += 1;
    const next = hist.current[histAt.current];
    docRef.current = next;
    setDocState(next);
    persist(next);
  }, [persist]);

  const saveNow = useCallback(() => {
    const token = debugToken();
    if (!token) return;
    const flushed = flushCanvasText(doc);
    window.clearTimeout(timer.current);
    setDirty("сохраняем…");
    if (flushed !== doc) setDocState(flushed);
    void savePageDraftFn({ data: { token, path: currentPath(), layout: flushed } }).then((res) => {
      setDirty(res.ok ? "сохранено" : res.error || "ошибка");
      if (res.ok && "phoneIssues" in res) setPhoneIssues(res.phoneIssues || []);
    });
  }, [doc]);

  const publish = useCallback(() => {
    const token = debugToken();
    if (!token) return;
    const flushed = flushCanvasText(doc);
    window.clearTimeout(timer.current);
    setDirty("публикуем…");
    if (flushed !== doc) setDocState(flushed);
    void publishPageFn({ data: { token, path: currentPath(), layout: flushed } }).then((res) => {
      if (!res.ok) {
        setDirty(res.error || "ошибка");
        if ("phoneIssues" in res) setPhoneIssues(res.phoneIssues || []);
        return;
      }
      setDirty("на сайте");
      setPhoneIssues([]);
    });
  }, [doc]);

  const preview = useCallback(() => {
    window.open(previewUrl(currentPath()), "_blank", "noopener");
  }, []);

  const goPage = useCallback((next: string) => {
    window.location.href = editUrl(next);
  }, []);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement | null)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveNow();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === "Escape") {
        if (askScope) {
          e.preventDefault();
          chooseScope("one");
          return;
        }
        setSelected(null);
        setRail(null);
      }
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
  }, [editing, selected, doc, setDoc, undo, redo, saveNow, askScope, chooseScope]);

  const canPublish = phoneIssues.length === 0 && dirty !== "на сайте" && dirty !== "сохраняем…";

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
    path,
    pages,
    goPage,
    saveNow,
    publish,
    preview,
    canPublish,
    phoneIssues,
    rail,
    setRail,
    askScope,
    chooseScope,
    blockScope: (id) => scopes[id] || null,
  };

  return <HomeEditorCtx.Provider value={value}>{children}</HomeEditorCtx.Provider>;
}

function ScopeAsk() {
  const ctx = useHomeEditor();
  if (!ctx?.askScope) return null;
  const label = ctx.askScope.label;
  return (
    <div className="ve-ui fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 text-fg shadow-[0_24px_60px_-24px_rgba(0,0,0,.45)]">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">Куда применить</p>
        <p className="mt-2 font-display text-2xl leading-tight">Изменения в блоке «{label}»</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">Только этот блок на этой странице — или все блоки этого типа на сайте.</p>
        <div className="mt-5 grid gap-2">
          <button type="button" className="min-h-12 rounded-xl bg-primary px-4 py-2.5 text-left text-sm font-semibold text-primary-foreground" onClick={() => ctx.chooseScope("one")}>
            Только этот блок
            <span className="mt-0.5 block text-[0.75rem] font-normal opacity-85">Эта страница</span>
          </button>
          <button type="button" className="min-h-12 rounded-xl bg-surface-2 px-4 py-2.5 text-left text-sm font-semibold" onClick={() => ctx.chooseScope("type")}>
            Все блоки «{label}»
            <span className="mt-0.5 block text-[0.75rem] font-normal text-muted">Все страницы сайта</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function HomeEditorChrome() {
  const ctx = useHomeEditor();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<"layers" | "block" | "studio">("layers");
  const [pageOpen, setPageOpen] = useState(false);
  useEffect(() => {
    if (!ctx?.editing) return;
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest(".ve-ui")) return;
      ctx.setRail(null);
      setPageOpen(false);
      setSheetOpen(false);
      const node = t.closest("[data-ve-frame]");
      const id = node?.getAttribute("data-ve-frame");
      if (id) ctx.select(id);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [ctx?.editing, ctx?.select, ctx?.setRail]);
  if (!ctx?.editing) return null;
  const { doc, selected, select, setDoc, device, setDevice, undo, redo, canUndo, canRedo, dirty, rail, setRail } = ctx;
  const style = selected ? doc.styles[selected] || {} : {};
  const pageTitle = ctx.pages.find((p) => p.path === ctx.path)?.title || ctx.path;

  function openSheet(tab: "layers" | "block" | "studio") {
    setSheetTab(tab);
    setSheetOpen(true);
  }

  function toggleRail(id: NonNullable<HomeEditorCtxValue["rail"]>) {
    setRail(rail === id ? null : id);
  }

  return (
    <>
      <VeSync />
      <VeStubs />
      <ScopeAsk />
      <div className="ve-ui ve-chrome">
        <div className="ve-topbar">
          <PagePicker open={pageOpen} setOpen={setPageOpen} title={pageTitle} path={ctx.path} pages={ctx.pages} goPage={ctx.goPage} />
          <div className="flex shrink-0 rounded-full bg-black/5 p-0.5">
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
                className={cn("grid size-8 place-items-center rounded-full", device === id ? "bg-white text-primary shadow-sm" : "text-black/50 hover:bg-white")}
                onClick={() => setDevice(id)}
              >
                <Icon className="size-3.5" />
              </button>
            ))}
          </div>
          <button type="button" className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-black/5 disabled:opacity-30" disabled={!canUndo} onClick={undo} title="Отменить">
            <Undo2 className="size-3.5" />
          </button>
          <button type="button" className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-black/5 disabled:opacity-30" disabled={!canRedo} onClick={redo} title="Повторить">
            <Redo2 className="size-3.5" />
          </button>
          <span className="ml-auto hidden text-[0.72rem] text-black/45 sm:inline">{dirty}</span>
          <button type="button" className="h-8 shrink-0 rounded-full px-3 text-[0.72rem] font-semibold hover:bg-black/5 lg:hidden" onClick={() => openSheet(selected ? "block" : "layers")}>
            Панель
          </button>
          <button type="button" className="h-8 shrink-0 rounded-full px-3 text-[0.78rem] font-semibold hover:bg-black/5" onClick={ctx.saveNow}>
            Сохранить
          </button>
          <button type="button" className="h-8 shrink-0 rounded-full px-3 text-[0.78rem] font-semibold hover:bg-black/5" onClick={ctx.preview}>
            Предпросмотр
          </button>
          <button
            type="button"
            className="h-8 shrink-0 rounded-full bg-primary px-3.5 text-[0.78rem] font-semibold text-primary-foreground disabled:opacity-40"
            disabled={!ctx.canPublish}
            title={ctx.phoneIssues[0] || "Опубликовать на сайт"}
            onClick={ctx.publish}
          >
            Опубликовать
          </button>
        </div>

        <TextToolbar />

        <aside className="ve-rail hidden md:block">
          {(
            [
              ["elements", Plus, "Элементы"],
              ["sections", LayoutTemplate, "Слои"],
              ["pages", Files, "Разделы"],
              ["media", ImageIcon, "Медиа"],
              ["ai", Sparkles, "Блоки"],
              ["agent", Bot, "Агент"],
            ] as const
          ).map(([id, Icon, label]) => (
            <button key={id} type="button" className={cn("ve-icon", rail === id && "is-on")} title={label} onClick={() => toggleRail(id)}>
              <Icon className="size-4" />
              <span>{label}</span>
            </button>
          ))}
        </aside>

        {rail ? (
          <div className="ve-fly hidden md:block">
            <div className="p-4">
              {rail === "elements" ? <ElementsList path={ctx.path} onLayout={(layout) => ctx.setDoc(layout)} /> : null}
              {rail === "sections" ? (
                <>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-black/40">Слои</p>
                  <LayersList doc={doc} selected={selected} select={select} setDoc={setDoc} tone="light" />
                </>
              ) : null}
              {rail === "pages" ? <PagesList pages={ctx.pages} path={ctx.path} goPage={ctx.goPage} /> : null}
              {rail === "media" || rail === "agent" ? (
                <StudioPanel
                  view={rail}
                  slot={selected}
                  onLayout={(layout) => setDoc(layout)}
                  onPickMedia={(src) => {
                    if (selected) setDoc(setHomeMedia(doc, selected, src));
                  }}
                />
              ) : null}
              {rail === "ai" ? (
                <BlocksRail
                  path={ctx.path}
                  selected={selected}
                  onLayout={(layout) => setDoc(layout)}
                  onPickMedia={(src) => {
                    if (selected) setDoc(setHomeMedia(doc, selected, src));
                  }}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        <aside className="ve-inspector hidden lg:block">
          <div className="p-4">
            <InspectorFields selected={selected} doc={doc} style={style} setDoc={setDoc} light />
            {ctx.phoneIssues.length ? (
              <p className="mt-4 text-[0.72rem] leading-relaxed text-red-600">На телефоне едет: {ctx.phoneIssues[0]}</p>
            ) : null}
          </div>
        </aside>
      </div>

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
                    if (id) {
                      revealBlock(id);
                      setSheetTab("block");
                    }
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

function PagePicker({
  open,
  setOpen,
  title,
  path,
  pages,
  goPage,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  title: string;
  path: string;
  pages: EditorPageItem[];
  goPage: (path: string) => void;
}) {
  return (
    <div className="relative min-w-0">
      <button
        type="button"
        className="flex h-8 max-w-[14rem] items-center gap-1 rounded-lg px-2 text-left text-[0.8rem] font-semibold hover:bg-black/5"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{title || "Страница"}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-50" />
      </button>
      {open ? (
        <div className="absolute left-0 top-9 z-20 max-h-[min(70dvh,28rem)] w-80 overflow-auto rounded-xl bg-white p-2 shadow-[0_16px_40px_-16px_rgba(0,0,0,.35)] ring-1 ring-black/10">
          <PagesTree
            pages={pages}
            path={path}
            goPage={(p) => {
              setOpen(false);
              if (p !== path) goPage(p);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function PagesList({ pages, path, goPage }: { pages: EditorPageItem[]; path: string; goPage: (p: string) => void }) {
  return (
    <div>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-black/40">Разделы</p>
      <div className="mt-2">
        <PagesTree pages={pages} path={path} goPage={goPage} />
      </div>
    </div>
  );
}

function PagesTree({ pages, path, goPage }: { pages: EditorPageItem[]; path: string; goPage: (p: string) => void }) {
  const tree = useMemo(() => editorMenuTree(pages), [pages]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const hit = tree.schools.find((s) => s.path === path || tree.coursesOf(s.path).some((c) => c.path === path));
    if (hit) setOpen((m) => ({ ...m, [hit.path]: true }));
  }, [path, tree]);
  const row = (p: EditorPageItem, cls?: string) => (
    <a
      href={editUrl(p.path)}
      className={cn("flex min-h-9 w-full items-center rounded-xl px-2 text-left text-[0.8rem] font-medium", p.path === path ? "bg-primary text-primary-foreground" : "hover:bg-black/5", cls)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        if (p.kind === "school") setOpen((m) => ({ ...m, [p.path]: true }));
        if (p.path !== path) goPage(p.path);
      }}
    >
      {p.title}
    </a>
  );
  const cap = (label: string) => <p className="px-2 pb-0.5 pt-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-black/40">{label}</p>;
  return (
    <div>
      {tree.home ? row(tree.home) : null}
      {cap("Меню")}
      {cap("Школы")}
      {tree.schools.map((s) => {
        const kids = tree.coursesOf(s.path);
        const expanded = Boolean(open[s.path]);
        return (
          <div key={s.path} className="mb-1">
            <div className="flex items-start gap-0.5">
              {kids.length ? (
                <button
                  type="button"
                  aria-label={expanded ? "Свернуть курсы" : "Показать курсы школы"}
                  className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-black/5"
                  onClick={() => setOpen((m) => ({ ...m, [s.path]: !expanded }))}
                >
                  <ChevronDown className={cn("size-3.5 opacity-60 transition-transform", !expanded && "-rotate-90")} />
                </button>
              ) : (
                <span className="size-8 shrink-0" />
              )}
              {row(s, "flex-1")}
            </div>
            {expanded
              ? kids.map((c) => (
                  <div key={c.path} className="pl-8">
                    {row(c, "text-[0.75rem] font-normal")}
                  </div>
                ))
              : null}
          </div>
        );
      })}
      {tree.orphanCourses.length
        ? tree.orphanCourses.map((c) => (
            <div key={c.path} className="pl-8">
              {row(c, "text-[0.75rem] font-normal")}
            </div>
          ))
        : null}
      {tree.menu.map((p) => (
        <div key={p.path}>{row(p)}</div>
      ))}
      {tree.more.length ? cap("Ещё") : null}
      {tree.more.map((p) => (
        <div key={p.path}>{row(p)}</div>
      ))}
      {tree.rest.length ? cap("Прочее") : null}
      {tree.rest.map((p) => (
        <div key={p.path}>{row(p)}</div>
      ))}
    </div>
  );
}

function BlocksRail({
  path,
  selected,
  onLayout,
  onPickMedia,
}: {
  path: string;
  selected: string | null;
  onLayout: (layout: HomeLayoutDoc) => void;
  onPickMedia?: (src: string) => void;
}) {
  const ctx = useHomeEditor();
  const [tab, setTab] = useState<"lib" | "gen">("lib");
  const [msg, setMsg] = useState("");
  async function add(typeId: string, seed: "empty" | "template") {
    const token = debugToken();
    if (!token) return;
    const res = await placeBlockFn({ data: { token, path, typeId, seed } });
    if (res.ok && "layout" in res) {
      onLayout(res.layout);
      const last = [...res.layout.order].reverse().find((id) => /^inst_/i.test(id) || /^c_/i.test(id));
      if (last && ctx) {
        ctx.select(last);
        revealBlock(last);
      }
      const name = BLOCK_LIBRARY.find((b) => b.typeId === typeId)?.label || typeId;
      setMsg(seed === "template" ? `«${name}» как в шаблоне` : `«${name}» на эту страницу`);
    } else setMsg(res.ok ? "" : res.error);
  }
  const groups = useMemo(() => {
    const map = new Map<string, typeof BLOCK_LIBRARY>();
    for (const b of BLOCK_LIBRARY) {
      const list = map.get(b.category) || [];
      list.push(b);
      map.set(b.category, list);
    }
    return [...map.entries()];
  }, []);
  return (
    <div>
      <div className="grid grid-cols-2 gap-1 rounded-full bg-black/5 p-0.5">
        <button type="button" className={cn("h-8 rounded-full text-[0.72rem] font-semibold", tab === "lib" ? "bg-primary text-primary-foreground" : "text-black/55")} onClick={() => setTab("lib")}>
          Блоки
        </button>
        <button type="button" className={cn("h-8 rounded-full text-[0.72rem] font-semibold", tab === "gen" ? "bg-primary text-primary-foreground" : "text-black/55")} onClick={() => setTab("gen")}>
          Генератор блоков
        </button>
      </div>
      {tab === "lib" ? (
        <div className="mt-3 space-y-4">
          <p className="text-[0.72rem] leading-relaxed text-black/50">Типовые блоки сайта. «На эту страницу» — пустой экземпляр. «Как в шаблоне» — тексты и медиа оригинала. Потом правите только здесь.</p>
          {groups.map(([cat, list]) => (
            <div key={cat}>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-black/40">{cat}</p>
              <ul className="mt-1.5 space-y-1">
                {list.map((b) => (
                  <li key={b.typeId} className="rounded-xl px-1 py-1 hover:bg-black/[0.03]">
                    <p className="px-1 text-[0.8rem] font-medium">{b.label}</p>
                    <div className="mt-1 grid grid-cols-2 gap-1">
                      <button type="button" className="min-h-8 rounded-lg bg-black/5 px-2 text-[0.68rem] font-semibold hover:bg-black/10" onClick={() => void add(b.typeId, "empty")}>
                        На эту страницу
                      </button>
                      <button type="button" className="min-h-8 rounded-lg bg-black/5 px-2 text-[0.68rem] font-semibold hover:bg-black/10" onClick={() => void add(b.typeId, "template")}>
                        Как в шаблоне
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {msg ? <p className="text-[0.72rem] text-primary">{msg}</p> : null}
        </div>
      ) : (
        <div className="mt-3">
          <StudioPanel embedded view="ai" slot={selected} onLayout={onLayout} onPickMedia={onPickMedia} />
        </div>
      )}
    </div>
  );
}

function ElementsList({ path, onLayout }: { path: string; onLayout: (layout: HomeLayoutDoc) => void }) {
  const [msg, setMsg] = useState("");
  async function add(typeId: string) {
    const token = debugToken();
    if (!token) return;
    const res = await placeBlockFn({ data: { token, path, typeId } });
    if (res.ok && "layout" in res) {
      onLayout(res.layout);
      setMsg(`Добавлен «${BLOCK_LIBRARY.find((b) => b.typeId === typeId)?.label || typeId}»`);
    } else setMsg(res.ok ? "" : res.error);
  }
  return (
    <div>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-black/40">Добавить элементы</p>
      <ul className="mt-2 space-y-0.5">
        {BLOCK_LIBRARY.filter((b) => !b.locked && (path === "/" || isAtomType(b.typeId) || b.typeId === "custom")).map((b) => (
          <li key={b.typeId}>
            <button type="button" className="flex min-h-9 w-full items-center rounded-xl px-2 text-left text-[0.8rem] font-medium hover:bg-black/5" onClick={() => void add(b.typeId)}>
              {b.label}
            </button>
          </li>
        ))}
      </ul>
      {msg ? <p className="mt-2 text-[0.72rem] text-primary">{msg}</p> : null}
    </div>
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
              <button type="button" className="min-h-9 min-w-0 flex-1 truncate text-left font-medium" onClick={() => { select(id); revealBlock(id); }}>
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
  style: HomeBlockStyle;
  setDoc: (next: HomeLayoutDoc, persist?: boolean) => void;
  light?: boolean;
}) {
  const ctx = useHomeEditor();
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
      {ctx ? (
        <div className="mt-3 grid grid-cols-2 gap-1">
          {(
            [
              ["one", "Этот блок"],
              ["type", "Все такие на сайте"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={cn(
                "min-h-9 rounded-lg px-2 text-[0.72rem] font-semibold",
                ctx.blockScope(selected) === id ? "bg-primary text-primary-foreground" : chipOff,
              )}
              onClick={() => ctx.chooseScope(id)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
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
      <CourseField id={selected} doc={doc} setDoc={setDoc} />
      <HeightField id={selected} doc={doc} style={style} setDoc={setDoc} muted={muted} />
      <p className={cn("mt-4 text-[0.68rem] font-semibold uppercase tracking-[0.14em]", muted)}>Выравнивание текста</p>
      <div className="mt-2 flex gap-1">
        {(
          [
            ["left", AlignLeft],
            ["center", AlignCenter],
            ["right", AlignRight],
          ] as const
        ).map(([id, Icon]) => (
          <button
            key={id}
            type="button"
            className={cn("grid size-9 place-items-center rounded-lg", (style.align || "left") === id ? "bg-primary text-primary-foreground" : chipOff)}
            onClick={() => setDoc(patchHomeStyle(doc, selected, { align: id }))}
          >
            <Icon className="size-3.5" />
          </button>
        ))}
      </div>
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
      <PlaceOn id={selected} />
      {ctx?.path === "/" ? (
        <button
          type="button"
          className={cn("mt-3 min-h-11 w-full rounded-xl text-[0.78rem] font-semibold", chipOff)}
          onClick={() => {
            if (window.confirm("Вернуть заводской порядок, тексты и отступы главной?")) setDoc(emptyHomeLayout());
          }}
        >
          Сброс
        </button>
      ) : null}
    </>
  );
}

function slotTypeId(doc: HomeLayoutDoc, id: string) {
  return doc.customs.find((c) => c.id === id)?.typeId || id;
}

function HeightField({
  id,
  doc,
  style,
  setDoc,
  muted,
}: {
  id: string;
  doc: HomeLayoutDoc;
  style: HomeBlockStyle;
  setDoc: (next: HomeLayoutDoc, persist?: boolean) => void;
  muted: string;
}) {
  const [natural, setNatural] = useState(0);
  useEffect(() => {
    const el = document.querySelector(`[data-ve-body="${CSS.escape(id)}"]`) as HTMLElement | null;
    if (!el) return;
    const read = () => setNatural(Math.round(el.getBoundingClientRect().height));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, doc.order, doc.texts, doc.media]);
  const extra = Math.max(0, (style.h || 0) - natural);
  const extraMax = Math.max(1, MAX_SECTION_H - natural);
  const shown = natural + extra;
  return (
    <>
      <p className={cn("mt-5 text-[0.68rem] font-semibold uppercase tracking-[0.14em]", muted)}>Высота секции</p>
      <input
        type="range"
        min={0}
        max={extraMax}
        value={Math.min(extra, extraMax)}
        className="mt-2 w-full"
        onChange={(e) => {
          const add = Number(e.target.value);
          setDoc(patchHomeStyle(doc, id, { h: add ? natural + add : 0 }));
        }}
      />
      <p className={cn("text-right text-[0.7rem]", muted)}>{shown ? `${shown} px` : "…"} / {MAX_SECTION_H}</p>
    </>
  );
}

function CourseField({
  id,
  doc,
  setDoc,
}: {
  id: string;
  doc: HomeLayoutDoc;
  setDoc: (next: HomeLayoutDoc, persist?: boolean) => void;
}) {
  const ctx = useHomeEditor();
  const type = libraryType(slotTypeId(doc, id));
  if (!type?.fields.some((f) => f.kind === "courseId")) return null;
  const value = doc.texts[`${id}.courseId`] || doc.customs.find((c) => c.id === id)?.courseId || "";
  const courses = (ctx?.pages || []).filter((p) => p.kind === "course");
  return (
    <label className="mt-5 block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-black/40">
      Курс (courseId)
      <select
        className="mt-2 h-11 w-full rounded-xl bg-surface-2 px-3 text-[0.8rem] font-normal text-fg"
        value={value}
        onChange={(e) => {
          const courseId = e.target.value;
          const texts = { ...doc.texts };
          if (courseId) texts[`${id}.courseId`] = courseId;
          else delete texts[`${id}.courseId`];
          const customs = doc.customs.map((c) => (c.id === id ? { ...c, courseId: courseId || undefined } : c));
          setDoc({ ...doc, texts, customs });
        }}
      >
        <option value="">Не выбран</option>
        {courses.map((p) => (
          <option key={p.path} value={p.path}>
            {p.title}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextToolbar() {
  const ctx = useHomeEditor();
  if (!ctx?.editing) return null;
  if (!ctx.selected) return <div className="ve-textbar" />;
  const st = ctx.doc.styles[ctx.selected] || {};
  const btn = (on: boolean) => cn("grid size-8 place-items-center rounded-md", on ? "bg-primary text-primary-foreground" : "hover:bg-black/5");
  return (
    <div className="ve-textbar">
      <button type="button" className={btn(Boolean(st.bold))} title="Жирный" onClick={() => ctx.setDoc(patchHomeStyle(ctx.doc, ctx.selected!, { bold: !st.bold }))}>
        <Bold className="size-3.5" />
      </button>
      <button type="button" className={btn(Boolean(st.italic))} title="Курсив" onClick={() => ctx.setDoc(patchHomeStyle(ctx.doc, ctx.selected!, { italic: !st.italic }))}>
        <Italic className="size-3.5" />
      </button>
      <button type="button" className={btn(Boolean(st.underline))} title="Подчёркнутый" onClick={() => ctx.setDoc(patchHomeStyle(ctx.doc, ctx.selected!, { underline: !st.underline }))}>
        <Underline className="size-3.5" />
      </button>
      <span className="mx-1 h-5 w-px bg-black/10" />
      <button type="button" className={btn(st.align === "left" || !st.align)} title="Слева" onClick={() => ctx.setDoc(patchHomeStyle(ctx.doc, ctx.selected!, { align: "left" }))}>
        <AlignLeft className="size-3.5" />
      </button>
      <button type="button" className={btn(st.align === "center")} title="По центру" onClick={() => ctx.setDoc(patchHomeStyle(ctx.doc, ctx.selected!, { align: "center" }))}>
        <AlignCenter className="size-3.5" />
      </button>
      <button type="button" className={btn(st.align === "right")} title="Справа" onClick={() => ctx.setDoc(patchHomeStyle(ctx.doc, ctx.selected!, { align: "right" }))}>
        <AlignRight className="size-3.5" />
      </button>
      <span className="mx-1 h-5 w-px bg-black/10" />
      <label className="flex items-center gap-1 px-1 text-[0.68rem] text-black/50">
        кегль
        <input
          type="number"
          min={12}
          max={72}
          placeholder="авто"
          value={st.fontSize || ""}
          className="h-8 w-14 rounded-md bg-surface-2 px-1 text-[0.78rem] text-fg"
          onChange={(e) => ctx.setDoc(patchHomeStyle(ctx.doc, ctx.selected!, { fontSize: Number(e.target.value) }))}
        />
      </label>
    </div>
  );
}

function PlaceOn({ id }: { id: string }) {
  const ctx = useHomeEditor();
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState("");
  if (!ctx || !isCustomBlockId(id)) return null;
  const others = ctx.pages.filter((p) => p.path !== ctx.path);
  if (!others.length) return null;
  async function go() {
    const token = debugToken();
    if (!token || !to) return;
    const res = await placeBlockFn({ data: { token, path: to, fromPath: ctx.path, fromId: id } });
    setMsg(res.ok ? `Скопирован на ${to}. Откройте страницу и смените контент.` : "error" in res ? res.error : "Ошибка");
  }
  return (
    <div className="mt-5">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-black/40">Поставить на другую страницу</p>
      <select
        className="mt-2 h-11 w-full rounded-xl bg-surface-2 px-3 text-[0.8rem]"
        value={to}
        onChange={(e) => setTo(e.target.value)}
      >
        <option value="">Страница…</option>
        {others.map((p) => (
          <option key={p.path} value={p.path}>
            {p.title}
          </option>
        ))}
      </select>
      <button type="button" className="mt-2 min-h-11 w-full rounded-xl bg-black/5 text-[0.78rem] font-semibold" onClick={() => void go()} disabled={!to}>
        Поставить этот блок
      </button>
      {msg ? <p className="mt-2 text-[0.72rem] text-primary">{msg}</p> : null}
    </div>
  );
}
