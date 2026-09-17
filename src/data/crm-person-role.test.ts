import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { customerPullCandidate, personIsStudy, personRole, personSaveFields, alfaStudyRole, dossierAuditRole } from "./crm-person-role.ts";

describe("роль человека: один экран", () => {
  it("is_study режет три корзины", () => {
    assert.equal(personRole({ is_study: 1 }), "учится");
    assert.equal(personRole({ is_study: 0 }), "лид");
    assert.equal(personRole({ is_study: 2 }), "архив");
    assert.equal(personRole({ is_study: 1, removed: 1 }), "удалён");
    assert.equal(personRole({ is_study: 1, removed: 2 }), "архив");
  });

  it("ученик с хвостом воронки Alfa — всё равно учится, не лид", () => {
    assert.equal(personRole({ is_study: 1, crm_funnel: "1" }), "учится");
    assert.equal(personRole({ is_study: 1, lead_status_id: 1 }), "учится");
    assert.equal(personRole({ is_study: 1, lead_status_id: 0 }), "учится");
    assert.equal(personRole({ is_study: 1, lead_status_id: null }), "учится");
  });

  it("сверка: is_study, не старый status", () => {
    assert.equal(alfaStudyRole({ is_study: 1, status: "лид" }), "клиент");
    assert.equal(alfaStudyRole({ is_study: 1, status: "архив" }), "клиент");
    assert.equal(alfaStudyRole({ is_study: 0, status: "учится" }), "лид");
    assert.equal(alfaStudyRole({ is_study: 2, status: "лид" }), "архив");
    assert.equal(alfaStudyRole({ is_study: 0 }), "лид");
    assert.equal(alfaStudyRole({ is_study: 2 }), "архив");
  });

  it("сверка как Клиенты: воронка CRM — лид, архив сильнее, ученик без воронки не лид", () => {
    assert.equal(dossierAuditRole({ is_study: 1, crm_funnel: "1" }), "лид");
    assert.equal(personRole({ is_study: 1, crm_funnel: "1" }), "учится");
    assert.equal(dossierAuditRole({ is_study: 1, crm_funnel: "0", status: "лид" }), "клиент");
    assert.equal(dossierAuditRole({ is_study: 0 }), "лид");
    assert.equal(dossierAuditRole({ is_study: 2, crm_funnel: "1" }), "архив");
    assert.equal(dossierAuditRole({ is_study: "", crm_funnel: "1" }), "лид");
  });

  it("лид без is_study=1 — кандидат на подгрузку клиентов", () => {
    assert.equal(customerPullCandidate({ crmId: 10, status: "лид", extras: { is_study: "0" } }), true);
    assert.equal(customerPullCandidate({ crmId: 10, status: "лид", extras: { is_study: "1" } }), false);
    assert.equal(customerPullCandidate({ crmId: 10, status: "учится", extras: { is_study: "1" } }), false);
    assert.equal(customerPullCandidate({ crmId: 0, status: "лид", extras: { is_study: "0" } }), false);
  });

  it("архив сильнее воронки", () => {
    assert.equal(personRole({ is_study: 2, crm_funnel: "1", lead_status_id: 1 }), "архив");
  });

  it("Сделать лидом / клиентом пишет диск и Alfa одним комплектом", () => {
    assert.deepEqual(personSaveFields(0), { is_study: 0, removed: 0, lead_status_id: 0, crm_funnel: "1" });
    assert.deepEqual(personSaveFields(1), { is_study: 1, removed: 0, lead_status_id: 0, crm_funnel: "0" });
    assert.deepEqual(personSaveFields(2), { removed: 2, lead_status_id: 0, crm_funnel: "0" });
    assert.equal(personIsStudy("лид"), 0);
    assert.equal(personRole({ ...personSaveFields(0) }), "лид");
    assert.equal(personRole({ ...personSaveFields(1) }), "учится");
    assert.equal(personRole({ ...personSaveFields(2) }), "архив");
  });
});
