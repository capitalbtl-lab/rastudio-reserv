import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LEAD_STAGES,
  applyStageOrder,
  crmBranchIds,
  crmLeadStatusId,
  leadStatusSortForm,
  leadStatusSortPayload,
  leadVisibleInBranch,
  mapCrmLeadStatuses,
  mergeStages,
  parseCrmLeadBoard,
  parseCrmStageOrder,
  pinUnsorted,
} from "./crm-leads-stages.ts";
import { filterLeadCards, leadAgeBand, leadYears, type LeadCard } from "./crm-leads.ts";

describe("воронка AlfaCRM: порядок этапов", () => {
  it("без ответа API колонки как в кабинете: Не разобрано → Разбирается → Ожидает старта → Отложен → Оплатил", () => {
    const ids = mergeStages().map((s) => s.id);
    assert.deepEqual(ids, [0, 1, 2, 7, 4]);
    assert.equal(mergeStages()[0].name, "Не разобрано");
  });

  it("вес из CRM важнее порядка в массиве", () => {
    const api = [
      { id: 4, name: "Оплатил", color: "#00aa00", weight: 4 },
      { id: 7, name: "Отложен", color: "#6b7280", weight: 3 },
      { id: 1, name: "Разбирается", color: "#c26629", weight: 1 },
      { id: 2, name: "Ожидает старта", color: "#1a7bb9", weight: 2 },
    ];
    assert.deepEqual(
      mergeStages(api).map((s) => s.id),
      [0, 1, 2, 7, 4],
    );
  });

  it("после перестановки в CRM колонки на сайте идут новым весом", () => {
    const swapped = [
      { id: 7, name: "Отложен", color: "#6b7280", weight: 1 },
      { id: 1, name: "Разбирается", color: "#c26629", weight: 2 },
      { id: 2, name: "Ожидает старта", color: "#1a7bb9", weight: 3 },
      { id: 4, name: "Оплатил", color: "#00aa00", weight: 4 },
    ];
    assert.deepEqual(
      mergeStages(swapped).map((s) => s.id),
      [0, 7, 1, 2, 4],
    );
  });

  it("Не разобрано нельзя утащить с первого места", () => {
    assert.deepEqual(pinUnsorted([1, 0, 2, 7, 4]), [0, 1, 2, 7, 4]);
    assert.deepEqual(pinUnsorted([7, 2, 1, 4]), [7, 2, 1, 4]);
  });

  it("сортировка в CRM не трогает системный этап 0 и нумерует weight с 1", () => {
    assert.deepEqual(leadStatusSortPayload([0, 7, 1, 2, 4]), [
      { id: 7, weight: 1 },
      { id: 1, weight: 2 },
      { id: 2, weight: 3 },
      { id: 4, weight: 4 },
    ]);
    assert.deepEqual(leadStatusSortPayload([1, 0, 4, 2]), [
      { id: 1, weight: 1 },
      { id: 4, weight: 2 },
      { id: 2, weight: 3 },
    ]);
  });

  it("тело sort как у jQuery в кабинете CRM: data[i][id] и data[i][weight]", () => {
    const body = leadStatusSortForm(
      [
        { id: 2, weight: 1 },
        { id: 1, weight: 2 },
      ],
      "token",
    );
    assert.equal(body.get("_csrf"), "token");
    assert.equal(body.get("data[0][id]"), "2");
    assert.equal(body.get("data[0][weight]"), "1");
    assert.equal(body.get("data[1][id]"), "1");
    assert.equal(body.get("data[1][weight]"), "2");
  });

  it("mapCrmLeadStatuses читает color_id, weight и выкидывает выключенные", () => {
    const stages = mapCrmLeadStatuses([
      { id: 4, name: "Оплатил", color_id: 4, weight: 4, is_enabled: 1, pipeline_id: 1 },
      { id: 99, name: "Скрытый", color_id: 6, weight: 9, is_enabled: 0, pipeline_id: 1 },
      { id: 1, name: "Разбирается", color_id: 1, weight: 1, is_enabled: 1, pipeline_id: 1 },
      { id: 2, name: "Ожидает старта", color: "#1a7bb9", sort: 2, pipeline_id: 1 },
      { id: 7, name: "Отложен", color_id: 0, ordering: 3, is_enabled: true, pipeline_id: 1 },
    ]);
    assert.deepEqual(
      stages.map((s) => s.id),
      [0, 1, 2, 7, 4],
    );
    assert.equal(stages.find((s) => s.id === 1)?.color, "#c26629");
    assert.equal(stages.find((s) => s.id === 4)?.color, "#00aa00");
    assert.equal(
      stages.some((s) => s.id === 99),
      false,
    );
  });

  it("новый этап из CRM встаёт по своему weight, неизвестный из карточек — в конец", () => {
    const api = [
      { id: 1, name: "Разбирается", color: "#c26629", weight: 1 },
      { id: 9, name: "Пробный урок", color: "#3C578C", weight: 2 },
      { id: 2, name: "Ожидает старта", color: "#1a7bb9", weight: 3 },
    ];
    assert.deepEqual(
      mergeStages(api, [11]).map((s) => s.id),
      [0, 1, 9, 2, 11],
    );
  });

  it("запасные имена LEAD_STAGES совпадают с кабинетом CRM", () => {
    const byId = new Map(LEAD_STAGES.map((s) => [s.id, s.name]));
    assert.equal(byId.get(0), "Не разобрано");
    assert.equal(byId.get(1), "Разбирается");
    assert.equal(byId.get(2), "Ожидает старта");
    assert.equal(byId.get(7), "Отложен");
    assert.equal(byId.get(4), "Оплатил");
  });

  it("порядок из HTML настроек CRM: sortable-item data-id", () => {
    const before = `<tbody class="sortable-list-lead-status-1 ui-sortable">
      <tr class="sortable-item ui-sortable-handle" data-id="1"></tr>
      <tr class="sortable-item ui-sortable-handle" data-id="2"></tr>
      <tr class="sortable-item ui-sortable-handle" data-id="7"></tr>
      <tr class="sortable-item ui-sortable-handle" data-id="4"></tr>
    </tbody>`;
    const after = `<tbody class="sortable-list-lead-status-1 ui-sortable">
      <tr class="sortable-item ui-sortable-handle" data-id="2"></tr>
      <tr class="sortable-item ui-sortable-handle" data-id="1"></tr>
      <tr class="sortable-item ui-sortable-handle" data-id="7"></tr>
      <tr class="sortable-item ui-sortable-handle" data-id="4"></tr>
    </tbody>`;
    assert.deepEqual(parseCrmStageOrder(before), [1, 2, 7, 4]);
    assert.deepEqual(parseCrmStageOrder(after), [2, 1, 7, 4]);
    assert.deepEqual(
      applyStageOrder(LEAD_STAGES, [2, 1, 7, 4]).map((s) => s.id),
      [0, 2, 1, 7, 4],
    );
  });

  it("филиалы как чекбоксы CRM, Не разобрано = пустой статус", () => {
    assert.deepEqual(crmBranchIds({ branch_ids: [2] }), [2]);
    assert.deepEqual(crmBranchIds({ branch_ids: ["2", "1"] }), [2, 1]);
    assert.deepEqual(crmBranchIds({ branch_ids: { 2: "2" } }), [2]);
    assert.equal(leadVisibleInBranch([2], 2), true);
    assert.equal(leadVisibleInBranch([2], 1), false);
    assert.equal(leadVisibleInBranch([2], 0), true);
    assert.equal(crmLeadStatusId({ lead_status_id: null }), 0);
    assert.equal(crmLeadStatusId({ lead_status_id: "" }), 0);
    assert.equal(crmLeadStatusId({}), 0);
    assert.equal(crmLeadStatusId({ lead_status_id: 1 }), 1);
  });

  it("воронка CRM: карточка лида по /company/2/lead/update?id=", () => {
    const html = `<a href="/company/2/lead/update?id=7759">Фролов Дмитрий Сергеевич</a>
      <a href="/company/2/lead/view?id=100">Другой лид</a>
      <form action="/company/2/lead/update?id=7759" method="post"></form>`;
    const rows = parseCrmLeadBoard(html);
    assert.deepEqual(
      rows.map((r) => r.id),
      [7759, 100],
    );
    assert.equal(rows[0].name, "Фролов Дмитрий Сергеевич");
  });
});

