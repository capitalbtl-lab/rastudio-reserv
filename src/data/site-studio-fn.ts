import { createServerFn } from "@tanstack/react-start";
import { tokenOk } from "./admin-auth";
import { listSiteMedia, saveSiteMedia, deleteSiteUpload } from "./site-media";
import { describeMediaForPulse, loadSitePulse, refreshSitePulse } from "./site-pulse";
import { loadHomeLayout, saveHomeLayout } from "./home-layout";
import { addCustomBlock, setHomeMedia, type HomeCustomBlock } from "./home-layout-core";
import { deepseekText, extractJson } from "./deepseek-text";

function guard(token?: string) {
  return tokenOk(token);
}

const TREND = `Сейчас 2026. Тренды доп. образования: инженерия и ИИ для школьников, робототехника на английском, цифровое искусство, короткие смены/интенсивы, пробное без давления, прозрачные цены за 4 недели, филиал рядом с домом. Студия «Развивайся»: Коломна и Луховицы, семь школ.`;

export const siteStudio = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        action: "list" | "upload" | "delete" | "describe" | "pulse" | "invent" | "generate" | "place";
        name?: string;
        mime?: string;
        base64?: string;
        src?: string;
        prompt?: string;
        block?: HomeCustomBlock;
        slot?: string;
      },
  )
  .handler(async ({ data }) => {
    if (!guard(data.token)) return { ok: false as const, error: "Нужен вход администратора или режим отладки." };
    if (data.action === "list") {
      return { ok: true as const, media: listSiteMedia(), pulse: loadSitePulse() };
    }
    if (data.action === "upload") {
      const raw = String(data.base64 || "").replace(/^data:[^;]+;base64,/, "");
      if (!raw) return { ok: false as const, error: "Файл пустой." };
      const saved = saveSiteMedia(String(data.name || "file"), Buffer.from(raw, "base64"));
      if (!saved.ok) return saved;
      let caption = "";
      try {
        caption = await describeMediaForPulse(saved.item.src, saved.item.name, saved.item.kind);
      } catch (e) {
        caption = e instanceof Error ? e.message : "DeepSeek не описал файл.";
      }
      return { ok: true as const, item: saved.item, caption, media: listSiteMedia(), pulse: loadSitePulse() };
    }
    if (data.action === "delete") {
      const res = deleteSiteUpload(String(data.src || ""));
      if (!res.ok) return res;
      return { ok: true as const, media: listSiteMedia() };
    }
    if (data.action === "describe") {
      const src = String(data.src || "");
      const name = src.split("/").pop() || src;
      const kind = /\.mp4($|\?)/i.test(src) ? "video" : "image";
      try {
        const caption = await describeMediaForPulse(src, name, kind);
        return { ok: true as const, caption, pulse: loadSitePulse() };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "DeepSeek не ответил." };
      }
    }
    if (data.action === "pulse") {
      try {
        const pulse = await refreshSitePulse();
        return { ok: true as const, pulse };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "DeepSeek не собрал сводку." };
      }
    }
    if (data.action === "invent" || data.action === "generate") {
      const ask =
        data.action === "generate"
          ? `Сделай ОДИН блок главной по запросу: ${String(data.prompt || "").slice(0, 400)}. JSON: {"kicker","title","text","ctaLabel","ctaHref","why"}`
          : `Предложи 3 новых блока для главной rastudio.org. ${TREND}
Запрос пользователя: ${String(data.prompt || "придумай актуальный блок").slice(0, 400)}
JSON: {"ideas":[{"kicker","title","text","ctaLabel","ctaHref","why"}]} why — почему это тренд сейчас. ctaHref только существующие пути: /allcourses /schedule /robototehnika-v-kolomne /art-studio /programming-school или #trial.`;
      try {
        const raw = await deepseekText(ask, 900);
        if (data.action === "generate") {
          const one = extractJson<Omit<HomeCustomBlock, "id">>(raw);
          const layout = saveHomeLayout(addCustomBlock(loadHomeLayout(), one));
          return { ok: true as const, layout, ideas: [one] };
        }
        const pack = extractJson<{ ideas: Omit<HomeCustomBlock, "id">[] }>(raw);
        const ideas = (pack.ideas || []).slice(0, 3);
        return { ok: true as const, ideas };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "DeepSeek не придумал блок." };
      }
    }
    if (data.action === "place") {
      const block = data.block;
      if (!block?.title) return { ok: false as const, error: "Нет заголовка блока." };
      let layout = addCustomBlock(loadHomeLayout(), block);
      if (data.src) layout = setHomeMedia(layout, layout.customs.at(-1)?.id || block.id || "", data.src);
      layout = saveHomeLayout(layout);
      return { ok: true as const, layout };
    }
    return { ok: false as const, error: "Неизвестное действие." };
  });
