"use client";

import { useEffect, useState } from "react";
import { siteStudio } from "@/data/site-studio-fn";
import type { SiteMediaItem } from "@/data/site-media";
import type { HomeCustomBlock, HomeLayoutDoc } from "@/data/home-layout-core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

export function useSiteStudio(useAdmin = false) {
  const [media, setMedia] = useState<SiteMediaItem[]>([]);
  const [ideas, setIdeas] = useState<Omit<HomeCustomBlock, "id">[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [prompt, setPrompt] = useState("");
  const tok = () => (useAdmin ? adminToken() : token() || adminToken());

  async function run(action: Parameters<typeof siteStudio>[0]["data"]["action"], extra: Record<string, unknown> = {}) {
    setBusy(action);
    setMsg("");
    const res = await siteStudio({ data: { token: tok(), action, ...extra } });
    setBusy("");
    if (!res.ok) {
      setMsg(res.error || "Ошибка");
      return res;
    }
    if ("media" in res && res.media) setMedia(res.media);
    if ("ideas" in res && res.ideas) setIdeas(res.ideas as Omit<HomeCustomBlock, "id">[]);
    if (action === "pulse") setMsg("Консультанты получили сводку сайта.");
    if (action === "describe" && "caption" in res) setMsg(String(res.caption));
    if (action === "upload" && "caption" in res) setMsg(`Загружено. DeepSeek: ${res.caption}`);
    return res;
  }

  useEffect(() => {
    void run("list");
  }, []);

  return { media, ideas, msg, busy, prompt, setPrompt, run, setIdeas };
}

export function MediaGrid({
  media,
  onPick,
  busy,
}: {
  media: SiteMediaItem[];
  onPick?: (src: string) => void;
  busy?: string;
}) {
  if (!media.length) return <p className="text-sm text-muted">Медиатека пуста. Загрузите фото или видео.</p>;
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {media.slice(0, 80).map((item) => (
        <button
          key={item.src}
          type="button"
          disabled={Boolean(busy)}
          className="overflow-hidden rounded-xl bg-surface-2 text-left"
          onClick={() => onPick?.(item.src)}
          title={item.name}
        >
          {item.kind === "video" ? (
            <video src={item.src} className="aspect-square w-full object-cover" muted playsInline />
          ) : (
            <img src={item.src} alt={item.name} className="aspect-square w-full object-cover" />
          )}
        </button>
      ))}
    </div>
  );
}

export function StudioPanel({
  admin,
  onLayout,
  onPickMedia,
}: {
  admin?: boolean;
  onLayout?: (layout: HomeLayoutDoc) => void;
  onPickMedia?: (src: string) => void;
}) {
  const s = useSiteStudio(admin);
  return (
    <div className="space-y-4 text-sm">
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
          DeepSeek: обновить знания
        </Button>
      </div>
      <MediaGrid media={s.media} busy={s.busy} onPick={onPickMedia} />
      <textarea
        value={s.prompt}
        onChange={(e) => s.setPrompt(e.target.value)}
        rows={2}
        placeholder="Например: блок про летний лагерь 2026 или набор в робототехнику на английском"
        className="w-full rounded-xl bg-surface-2 px-3 py-2 text-sm ring-1 ring-black/10"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={Boolean(s.busy)}
          onClick={() => void s.run("invent", { prompt: s.prompt })}
        >
          Придумать блок
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={Boolean(s.busy) || !s.prompt.trim()}
          onClick={async () => {
            const res = await s.run("generate", { prompt: s.prompt });
            if (res.ok && "layout" in res && res.layout) onLayout?.(res.layout);
          }}
        >
          Сгенерировать по запросу
        </Button>
      </div>
      {s.ideas.length ? (
        <ul className="space-y-2">
          {s.ideas.map((idea, i) => (
            <li key={i} className={cn("rounded-2xl bg-surface-2 p-3")}>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-primary">{idea.kicker || "Блок"}</p>
              <p className="mt-1 font-semibold">{idea.title}</p>
              <p className="mt-1 text-muted">{idea.text}</p>
              {idea.why ? <p className="mt-1 text-[0.72rem] text-muted">Тренд: {idea.why}</p> : null}
              <Button
                type="button"
                size="sm"
                className="mt-2"
                onClick={async () => {
                  const res = await s.run("place", { block: idea });
                  if (res.ok && "layout" in res && res.layout) onLayout?.(res.layout);
                }}
              >
                Поставить на главную
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {s.msg ? <p className="text-primary">{s.msg}</p> : null}
      {s.busy ? <p className="text-muted">{s.busy === "invent" || s.busy === "generate" ? "DeepSeek думает…" : "Работаю…"}</p> : null}
    </div>
  );
}
