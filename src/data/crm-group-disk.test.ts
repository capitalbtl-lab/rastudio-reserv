import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupLinkHits, takenMapFromLinks, takenOfGroup, overlayCgiNeeded, mergeCgiGroupLinks } from "./crm-group-disk.ts";

describe("состав группы с диска", () => {
  it("берёт по ID группы и филиала, пустой филиал в связи не мешает", () => {
    const links = [
      { id: 585, branchId: 2 },
      { id: 580, branchId: 1 },
    ];
    assert.equal(groupLinkHits(links, 2, 585), true);
    assert.equal(groupLinkHits(links, 1, 585), false);
    assert.equal(groupLinkHits([{ id: 585, branchId: 0 }], 2, 585), true);
    assert.equal(groupLinkHits([], 2, 585), false);
    assert.equal(groupLinkHits(links, 2, 0), false);
  });

  it("счётчик taken по groupLinks, не по имени", () => {
    const map = takenMapFromLinks([
      { groupLinks: [{ id: 585, branchId: 2, active: true }, { id: 580, branchId: 1 }] },
      { groupLinks: [{ id: 585, branchId: 2 }] },
      { groupLinks: [{ id: 585, branchId: 2, active: false }] },
      { groupLinks: [{ id: 999, branchId: 1 }] },
    ]);
    assert.equal(takenOfGroup(map, 2, 585), 2);
    assert.equal(takenOfGroup(map, 1, 580), 1);
    assert.equal(takenOfGroup(map, 2, 999, 7), 7);
  });

  it("cgi не зовём, если на диске уже есть состав или группа пустая", () => {
    assert.equal(overlayCgiNeeded(8, 8), false);
    assert.equal(overlayCgiNeeded(1, 12), false);
    assert.equal(overlayCgiNeeded(0, 0), false);
    assert.equal(overlayCgiNeeded(0, 12), true);
  });

  it("полный cgi гасит лишние группы, пустой cgi диск не трогает", () => {
    const prev = [
      { id: 580, branchId: 1, name: "Роботы", active: true },
      { id: 999, branchId: 1, name: "лишняя", active: true },
    ];
    const next = mergeCgiGroupLinks(prev, [{ id: 580, branchId: 1, name: "Роботы 7-9" }]);
    assert.equal(next.length, 2);
    assert.equal(next.find((g) => g.id === 580)?.active, true);
    assert.equal(next.find((g) => g.id === 580)?.name, "Роботы 7-9");
    assert.equal(next.find((g) => g.id === 999)?.active, false);
    const empty = mergeCgiGroupLinks(prev, []);
    assert.equal(empty.find((g) => g.id === 999)?.active, true);
    assert.equal(empty.length, 2);
  });
});
