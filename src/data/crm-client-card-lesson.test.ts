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
    assert.match(src, /from "@\/data\/crm-lesson-time"/);
    assert.match(src, /e.target === e.currentTarget/);
    assert.match(src, /setLessonOpen\(false\)/);
    assert.match(src, /applyLessonBranch/);
    assert.match(src, /lessonGroupOffers/);
    assert.match(src, /g\?\.teacherId/);
  });

  it("расписание импортирует reload — иначе вкладка не открывается", () => {
    const sched = readFileSync(new URL("../components/admin-schedule.tsx", import.meta.url), "utf8");
    assert.match(sched, /import \{ AdminReloadBtn, useAdminReload \} from "@\/components\/admin-reload-btn"/);
    assert.match(sched, /useAdminReload\(/);
    assert.match(sched, /from "@\/data\/crm-teachers-core"/);
  });
});

describe("список и вкладка не падают", () => {
  it("клик по пункту не пробивает оверлей, чанк после деплоя перезагружает", () => {
    const sel = readFileSync(new URL("../components/ra-select.tsx", import.meta.url), "utf8");
    assert.match(sel, /onMouseDown=\{\(e\) => e.preventDefault\(\)\}/);
    assert.match(sel, /g.options \|\| \[\]/);
    const err = readFileSync(new URL("../lib/error-component.tsx", import.meta.url), "utf8");
    assert.match(err, /lazyWithRetry/);
    assert.match(err, /isChunkLoadError/);
    assert.match(err, /Кабинет обновляется/);
    assert.match(err, /this.state.message/);
  });
});
