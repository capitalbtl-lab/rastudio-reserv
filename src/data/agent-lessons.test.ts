import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  guessKind,
  isLessonSpeech,
  lessonGraph,
  lessonsPromptText,
  parseLessonSpeech,
} from "./agent-lessons-core.ts";

describe("карта обучения консультанта", () => {
  it("голос «неправильно» — урок, цена — нет", () => {
    assert.equal(isLessonSpeech("Заголовок: студия"), false);
    assert.equal(isLessonSpeech("Ты неправильно ответила на отработку. Надо сначала спросить неделю."), true);
    const p = parseLessonSpeech(
      "Ты неправильно ответила на отработку. Надо сначала спросить неделю, потом три слота своего педагога.",
    );
    assert.ok(p);
    assert.equal(p?.intent, "отработка");
    assert.equal(p?.kind, "flow");
    assert.match(p?.right || "", /неделю/);
    assert.equal(guessKind("не предлагай пробное вместо отработки, book_lesson makeup"), "crm");
    assert.equal(guessKind("курс только по courseId, не по имени"), "id");
    assert.equal(guessKind("говори коротко: остаток абонемента с диска"), "crm");
  });

  it("граф: намерение → урок → действие CRM", () => {
    const g = lessonGraph([
      {
        id: "1",
        at: "",
        kind: "flow",
        intent: "отработка",
        wrong: "сразу день",
        right: "сначала неделя, потом три слота",
        action: "book_lesson",
        entity: "teacherId",
        on: true,
        source: "test",
      },
      {
        id: "2",
        at: "",
        kind: "reply",
        intent: "набор",
        wrong: "",
        right: "предложи курс",
        action: "",
        entity: "",
        on: false,
        source: "test",
      },
    ]);
    assert.ok(g.nodes.some((n) => n.id === "intent:отработка"));
    assert.ok(g.nodes.some((n) => n.type === "lesson" && n.kind === "flow"));
    assert.ok(g.nodes.some((n) => n.id === "action:book_lesson"));
    assert.ok(g.nodes.some((n) => n.id === "entity:teacherId"));
    assert.equal(g.nodes.some((n) => n.id === "lesson:2"), false);
    const prompt = lessonsPromptText(
      [
        {
          id: "1",
          at: "",
          kind: "crm",
          intent: "отработка",
          wrong: "пробное",
          right: "не ставь пробное вместо отработки",
          action: "book_lesson",
          entity: "",
          on: true,
          source: "t",
        },
      ],
      8,
    );
    assert.match(prompt, /КАРТА ОБУЧЕНИЯ/);
    assert.match(prompt, /Действие в CRM/);
  });

  it("админка: вкладка карты, голос remember_lesson", () => {
    const train = readFileSync(new URL("../components/admin-train.tsx", import.meta.url), "utf8");
    assert.match(train, /Карта обучения/);
    assert.match(train, /AdminLessonMap/);
    const chat = readFileSync(new URL("./agent-chat.ts", import.meta.url), "utf8");
    assert.match(chat, /remember_lesson/);
    assert.match(chat, /parseLessonSpeech/);
    const cfg = readFileSync(new URL("./agent-config.ts", import.meta.url), "utf8");
    assert.match(cfg, /lessonsPrompt/);
    const panes = readFileSync(new URL("./agent-panes.ts", import.meta.url), "utf8");
    assert.match(panes, /Карта обучения/);
  });
});
