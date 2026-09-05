import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { GroupCalLesson } from "./crm-slots-core";
import { rememberLessons } from "./crm-lessons";
import { nextLocalId } from "./crm-local-id";
import { mergeJournalInbound } from "./crm-inbound-core";

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
  priority?: number;
  calendar: GroupCalLesson[];
  at: string;
};

type Store = { at: string; items: Record<string, CachedGroupCard> };

let mem: Store | null = null;
let memMtime = 0;

function file() {
  return join(process.cwd(), "storage", "group-cards.json");
}

function key(branchId: number, gid: number) {
  return `${branchId}-${gid}`;
}

function load(): Store {
  try {
    const mtime = existsSync(file()) ? statSync(file()).mtimeMs : 0;
    if (mem && memMtime === mtime) return mem;
    const raw = JSON.parse(readFileSync(file(), "utf8")) as Store;
    if (raw && raw.items && typeof raw.items === "object") {
      mem = raw;
      memMtime = mtime;
      return mem;
    }
  } catch {
    /* */
  }
  mem = { at: "", items: {} };
  memMtime = 0;
  return mem;
}

function write(store: Store) {
  mem = store;
  mkdirSync(dirname(file()), { recursive: true });
  writeFileSync(file(), JSON.stringify(store, null, 0), "utf8");
  try {
    memMtime = statSync(file()).mtimeMs;
  } catch {
    memMtime = Date.now();
  }
}

export function loadGroupCard(branchId: number, gid: number): CachedGroupCard | null {
  return load().items[key(branchId, gid)] || null;
}

export function saveGroupCard(card: CachedGroupCard) {
  saveGroupCards([card]);
}

export function saveGroupCards(cards: CachedGroupCard[]) {
  if (!cards.length) return;
  const store = load();
  const at = new Date().toISOString();
  for (const card of cards) store.items[key(card.branchId, card.id)] = { ...card, at };
  store.at = at;
  write(store);
}

export function listGroupCards(): CachedGroupCard[] {
  return Object.values(load().items);
}

export function nextLocalLessonId() {
  const used: number[] = [];
  for (const card of listGroupCards()) {
    for (const l of card.calendar || []) used.push(Number(l.lessonId) || 0);
  }
  return nextLocalId(used);
}

export function upsertGroupCalendar(
  branchId: number,
  gid: number,
  lesson: GroupCalLesson,
  seed?: Partial<CachedGroupCard>,
) {
  const prev = loadGroupCard(branchId, gid);
  const card: CachedGroupCard = prev || {
    id: gid,
    branchId,
    name: seed?.name || `группа ${gid}`,
    note: seed?.note || "",
    description: seed?.description || "",
    remarks: seed?.remarks || "",
    hashtags: seed?.hashtags || "",
    makeup: seed?.makeup || "",
    statusId: Number(seed?.statusId || 0),
    bDate: seed?.bDate || "",
    eDate: seed?.eDate || "",
    levelId: Number(seed?.levelId || 0),
    signup: seed?.signup || "",
    subjectId: Number(seed?.subjectId || lesson.subjectId || 0),
    subject: seed?.subject || lesson.subject || "",
    calendar: [],
    at: "",
  };
  const cal = [...(card.calendar || [])];
  const lid = Number(lesson.lessonId) || 0;
  const date = String(lesson.date || "");
  const from = String(lesson.from || "");
  let i = lid ? cal.findIndex((x) => Number(x.lessonId) === lid) : -1;
  if (i < 0 && date) i = cal.findIndex((x) => String(x.date) === date && String(x.from || "") === from);
  if (i >= 0) cal[i] = { ...cal[i], ...lesson, lessonId: lid || cal[i].lessonId };
  else cal.push(lesson);
  const next = { ...card, calendar: cal };
  saveGroupCard(next);
  rememberLessons([i >= 0 ? cal[i] : lesson]);
  return next;
}

export function mergeLocalCalendar(
  pulled: GroupCalLesson[],
  prev: GroupCalLesson[] | undefined,
  holdIds?: Iterable<number>,
  mode: "replace" | "union" = "replace",
): GroupCalLesson[] {
  return mergeJournalInbound(pulled, prev, holdIds, mode);
}

export function applyCreatedCalendarLesson(localId: number, crmId: number) {
  const from = Number(localId) || 0;
  const to = Number(crmId) || 0;
  if (!from || !to || from === to) return;
  const remapped: GroupCalLesson[] = [];
  for (const card of listGroupCards()) {
    let changed = false;
    const calendar = (card.calendar || []).map((x) => {
      if (Number(x.lessonId) !== from) return x;
      changed = true;
      const next = { ...x, lessonId: to };
      remapped.push(next);
      return next;
    });
    if (changed) saveGroupCard({ ...card, calendar });
  }
  if (remapped.length) rememberLessons(remapped);
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
