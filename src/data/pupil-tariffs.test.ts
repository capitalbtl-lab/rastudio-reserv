import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assignable, pupilRowFromMember, uniqueLiveGroups, pickBestTariff, tariffMatchesSubject, customerTariffPayload, customerTariffCreatePath, customerTariffIndexPath, customerTariffIndexBranchPath, customerTariffUpdatePath, customerTariffDeletePath, activeCustomerTariffs, keepPupilsWithActiveTariffs, groupHasBoundPupils, indexActiveTariffsByCustomer, PLAN_GROUP_CHUNK, formatTariffNames, customerTariffLabel, withCatalogNames, countArchivedOnlyPupils, splitCustomerTariffs, collapsePupilsByCustomer, pupilListStats, crmGroupQuantity, countCgiByGroup, countCgiParticipants, crmIndexTotal, mergeGroupTaken, groupsBySchoolId, bySchoolId, dropoutsAfterJob, stampLiveTariff, changeListRows, batchesOfThree, keepByLiveTariff, type PupilGroup } from "./pupil-tariffs.ts";
import { tariffFitsSlot } from "./crm-tariffs.ts";
import type { CrmSlot } from "./crm-slots-core.ts";
import type { CrmTariff } from "./crm-tariffs.ts";

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
  it("группы уникальны по филиалу+id, архивные тоже в списке", () => {
    const list = uniqueLiveGroups([
      slot(),
      slot({ id: "2", day: 3 }),
      slot({ id: "3", groupId: 11, groupName: "Роботы 5-6" }),
      slot({ id: "4", statusId: 3, groupId: 99, groupName: "архив", taken: 2 }),
      slot({ id: "6", statusId: 4, groupId: 12, groupName: "набор закрыт" }),
      slot({ id: "5", branchId: 1, groupName: "Роботы Гражданская" }),
    ]);
    assert.equal(list.length, 5);
    assert.ok(list.some((g) => g.groupId === 99));
    assert.deepEqual(
      list.map((g) => g.key).sort(),
      ["1:10", "2:10", "2:11", "2:12", "2:99"],
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

  it("мастер обрабатывает группы школой за школой по ID", () => {
    const list = uniqueLiveGroups([
      slot({ groupId: 1, schoolId: "art", school: "Художественная школа" }),
      slot({ groupId: 2, schoolId: "robots", school: "Школа робототехники", groupName: "Роботы" }),
      slot({ groupId: 3, schoolId: "art", school: "Художественная школа", groupName: "Худ 2" }),
      slot({ groupId: 4, schoolId: "", school: "", groupName: "без школы" }),
    ]);
    const packed = groupsBySchoolId(list);
    assert.equal(packed[0][0], "art");
    assert.equal(packed[0][1].length, 2);
    assert.equal(packed[1][0], "robots");
    assert.ok(String(packed.at(-1)?.[0] || "").startsWith("name:"));
    const jobs = bySchoolId([
      { schoolId: "art", school: "Художественная школа", n: 1 },
      { schoolId: "robots", school: "Школа робототехники", n: 2 },
      { schoolId: "art", school: "Художественная школа", n: 3 },
    ]);
    assert.deepEqual(jobs.map(([id, list]) => [id, list.length]), [["art", 2], ["robots", 1]]);
  });

  it("после круга школы ловит выпавших", () => {
    const sent = [
      { customerId: 1, branchId: 2, tariffId: 10 },
      { customerId: 2, branchId: 2, tariffId: 10 },
      { customerId: 3, branchId: 2, tariffId: 10 },
    ];
    const live = [
      { customerId: 1, branchId: 2, activeTariffs: [{ tariffId: 10 }] },
      { customerId: 2, branchId: 2, activeTariffs: [] },
    ];
    const miss = dropoutsAfterJob("assign", sent, live);
    assert.deepEqual(miss.map((x) => x.customerId), [2, 3]);
    const still = dropoutsAfterJob("delete", sent, [
      { customerId: 1, branchId: 2, activeTariffs: [{ tariffId: 10 }] },
      { customerId: 2, branchId: 2, activeTariffs: [] },
      { customerId: 3, branchId: 2, activeTariffs: [] },
    ]);
    assert.deepEqual(still.map((x) => x.customerId), [1]);
  });

  it("изменение не подставляет тариф группы, если в CRM у человека его нет", () => {
    const row = {
      customerId: 1,
      name: "Майоров",
      status: "лид",
      groupId: 589,
      branchId: 2,
      groupName: "589",
      school: "ЦМИТ",
      tariffId: 3850,
      tariffName: "Абонемент 3850/8/90",
      price: 3850,
      periodCount: 0,
      periodType: 3,
      calcType: 0,
      subjectIds: [],
      lessonTypeIds: [2],
      lessonsCount: 8,
    };
    const empty = stampLiveTariff(row);
    assert.equal(empty.tariffId, 0);
    assert.equal(empty.tariffName, "");
    const live = stampLiveTariff({ ...row, activeTariffs: [{ id: 9, tariffId: 12, name: "абонемент 12" }] });
    assert.equal(live.tariffId, 12);
    assert.match(live.tariffName, /12/);
    const listed = changeListRows([
      row,
      { ...row, customerId: 2, name: "Учится", status: "учится", activeTariffs: [{ id: 1, tariffId: 12, name: "12" }] },
      { ...row, customerId: 3, name: "Лид с абонементом", status: "лид", activeTariffs: [{ id: 2, tariffId: 12, name: "12" }] },
    ]);
    assert.equal(listed.length, 2);
    assert.ok(listed.some((x) => x.name === "Учится"));
    assert.ok(listed.some((x) => x.name === "Лид с абонементом"));
  });

  it("только что назначенный абонемент с датой старта завтра — живой", async () => {
    const { customerTariffLive } = await import("./pupil-tariffs.ts");
    assert.equal(
      customerTariffLive(
        { id: 1, tariff_id: 12, removed: 0, b_date: "06.09.2026", e_date: "04.07.2027" },
        [],
        "2026-09-05",
      ),
      true,
    );
    assert.equal(
      customerTariffLive({ id: 1, tariff_id: 12, removed: 0, b_date: "01.01.2026", e_date: "04.09.2026" }, [], "2026-09-05"),
      false,
    );
  });

  it("фильтр клиентов по живому абонементу", () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 0 }];
    const live = new Set([1]);
    assert.deepEqual(keepByLiveTariff(rows, "all", live, (x) => x.id).map((x) => x.id), [1, 2, 0]);
    assert.deepEqual(keepByLiveTariff(rows, "with", live, (x) => x.id).map((x) => x.id), [1]);
    assert.deepEqual(keepByLiveTariff(rows, "without", live, (x) => x.id).map((x) => x.id), [2, 0]);
  });

  it("customer id абонемента из вложенного customer и без tariff_id всё равно на карточке", async () => {
    const { tariffRowCustomerId, customerTariffOnCard, cgiCustomerId } = await import("./pupil-tariffs.ts");
    assert.equal(tariffRowCustomerId({ customer: { id: 8554 }, id: 9 }), 8554);
    assert.equal(tariffRowCustomerId({ customer_ids: [12], id: 1 }), 12);
    assert.equal(cgiCustomerId({ customer: { id: 8823 }, group_id: 1 }), 8823);
    assert.equal(
      customerTariffOnCard({ id: 88, removed: 0, e_date: "04.07.2027" }, "2026-09-05"),
      true,
    );
  });

  it("все медленно — пачки по 3 группы по номеру", () => {
    const pack = batchesOfThree([
      { groupId: 594 },
      { groupId: 590 },
      { groupId: 592 },
      { groupId: 593 },
      { groupId: 580 },
    ]);
    assert.equal(pack.length, 2);
    assert.deepEqual(pack[0].map((g) => g.groupId), [580, 590, 592]);
    assert.deepEqual(pack[1].map((g) => g.groupId), [593, 594]);
  });

  it("по умолчанию только ученики, лиды — по флагу", () => {
    const g: PupilGroup = {
      key: "2:10",
      groupId: 10,
      branchId: 2,
      name: "Роботы",
      school: "Школа робототехники",
      schoolId: "robots",
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
    const portrait = { ...a, id: 373, duration: 180, subjectIds: [92], price: 6450, name: "Основы портрета" };
    const studio = { ...a, id: 400, duration: 90, subjectIds: [92], price: 3850, name: "Художественная студия" };
    const wrongSaved = pickBestTariff(slot({ timeFrom: "16:00", timeTo: "17:30", subjectId: 92, tariffId: 373 }), [portrait, studio]);
    assert.equal(wrongSaved?.id, 400);
  });

  it("абонемент другого курса сайта не ставится в группу художественной школы", () => {
    const t = {
      archive: false,
      branchIds: [2],
      duration: 180,
      lessonTypeIds: [2],
      subjectIds: [5],
    } as CrmTariff;
    const group = slot({
      branchId: 2,
      timeFrom: "16:00",
      timeTo: "19:00",
      subjectId: 5,
      courseId: "/art-studio",
    });
    assert.equal(tariffFitsSlot(t, group, { tariffId: 373, schoolId: "/art-studio", courseId: "/portrait-12" }), false);
    assert.equal(tariffFitsSlot(t, group, { tariffId: 400, schoolId: "/art-studio", courseId: "/art-studio" }), true);
    assert.equal(
      tariffFitsSlot(t, group, [
        { tariffId: 400, schoolId: "/art-studio", courseId: "/portrait-12" },
        { tariffId: 400, schoolId: "/art-studio", courseId: "/art-studio" },
      ]),
      true,
    );
    const unboundGroup = slot({
      branchId: 2,
      timeFrom: "16:00",
      timeTo: "19:00",
      subjectId: 5,
      courseId: "",
    });
    assert.equal(tariffFitsSlot(t, unboundGroup, { tariffId: 373, schoolId: "/art-studio", courseId: "/portrait-12" }), true);
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
    assert.equal(customerTariffIndexBranchPath(2), "/v2api/2/customer-tariff/index");
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
    const list = activeCustomerTariffs(
      [
        { id: 1, tariff_id: 10, tariff_name: "живой" },
        { id: 2, tariff_id: 11, removed: 1 },
        { id: 0, tariff_id: 12 },
        { id: 3, is_archived: 1 },
        { id: 5, tariff_id: 10, is_archived: 1, tariff_name: "шаблон в архиве CRM" },
        { id: 4, tariff_id: 10, e_date: "01.01.2020" },
      ],
      [{ id: 10, name: "Абонемент 3850", archive: true }],
    );
    assert.deepEqual(
      list.map((x) => x.id),
      [1, 5],
    );
    assert.equal(list[0].name, "живой");
  });

  it("изменяем только абонементы, действующие сегодня", () => {
    const catalog = [
      { id: 385, name: "Абонемент 3850/4/90 Скульптурная студия", archive: false },
      { id: 177, name: "старый", archive: true },
    ];
    const list = activeCustomerTariffs(
      [
        { id: 1, customer_id: 8, tariff_id: 385, e_date: "30.06.2027" },
        { id: 2, customer_id: 8, tariff_id: 177, e_date: "01.01.2020" },
        { id: 3, customer_id: 8, tariff_id: 385, is_archive: 1 },
        { id: 4, customer_id: 8, tariff_id: 174, b_date: "01.01.2028" },
      ],
      catalog,
    );
    assert.deepEqual(
      list.map((x) => x.tariffId),
      [385],
    );
    const bothCurrent = splitCustomerTariffs(
      [
        { id: 1, customer_id: 8, tariff_id: 385 },
        { id: 2, customer_id: 8, tariff_id: 177 },
      ],
      catalog,
    );
    assert.deepEqual(
      bothCurrent.live.get(8)?.map((x) => x.tariffId),
      [385],
    );
    const onlyOld = splitCustomerTariffs([{ id: 2, customer_id: 9, tariff_id: 177 }], catalog);
    assert.equal(onlyOld.live.get(9)?.[0].tariffId, 177);
    const n = countArchivedOnlyPupils(
      [
        { customerId: 8, branchId: 2 },
        { customerId: 9, branchId: 2 },
      ],
      new Map([
        ["2:8", [{}]],
        ["2:9", []],
      ]),
      new Map([
        ["2:8", []],
        ["2:9", [{}]],
      ]),
    );
    assert.equal(n, 1);
  });

  it("имя абонемента берётся из каталога, повтор схлопывается", () => {
    assert.equal(customerTariffLabel({ tariff_id: 386 }, [{ id: 386, name: "Абонемент 3850/4/90" }]), "Абонемент 3850/4/90");
    assert.equal(customerTariffLabel({ tariff_id: 9 }), "абонемент #9");
    const named = withCatalogNames(
      [
        { id: 1, tariffId: 386, name: "абонемент" },
        { id: 2, tariffId: 386, name: "абонемент" },
        { id: 3, tariffId: 400, name: "абонемент" },
      ],
      [
        { id: 386, name: "Абонемент 3850/4/90" },
        { id: 400, name: "Абонемент 2950" },
      ],
    );
    assert.equal(formatTariffNames(named), "Абонемент 3850/4/90 ×2, Абонемент 2950");
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

  it("в мастере только группы с учениками, лидами или архивом", () => {
    assert.equal(groupHasBoundPupils(3, 0, 0), true);
    assert.equal(groupHasBoundPupils(0, 2, 0), true);
    assert.equal(groupHasBoundPupils(0, 0, 4), true);
    assert.equal(groupHasBoundPupils(0, 0, 0), false);
  });

  it("чтение абонементов идёт пачками по филиалу, не по каждому ученику", () => {
    assert.equal(PLAN_GROUP_CHUNK, 1);
    const map = indexActiveTariffsByCustomer(
      [
        { id: 1, customer_id: 10, tariff_id: 5, tariff_name: "A" },
        { id: 2, customer_id: 10, tariff_id: 6, tariff_name: "B" },
        { id: 3, customer_id: 11, removed: 1 },
        { id: 4, customerId: 12, tariffId: 7, tariff_name: "C" },
        { id: 5, customer_id: 0, tariff_id: 8 },
      ],
      [
        { id: 5, name: "A" },
        { id: 6, name: "B" },
        { id: 7, name: "C" },
      ],
    );
    assert.equal(map.get(10)?.length, 2);
    assert.equal(map.has(11), false);
    assert.equal(map.get(12)?.[0].name, "C");
    assert.equal(map.has(0), false);
  });

  it("места в мастере: лиды и ученики из слота, без запроса CRM на каждую группу", () => {
    const list = uniqueLiveGroups([slot({ taken: 0, takenStudy: 3, takenLead: 2 })]);
    assert.equal(list[0].taken, 5);
    assert.equal(groupHasBoundPupils(list[0].taken, 0, 0), true);
  });

  it("состав группы — quantity с карточки CRM, не group_ids клиента", () => {
    assert.equal(crmGroupQuantity({ quantity: 3, limit: 8 }), 3);
    assert.equal(crmGroupQuantity({ cnt: 3 }), 3);
    assert.equal(crmGroupQuantity({ group_ids: [647] }), 0);
    assert.equal(Math.max(0, crmGroupQuantity({ quantity: 3 })), 3);
  });

  it("участники группы из cgi и total customer/index", () => {
    const map = countCgiByGroup(
      [
        { group_id: 433, customer_id: 1 },
        { group_id: 433, customer_id: 2 },
        { group_id: 433, customer_id: 3, removed: 1 },
        { group_id: 647, customer_id: 4, e_date: "0000-00-00" },
      ],
      "2026-09-04",
    );
    assert.equal(map.get(433), 2);
    assert.equal(map.get(647), 1);
    assert.equal(crmIndexTotal({ total: 6, count: 1, items: [{}] }), 6);
    assert.equal(crmIndexTotal({ items: [1, 2, 3, 4, 5, 6] }), 6);
    assert.equal(countCgiParticipants([{ customer_id: 1 }, { customer_id: 2, is_study: 0 }, { customer_id: 3, removed: 1 }]), 2);
    assert.equal(mergeGroupTaken(0, 1, 6, 0), 6);
    assert.equal(mergeGroupTaken(16, 0, 0), 16);
  });

  it("удаление схлопывает человека из двух групп в одну строку", () => {
    const a = {
      customerId: 7,
      name: "Иванов",
      status: "учится",
      groupId: 586,
      branchId: 2,
      groupName: "группа 586",
      school: "ЦМИТ",
      tariffId: 385,
      tariffName: "3850",
      price: 3850,
      periodCount: 0,
      periodType: 3,
      calcType: 0,
      subjectIds: [1],
      lessonTypeIds: [2],
      lessonsCount: 4,
    };
    const b = { ...a, groupId: 592, groupName: "группа 592" };
    const stats = pupilListStats([a, b, { ...a, customerId: 8, name: "Петров", groupId: 586, groupName: "группа 586" }]);
    assert.equal(stats.rows, 3);
    assert.equal(stats.unique, 2);
    assert.equal(stats.dual, 1);
    const collapsed = collapsePupilsByCustomer([a, b]);
    assert.equal(collapsed.length, 1);
    assert.equal(collapsed[0].groupName, "группа 586 · группа 592");
  });
});
