import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { priceRowFromCourse } from "./prices.ts";

describe("цены: школа и курс как в группах", () => {
  it("новый курс получает courseId школы из дерева", () => {
    const row = priceRowFromCourse(
      { id: "/dance", label: "Танцевальная школа" },
      { id: "/dance#1", label: "Бальные танцы · 5-6 лет", href: "", age: "5-6 лет" },
    );
    assert.equal(row.courseId, "/dance#1");
    assert.equal(row.direction, "Танцевальная школа");
    assert.equal(row.path, "/dance#1");
    assert.equal(row.all, 0);
  });
});
