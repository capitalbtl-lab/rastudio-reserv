import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { behaviorPrompt } from "./page-behavior.ts";
import { extractJson } from "./deepseek-text.ts";

describe("поведение и json модели", () => {
  it("промпт не пустой и не читает отчёт вслух", () => {
    const t = behaviorPrompt({ path: "/robototehnika-v-kolomne", dwell: 40, trail: ["/", "/robototehnika-v-kolomne"], courses: ["/robototehnika-v-kolomne"] });
    assert.match(t, /робототехник/i);
    assert.match(t, /не читай вслух/);
    assert.match(t, /пробное/);
  });

  it("вынимает json из markdown", () => {
    const hit = extractJson<{ title: string }>("конечно\n```json\n{\"title\":\"Лето\"}\n```");
    assert.equal(hit.title, "Лето");
  });
});
