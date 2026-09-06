import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyDurations, matchDuration, type GroupDuration, type PriceRow } from "./prices-core.ts";

function row(partial: Partial<PriceRow> & { path: string; name: string }): PriceRow {
  return {
    id: partial.id || partial.path,
    name: partial.name,
    age: partial.age || "",
    path: partial.path,
    courseId: partial.courseId || partial.path,
    schoolId: partial.schoolId || "",
    direction: partial.direction || "Школа",
    all: partial.all || 4650,
    kbm: partial.kbm || 3650,
    tmx: partial.tmx || 3900,
    mins: partial.mins,
    perWeek: partial.perWeek,
  };
}

describe("длительность в ценах курсов", () => {
  const items: GroupDuration[] = [
    { path: "/art-studio-5-6", course: "Студия 5-6", mins: 90, perWeek: 2, groups: 3 },
    { path: "/kinder-master", course: "Киндер-Мастер", mins: 60, perWeek: 1, groups: 1 },
  ];

  it("матчит по courseId, path и id", () => {
    assert.equal(matchDuration(row({ name: "А", path: "/other", courseId: "/art-studio-5-6" }), items)?.mins, 90);
    assert.equal(matchDuration(row({ name: "Б", path: "/kinder-master" }), items)?.perWeek, 1);
    assert.equal(matchDuration(row({ name: "В", path: "/x", id: "/art-studio-5-6", courseId: "/x" }), items)?.mins, 90);
    assert.equal(matchDuration(row({ name: "Г", path: "/nope" }), items), null);
  });

  it("заполняет пустые минуты и «в неделю», не затирает свои", () => {
    const rows = [
      row({ name: "А", path: "/art-studio-5-6" }),
      row({ name: "Б", path: "/kinder-master", mins: 45, perWeek: 3 }),
      row({ name: "В", path: "/nope" }),
    ];
    const empty = applyDurations(rows, items, true);
    assert.equal(empty.filled, 1);
    assert.equal(empty.rows[0].mins, 90);
    assert.equal(empty.rows[0].perWeek, 2);
    assert.equal(empty.rows[1].mins, 45);
    assert.equal(empty.rows[1].perWeek, 3);
    const force = applyDurations(rows, items, false);
    assert.equal(force.rows[1].mins, 60);
    assert.equal(force.rows[1].perWeek, 1);
  });

  it("кабинет не рвёт цены отдельным чанком site-tree", () => {
    const src = readFileSync(new URL("./admin.ts", import.meta.url), "utf8");
    assert.match(src, /from "\.\/site-tree"/);
    assert.doesNotMatch(src, /import\("\.\/site-tree"\)/);
    assert.match(src, /fillPriceDurations/);
  });
});