function card(p: Partial<LeadCard>): LeadCard {
  return {
    id: 1,
    customerId: 1,
    branchId: 2,
    name: "Лид",
    age: "",
    phone: "",
    email: "",
    note: "",
    assigned: "",
    statusId: 1,
    at: "",
    chats: 0,
    ...p,
  };
}

describe("возраст на доске лидов", () => {
  it("читает 7 лет +6мес и «ребёнок 13 лет» из имени", () => {
    assert.equal(leadYears("7 лет +6мес"), 7);
    assert.equal(leadAgeBand("7 лет +6мес"), "7-9");
    assert.equal(leadAgeBand("", "Ребенок 13 лет ВИКИТИ"), "13-17");
    assert.equal(leadAgeBand("", "хочет C++"), "");
  });

  it("чип возраста не прячет лидов без возраста и отсекает чужой", () => {
    const items = [
      card({ id: 1, name: "Каширский", age: "7 лет +6мес" }),
      card({ id: 2, name: "Ребенок 13 лет ВИКИТИ" }),
      card({ id: 3, name: "Семекашев", note: "ХОЧЕТ НА C++" }),
    ];
    assert.deepEqual(
      filterLeadCards(items, { age: "7-9" }).map((x) => x.id),
      [1, 3],
    );
    assert.deepEqual(
      filterLeadCards(items, { age: "13-17" }).map((x) => x.id),
      [2, 3],
    );
    assert.equal(filterLeadCards(items, { age: "3-4" }).length, 1);
  });
});

