import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isAdminRequest } from "./admin-auth";
import { logAdmin } from "./admin-settings";
import { IDS_FOR_AGENT } from "./ids";
import { FACTORY_GUIDES, factoryGuide, GUIDE_REV, type SectionGuide } from "./agent-section-guides-data";
import { tariffMapForAgent } from "./public-bind";
import { loadSiteSignup } from "./site-signup";
import { subjectMapForAgent } from "./subject-admin";
import { GROUP_STATUSES } from "./group-status";
import { rolesPrompt } from "./agent-config";

type Overlay = { id: string; on?: boolean; body?: string; updatedAt?: string };
type Store = { items: Overlay[] };

function storeFile() {
  return join(process.cwd(), "storage", "agent-section-guides.json");
}

function loadStore(): Store {
  try {
    if (!existsSync(storeFile())) return { items: [] };
    const raw = JSON.parse(readFileSync(storeFile(), "utf8")) as Partial<Store>;
    return { items: Array.isArray(raw.items) ? raw.items : [] };
  } catch {
    return { items: [] };
  }
}

function saveStore(store: Store) {
  mkdirSync(dirname(storeFile()), { recursive: true });
  writeFileSync(storeFile(), JSON.stringify(store, null, 2), "utf8");
}

export function loadGuides(): SectionGuide[] {
  const store = loadStore();
  return FACTORY_GUIDES.map((g) => {
    const hit = store.items.find((x) => x.id === g.id);
    if (!hit) return { ...g };
    const body = String(hit.body || "");
    const stale = !body.includes(`REV ${GUIDE_REV}`);
    return {
      ...g,
      on: hit.on !== false,
      body: stale ? g.body : body,
      updatedAt: stale ? "" : hit.updatedAt || "",
    };
  });
}

export function guidePrompt(sectionId: string) {
  const g = loadGuides().find((x) => x.id === sectionId && x.on);
  return g?.body?.trim() || "";
}

export function scheduleGuidePrompt() {
  const all = loadGuides().filter((g) => g.on && String(g.body || "").trim());
  const base = all.length ? all.map((g) => String(g.body).trim()).join("\n\n----\n\n") : IDS_FOR_AGENT;
  let extra = "";
  try {
    extra += `\n\n${tariffMapForAgent()}`;
  } catch {
    /* */
  }
  try {
    extra += `\n\n${subjectMapForAgent()}`;
  } catch {
    /* */
  }
  try {
    const s = loadSiteSignup();
    const rows = GROUP_STATUSES.filter((st) => st.id !== 7 && st.id !== 8 && st.id !== 9)
      .map((st) => {
        const p = s.statusPublish?.[String(st.id)];
        return `${st.id} ${st.short}: сайт ${p?.schedule ? "да" : "нет"}, пробное ${p?.trial ? "да" : "нет"}, в группу ${p?.group ? "да" : "нет"}`;
      })
      .join("; ");
    extra += `\n\nЗапись на сайте сейчас: пробное ${s.trialOn ? "ВКЛ" : "выкл"}, в группу ${s.groupOn ? "ВКЛ" : "выкл"}.\nМатрица статусов (Админка → Сайт): ${rows}.`;
  } catch {
    /* */
  }
  try {
    extra += `\n\n${rolesPrompt("admin")}`;
  } catch {
    /* */
  }
  return `${base}${extra}`;
}

export async function handleAdminSectionGuides(data: {
  token?: string;
  action: "get" | "save" | "reset";
  id?: string;
  on?: boolean;
  body?: string;
}) {
  if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
  const pack = () => ({ ok: true as const, guides: loadGuides() });
  if (data.action === "get") return pack();
  const id = String(data.id || "");
  const factory = factoryGuide(id);
  if (!factory) return { ok: false as const, error: "Нет такого раздела." };
  const store = loadStore();
  const rest = store.items.filter((x) => x.id !== id);
  if (data.action === "reset") {
    saveStore({ items: rest });
    logAdmin(`Инструкция раздела сброшена: ${id}`);
    return pack();
  }
  const next: Overlay = {
    id,
    on: data.on !== false,
    body: String(data.body ?? factory.body).slice(0, 32000),
    updatedAt: new Date().toISOString(),
  };
  saveStore({ items: [...rest, next] });
  logAdmin(`Инструкция раздела сохранена: ${id}`);
  return pack();
}
