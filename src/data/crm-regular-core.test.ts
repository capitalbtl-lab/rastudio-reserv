import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { packCustomerRegular, parseDossierRegular } from "./crm-regular-core.ts";

describe("постоянное расписание ученика", () => {
  it("пакует вс/ср/пт Чудновой и не берёт выключенные", () => {
    const sun = packCustomerRegular(
      { id: 1176, related_id: 80, day: 7, time_from_v: "11:10", time_to_v: "13:40", teacher_ids: [1], subject_id: 92 },
      { groupName: "2026 Художественная школа (10-14 лет)", teacher: "Самсонова", subject: "Художественная школа (10-14 лет)", branchId: 1 },
    );
    const off = packCustomerRegular({ id: 1, related_id: 80, day: 5, time_from_v: "18:10", disabled: 1 }, {});
    assert.equal(sun?.dayLabel, "Вс");
    assert.equal(sun?.from, "11:10");
    assert.equal(sun?.to, "13:40");
    assert.equal(off, null);
  });

  it("читает extras.regular", () => {
    const rows = parseDossierRegular({
      regular: JSON.stringify([{ id: 1603, groupId: 80, day: 3, dayLabel: "Ср", from: "15:30", to: "18:00", teacher: "Аверина", groupName: "худ" }]),
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].from, "15:30");
  });
});
