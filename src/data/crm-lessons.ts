import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { GroupCalLesson } from "./crm-slots-core";

export type LessonKnowledge = {
  lessonId?: number;
  date: string;
  type: string;
  status: number;
  from: string;
  to: string;
  room?: string;
  teacher?: string;
  subject?: string;
  group?: string;
  topic?: string;
  homework?: string;
};

function file() {
  return join(process.cwd(), "storage", "crm-lessons.json");
}

export function loadLessonKnowledge(): LessonKnowledge[] {
  try {
    const raw = JSON.parse(readFileSync(file(), "utf8")) as { items?: LessonKnowledge[] };
    return Array.isArray(raw.items) ? raw.items : [];
  } catch {
    return [];
  }
}

export function rememberLessons(lessons: GroupCalLesson[]) {
  const useful = lessons.filter((l) => l.topic || l.homework || l.lessonId);
  if (!useful.length) return;
  const prev = loadLessonKnowledge();
  const map = new Map<string, LessonKnowledge>();
  for (const x of prev) map.set(String(x.lessonId || `${x.date}|${x.group}|${x.from}`), x);
  for (const l of useful) {
    const key = String(l.lessonId || `${l.date}|${l.group}|${l.from}`);
    map.set(key, {
      lessonId: l.lessonId,
      date: l.date,
      type: l.type,
      status: l.status,
      from: l.from,
      to: l.to,
      room: l.room,
      teacher: l.teacher,
      subject: l.subject,
      group: l.group,
      topic: l.topic,
      homework: l.homework,
    });
  }
  const items = [...map.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4000);
  mkdirSync(dirname(file()), { recursive: true });
  writeFileSync(file(), JSON.stringify({ at: new Date().toISOString(), count: items.length, items }, null, 0), "utf8");
}

export function lessonFactsForAgent(limit = 40) {
  return loadLessonKnowledge()
    .filter((x) => x.topic || x.homework)
    .slice(0, limit)
    .map((x) => {
      const bits = [
        x.date,
        x.group || x.subject,
        x.type,
        x.topic ? `тема: ${x.topic}` : "",
        x.homework ? `домашнее: ${x.homework}` : "",
      ].filter(Boolean);
      return bits.join(" · ");
    });
}
