import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { listSiteMedia } from "./site-media";
import { loadHomeLayout } from "./home-layout";
import { deepseekText } from "./deepseek-text";
import { homeBlockLabel, type HomeCustomBlock } from "./home-layout-core";
import { mediaContext } from "./media-context";
import { loadSiteTree } from "./site-tree";
import { saveMediaAlt } from "./media-alts";

export type PulseNote = { at: string; kind: "media" | "block" | "site"; title: string; text: string; src?: string };

type Pulse = { updated: string; notes: PulseNote[] };

function fileOf() {
  return join(process.cwd(), "storage", "site-pulse.json");
}

export function loadSitePulse(): Pulse {
  try {
    if (!existsSync(fileOf())) return { updated: "", notes: [] };
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Pulse;
    return { updated: String(raw.updated || ""), notes: Array.isArray(raw.notes) ? raw.notes.slice(0, 40) : [] };
  } catch {
    return { updated: "", notes: [] };
  }
}

function savePulse(p: Pulse) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify(p, null, 2), "utf8");
}

export function pulsePrompt() {
  const p = loadSitePulse();
  if (!p.notes.length) return "";
  const lines = p.notes
    .slice(0, 16)
    .map((n) => `— ${n.title}: ${n.text}${n.src ? ` (${n.src})` : ""}`)
    .join("\n");
  return `

Новое на сайте (DeepSeek прочитал медиа и блоки, консультант это уже знает):
обновлено ${p.updated || "—"}
${lines}
Не говори «из базы». Если родитель спрашивает про фото/новый блок — опирайся на эти подписи.`;
}

function treeLabels() {
  try {
    const tree = loadSiteTree();
    return [...tree.schools, ...tree.courses].map((x) => ({ id: x.id || x.href, label: x.label }));
  } catch {
    return [];
  }
}

export function pushPulse(note: PulseNote) {
  const pulse = loadSitePulse();
  pulse.updated = note.at || new Date().toISOString();
  pulse.notes = [note, ...pulse.notes.filter((n) => n.src !== note.src || n.kind !== note.kind)].slice(0, 40);
  savePulse(pulse);
  return pulse;
}

export async function describeMediaForPulse(src: string, name: string, kind: "image" | "video") {
  const caption = await proposeMediaCaption(src, name, kind);
  acceptMediaCaption(src, caption);
  return caption;
}

export async function proposeMediaCaption(src: string, name: string, kind: "image" | "video") {
  const layout = loadHomeLayout();
  const used = Object.entries(layout.media || {})
    .filter(([, v]) => v === src)
    .map(([id]) => homeBlockLabel(id, layout.customs));
  const ctx = mediaContext(src, treeLabels());
  return deepseekText(
    `Напиши ALT-подпись файла сайта студии «Развивайся». DeepSeek видит метаданные и место, не пиксели — не выдумывай лица.
Тип: ${kind === "video" ? "видео" : "фото"}. Имя: ${name}. Путь: ${src}.
Папка/курс: ${ctx.place}. Где на главной: ${used.join(", ") || "ещё не в блоке"}.
Одно-два коротких предложения для атрибута alt: что на кадре по месту и имени. Без цен и выдуманных людей.`,
    220,
  );
}

export function acceptMediaCaption(src: string, text: string) {
  const caption = String(text || "").trim();
  if (!caption) return loadSitePulse();
  const ctx = mediaContext(src, treeLabels());
  const name = src.split("/").pop() || src;
  saveMediaAlt(src, caption);
  return pushPulse({ at: new Date().toISOString(), kind: "media", title: `${ctx.place}: ${name}`, text: caption, src });
}

export function noteCustomBlock(block: Pick<HomeCustomBlock, "title" | "text" | "why" | "kicker">) {
  return pushPulse({
    at: new Date().toISOString(),
    kind: "block",
    title: block.title,
    text: [block.kicker, block.why || block.text].filter(Boolean).join(". ").slice(0, 400),
  });
}

export async function refreshSitePulse() {
  const layout = loadHomeLayout();
  const media = listSiteMedia().slice(0, 12);
  const labels = treeLabels();
  const texts = Object.entries(layout.texts || {})
    .slice(0, 12)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const customs = (layout.customs || []).map((c) => `${c.title}: ${c.text}`).join("\n");
  const listing = media
    .map((m) => {
      const ctx = mediaContext(m.src, labels);
      return `${m.kind} ${m.src} — ${ctx.place}`;
    })
    .join("\n");
  const body = await deepseekText(
    `Сводка для ИИ-консультанта студии «Развивайся». Что нового на сайте, чтобы Ольга сразу это знала.
Тексты главной:
${texts || "заводские"}
Свои блоки:
${customs || "нет"}
Медиа (последние файлы, папка = курс или место):
${listing || "нет"}
Верни 6–10 строк: факт — как сказать родителю. Без цен, если их нет в тексте.`,
    700,
  );
  return pushPulse({ at: new Date().toISOString(), kind: "site", title: "Сводка сайта", text: body });
}