describe("живая воронка AlfaCRM", () => {
  it("этапы из lead-status/index те же и в том же порядке, что колонки сайта", async (t) => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    function envOf(key: string) {
      const dyn = String(process.env[key] || "").trim();
      if (dyn) return dyn;
      for (const file of [join(process.cwd(), ".env"), "/var/www/rastudio/.env"]) {
        try {
          for (const line of readFileSync(file, "utf8").split("\n")) {
            const row = line.trim();
            if (!row || row.startsWith("#") || !row.startsWith(`${key}=`)) continue;
            return row.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
          }
        } catch {
          /* next */
        }
      }
      try {
        const raw = JSON.parse(readFileSync(join(process.cwd(), "storage", "api-keys.json"), "utf8")) as {
          conns?: { enabled?: boolean; fields?: { key?: string; value?: string }[] }[];
        };
        for (const c of raw.conns || []) {
          if (c.enabled === false) continue;
          for (const f of c.fields || []) {
            if (f.key === key && String(f.value || "").trim()) return String(f.value).trim();
          }
        }
      } catch {
        /* none */
      }
      return "";
    }
    const host = (envOf("ALFACRM_HOST") || "https://studiyarazvivaysya.s20.online").replace(/\/$/, "");
    const email = envOf("ALFACRM_EMAIL");
    const apiKey = envOf("ALFACRM_API_KEY");
    if (!email || !apiKey) {
      t.skip("нет ключа AlfaCRM — пропускаю живую проверку");
      return;
    }
    const login = await fetch(`${host}/v2api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, api_key: apiKey }),
    });
    const auth = (await login.json()) as { token?: string };
    if (!auth.token) {
      t.skip("AlfaCRM не выдала токен");
      return;
    }
    const res = await fetch(`${host}/v2api/1/lead-status/index`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-ALFACRM-TOKEN": auth.token,
      },
      body: JSON.stringify({ page: 0, pageSize: 50 }),
    });
    const json = (await res.json()) as { items?: Record<string, unknown>[] };
    const raw = json.items || [];
    assert.ok(raw.length >= 4, `CRM вернула ${raw.length} этапов, ждали не меньше 4`);
    const stages = mapCrmLeadStatuses(raw);
    assert.equal(stages[0]?.id, 0);
    assert.equal(stages[0]?.name, "Не разобрано");
    const enabled = raw
      .filter((s) => {
        const id = Number(s.id);
        const on = s.is_enabled == null || s.is_enabled === "" ? 1 : Number(s.is_enabled);
        return Number.isFinite(id) && id !== 0 && on !== 0;
      })
      .slice()
      .sort((a, b) => Number(a.weight ?? a.sort ?? 0) - Number(b.weight ?? b.sort ?? 0) || Number(a.id) - Number(b.id));
    assert.deepEqual(
      stages.filter((s) => s.id !== 0).map((s) => s.id),
      enabled.map((s) => Number(s.id)),
    );
    const names = new Map(stages.map((s) => [s.id, s.name]));
    for (const s of enabled) {
      const title = String(s.name || "").trim();
      if (title) assert.equal(names.get(Number(s.id)), title);
    }
  });
});
