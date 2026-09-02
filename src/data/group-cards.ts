import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { GroupCalLesson } from "./crm-slots-core";

export type CachedGroupCard = {
  id: number;
  branchId: number;
  name: string;
  note: string;
  description: string;
  remarks: string;
  hashtags: string;
  makeup: string;
  statusId: number;
  bDate: string;
  eDate: string;
  levelId: number;
  signup: string;
  /** Предмет CRM. Карточка группы ключуется branchId+id (=groupId). */
  subjectId: number;
  subject: string;
  calendar: GroupCalLesson[];
  at: string;
};

type Store = { at: string; items: Record<string, CachedGroupCard> };

function file() {
  return join(process.cwd(), "storage", "group-cards.json");
}

function key(branchId: number, gid: number) {
  return `${branchId}-${gid}`;
}

function load(): Store {
  try {
    const raw = JSON.parse(readFileSync(file(), "utf8")) as Store;
    if (raw && raw.items && typeof raw.items === "object") return raw;
  } catch {
    /* */
  }
  return { at: "", items: {} };
}

function write(store: Store) {
  mkdirSync(dirname(file()), { recursive: true });
  writeFileSync(file(), JSON.stringify(store, null, 0), "utf8");
}

export function loadGroupCard(branchId: number, gid: number): CachedGroupCard | null {
  return load().items[key(branchId, gid)] || null;
}

export function saveGroupCard(card: CachedGroupCard) {
  const store = load();
  store.items[key(card.branchId, card.id)] = { ...card, at: new Date().toISOString() };
  store.at = new Date().toISOString();
  write(store);
}

export function listGroupCards(): CachedGroupCard[] {
  return Object.values(load().items);
}

export function groupCardsExist() {
  return existsSync(file());
}

export function groupFactsForVoice(limit = 80) {
  return listGroupCards()
    .slice(0, limit)
    .map((g) => {
      const last = [...g.calendar].sort((a, b) => b.date.localeCompare(a.date))[0];
      return [
        `gid ${g.id}`,
        g.name,
        g.subject,
        g.note,
        g.statusId ? `status ${g.statusId}` : "",
        g.bDate && g.eDate ? `${g.bDate}–${g.eDate}` : "",
        last ? `последнее ${last.date} ${last.type} ст.${last.status}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
    });
}
