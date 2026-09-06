/** Диск и сервер: уроки консультанта + карта связей. */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { logAdmin } from "./admin-settings";
import {
  confirmLessonReply,
  isLessonSpeech,
  lessonGraph,
  lessonsPromptText,
  parseLessonSpeech,
  type AgentLesson,
  type LessonKind,
} from "./agent-lessons-core";

export {
  confirmLessonReply,
  isLessonSpeech,
  lessonGraph,
  lessonsPromptText,
  parseLessonSpeech,
  guessKind,
  guessIntent,
  guessAction,
  guessEntity,
  LESSON_KIND_LABEL,
  LESSON_KINDS,
  type AgentLesson,
  type GraphEdge,
  type GraphNode,
  type LessonKind,
} from "./agent-lessons-core";

function fileOf() {
  return join(process.cwd(), "storage", "agent-lessons.json");
}

function nid() {
  return `lsn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function loadLessons(): AgentLesson[] {
  try {
    if (!existsSync(fileOf())) return [];
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as { lessons?: AgentLesson[] } | AgentLesson[];
    const list = Array.isArray(raw) ? raw : raw.lessons || [];
    return list.filter((l) => l && l.id && l.right);
  } catch {
    return [];
  }
}

export function saveLessons(list: AgentLesson[]) {
  const file = fileOf();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ lessons: list.slice(0, 300), updatedAt: new Date().toISOString() }, null, 2));
}

export function addLesson(partial: Partial<AgentLesson> & { right?: string; source?: string }): AgentLesson {
  const now = new Date().toISOString();
  const lesson: AgentLesson = {
    id: partial.id || nid(),
    at: partial.at || now,
    kind: (["reply", "crm", "flow", "id"] as LessonKind[]).includes(partial.kind as LessonKind)
      ? (partial.kind as LessonKind)
      : "reply",
    intent: String(partial.intent || "общее").slice(0, 40),
    wrong: String(partial.wrong || "").slice(0, 400),
    right: String(partial.right || "").slice(0, 800),
    action: String(partial.action || "").slice(0, 60),
    entity: String(partial.entity || "").slice(0, 40),
    on: partial.on !== false,
    source: String(partial.source || "manual").slice(0, 80),
  };
  const list = [lesson, ...loadLessons().filter((x) => x.id !== lesson.id)].slice(0, 300);
  saveLessons(list);
  return lesson;
}

export function lessonsPrompt(cap = 24) {
  return lessonsPromptText(loadLessons(), cap);
}

export const adminAgentLessons = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        action: "get" | "add" | "toggle" | "remove";
        lesson?: Partial<AgentLesson> & { id?: string };
      },
  )
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const pack = (list: AgentLesson[]) => {
      const graph = lessonGraph(list);
      return { ok: true as const, lessons: list, graph, total: list.length };
    };
    if (data.action === "get") return pack(loadLessons());
    if (data.action === "add") {
      const parsed = data.lesson?.right || data.lesson?.wrong ? data.lesson : parseLessonSpeech(String(data.lesson?.right || data.lesson?.wrong || ""));
      const right = String(data.lesson?.right || (parsed && "right" in parsed ? parsed.right : "") || "").trim();
      if (!right) return { ok: false as const, error: "Нужно, как правильно." };
      const lesson = addLesson({
        ...parsed,
        ...data.lesson,
        right,
        source: data.lesson?.source || "admin",
      });
      logAdmin(`Обучение: урок ${lesson.kind} «${lesson.intent}»`);
      return { ...pack(loadLessons()), saved: lesson };
    }
    if (data.action === "toggle" && data.lesson?.id) {
      const list = loadLessons().map((l) => (l.id === data.lesson?.id ? { ...l, on: !l.on } : l));
      saveLessons(list);
      return pack(list);
    }
    if (data.action === "remove" && data.lesson?.id) {
      const list = loadLessons().filter((l) => l.id !== data.lesson?.id);
      saveLessons(list);
      logAdmin("Обучение: урок снят с карты");
      return pack(list);
    }
    return { ok: false as const, error: "Неизвестное действие." };
  });
