import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assignable, pupilRowFromMember, uniqueLiveGroups, pickBestTariff, tariffMatchesSubject, customerTariffPayload, customerTariffCreatePath, customerTariffIndexPath, customerTariffUpdatePath, customerTariffDeletePath, activeCustomerTariffs, keepPupilsWithActiveTariffs, type PupilGroup } from "./pupil-tariffs.ts";
import type { CrmSlot } from "./crm-slots-core.ts";

function slot(over: Partial<CrmSlot> = {}): CrmSlot {
  return {
    id: "1",
    lessonId: 1,
    groupId: 10,
    groupName: "Роботы 7-9",
    groupNote: "",
    statusId: 1,
    limit: 12,
    taken: 8,
    subjectId: 37,
    subject: "Робототехника",
    school: "Школа робототехники",
    course: "Робототехника 7-9",
    path: "",
    age: "7-9",
    day: 1,
    dayLabel: "Пн",
    timeFrom: "16:00",
    timeTo: "17:00",
    timesPerWeek: 1,
    branchId: 2,
    city: "Коломна",
    branch: "ЦМИТ",
    signup: "",
    teacherId: 1,
    teacherIds: [1],
    teacher: "Иванова",
    roomId: 1,
    bDate: "",
    eDate: "",
    ...over,
  };
}

