import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  step5CanSverka,
  step5Role,
  step5SkipNote,
  step5StudyNum,
  step5RemovedNum,
  step5AuditGapMs,
  sameCustomerId,
  parseAlfaHeaderCanon,
  paidLessonCountOf,
  step5HasH,
  step5Newer,
  step5Reasons,
  step5RemainderFormula,
  step5FitRemainder,
  step5ApplyDebts,
  step5PickWriteoff,
  step5Close,
  step5UnitScale,
  step5ReviveEmptySkip,
  step6DiskAgrees,
  step5ApiRole,
} from "./crm-step5-canon.ts";

describe("шаг 5 канон", () => {
  it("роль с customer/index: 0 лид, 1 клиент, removed 2 архив, 2 и removed 1 не роль", () => {
    assert.equal(step5ApiRole(0, 0), "лид");
    assert.equal(step5ApiRole(false, 0), "лид");
    assert.equal(step5ApiRole("0", 0), "лид");
    assert.equal(step5ApiRole(1, 0), "клиент");
    assert.equal(step5ApiRole(true, 0), "клиент");
    assert.equal(step5ApiRole(0, 2), "архив");
    assert.equal(step5ApiRole(1, 2, true), "архив");
    assert.equal(step5ApiRole(2, 0), "не разобрали");
    assert.equal(step5ApiRole(0, 1), "лид");
  });

  it("id как число", () => {
    assert.equal(sameCustomerId("12", 12), true);
    assert.equal(sameCustomerId(12, 13), false);
  });

  it("шапка 0 не закрывает карточку, если в Alfa платежей больше, чем на диске", () => {
    assert.equal(step6DiskAgrees({ cashDiskKnown: true, cashPayHole: 0, cashPayExtra: 2, cashLesHole: 0, cashLesExtra: 4, cashPayN: 17, cashLesN: 83 }), false);
    assert.equal(step6DiskAgrees({ cashDiskKnown: true, cashPayHole: 0, cashPayExtra: 0, cashLesHole: 0, cashLesExtra: 0, cashPayN: 17, cashLesN: 83 }), true);
    assert.equal(step6DiskAgrees({ cashDiskKnown: false, cashPayHole: 0, cashPayExtra: 0, cashLesHole: 0, cashLesExtra: 0, cashPayN: 17, cashLesN: 0 }), false);
    assert.equal(step6DiskAgrees({ cashDiskKnown: false, cashPayHole: 0, cashPayExtra: 0, cashLesHole: 0, cashLesExtra: 0, cashPayN: 0, cashLesN: 0 }), true);
  });

  it("роль по removed=2 и старому диску is_study=2", () => {
    assert.equal(step5Role(1, 0), "клиент");
    assert.equal(step5Role(0, 0), "лид");
    assert.equal(step5Role(1, 2), "архив");
    assert.equal(step5Role(0, 2), "архив");
    assert.equal(step5Role(2, 0), "архив");
    assert.equal(step5Role(1, 1), "не разобрали");
    assert.equal(step5Role("1", "0"), "клиент");
    assert.equal(Number.isNaN(step5StudyNum("")), true);
    assert.equal(Number.isNaN(step5StudyNum("  ")), true);
    assert.equal(step5StudyNum("0"), 0);
    assert.equal(step5StudyNum(1), 1);
    assert.equal(step5Role(step5StudyNum(""), step5StudyNum("")), "не разобрали");
    assert.equal(step5CanSverka({
      hasDossier: true,
      payFilled: true,
      livePays: 4,
      isStudy: step5StudyNum(""),
      removed: step5StudyNum(""),
      inArchiveSet: false,
    }), false);
    assert.equal(step5RemovedNum(""), 0);
    assert.equal(step5RemovedNum(undefined), 0);
    assert.equal(step5RemovedNum("2"), 2);
    assert.equal(step5CanSverka({
      hasDossier: true,
      payFilled: true,
      livePays: 1,
      isStudy: 1,
      removed: "",
      inArchiveSet: false,
    }), true);
    assert.equal(step5CanSverka({
      hasDossier: true,
      payFilled: true,
      livePays: 3,
      isStudy: 0,
      removed: "",
      inArchiveSet: false,
    }), true);
    assert.equal(step5SkipNote({ livePays: 3, isStudy: 1, removed: "", inArchiveSet: false, payFilled: true }), "");
  });

  it("старый диск is_study=2 сверяем только в наборе шага 2", () => {
    const p = { hasDossier: true, payFilled: true, livePays: 3, isStudy: 2, removed: 0, inArchiveSet: false };
    assert.equal(step5CanSverka(p), false);
    assert.equal(step5SkipNote(p), "не в наборе шага 2, не сверяем");
    assert.equal(step5CanSverka({ ...p, inArchiveSet: true }), true);
  });

  it("лид с А и пустой лентой — сверка 0=0=0, без А шапку не зовём", () => {
    const base = { hasDossier: true, payFilled: true, isStudy: 0, removed: 0, inArchiveSet: false };
    assert.equal(step5CanSverka({ ...base, livePays: 0 }), true);
    assert.equal(step5CanSverka({ ...base, livePays: 2 }), true);
    assert.equal(step5CanSverka({ ...base, livePays: 2, removed: 2 }), false);
    assert.equal(step5CanSverka({ ...base, livePays: 2, removed: 2, inArchiveSet: true }), true);
    assert.equal(step5SkipNote({ livePays: 2, isStudy: 0, removed: 2, inArchiveSet: false }), "не в наборе шага 2, не сверяем");
    assert.equal(step5SkipNote({ livePays: 0, isStudy: 0, removed: 0, inArchiveSet: false, payFilled: true }), "");
    assert.equal(step5SkipNote({ livePays: 0, isStudy: 0, removed: 0, inArchiveSet: false, payFilled: false }), "кассы нет / нет А");
    assert.equal(step5CanSverka({ ...base, livePays: 0, payFilled: false }), false);
  });

  it("старый чип «кассы нет, не сверяем» при нулях — совпало", () => {
    assert.equal(step5ReviveEmptySkip({ codes: ["нет сверки"], extra: "кассы нет, не сверяем", clients: 0, cash: 0 }), true);
    assert.equal(step5ReviveEmptySkip({ codes: ["нет сверки"], extra: "кассы нет / нет А", clients: 0, cash: 0 }), false);
    assert.equal(step5ReviveEmptySkip({ codes: ["нет сверки"], extra: "кассы нет, не сверяем", clients: 2000, cash: 2000 }), false);
  });

  it("клиент архива вне набора шага 2 не сверка", () => {
    const p = { hasDossier: true, payFilled: true, livePays: 3, isStudy: 1, removed: 2, inArchiveSet: false };
    assert.equal(step5CanSverka(p), false);
    assert.equal(step5SkipNote(p), "не в наборе шага 2, не сверяем");
    assert.equal(step5CanSverka({ ...p, inArchiveSet: true }), true);
  });

  it("нет роли на досье — шапку не зовём", () => {
    assert.equal(step5Role("", ""), "не разобрали");
    assert.equal(step5CanSverka({ hasDossier: true, payFilled: true, livePays: 3, isStudy: "", removed: "", inArchiveSet: false }), false);
    assert.equal(step5SkipNote({ livePays: 3, isStudy: "", removed: "", inArchiveSet: false }), "нет роли на досье, шапку не зовём");
  });

  it("нет А — шапку не зовём, даже если строки кассы уже есть", () => {
    const client = { hasDossier: true, payFilled: false, livePays: 6, isStudy: 1, removed: 0, inArchiveSet: false };
    assert.equal(step5CanSverka(client), false);
    assert.equal(step5SkipNote({ ...client, payFilled: false }), "кассы нет / нет А");
    const lead = { hasDossier: true, payFilled: false, livePays: 6, isStudy: 0, removed: 0, inArchiveSet: false };
    assert.equal(step5CanSverka(lead), false);
    assert.equal(step5SkipNote({ ...lead, payFilled: false }), "кассы нет / нет А");
    assert.equal(step5CanSverka({ ...client, payFilled: true }), true);
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

  it("формула остатка минус товар", () => {
    assert.equal(step5RemainderFormula(148779, 146354), 2425);
    assert.equal(step5RemainderFormula(129487.5, 127487.5, 2000), 0);
    assert.equal(step5RemainderFormula(148779, 146354, 2500), -75);
    assert.equal(step5FitRemainder(205375 + 157325, 157325, [2500], 205375).n, 205375);
    assert.equal(step5FitRemainder(205375 + 157325, 157325, [2500], 205375).goods, 0);
    assert.equal(step5FitRemainder(2787.5, 0, [2000], 787.5).n, 787.5);
    assert.equal(step5FitRemainder(2787.5, 0, [2000], 787.5).goods, 2000);
    assert.equal(step5FitRemainder(1700, 0, [2000], 787.5).goods, 0);
    assert.equal(step5FitRemainder(33660, 0, [1950, 31400, 650], 2260).n, 2260);
    assert.equal(step5FitRemainder(3087.5, 0, [2000, 1950], 1087.5).n, 1087.5);
    assert.equal(step5FitRemainder(40000, 0, [31400, 3900, 3900], 4700).n, 4700);
    assert.equal(step5FitRemainder(5637.5, 0, [2150, 2000, 1800, 1800], 3637.5).n, 3637.5);
    assert.equal(step5FitRemainder(5637.5, 0, [2150, 2000, 1800, 1800], 3637.5).goods, 2000);
    assert.equal(step5RemainderFormula(121150, 115987.5, 2000), 3162.5);
    assert.equal(step5FitRemainder(121150, 115987.5, [2000], 3162.5).n, 3162.5);
    assert.deepEqual(
      step5ApplyDebts({ n: 114900, k: 135 }, [1087.5], 121150, [2000], 3162.5),
      { n: 115987.5, k: 136 },
    );
    assert.deepEqual(
      step5ApplyDebts({ n: 93928.75, k: 119 }, [1087.5], 93850, 0, 138.75),
      { n: 93928.75, k: 119 },
    );
    assert.equal(
      step5PickWriteoff({ n: 115887.5, k: 136 }, { ok: true, n: 115987.5, k: 136 }, 121150, [2000], 3162.5).n,
      115987.5,
    );
    assert.equal(
      step5PickWriteoff({ n: 93928.75, k: 119 }, { ok: true, n: 93711.25, k: 119 }, 93850, 0, 138.75).n,
      93711.25,
    );
    assert.equal(step5Close(2425, 2425), true);
    assert.equal(step5Close(2425, 24.25), true);
    assert.equal(step5Close(24.25, 2425), true);
    assert.equal(step5Close(100, 50), false);
    assert.equal(step5Close(10000, 100), false);
    assert.equal(step5UnitScale(2425, 24.25), 100);
    assert.equal(step5UnitScale(2425, 2425), 1);
    const scaled = step5Reasons({
      sverka: true,
      hasH: true,
      pending: false,
      formulaSite: 2425,
      header: 24.25,
      cashLessons: 184230,
      cashAll: 186730,
      headerAt: "2026-09-01",
      cashDate: "2026-09-01",
    });
    assert.equal(scaled.c, true);
  });

  it("товар в ленте не ломает C, если формула без товара = шапка", () => {
    const r = step5Reasons({
      sverka: true,
      hasH: true,
      pending: false,
      formulaSite: 2425,
      header: 2425,
      cashLessons: 2425,
      cashAll: 4925,
      headerAt: "2026-09-01",
      cashDate: "2026-09-01",
    });
    assert.equal(r.c, true);
    assert.equal(r.main, "");
    assert.deepEqual(r.tail, ["product"]);
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
