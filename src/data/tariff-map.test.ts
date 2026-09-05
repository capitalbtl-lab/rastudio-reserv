import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { guessTariffLinks } from "./tariff-map.ts";

describe("карта абонемент → курс сайта", () => {
  it("сохранённая привязка важнее догадки по предмету", () => {
    const tariffs = [
      { id: 10, subjectIds: [1], archive: false },
      { id: 11, subjectIds: [1], archive: false },
    ];
    const saved = [{ tariffId: 10, schoolId: "/art-studio", courseId: "/art-studio-7-8" }];
    const out = guessTariffLinks(tariffs, saved);
    const a = out.find((x) => x.tariffId === 10);
    assert.equal(a?.courseId, "/art-studio-7-8");
    assert.equal(a?.schoolId, "/art-studio");
    const b = out.find((x) => x.tariffId === 11);
    assert.equal(b?.courseId || "", "");
  });

  it("архив и отрицательные id не берёт", () => {
    const out = guessTariffLinks(
      [
        { id: -1, subjectIds: [1] },
        { id: 5, subjectIds: [1], archive: true },
      ],
      [],
    );
    assert.equal(out.length, 0);
  });

  it("черновик абонемента держит привязку курса по id, не по имени", () => {
    const saved = [{ tariffId: -42, schoolId: "/art-studio", courseId: "/art-studio-9-13" }];
    const out = guessTariffLinks([{ id: 10, subjectIds: [1] }], saved);
    const draft = out.find((x) => x.tariffId === -42);
    assert.equal(draft?.courseId, "/art-studio-9-13");
    assert.equal(out.find((x) => x.tariffId === 10)?.courseId || "", "");
  });

  it("два курса с одним названием остаются разными id", () => {
    const out = guessTariffLinks(
      [{ id: 10, subjectIds: [12], archive: false }],
      [
        { tariffId: 10, schoolId: "/art-studio", courseId: "/art-studio-3-4" },
        { tariffId: 10, schoolId: "/art-studio", courseId: "/art-studio-5-6" },
      ],
    );
    const ids = out.filter((x) => x.tariffId === 10).map((x) => x.courseId).sort();
    assert.deepEqual(ids, ["/art-studio-3-4", "/art-studio-5-6"]);
    assert.equal(ids.length, 2);
  });
});
