/**
 * Приёмка этапов 1–9: одна семья, одна группа, без живой Alfa.
 * Витрина → ИИ → заявка → лид → состав cgi → абонемент → аудитория.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readPriority, sessionMatchesPage, slotOnPublicSchedule } from "./group-status.ts";
import { resolveSignupIds } from "./site-signup-ids.ts";
import { personRole, personSaveFields } from "./crm-person-role.ts";
import { tariffRowLive, liveTariffCustomerIds } from "./crm-tariff-row.ts";
import { roomsOfBranchList } from "./crm-rooms.ts";
import { slotFitsAgent } from "./agent-groups.ts";
import { takenByGroupFromCgi, groupsOfCustomerFromCgi } from "./crm-membership.ts";

const tree = {
  schools: [
    { id: "/art-studio", href: "/art-studio", label: "Художественная школа" },
    { id: "/robototehnika-v-kolomne", href: "/robototehnika-v-kolomne", label: "Школа робототехники" },
  ],
  courses: [
    { id: "/art-studio-5-6", href: "/art-studio-5-6", schoolId: "/art-studio", label: "5-6" },
    { id: "/robototehnika-7-9", href: "/robototehnika-7-9", schoolId: "/robototehnika-v-kolomne", label: "7-9" },
  ],
};

const group580 = {
  groupId: 580,
  branchId: 1,
  statusId: 2,
  priority: 1,
  subjectId: 13,
  courseId: "/art-studio-5-6",
  schoolId: "/art-studio",
  path: "/art-studio-5-6",
  groupName: "Роботы 2026",
};

describe("приёмка: витрина → заявка → лид", () => {
  it("на сайт только status + priority≥1 + courseId дерева", () => {
    const pub = { "2": { schedule: true, trial: true, group: true } };
    assert.equal(slotOnPublicSchedule(group580, pub), true);
    assert.equal(slotOnPublicSchedule({ ...group580, priority: 0 }, pub), false);
    assert.equal(slotOnPublicSchedule({ ...group580, courseId: "", path: "" }, pub), false);
    assert.equal(readPriority(""), 0);
  });

  it("страница курса не берёт группу другой школы, даже если имя «Роботы»", () => {
    const art = { siteCourseId: "/art-studio-5-6", path: "/art-studio-5-6" };
    assert.equal(sessionMatchesPage(art, "/art-studio-5-6", tree), true);
    assert.equal(sessionMatchesPage(art, "/robototehnika-7-9", tree), false);
    assert.equal(sessionMatchesPage(art, "/art-studio", tree), true);
  });

  it("ИИ не кладёт художественную группу в робототехнику по имени", () => {
    assert.equal(slotFitsAgent(group580, { course: "робототехника" }, tree), false);
    assert.equal(slotFitsAgent(group580, { courseId: "/art-studio-5-6" }, tree), true);
  });

  it("заявка с gid отдаёт subjectId группы, не Number(пути курса)", () => {
    const hit = resolveSignupIds({
      gid: "580",
      branchId: 1,
      courseId: "/art-studio-5-6",
      slots: [group580],
    });
    assert.equal(hit.subjectId, 13);
    assert.equal(hit.source, "group");
    assert.equal(Number("/art-studio-5-6"), Number.NaN);
  });

  it("Фролов на доске CRM — лид, не клиент; «Сделать клиентом» снимает воронку", () => {
    assert.equal(personRole({ is_study: 1, lead_status_id: 1, crm_funnel: "1" }), "лид");
    assert.deepEqual(personSaveFields(1), { is_study: 1, lead_status_id: 0, crm_funnel: "0" });
    assert.equal(personRole(personSaveFields(1)), "учится");
  });

  it("живой абонемент — строка CRM, не paid_till", () => {
    const today = "2026-09-05";
    assert.equal(tariffRowLive({ id: 9, tariff_id: 400, e_date: "2026-12-01" }, today), true);
    assert.equal(tariffRowLive({ id: 9, tariff_id: 400, e_date: "2026-01-01" }, today), false);
    assert.equal(liveTariffCustomerIds([{ id: 1, customer_id: 100, tariff_id: 400, e_date: "2026-12-01" }], today).size, 1);
  });

  it("состав группы — cgi, дубль customer_id считается один раз", () => {
    const rows = [
      { id: 1, customer_id: 7759, group_id: 580 },
      { id: 2, customer_id: 7759, group_id: 580 },
      { id: 3, customer_id: 12, group_id: 580 },
    ];
    assert.equal(takenByGroupFromCgi(rows).get(580), 2);
    assert.deepEqual(
      groupsOfCustomerFromCgi(rows, 7759, 1).map((g) => g.id),
      [580],
    );
  });

  it("аудитория чужого филиала и архив не подставляются", () => {
    const rooms = roomsOfBranchList(
      [
        { id: 1, name: "Гражданская", branch_id: 1 },
        { id: 2, name: "ЦМИТ", branch_ids: [2] },
        { id: 3, name: "Архив", branch_id: 1, is_archived: 1 },
      ],
      1,
    );
    assert.deepEqual(
      rooms.map((r) => r.id),
      [1],
    );
  });

  it("раздельный счёт UI 1 → Alfa calculation_type 2", () => {
    const uiToAlfa = (ui: number) => (Number(ui) ? 2 : 1);
    assert.equal(uiToAlfa(1), 2);
    assert.equal(uiToAlfa(0), 1);
  });
});
