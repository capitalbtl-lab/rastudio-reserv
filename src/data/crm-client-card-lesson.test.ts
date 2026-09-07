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
    assert.match(src, /type="time"/);
    assert.match(src, /step=\{60\}/);
    assert.match(src, /timeTo: addMinsHm/);
    assert.match(src, /from "@\/data\/crm-lesson-time"/);
    assert.match(src, /e.target === e.currentTarget/);
    assert.match(src, /setLessonOpen\(false\)/);
    assert.match(src, /applyLessonBranch/);
    assert.match(src, /lessonGroupOffers/);
    assert.match(src, /g\?\.teacherId/);
    assert.match(src, /const lessonRoomCount = lessonRooms.filter/);
    assert.match(src, /card.crmPush/);
    assert.match(src, /data-op="archived-tariffs"/);
    assert.match(src, /data-op="lesson-writeoffs"/);
    assert.match(src, /cttSelectLabel/);
    assert.match(src, /Базовый счет/);
    assert.match(src, /label: "Архивные"/);
    assert.match(src, /date < today/);
    assert.match(src, /l\.amount/);
    assert.match(src, /Отмен:/);
    assert.match(src, /regularBelongsToGroups/);
    assert.match(src, /lessonsForCard\(card.calendar, card.regular, card.groups\)/);
    assert.doesNotMatch(src, /group=\{\(card.groups \|\| \[\]\)\[0\]\?\.name\}/);
    const strip = readFileSync(new URL("../components/lesson-strip.tsx", import.meta.url), "utf8");
    assert.match(strip, /isOneOffLesson/);
    assert.match(strip, /bg-amber-100/);
    assert.match(strip, /all.filter\(isOneOffLesson\)/);
  });

  it("расписание импортирует reload — иначе вкладка не открывается", () => {
    const sched = readFileSync(new URL("../components/admin-schedule.tsx", import.meta.url), "utf8");
    assert.match(sched, /import \{ AdminReloadBtn, useAdminReload \} from "@\/components\/admin-reload-btn"/);
    assert.match(sched, /useAdminReload\(/);
    assert.match(sched, /from "@\/data\/crm-teachers-core"/);
    const disk = readFileSync(new URL("./customer-card-disk.ts", import.meta.url), "utf8");
    const api = readFileSync(new URL("./admin-schedule.ts", import.meta.url), "utf8");
    assert.match(disk, /parseDossierRegular/);
    assert.match(api, /pullCustomerRegular/);
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
