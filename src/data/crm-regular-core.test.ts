import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { packCustomerRegular, parseDossierRegular, pickCustomerRegularItems } from "./crm-regular-core.ts";

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

  it("берёт копии ученика, не слот группы 18:10", () => {
    const cid = 670;
    const picked = pickCustomerRegularItems(
      [
        { id: 9, related_id: 80, day: 5, time_from_v: "18:10", time_to_v: "20:40", customer_ids: [670, 1, 2, 3, 4] },
        { id: 1176, related_id: 80, day: 7, time_from_v: "11:10", time_to_v: "13:40", customer_ids: [670] },
        { id: 1603, related_id: 80, day: 3, time_from_v: "15:30", time_to_v: "18:00", customer_ids: [670] },
        { id: 1604, related_id: 80, day: 5, time_from_v: "15:30", time_to_v: "18:00", customer_ids: [670] },
      ],
      cid,
    );
    const froms = picked.map((x) => String(x.time_from_v)).sort();
    assert.deepEqual(froms, ["11:10", "15:30", "15:30"]);
    assert.equal(picked.some((x) => String(x.time_from_v) === "18:10"), false);
  });

  it("если customer_id вернул слот без состава — related_id с копиями его вытесняет", () => {
    const picked = pickCustomerRegularItems(
      [
        { id: 9, related_id: 80, day: 5, time_from_v: "18:10", time_to_v: "20:40" },
        { id: 10, related_id: 80, day: 7, time_from_v: "11:10", time_to_v: "13:40" },
        { id: 1176, related_id: 80, day: 7, time_from_v: "11:10", time_to_v: "13:40", customer_ids: [670] },
        { id: 1603, related_id: 80, day: 3, time_from_v: "15:30", time_to_v: "18:00", customer_ids: [670] },
        { id: 1604, related_id: 80, day: 5, time_from_v: "15:30", time_to_v: "18:00", customer_ids: [670] },
      ],
      670,
    );
    assert.equal(picked.some((x) => String(x.time_from_v) === "18:10"), false);
    assert.equal(picked.length, 3);
  });
});
