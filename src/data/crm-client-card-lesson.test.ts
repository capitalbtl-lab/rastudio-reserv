import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

describe("форма занятия карточки", () => {
  it("филиал и аудитория обязательны, группы — после филиала", () => {
    const src = readFileSync(new URL("../components/crm-client-card.tsx", import.meta.url), "utf8");
    assert.match(src, /placeholder="выбрать филиал"/);
    assert.match(src, /placeholder="выбрать аудиторию"/);
    assert.match(src, /Field label="Филиал" required/);
    assert.match(src, /Field label="Аудитория" required/);
    assert.match(src, /disabled=\{!lessonBranch\}/);
    assert.match(src, /branchId: lessonBranch/);
    assert.match(src, /roomId: lessonRoom/);
    assert.match(src, /!lessonBranch \|\| !lessonRoom/);
    assert.match(src, /setLessonBranch\(0\)/);
    assert.match(src, /setLessonRoom\(0\)/);
    assert.match(src, /placeholder="час"/);
    assert.match(src, /placeholder="мин"/);
    assert.match(src, /HOUR_OPTS/);
    assert.match(src, /timeTo: addMinsHm/);
  });
});
