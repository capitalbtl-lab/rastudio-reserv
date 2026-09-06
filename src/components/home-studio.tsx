"use client";

import { useEffect, useMemo, useState } from "react";
import { siteStudio } from "@/data/site-studio-fn";
import type { SiteMediaItem } from "@/data/site-media";
import type { HomeCustomBlock, HomeLayoutDoc } from "@/data/home-layout-core";
import type { PageAgent } from "@/data/page-agents-core";
import { emptyPageAgent } from "@/data/page-agents-core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { endMediaDrag, startMediaDrag } from "@/lib/media-drag";
import { hydrateMediaAlts } from "@/data/media-alts-core";

type MediaRow = SiteMediaItem & { caption?: string; place?: string; schoolId?: string };
type SchoolRow = { id: string; label: string; folder: string };

function token() {
  if (typeof document === "undefined") return "";
  try {
    return sessionStorage.getItem("ra_debug") || "";
  } catch {
    return "";
  }
}

function adminToken() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || token();
}

function currentPath() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

function useSiteStudio(useAdmin = false) {
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [ideas, setIdeas] = useState<Omit<HomeCustomBlock, "id">[]>([]);
  const [pages, setPages] = useState<PageAgent[]>([]);
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [prompt, setPrompt] = useState("");
  const tok = () => (useAdmin ? adminToken() : token() || adminToken());

  async function run(
    action: "list" | "upload" | "delete" | "describe" | "pulse" | "invent" | "generate" | "place" | "rewrite" | "agents" | "embed" | "set" | "caption",
    extra: Record<string, unknown> = {},
  ) {
    setBusy(action === "describe" || action === "caption" ? "" : action);
    setMsg("");
    const res = await siteStudio({ data: { token: tok(), action, ...extra } });
    if (action !== "describe") setBusy("");
    if (!res.ok) {
      setMsg(res.error || "Ошибка");
      return res;
    }
    if ("media" in res && res.media) setMedia(res.media as MediaRow[]);
    if ("ideas" in res && res.ideas) setIdeas(res.ideas as Omit<HomeCustomBlock, "id">[]);
    if ("pages" in res && res.pages) setPages(res.pages as PageAgent[]);
    if ("schools" in res && Array.isArray(res.schools)) setSchools(res.schools as SchoolRow[]);
    if (action === "pulse") setMsg("Консультанты получили сводку сайта.");
    if (action === "rewrite") setMsg("Тексты блока обновлены.");
    if (action === "set" && "layout" in res) setMsg("Файл в блоке.");
    if (action === "embed") setMsg("Агент на странице сохранён.");
    if (action === "caption" && extra.accept) setMsg("Подпись добавлена.");
    if (action === "caption" && extra.accept === false) setMsg("Подпись не добавлена.");
    return res;
  }

  useEffect(() => {
    void run("list");
  }, []);

  return { media, ideas, pages, schools, msg, busy, prompt, setPrompt, run, setIdeas };
}

export function MediaGrid({
  media,
  onPick,
  busy,
  active,
}: {
  media: MediaRow[];
  onPick?: (src: string) => void;
  busy?: string;
  active?: string;
}) {
  if (!media.length) return <p className="text-sm text-muted">Нет файлов в этой папке.</p>;
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {media.slice(0, 48).map((item) => (
        <div
          key={item.src}
          role="button"
          tabIndex={0}
          draggable
          className={cn(
            "cursor-grab overflow-hidden rounded-xl bg-surface-2 text-left ring-2 ring-transparent active:cursor-grabbing",
            active === item.src && "ring-primary",
            busy && "pointer-events-none opacity-50",
          )}
          onClick={() => onPick?.(item.src)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onPick?.(item.src);
          }}
          onDragStart={(e) => startMediaDrag(e, item.src, item.kind)}
          onDragEnd={() => endMediaDrag()}
          title={item.caption || item.place || item.name}
        >
          {item.kind === "video" ? (
            <span className="grid aspect-square w-full place-items-center bg-header px-1 text-center text-[0.65rem] font-semibold leading-tight text-header-fg">
              видео · {item.name.replace(/\.[^.]+$/, "").slice(0, 22)}
            </span>
          ) : (
            <img src={item.src} alt={item.caption || item.place || item.name} loading="lazy" decoding="async" className="aspect-square w-full object-cover" />
          )}
        </div>
      ))}
    </div>
  );
}

const EXTRA_FOLDERS: { id: string; label: string }[] = [
  { id: "home", label: "Главная" },
  { id: "uploads", label: "Загрузки" },
  { id: "imported", label: "Архив" },
];

