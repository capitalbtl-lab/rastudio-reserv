import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { packCustomerRegular, parseDossierRegular, pickCustomerRegularItems, regularBelongsToGroups } from "./crm-regular-core.ts";

describe("постоянное расписание ученика", () => {
  it("пакует вс/ср/пт Чудновой и не берёт выключенные", () => {
    const sun = packCustomerRegular(
      { id: 1176, related_id: 80, day: 7, time_from_v: "11:10", time_to_v: "13:40", teacher_ids: [1], subject_id: 92, b_date: "01.09.2026", e_date: "01.03.2027" },
      { groupName: "2026 Художественная школа (10-14 лет)", teacher: "Самсонова", subject: "Художественная школа (10-14 лет)", branchId: 1 },
    );
    const off = packCustomerRegular({ id: 1, related_id: 80, day: 5, time_from_v: "18:10", disabled: 1 }, {});
    assert.equal(sun?.dayLabel, "Вс");
    assert.equal(sun?.from, "11:10");
    assert.equal(sun?.to, "13:40");
    assert.equal(sun?.bDate, "01.09.2026");
    assert.equal(sun?.eDate, "01.03.2027");
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

  it("время ученика из customers[] важнее слота группы 18:10", () => {
    const picked = pickCustomerRegularItems(
      [
        {
          id: 9,
          related_id: 80,
          day: 5,
          time_from_v: "18:10",
          time_to_v: "20:40",
          customers: [{ id: 670, time_from: "15:30", time_to: "18:00" }],
        },
      ],
      670,
    );
    assert.equal(picked.length, 1);
    assert.equal(String(picked[0].time_from_v), "15:30");
  });

  it("без копий ученика не тащит чужие группы; python ≠ художественная", () => {
    const cid = 670;
    const dumped = pickCustomerRegularItems(
      [
        { id: 1, related_id: 80, day: 3, time_from_v: "15:30", time_to_v: "18:00" },
        { id: 2, related_id: 465, day: 3, time_from_v: "18:00", time_to_v: "19:30", subject_id: 11 },
        { id: 3, related_id: 12, day: 2, time_from_v: "16:00" },
      ],
      cid,
    );
    assert.equal(dumped.length, 0);
    const art = pickCustomerRegularItems(
      [
        { id: 1, related_id: 80, day: 3, time_from_v: "15:30", time_to_v: "18:00" },
        { id: 2, related_id: 465, day: 3, time_from_v: "18:00", time_to_v: "19:30" },
      ],
      cid,
      [80],
    );
    assert.deepEqual(
      art.map((x) => Number(x.related_id)),
      [80],
    );
    const groups = [{ id: 80, name: "2026 Художественная школа (10-14 лет)", subjectId: 92 }];
    assert.equal(regularBelongsToGroups({ groupId: 80, subjectId: 92 }, groups), true);
    assert.equal(regularBelongsToGroups({ groupId: 80, subjectId: 11, groupName: "2026 Художественная школа (10-14 лет)" }, groups), false);
    assert.equal(regularBelongsToGroups({ groupId: 465, subjectId: 11, groupName: "Python" }, groups), false);
    assert.equal(regularBelongsToGroups({ groupId: 80, subjectId: 92 }, []), false);
    const poison = packCustomerRegular(
      { id: 9, related_id: 670, day: 3, time_from_v: "18:00", subject_id: 11 },
      { customerId: 670, fallbackGroupId: 80, groupName: "2026 Художественная школа (10-14 лет)" },
    );
    assert.equal(poison, null);
  });
});