describe("мастер абонементов учеников", () => {
  it("группы уникальны по филиалу+id, архив не берёт", () => {
    const list = uniqueLiveGroups([
      slot(),
      slot({ id: "2", day: 3 }),
      slot({ id: "3", groupId: 11, groupName: "Роботы 5-6" }),
      slot({ id: "4", statusId: 3, groupId: 99, groupName: "архив" }),
      slot({ id: "6", statusId: 4, groupId: 12, groupName: "набор закрыт" }),
      slot({ id: "5", branchId: 1, groupName: "Роботы Гражданская" }),
    ]);
    assert.equal(list.length, 4);
    assert.deepEqual(
      list.map((g) => g.key).sort(),
      ["1:10", "2:10", "2:11", "2:12"],
    );
  });

  it("группа без школы сайта не пропадает из мастера", () => {
    const list = uniqueLiveGroups([
      slot({ id: "594", groupId: 594, groupName: "Модельная школа (2024)", school: "", course: "", statusId: 2 }),
    ]);
    assert.equal(list.length, 1);
    assert.equal(list[0].groupId, 594);
    assert.equal(list[0].school, "Без школы на сайте");
  });

  it("по умолчанию только ученики, лиды — по флагу", () => {
    const g: PupilGroup = {
      key: "2:10",
      groupId: 10,
      branchId: 2,
      name: "Роботы",
      school: "Школа робототехники",
      course: "Роботы",
      age: "7-9",
      teacher: "",
      taken: 8,
      limit: 12,
      subjectId: 37,
    };
    const tariff = {
      id: 386,
      name: "Абонемент 2950/4/60",
      price: 2950,
      lessonsCount: 4,
      duration: 60,
      type: 1,
      typeName: "Поурочная",
      archive: false,
      branchIds: [2],
      subjectIds: [37],
      lessonTypeIds: [2],
      calculationType: 2,
      calculationName: "Отдельный счет",
      periodCount: 1,
      periodType: 3,
      periodLabel: "1 месяц",
      pricePerLesson: 738,
      bDate: "",
      eDate: "",
      added: "",
      cardOk: true,
    };
    const pupil = pupilRowFromMember({ id: 1, name: "Петя", status: "учится" }, g, tariff, false);
    const lead = pupilRowFromMember({ id: 2, name: "Лид", status: "лид" }, g, tariff, false);
    const leadOn = pupilRowFromMember({ id: 2, name: "Лид", status: "лид" }, g, tariff, true);
    const arch = pupilRowFromMember({ id: 3, name: "Был", status: "архив", archived: true }, g, tariff, true);
    assert.equal(pupil?.tariffId, 386);
    assert.equal(lead, null);
    assert.equal(leadOn?.skip, "lead");
    assert.equal(arch, null);
    assert.equal(assignable([pupil!, leadOn!]).length, 2);
  });

  it("выбор абонемента на группе важнее автоподбора", () => {
    const a = {
      id: 1,
      name: "дешёвый",
      price: 1000,
      lessonsCount: 4,
      duration: 60,
      type: 1,
      typeName: "",
      archive: false,
      branchIds: [2],
      subjectIds: [37],
      lessonTypeIds: [2],
      calculationType: 2,
      calculationName: "",
      periodCount: 1,
      periodType: 3,
      periodLabel: "",
      pricePerLesson: 250,
      bDate: "",
      eDate: "",
      added: "",
      cardOk: true,
    };
    const b = { ...a, id: 2, name: "выбранный", price: 3850 };
    const auto = pickBestTariff(slot({ timeFrom: "16:00", timeTo: "17:00" }), [a, b]);
    assert.equal(auto?.id, 1);
    const chosen = pickBestTariff(slot({ timeFrom: "16:00", timeTo: "17:00", tariffId: 2 }), [a, b]);
    assert.equal(chosen?.id, 2);
  });

  it("абонемент соответствует предмету группы", () => {
    assert.equal(tariffMatchesSubject({ subjectIds: [12, 13] }, 12), true);
    assert.equal(tariffMatchesSubject({ subjectIds: [12, 13] }, 37), false);
    assert.equal(tariffMatchesSubject({ subjectIds: [] }, 12), false);
    assert.equal(tariffMatchesSubject(null, 0), true);
  });

  it("выгрузка в CRM всегда шлёт customer_id и тип урока", () => {
    const body = customerTariffPayload({
      customerId: 7759,
      tariffId: 386,
      bDate: "04.09.2026",
      eDate: "03.10.2026",
      groupId: 701,
      subjectIds: [13],
      lessonTypeIds: [],
      periodCount: 10,
      periodType: 3,
    });
    assert.equal(body.customer_id, 7759);
    assert.equal(body.tariff_id, 386);
    assert.deepEqual(body.lesson_type_ids, [2]);
    assert.deepEqual(body.subject_ids, [13]);
    assert.equal(body.group_id, 701);
    assert.equal(body.b_date, "04.09.2026");
    assert.equal(body.is_separate_balance, 0);
    const separate = customerTariffPayload({
      customerId: 1,
      tariffId: 1,
      bDate: "04.09.2026",
      calcType: 1,
    });
    assert.equal(separate.is_separate_balance, 1);
    assert.equal(separate.calculation_type, 2);
    assert.equal(customerTariffCreatePath(1, 7759), "/v2api/1/customer-tariff/create?customer_id=7759");
    assert.equal(customerTariffIndexPath(1, 7759), "/v2api/1/customer-tariff/index?customer_id=7759");
    assert.equal(customerTariffUpdatePath(1, 88, 7759), "/v2api/1/customer-tariff/update?id=88&customer_id=7759");
    assert.equal(customerTariffDeletePath(1, 88, 7759), "/v2api/1/customer-tariff/delete?id=88&customer_id=7759");
    const empty = customerTariffPayload({ customerId: 0, tariffId: 1, bDate: "01.01.2026" });
    assert.equal(empty.customer_id, 0);
    assert.deepEqual(empty.lesson_type_ids, [2]);
  });

  it("массовая выгрузка идёт пачками с паузой", async () => {
    const { ASSIGN_CHUNK, ASSIGN_GAP_MS, ASSIGN_BATCH_PAUSE_MS, ASSIGN_REST_EVERY, assignEtaMin } = await import("./pupil-tariffs.ts");
    assert.equal(ASSIGN_CHUNK, 5);
    assert.ok(ASSIGN_GAP_MS >= 800);
    assert.ok(ASSIGN_BATCH_PAUSE_MS >= 2000);
    assert.equal(ASSIGN_REST_EVERY, 40);
    const n = 300;
    assert.equal(Math.ceil(n / ASSIGN_CHUNK), 60);
    assert.ok(assignEtaMin(n) >= 8);
  });

  it("закрыть и удалить берут только живые абонементы", () => {
    const list = activeCustomerTariffs([
      { id: 1, tariff_id: 10, name: "живой" },
      { id: 2, tariff_id: 11, removed: 1 },
      { id: 0, tariff_id: 12 },
      { id: 3, is_archived: 1 },
    ]);
    assert.deepEqual(
      list.map((x) => x.id),
      [1],
    );
  });

  it("изменение и удаление оставляют только детей с живым абонементом", () => {
    const rows = [
      { customerId: 1, branchId: 1, name: "есть" },
      { customerId: 2, branchId: 1, name: "нет" },
    ];
    const by = new Map([
      ["1:1", [{ id: 10, tariffId: 386, name: "Абонемент 2950" }]],
      ["1:2", [] as { id: number; tariffId: number; name: string }[]],
    ]);
    const kept = keepPupilsWithActiveTariffs(rows, by);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].customerId, 1);
    assert.equal(kept[0].activeTariffs[0].name, "Абонемент 2950");
  });
});