export function StudioPanel({
  admin,
  slot,
  onLayout,
  onPickMedia,
}: {
  admin?: boolean;
  slot?: string | null;
  onLayout?: (layout: HomeLayoutDoc) => void;
  onPickMedia?: (src: string) => void;
}) {
  const s = useSiteStudio(admin);
  const [tab, setTab] = useState<"media" | "ai" | "agent">("media");
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("");
  const [picked, setPicked] = useState("");
  const [rewrite, setRewrite] = useState("");
  const [pending, setPending] = useState<{ src: string; caption: string } | null>(null);
  const [agent, setAgent] = useState<PageAgent>(() => emptyPageAgent(currentPath()));

  useEffect(() => {
    const path = currentPath();
    const hit = s.pages.find((p) => p.path === path);
    setAgent(hit || emptyPageAgent(path));
  }, [s.pages]);

  const folders = useMemo(() => {
    const schools = s.schools.map((sch) => ({ id: sch.id, label: sch.label }));
    return [{ id: "", label: "Все" }, ...schools, ...EXTRA_FOLDERS];
  }, [s.schools]);

  const openFolder = folders.find((f) => f.id === folder);
  const canUpload = Boolean(folder);

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    return s.media.filter((item) => {
      if (folder) {
        const schoolHit = item.schoolId === folder || item.folder === folder.replace(/^\//, "");
        const extraHit = item.folder === folder;
        if (!schoolHit && !extraHit) return false;
      }
      if (!query) return true;
      return `${item.name} ${item.place || ""} ${item.caption || ""} ${item.folder} ${item.schoolId || ""}`.toLowerCase().includes(query);
    });
  }, [s.media, q, folder]);

  async function pick(src: string) {
    setPicked(src);
    onPickMedia?.(src);
    if (slot) {
      const res = await s.run("set", { src, slot });
      if (res.ok && "layout" in res && res.layout) onLayout?.(res.layout);
    }
  }

  async function uploadFile(file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      const res = await s.run("upload", { name: file.name, mime: file.type, base64: String(reader.result || ""), folder });
      if (res.ok && "item" in res && res.item) setPicked(res.item.src);
      if (res.ok && "askCaption" in res && res.askCaption && "caption" in res && "item" in res && res.item) {
        setPending({ src: res.item.src, caption: String(res.caption || "") });
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-3 gap-1 rounded-full bg-surface-2 p-0.5">
        {(
          [
            ["media", "Медиа"],
            ["ai", "Блоки ИИ"],
            ["agent", "Агент"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cn("h-8 rounded-full text-[0.72rem] font-semibold", tab === id ? "bg-primary text-primary-foreground" : "hover:bg-black/5")}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "media" ? (
        <>
          <div className="flex flex-wrap gap-2">
            <label
              className={cn(
                "inline-flex h-9 items-center rounded-full px-3 text-[0.78rem] font-semibold",
                canUpload ? "cursor-pointer bg-primary text-primary-foreground" : "cursor-not-allowed bg-surface-2 text-muted",
              )}
            >
              {canUpload ? `Загрузить в «${openFolder?.label}»` : "Загрузить файл"}
              <input
                type="file"
                accept="image/*,video/mp4"
                className="hidden"
                disabled={!canUpload}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void uploadFile(f);
                }}
              />
            </label>
            <Button type="button" variant="secondary" disabled={Boolean(s.busy)} onClick={() => void s.run("pulse")}>
              DeepSeek: знания
            </Button>
          </div>
          <p className="text-[0.72rem] leading-relaxed text-muted">
            {canUpload
              ? "Файл попадёт в папку этой школы на сервере. Перетащите фото на блок слева."
              : "Откройте папку школы — загрузка идёт туда. Либо смотрите все изображения."}
          </p>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Найти фото или курс"
            className="h-9 w-full rounded-xl bg-surface-2 px-3 text-sm ring-1 ring-black/10"
          />
          <div className="flex flex-wrap gap-1">
            {folders.map((item) => (
              <button
                key={item.id || "all"}
                type="button"
                className={cn(
                  "rounded-full px-2.5 py-1 text-[0.68rem] font-semibold",
                  folder === item.id ? "bg-primary text-primary-foreground" : "bg-surface-2",
                )}
                onClick={() => setFolder(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {pending ? (
            <div className="rounded-2xl bg-surface-2 p-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">DeepSeek предлагает подпись</p>
              <p className="mt-2 leading-relaxed">{pending.caption || "Пусто."}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={async () => {
                    await s.run("caption", { src: pending.src, caption: pending.caption, accept: true });
                    hydrateMediaAlts({ ...Object.fromEntries(s.media.map((m) => [m.src, m.caption || ""])), [pending.src]: pending.caption });
                    setPending(null);
                  }}
                >
                  И этот
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={async () => {
                  await s.run("caption", { src: pending.src, accept: false });
                  setPending(null);
                }}>
                  Не добавлять
                </Button>
              </div>
            </div>
          ) : null}
          <p className="text-[0.72rem] text-muted">
            {slot ? `Перетащите файл на блок «${slot}» или кликните, чтобы поставить.` : "Выберите блок на странице, затем перетащите файл."}
          </p>
          <MediaGrid media={shown} busy={s.busy} active={picked} onPick={(src) => void pick(src)} />
        </>
      ) : null}

      {tab === "ai" ? (
        <>
          <textarea
            value={s.prompt}
            onChange={(e) => s.setPrompt(e.target.value)}
            rows={2}
            placeholder="Например: летний интенсив по роботам или набор в digital art"
            className="w-full rounded-xl bg-surface-2 px-3 py-2 text-sm ring-1 ring-black/10"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={Boolean(s.busy)} onClick={() => void s.run("invent", { prompt: s.prompt })}>
              Придумать новый блок
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={Boolean(s.busy) || !s.prompt.trim()}
              onClick={async () => {
                const res = await s.run("generate", { prompt: s.prompt, slot });
                if (res.ok && "layout" in res && res.layout) onLayout?.(res.layout);
              }}
            >
              Сгенерировать по запросу
            </Button>
          </div>
          {s.ideas.length ? (
            <ul className="space-y-2">
              {s.ideas.map((idea, i) => (
                <li key={i} className="rounded-2xl bg-surface-2 p-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-primary">{idea.kicker || "Блок"}</p>
                  <p className="mt-1 font-semibold">{idea.title}</p>
                  <p className="mt-1 text-muted">{idea.text}</p>
                  {idea.why ? <p className="mt-1 text-[0.72rem] text-muted">Тренд: {idea.why}</p> : null}
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2"
                    onClick={async () => {
                      const res = await s.run("place", { block: idea, slot, src: picked });
                      if (res.ok && "layout" in res && res.layout) onLayout?.(res.layout);
                    }}
                  >
                    Поставить на главную
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[0.78rem] leading-relaxed text-muted">
              Кнопка предлагает три блока по трендам 2026. «Сгенерировать» сразу ставит один на главную.
            </p>
          )}
          <div className="rounded-2xl bg-surface-2 p-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">Переписать тексты блока</p>
            <textarea
              value={rewrite}
              onChange={(e) => setRewrite(e.target.value)}
              rows={2}
              placeholder={slot ? "Короче, теплее, без канцелярита" : "Сначала выберите блок"}
              className="mt-2 w-full rounded-xl bg-surface px-3 py-2 text-sm"
            />
            <Button
              type="button"
              size="sm"
              className="mt-2"
              disabled={Boolean(s.busy) || !slot}
              onClick={async () => {
                const res = await s.run("rewrite", { slot, prompt: rewrite });
                if (res.ok && "layout" in res && res.layout) onLayout?.(res.layout);
              }}
            >
              DeepSeek: править текст
            </Button>
          </div>
        </>
      ) : null}

      {tab === "agent" ? (
        <div className="space-y-3">
          <p className="text-[0.78rem] leading-relaxed text-muted">
            Агент уже на всём сайте. Здесь — как он ведёт себя на этой странице: приветствие, автооткрытие и может ли открывать курсы.
          </p>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Внедрить на {agent.path}</span>
            <input type="checkbox" checked={agent.on} onChange={(e) => setAgent({ ...agent, on: e.target.checked })} />
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {(["olga", "oleg"] as const).map((who) => (
              <button
                key={who}
                type="button"
                className={cn("rounded-xl py-2 text-[0.78rem] font-semibold", agent.who === who ? "bg-primary text-primary-foreground" : "bg-surface-2")}
                onClick={() => setAgent({ ...agent, who })}
              >
                {who === "olga" ? "Ольга" : "Олег"}
              </button>
            ))}
          </div>
          <label className="block text-[0.72rem] text-muted">
            Фокус страницы
            <textarea
              value={agent.focus}
              onChange={(e) => setAgent({ ...agent, focus: e.target.value })}
              rows={2}
              placeholder="Робототехника 7–9, пробное без давления"
              className="mt-1 w-full rounded-xl bg-surface-2 px-3 py-2 text-sm text-fg"
            />
          </label>
          <label className="block text-[0.72rem] text-muted">
            Приветствие
            <textarea
              value={agent.greeting}
              onChange={(e) => setAgent({ ...agent, greeting: e.target.value })}
              rows={2}
              placeholder="Вижу, смотрите робототехнику. Рассказать про возраст или сразу на пробное?"
              className="mt-1 w-full rounded-xl bg-surface-2 px-3 py-2 text-sm text-fg"
            />
          </label>
          <label className="block text-[0.72rem] text-muted">
            Открыть чат через {agent.autoOpenSec || 0} сек
            <input
              type="range"
              min={0}
              max={60}
              value={agent.autoOpenSec}
              className="mt-1 w-full"
              onChange={(e) => setAgent({ ...agent, autoOpenSec: Number(e.target.value) })}
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Открывать страницы по поведению</span>
            <input type="checkbox" checked={agent.steer} onChange={(e) => setAgent({ ...agent, steer: e.target.checked })} />
          </label>
          <Button
            type="button"
            disabled={Boolean(s.busy)}
            onClick={() => void s.run("embed", { agent, path: agent.path })}
          >
            Сохранить агента страницы
          </Button>
        </div>
      ) : null}

      {s.msg ? <p className="text-primary">{s.msg}</p> : null}
      {s.busy ? <p className="text-muted">{s.busy === "invent" || s.busy === "generate" || s.busy === "rewrite" || s.busy === "upload" ? "DeepSeek думает…" : "Работаю…"}</p> : null}
    </div>
  );
}
