"use client";

import { useEffect, useMemo, useState } from "react";
import { siteStudio } from "@/data/site-studio-fn";
import type { SiteMediaItem } from "@/data/site-media";
import type { HomeCustomBlock, HomeLayoutDoc } from "@/data/home-layout-core";
import type { PageAgent } from "@/data/page-agents-core";
import { emptyPageAgent } from "@/data/page-agents-core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MediaRow = SiteMediaItem & { caption?: string; place?: string };

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
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [prompt, setPrompt] = useState("");
  const tok = () => (useAdmin ? adminToken() : token() || adminToken());

  async function run(
    action: "list" | "upload" | "delete" | "describe" | "pulse" | "invent" | "generate" | "place" | "rewrite" | "agents" | "embed",
    extra: Record<string, unknown> = {},
  ) {
    setBusy(action);
    setMsg("");
    const res = await siteStudio({ data: { token: tok(), action, ...extra } });
    setBusy("");
    if (!res.ok) {
      setMsg(res.error || "Ошибка");
      return res;
    }
    if ("media" in res && res.media) setMedia(res.media as MediaRow[]);
    if ("ideas" in res && res.ideas) setIdeas(res.ideas as Omit<HomeCustomBlock, "id">[]);
    if ("pages" in res && res.pages) setPages(res.pages as PageAgent[]);
    if (action === "pulse") setMsg("Консультанты получили сводку сайта.");
    if (action === "describe" && "caption" in res) setMsg(String(res.caption));
    if (action === "upload" && "caption" in res) setMsg(`Загружено. DeepSeek: ${res.caption}`);
    if (action === "rewrite") setMsg("Тексты блока обновлены.");
    if (action === "embed") setMsg("Агент на странице сохранён.");
    return res;
  }

  useEffect(() => {
    void run("list");
  }, []);

  return { media, ideas, pages, msg, busy, prompt, setPrompt, run, setIdeas };
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
      {media.slice(0, 80).map((item) => (
        <button
          key={item.src}
          type="button"
          disabled={Boolean(busy)}
          className={cn(
            "overflow-hidden rounded-xl bg-surface-2 text-left ring-2 ring-transparent",
            active === item.src && "ring-primary",
          )}
          onClick={() => onPick?.(item.src)}
          title={item.caption || item.place || item.name}
        >
          {item.kind === "video" ? (
            <video src={item.src} className="aspect-square w-full object-cover" muted playsInline />
          ) : (
            <img src={item.src} alt={item.place || item.name} className="aspect-square w-full object-cover" />
          )}
        </button>
      ))}
    </div>
  );
}

const FOLDER_LABEL: Record<string, string> = {
  home: "Главная",
  uploads: "Загрузки",
  imported: "Архив",
  heroes: "Обложки",
};

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
  const [agent, setAgent] = useState<PageAgent>(() => emptyPageAgent(currentPath()));

  useEffect(() => {
    const path = currentPath();
    const hit = s.pages.find((p) => p.path === path);
    setAgent(hit || emptyPageAgent(path));
  }, [s.pages]);

  const folders = useMemo(() => {
    const set = new Set(s.media.map((m) => m.folder).filter(Boolean));
    return ["", ...[...set].sort()];
  }, [s.media]);

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    return s.media.filter((item) => {
      if (folder && item.folder !== folder) return false;
      if (!query) return true;
      return `${item.name} ${item.place || ""} ${item.caption || ""} ${item.folder}`.toLowerCase().includes(query);
    });
  }, [s.media, q, folder]);

  async function pick(src: string) {
    setPicked(src);
    onPickMedia?.(src);
    if (slot) {
      const res = await s.run("describe", { src, slot });
      if (res.ok && "layout" in res && res.layout) onLayout?.(res.layout);
    }
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
            <label className="inline-flex h-9 cursor-pointer items-center rounded-full bg-primary px-3 text-[0.78rem] font-semibold text-primary-foreground">
              Загрузить файл
              <input
                type="file"
                accept="image/*,video/mp4"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = () => void s.run("upload", { name: f.name, mime: f.type, base64: String(reader.result || "") });
                  reader.readAsDataURL(f);
                }}
              />
            </label>
            <Button type="button" variant="secondary" disabled={Boolean(s.busy)} onClick={() => void s.run("pulse")}>
              DeepSeek: знания
            </Button>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Найти фото или курс"
            className="h-9 w-full rounded-xl bg-surface-2 px-3 text-sm ring-1 ring-black/10"
          />
          <div className="flex flex-wrap gap-1">
            {folders.slice(0, 12).map((id) => (
              <button
                key={id || "all"}
                type="button"
                className={cn(
                  "rounded-full px-2.5 py-1 text-[0.68rem] font-semibold",
                  folder === id ? "bg-primary text-primary-foreground" : "bg-surface-2",
                )}
                onClick={() => setFolder(id)}
              >
                {id ? FOLDER_LABEL[id] || id.replace(/-/g, " ").slice(0, 18) : "Все"}
              </button>
            ))}
          </div>
          <p className="text-[0.72rem] text-muted">
            {slot ? `Клик — поставить в «${slot}». DeepSeek подпишет кадр для Ольги.` : "Выберите блок слева, затем кликните файл."}
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
      {s.busy ? <p className="text-muted">{s.busy === "invent" || s.busy === "generate" || s.busy === "rewrite" ? "DeepSeek думает…" : "Работаю…"}</p> : null}
    </div>
  );
}
