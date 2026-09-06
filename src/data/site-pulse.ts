import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { listSiteMedia } from "./site-media";
import { loadHomeLayout } from "./home-layout";
import { deepseekText } from "./deepseek-text";
import { homeBlockLabel } from "./home-layout-core";

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

export async function describeMediaForPulse(src: string, name: string, kind: "image" | "video") {
  const layout = loadHomeLayout();
  const used = Object.entries(layout.media || {})
    .filter(([, v]) => v === src)
    .map(([id]) => homeBlockLabel(id, layout.customs));
  const caption = await deepseekText(
    `Опиши файл сайта для консультанта Ольги.
Тип: ${kind === "video" ? "видео" : "фото"}. Имя файла: ${name}. Путь: ${src}.
Где на главной сейчас стоит: ${used.join(", ") || "ещё не в блоке"}.
Два коротких предложения: что на кадре (по имени и месту) и как это назвать родителю. Без выдуманных людей.`,
    280,
  );
  const pulse = loadSitePulse();
  pulse.updated = new Date().toISOString();
  pulse.notes = [
    { at: pulse.updated, kind: "media", title: name, text: caption, src },
    ...pulse.notes.filter((n) => n.src !== src),
  ].slice(0, 40);
  savePulse(pulse);
  return caption;
}

export async function refreshSitePulse() {
  const layout = loadHomeLayout();
  const media = listSiteMedia().slice(0, 12);
  const texts = Object.entries(layout.texts || {})
    .slice(0, 12)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const customs = (layout.customs || []).map((c) => `${c.title}: ${c.text}`).join("\n");
  const listing = media.map((m) => `${m.kind} ${m.src}`).join("\n");
  const body = await deepseekText(
    `Сводка для ИИ-консультанта студии «Развивайся». Что нового на сайте, чтобы Ольга сразу это знала.
Тексты главной:
${texts || "заводские"}
Свои блоки:
${customs || "нет"}
Медиа (последние файлы):
${listing || "нет"}
Верни 6–10 строк: факт — как сказать родителю. Без цен, если их нет в тексте.`,
    700,
  );
  const pulse = loadSitePulse();
  pulse.updated = new Date().toISOString();
  pulse.notes = [
    { at: pulse.updated, kind: "site", title: "Сводка сайта", text: body },
    ...pulse.notes.filter((n) => n.kind !== "site"),
  ].slice(0, 40);
  savePulse(pulse);
  return pulse;
}
