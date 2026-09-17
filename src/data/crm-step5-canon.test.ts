import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  step5CanSverka,
  step5Role,
  step5SkipNote,
  step5AuditGapMs,
  sameCustomerId,
  parseAlfaHeaderCanon,
  paidLessonCountOf,
  step5HasH,
  step5Newer,
  step5Reasons,
} from "./crm-step5-canon.ts";

describe("шаг 5 канон", () => {
  it("id как число", () => {
    assert.equal(sameCustomerId("12", 12), true);
    assert.equal(sameCustomerId(12, 13), false);
  });

  it("роль по is_study и removed, не is_study=2", () => {
    assert.equal(step5Role(1, 0), "клиент");
    assert.equal(step5Role(0, 0), "лид");
    assert.equal(step5Role(1, 2), "архив");
    assert.equal(step5Role(0, 2), "архив");
    assert.equal(step5Role(2, 0), "не разобрали");
    assert.equal(step5Role(1, 1), "не разобрали");
    assert.equal(step5Role("1", "0"), "клиент");
  });

  it("лид без кассы не сверка, лид с кассой сверка, лид архива с кассой сверка", () => {
    const base = { hasDossier: true, payFilled: true, isStudy: 0, removed: 0, inArchiveSet: false };
    assert.equal(step5CanSverka({ ...base, livePays: 0 }), false);
    assert.equal(step5CanSverka({ ...base, livePays: 2 }), true);
    assert.equal(step5CanSverka({ ...base, livePays: 2, removed: 2 }), true);
    assert.equal(step5SkipNote({ livePays: 0, isStudy: 0, removed: 0, inArchiveSet: false }), "кассы нет, не сверяем");
  });

  it("клиент архива вне набора шага 2 не сверка", () => {
    const p = { hasDossier: true, payFilled: true, livePays: 3, isStudy: 1, removed: 2, inArchiveSet: false };
    assert.equal(step5CanSverka(p), false);
    assert.equal(step5SkipNote(p), "не в наборе шага 2, не сверяем");
    assert.equal(step5CanSverka({ ...p, inArchiveSet: true }), true);
  });

  it("пауза красной 5 с, синяя справа по окну", () => {
    assert.equal(step5AuditGapMs({ recheck: false }), 5000);
    assert.equal(step5AuditGapMs({ recheck: true, staleHeader: false }), 5000);
    assert.equal(step5AuditGapMs({ recheck: true, staleHeader: true, periodDays: 10 }), 2000);
    assert.equal(step5AuditGapMs({ recheck: true, staleHeader: true, periodDays: 32 }), 2500);
  });

  it("шапка balance float или строка числа, headerC = paid_lesson_count", () => {
    assert.equal(parseAlfaHeaderCanon({ balance: 2025 }).ok, true);
    assert.equal(parseAlfaHeaderCanon({ balance: "-987.5" }).header, -987.5);
    assert.equal(parseAlfaHeaderCanon({}).ok, false);
    assert.equal(paidLessonCountOf({ paid_lesson_count: 12 }), 12);
    assert.equal(paidLessonCountOf({ lesson_count: 12 }), null);
    assert.equal(step5HasH(100, "2026-09-17"), true);
    assert.equal(step5HasH(100, ""), false);
    assert.equal(step5Newer("2026-09-18", "2026-09-17"), true);
  });

  it("C и причина header-stale", () => {
    const ok = step5Reasons({
      sverka: true,
      hasH: true,
      pending: false,
      formulaSite: 100,
      header: 100,
      cashLessons: 100,
      cashAll: 100,
      headerAt: "2026-09-01",
      cashDate: "2026-09-01",
    });
    assert.equal(ok.c, true);
    assert.equal(ok.main, "");
    const stale = step5Reasons({
      sverka: true,
      hasH: true,
      pending: false,
      formulaSite: 100,
      header: 100,
      cashLessons: 100,
      cashAll: 100,
      headerAt: "2026-09-01",
      cashDate: "2026-09-10",
    });
    assert.equal(stale.c, true);
    assert.equal(stale.main, "header-stale");
  });
});
