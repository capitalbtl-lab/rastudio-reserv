import { createServerFn } from "@tanstack/react-start";
import { tokenOk } from "./admin-auth";
import { listSiteMedia, saveSiteMedia, deleteSiteUpload } from "./site-media";
import { describeMediaForPulse, loadSitePulse, refreshSitePulse, noteCustomBlock } from "./site-pulse";
import { loadHomeLayout, saveHomeLayout } from "./home-layout";
import {
  addCustomBlock,
  homeBlockLabel,
  placeHomeBlock,
  setHomeMedia,
  setHomeText,
  type HomeCustomBlock,
} from "./home-layout-core";
import { deepseekText, extractJson } from "./deepseek-text";
import { loadPageAgents, upsertPageAgent, asPageAgent } from "./page-agents";
import { mediaContext } from "./media-context";
import { loadSiteTree } from "./site-tree";

function guard(token?: string) {
  return tokenOk(token);
}

const TREND = `Сейчас 2026. Тренды доп. образования: инженерия и ИИ для школьников, робототехника на английском, цифровое искусство, короткие смены/интенсивы, пробное без давления, прозрачные цены за 4 недели, филиал рядом с домом. Студия «Развивайся»: Коломна и Луховицы, семь школ.`;

function treeLabels() {
  try {
    const tree = loadSiteTree();
    return [...tree.schools, ...tree.courses].map((x) => ({ id: x.id || x.href, label: x.label }));
  } catch {
    return [];
  }
}

function mediaWithCaptions() {
  const pulse = loadSitePulse();
  const captions = new Map(pulse.notes.filter((n) => n.src).map((n) => [n.src as string, n.text]));
  const labels = treeLabels();
  return listSiteMedia().map((item) => {
    const ctx = mediaContext(item.src, labels);
    return { ...item, caption: captions.get(item.src) || "", place: ctx.place };
  });
}

export const siteStudio = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        action:
          | "list"
          | "upload"
          | "delete"
          | "describe"
          | "pulse"
          | "invent"
          | "generate"
          | "place"
          | "rewrite"
          | "agents"
          | "embed";
        name?: string;
        mime?: string;
        base64?: string;
        src?: string;
        prompt?: string;
        block?: HomeCustomBlock;
        slot?: string;
        path?: string;
        agent?: unknown;
      },
  )
  .handler(async ({ data }) => {
    if (!guard(data.token)) return { ok: false as const, error: "Нужен вход администратора или режим отладки." };
    if (data.action === "list") {
      return { ok: true as const, media: mediaWithCaptions(), pulse: loadSitePulse(), pages: loadPageAgents().pages };
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
      return { ok: true as const, item: saved.item, caption, media: mediaWithCaptions(), pulse: loadSitePulse() };
    }
    if (data.action === "delete") {
      const res = deleteSiteUpload(String(data.src || ""));
      if (!res.ok) return res;
      return { ok: true as const, media: mediaWithCaptions() };
    }
    if (data.action === "describe") {
      const src = String(data.src || "");
      const name = src.split("/").pop() || src;
      const kind = /\.mp4($|\?)/i.test(src) ? "video" : "image";
      try {
        let layout = loadHomeLayout();
        if (data.slot) {
          layout = saveHomeLayout(setHomeMedia(layout, data.slot, src));
        }
        const caption = await describeMediaForPulse(src, name, kind);
        return { ok: true as const, caption, pulse: loadSitePulse(), layout };
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
Запрос пользователя: ${String(data.prompt || "придумай актуальный блок по трендам 2026").slice(0, 400)}
JSON: {"ideas":[{"kicker","title","text","ctaLabel","ctaHref","why"}]} why — почему это тренд сейчас. ctaHref только существующие пути: /allcourses /schedule /robototehnika-v-kolomne /art-studio /programming-school или #trial.`;
      try {
        const raw = await deepseekText(ask, 900);
        if (data.action === "generate") {
          const one = extractJson<Omit<HomeCustomBlock, "id">>(raw);
          let layout = addCustomBlock(loadHomeLayout(), one);
          if (data.slot) {
            const id = layout.customs.at(-1)?.id;
            if (id) layout = { ...layout, order: placeHomeBlock(layout.order, id, data.slot) };
          }
          layout = saveHomeLayout(layout);
          noteCustomBlock(one);
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
      const id = layout.customs.find((c) => c.title === block.title)?.id || layout.customs.at(-1)?.id || "";
      if (data.src && id) layout = setHomeMedia(layout, id, data.src);
      if (data.slot && id) layout = { ...layout, order: placeHomeBlock(layout.order, id, data.slot) };
      layout = saveHomeLayout(layout);
      noteCustomBlock(block);
      return { ok: true as const, layout };
    }
    if (data.action === "rewrite") {
      const slot = String(data.slot || "");
      if (!slot) return { ok: false as const, error: "Выберите блок на странице." };
      const layout = loadHomeLayout();
      const current: Record<string, string> = {};
      for (const [k, v] of Object.entries(layout.texts)) {
        if (k === slot || k.startsWith(`${slot}.`)) current[k] = v;
      }
      const custom = layout.customs.find((c) => c.id === slot);
      if (custom) {
        current[`${slot}.kicker`] = custom.kicker;
        current[`${slot}.title`] = custom.title;
        current[`${slot}.text`] = custom.text;
      }
      const ask = `Отредактируй тексты блока «${homeBlockLabel(slot, layout.customs)}» главной rastudio.org.
Сейчас:
${JSON.stringify(current, null, 2) || "тексты заводские, ключи вида hero.title / about.text"}
Запрос редактора: ${String(data.prompt || "сделай живее для родителя, короче, без канцелярита").slice(0, 400)}
JSON: {"texts":{"ключ":"новый текст"},"custom":{"kicker":"","title":"","text":""}}
custom заполняй только если это свой блок (id начинается с c_). Не выдумывай цены и даты.`;
      try {
        const raw = await deepseekText(ask, 900);
        const pack = extractJson<{ texts?: Record<string, string>; custom?: { kicker?: string; title?: string; text?: string } }>(raw);
        let next = layout;
        for (const [k, v] of Object.entries(pack.texts || {})) {
          if (typeof v === "string") next = setHomeText(next, k, v);
        }
        if (custom && pack.custom?.title) {
          next = addCustomBlock(next, {
            ...custom,
            kicker: pack.custom.kicker ?? custom.kicker,
            title: pack.custom.title,
            text: pack.custom.text ?? custom.text,
          });
        }
        next = saveHomeLayout(next);
        return { ok: true as const, layout: next };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "DeepSeek не переписал текст." };
      }
    }
    if (data.action === "agents") {
      return { ok: true as const, pages: loadPageAgents().pages };
    }
    if (data.action === "embed") {
      const draft = asPageAgent(data.agent) || asPageAgent({ ...(typeof data.agent === "object" && data.agent ? data.agent : {}), path: data.path });
      if (!draft) return { ok: false as const, error: "Укажите страницу сайта." };
      const saved = upsertPageAgent(draft);
      if (!saved.ok) return saved;
      return { ok: true as const, agent: saved.agent, pages: saved.pages };
    }
    return { ok: false as const, error: "Неизвестное действие." };
  });
