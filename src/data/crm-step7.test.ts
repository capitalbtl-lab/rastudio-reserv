import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { step7ArchiveDay, step7FioOk, step7HadGroups, step7HeaderQuery, step7InYears, step7Keep, step7KeepAny, step7KeepFailedBranch, step7ListStudy, step7RejectId, step7Shows } from "./crm-step7-core.ts";

describe("шаг 7", () => {
  const live = new Set([10]);

  it("архивный клиент вне живой группы остаётся", () => {
    assert.equal(step7Keep({ id: 7, is_study: 1, removed: 2 }, live), true);
  });

  it("кто уже в действующей группе — не входит", () => {
    assert.equal(step7Keep({ id: 10, is_study: 1, removed: 2 }, live), false);
  });

  it("архивный лид — это шаг 6, не шаг 7", () => {
    assert.equal(step7Keep({ id: 8, is_study: 0, removed: 2 }, live), false);
  });

  it("активный и удалённый в строке не входят", () => {
    assert.equal(step7Keep({ id: 9, is_study: 1, removed: 0 }, live), false);
    assert.equal(step7Keep({ id: 11, is_study: 1, removed: 1 }, live), false);
  });

  it("пустое removed в строке не выкидывает: фильтр уже removed 2", () => {
    assert.equal(step7Keep({ id: 12, is_study: 1 }, live), true);
    assert.equal(step7Keep({ id: 13, is_study: "1", removed: "" }, live), true);
  });

  it("причина архива — customer_reject_id, пустое не причина", () => {
    assert.equal(step7RejectId({ customer_reject_id: 6 }), 6);
    assert.equal(step7RejectId({ customer_reject_id: "6" }), 6);
    assert.equal(step7RejectId({}), 0);
    assert.equal(step7RejectId({ customer_reject_id: 0 }), 0);
    assert.equal(step7RejectId({ customer_reject_id: "" }), 0);
    assert.equal(step7RejectId({ customer_reject_id: null }), 0);
    assert.equal(step7RejectId({ lead_reject_id: 9 }, 0), 9);
    assert.equal(step7RejectId({ customer_reject_id: 6, lead_reject_id: 9 }, 0), 9);
  });

  it("шапка архивного лида — is_study 0, клиента — 1, оба только архив", () => {
    assert.deepEqual(step7HeaderQuery(3, 0), { id: 3, is_study: 0, removed: 2, page: 0, pageSize: 1 });
    assert.deepEqual(step7HeaderQuery(7, 1), { id: 7, is_study: 1, removed: 2, page: 0, pageSize: 1 });
    assert.equal(step7HeaderQuery(8).is_study, 2);
    assert.equal(step7HeaderQuery(8, 2).is_study, 2);
    assert.equal(step7ListStudy({ is_study: false }, 1), 0);
    assert.equal(step7ListStudy({}, 0), 0);
    assert.equal(step7ListStudy({ is_study: 2 }, 0), 0);
    assert.equal(step7KeepAny({ id: 14, is_study: step7ListStudy({}, 0), removed: 2 }, live), true);
  });

  it("архивный лид входит, активный лид нет", () => {
    assert.equal(step7KeepAny({ id: 3, is_study: 0, removed: 2 }, live), true);
    assert.equal(step7KeepAny({ id: 4, is_study: 0, removed: 0 }, live), false);
    assert.equal(step7KeepAny({ id: 10, is_study: 0, removed: 2 }, live), false);
  });

  it("оборвавшийся филиал остаётся, успешный заменяется", () => {
    const prev = [
      { id: 1, branchId: 2 },
      { id: 2, branchId: 1 },
    ];
    const next = [{ id: 3, branchId: 1 }];
    const kept = step7KeepFailedBranch(next, prev, [2]);
    assert.deepEqual(kept.map((x) => x.id).sort(), [1, 3]);
    assert.deepEqual(step7KeepFailedBranch(next, prev, []), next);
  });

  it("фио, группы и дата архива", () => {
    assert.equal(step7FioOk("Иванов Иван"), true);
    assert.equal(step7FioOk("Тестова Мария"), true);
    assert.equal(step7FioOk("тест"), false);
    assert.equal(step7FioOk("+79991234567"), false);
    assert.equal(step7HadGroups({ group_ids: [12] }), true);
    assert.equal(step7HadGroups({ group_ids: { 0: 12 } }), true);
    assert.equal(step7HadGroups({ groups: [{ group_id: 4 }] }), true);
    assert.equal(step7HadGroups({ group_ids: "[]" }), false);
    assert.equal(step7HadGroups({}), false);
    assert.equal(step7ArchiveDay({ e_date: "18.09.2026" }), "2026-09-18");
    assert.equal(step7ArchiveDay({ e_date: "31.12.2030" }), "");
    assert.equal(step7InYears("", 1, new Date("2026-09-26")), false);
    assert.equal(step7InYears("", 2015, new Date("2026-09-26")), false);
    assert.equal(step7InYears("2014-12-31", 2015, new Date("2026-09-26")), false);
    assert.equal(step7InYears("2026-08-01", 1, new Date("2026-09-26")), true);
    assert.equal(step7InYears("2025-09-26", 1, new Date("2026-09-26")), true);
    assert.equal(step7InYears("2025-09-25", 1, new Date("2026-09-26")), false);
    assert.equal(step7InYears("2024-02-29", 1, new Date("2025-02-28")), true);
    assert.equal(step7InYears("2020-01-01", 2015, new Date("2026-09-26")), true);
    const now = new Date("2026-09-26");
    const both = { clients: true, leads: true, dobYes: false, dobNo: false, fio: false, groupsYes: false, groupsNo: false, years: 0 as const };
    assert.equal(step7Shows({ study: 0, name: "Лид", dob: "01.01.2015" }, both, now), true);
    assert.equal(step7Shows({ study: 0, name: "Лид" }, { ...both, leads: false }, now), false);
    assert.equal(step7Shows({ name: "Без роли" }, { ...both, clients: false }, now), false);
    assert.equal(step7Shows({ name: "Без роли" }, { ...both, leads: false }, now), false);
    assert.equal(step7Shows({ name: "Без роли" }, both, now), true);
    assert.equal(step7Shows({ study: 1, name: "тест", dob: "01.01.2015" }, { ...both, fio: true }, now), false);
    assert.equal(step7Shows({ study: 1, name: "Иванов", hadGroups: false }, { ...both, groupsYes: true }, now), false);
    assert.equal(step7Shows({ study: 1, name: "Иванов", hadGroups: false }, { ...both, groupsNo: true }, now), true);
    assert.equal(step7Shows({ study: 1, name: "Иванов", dob: "0000-00-00" }, { ...both, dobYes: true }, now), false);
    assert.equal(step7Shows({ study: 1, name: "Иванов", dob: "0000-00-00" }, { ...both, dobNo: true }, now), true);
    assert.equal(step7Shows({ study: 1, name: "Иванов", dob: "01.01.2015" }, { ...both, dobYes: true }, now), true);
    assert.equal(step7Shows({ study: 1, name: "Иванов", archivedAt: "" }, { ...both, years: 2015 }, now), false);
    assert.equal(step7Shows({ study: 1, name: "Иванов", archivedAt: "2020-01-01" }, { ...both, years: 2015 }, now), true);
  });
});
