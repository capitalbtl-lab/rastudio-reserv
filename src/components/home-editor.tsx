"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  Eye,
  EyeOff,
  Files,
  Image as ImageIcon,
  LayoutTemplate,
  Monitor,
  Plus,
  Redo2,
  Smartphone,
  Tablet,
  Undo2,
} from "lucide-react";
import { debugSession } from "@/data/debug-fn";
import { debugEmit } from "@/data/debug-client";
import { loadPageDocFn, placeBlockFn, publishPageFn, savePageDraftFn } from "@/data/page-layout-fn";
import { BLOCK_LIBRARY } from "@/data/block-library-core";
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
import type { EditorPageItem } from "@/data/page-layout-core";
import { cn } from "@/lib/utils";
import "./home-editor.css";

export { EditText, useHomeEditor } from "@/components/home-read";

const KEY = "ra_edit";

function debugToken() {
  try {
    const s = sessionStorage.getItem(KEY);
    if (s) return s;
  } catch {
    /* */
  }
  try {
    const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  } catch {
    /* */
  }
  try {
    return localStorage.getItem("ra_admin") || "";
  } catch {
    return "";
  }
}

function currentPath() {
  if (typeof window === "undefined") return "/";
  const page = new URLSearchParams(location.search).get("page");
  if (page?.startsWith("/")) return page;
  return location.pathname || "/";
}

function editUrl(path: string) {
  return path === "/" ? "/?edit=1" : `${path}?edit=1`;
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
        const door = /(?:\?|&)edit=1(?:&|$)/.test(location.search) || Boolean(sessionStorage.getItem(KEY));
        setEditing(Boolean(res.ok && door));
      });
    };
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

  const setDoc = useCallback(
    (next: HomeLayoutDoc, write = true) => {
      const fill = currentPath() === "/";
      const norm = normalizeHomeLayout(next, fill);
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

  const saveNow = useCallback(() => {
    const token = debugToken();
    if (!token) return;
    window.clearTimeout(timer.current);
    setDirty("сохраняем…");
    void savePageDraftFn({ data: { token, path: currentPath(), layout: doc } }).then((res) => {
      setDirty(res.ok ? "сохранено" : res.error || "ошибка");
      if (res.ok && "phoneIssues" in res) setPhoneIssues(res.phoneIssues || []);
    });
  }, [doc]);

  const publish = useCallback(() => {
    const token = debugToken();
    if (!token) return;
    window.clearTimeout(timer.current);
    setDirty("публикуем…");
    void publishPageFn({ data: { token, path: currentPath(), layout: doc } }).then((res) => {
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
  }, [editing, selected, doc, setDoc, undo, redo, saveNow]);

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
  };

  return <HomeEditorCtx.Provider value={value}>{children}</HomeEditorCtx.Provider>;
}

export function HomeEditorChrome() {
  const ctx = useHomeEditor();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<"layers" | "block" | "studio">("layers");
  const [pageOpen, setPageOpen] = useState(false);
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

        <aside className="ve-rail hidden md:block">
          <button type="button" className={cn("ve-icon", rail === "elements" && "is-on")} title="Добавить элементы" onClick={() => toggleRail("elements")}>
            <Plus className="size-4" />
          </button>
          <button type="button" className={cn("ve-icon", rail === "sections" && "is-on")} title="Слои и секции" onClick={() => toggleRail("sections")}>
            <LayoutTemplate className="size-4" />
          </button>
          <button type="button" className={cn("ve-icon", rail === "pages" && "is-on")} title="Страницы и меню" onClick={() => toggleRail("pages")}>
            <Files className="size-4" />
          </button>
          <button type="button" className={cn("ve-icon", rail === "media" && "is-on")} title="Медиа" onClick={() => toggleRail("media")}>
            <ImageIcon className="size-4" />
          </button>
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
              {rail === "media" ? (
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
  const groups = useMemo(() => {
    const home = pages.filter((p) => p.kind === "home");
    const schools = pages.filter((p) => p.kind === "school");
    const courses = pages.filter((p) => p.kind === "course");
    const rest = pages.filter((p) => !["home", "school", "course"].includes(p.kind));
    return [
      { label: "Главная", items: home },
      { label: "Школы", items: schools },
      { label: "Курсы", items: courses },
      { label: "Ещё", items: rest },
    ].filter((g) => g.items.length);
  }, [pages]);
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
        <div className="absolute left-0 top-9 z-20 max-h-[min(70dvh,28rem)] w-72 overflow-auto rounded-xl bg-white p-2 shadow-[0_16px_40px_-16px_rgba(0,0,0,.35)] ring-1 ring-black/10">
          {groups.map((g) => (
            <div key={g.label} className="mb-2">
              <p className="px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-black/40">{g.label}</p>
              {g.items.map((p) => (
                <button
                  key={p.path}
                  type="button"
                  className={cn("flex min-h-9 w-full items-center rounded-lg px-2 text-left text-[0.8rem]", p.path === path ? "bg-primary text-primary-foreground" : "hover:bg-black/5")}
                  onClick={() => {
                    setOpen(false);
                    if (p.path !== path) goPage(p.path);
                  }}
                >
                  {p.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PagesList({ pages, path, goPage }: { pages: EditorPageItem[]; path: string; goPage: (p: string) => void }) {
  return (
    <div>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-black/40">Страницы и меню</p>
      <ul className="mt-2 space-y-0.5">
        {pages.map((p) => (
          <li key={p.path}>
            <button
              type="button"
              className={cn("flex min-h-9 w-full items-center rounded-xl px-2 text-left text-[0.8rem] font-medium", p.path === path ? "bg-primary text-primary-foreground" : "hover:bg-black/5")}
              onClick={() => goPage(p.path)}
            >
              {p.title}
            </button>
          </li>
        ))}
      </ul>
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
        {BLOCK_LIBRARY.filter((b) => !b.locked).map((b) => (
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
      <button
        type="button"
        className={cn("mt-3 min-h-11 w-full rounded-xl text-[0.78rem] font-semibold", chipOff)}
        onClick={() => {
          if (window.confirm("Вернуть заводской порядок, тексты и отступы?")) setDoc(emptyHomeLayout());
        }}
      >
        Сброс
      </button>
    </>
  );
}
