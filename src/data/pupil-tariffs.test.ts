import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assignable, pupilRowFromMember, uniqueLiveGroups, pickBestTariff, type PupilGroup } from "./pupil-tariffs.ts";
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
      slot({ id: "5", branchId: 1, groupName: "Роботы Гражданская" }),
    ]);
    assert.equal(list.length, 3);
    assert.deepEqual(
      list.map((g) => g.key).sort(),
      ["1:10", "2:10", "2:11"],
    );
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
});
