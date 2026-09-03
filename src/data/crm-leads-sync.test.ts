import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  LEAD_INDEX_QUERY,
  crmBranchIds,
  crmIndexAccumTotal,
  crmIndexShouldStop,
  crmLeadStatusId,
  isCrmLeadRecord,
  leadMoveFields,
  leadVisibleInBranch,
  parseCrmLeadBoard,
  parseCrmLeadColumn,
  parseCrmLeadBoardPayload,
  parseCrmBoardCounts,
  parseCrmScrollPagerUrl,
  applyCrmBoardRows,
  crmBoardStatusField,
} from "./crm-leads-stages.ts";

const FROLOV: Record<string, unknown> = {
  id: 7759,
  name: "Фролов Дмитрий Сергеевич",
  is_study: 0,
  lead_status_id: null,
  branch_ids: [2],
  dob: "2015-05-08",
  phone: "+7(916)345-89-60",
};

function pack(it: Record<string, unknown>, branchId: number) {
  if (!isCrmLeadRecord(it)) return null;
  return {
    id: Number(it.id),
    branchId,
    branches: crmBranchIds(it).length ? crmBranchIds(it) : [branchId],
    name: String(it.name || ""),
    statusId: crmLeadStatusId(it),
  };
}

function envOf(key: string) {
  const dyn = String(process.env[key] || "").trim();
  if (dyn) return dyn;
  for (const file of [
    join(process.cwd(), ".env"),
    "/var/www/rastudio/.env",
    join(process.cwd(), "storage", "api-keys.json"),
    "/var/www/rastudio/storage/api-keys.json",
  ]) {
    try {
      if (!existsSync(file)) continue;
      if (file.endsWith(".json")) {
        const raw = JSON.parse(readFileSync(file, "utf8")) as {
          conns?: { enabled?: boolean; fields?: { key?: string; value?: string }[] }[];
        };
        for (const c of raw.conns || []) {
          if (c.enabled === false) continue;
          for (const f of c.fields || []) {
            if (f.key === key && String(f.value || "").trim()) return String(f.value).trim();
          }
        }
        continue;
      }
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const row = line.trim();
        if (!row || row.startsWith("#") || !row.startsWith(`${key}=`)) continue;
        return row.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
      }
    } catch {
      /* next */
    }
  }
  return "";
}

describe("двусторонняя связь карточек лидов с AlfaCRM", () => {
  it("запрос списка лидов — только is_study:0, без removed и без lead_status_id", () => {
    assert.deepEqual(LEAD_INDEX_QUERY, { is_study: 0 });
    assert.equal("removed" in LEAD_INDEX_QUERY, false);
    assert.equal("lead_status_id" in LEAD_INDEX_QUERY, false);
  });

  it("CRM → сайт: Фролов как в форме /lead/update (is_study 0, статус null, филиал 2)", () => {
    const card = pack(FROLOV, 2);
    assert.ok(card, "карточка не должна отбрасываться");
    assert.equal(card!.id, 7759);
    assert.equal(card!.name, "Фролов Дмитрий Сергеевич");
    assert.equal(card!.statusId, 0, "Не разобрано в CRM = null, на сайте 0");
    assert.equal(card!.branchId, 2);
    assert.deepEqual(card!.branches, [2]);
    assert.equal(leadVisibleInBranch(card!.branches, 2), true);
  });

  it("CRM → сайт: is_study строкой «0» и без поля removed — это лид", () => {
    assert.ok(isCrmLeadRecord({ ...FROLOV, is_study: "0", removed: undefined }));
    assert.ok(pack({ ...FROLOV, is_study: "0" }, 2));
  });

  it("CRM → сайт: ученик без этапа воронки и архив не попадают", () => {
    assert.equal(isCrmLeadRecord({ ...FROLOV, is_study: 1 }), false);
    assert.equal(isCrmLeadRecord({ ...FROLOV, is_study: 2 }), false);
    assert.equal(isCrmLeadRecord({ ...FROLOV, removed: 1 }), false);
  });

  it("клиент, которого вернули в воронку (is_study 1 + этап 1) — это лид", () => {
    assert.equal(isCrmLeadRecord({ ...FROLOV, is_study: 1, lead_status_id: 1 }), true);
    const card = pack({ ...FROLOV, is_study: 1, lead_status_id: 1 }, 2);
    assert.ok(card);
    assert.equal(card!.statusId, 1);
  });

  it("сайт → CRM: смена этапа шлёт is_study 0 и lead_status_id", () => {
    assert.deepEqual(leadMoveFields(2), { lead_status_id: 2, is_study: 0 });
    assert.equal(leadMoveFields(0).lead_status_id, 0);
    assert.equal(leadMoveFields(0).is_study, 0);
  });

  it("сайт → CRM → сайт: после update карточка остаётся лидом того же этапа", () => {
    const before = pack(FROLOV, 2)!;
    const patch = leadMoveFields(1);
    const after = pack({ ...FROLOV, ...patch }, 2);
    assert.ok(after);
    assert.equal(after!.id, before.id);
    assert.equal(after!.statusId, 1);
    assert.equal(pack({ ...FROLOV, lead_status_id: null, is_study: 0 }, 2)!.statusId, 0);
  });

  it("все карточки страниц is_study=0 проходят без потерь, Фролов на 3-й странице", () => {
    const pages: Record<string, unknown>[][] = [
      Array.from({ length: 50 }, (_, i) => ({ id: i + 1, is_study: 0, name: `Лид ${i + 1}`, lead_status_id: 1 })),
      Array.from({ length: 50 }, (_, i) => ({ id: i + 51, is_study: 0, name: `Лид ${i + 51}`, lead_status_id: 2 })),
      [{ ...FROLOV }, { id: 8000, is_study: 0, name: "Ещё", lead_status_id: 7, branch_ids: [2] }],
    ];
    const out = [];
    const seen = new Set<number>();
    for (const page of pages) {
      for (const it of page) {
        const packed = pack(it, 2);
        if (!packed || seen.has(packed.id)) continue;
        seen.add(packed.id);
        out.push(packed);
      }
    }
    assert.equal(out.length, 102);
    assert.ok(out.some((x) => x.id === 7759), "Фролов потерян при упаковке страниц");
    assert.equal(out.find((x) => x.id === 7759)?.statusId, 0);
  });
});

describe("пагинация customer/index не режет лидов", () => {
  it("если total первой страницы равен pageSize — читаем следующую (там Фролов)", () => {
    const pageSize = 50;
    let total = Number.POSITIVE_INFINITY;
    let loaded = 0;
    const ids: number[] = [];
    const pages = [
      { items: Array.from({ length: 50 }, (_, i) => ({ id: i + 1 })), total: 50, count: 50 },
      { items: [{ id: 7759 }], total: 51, count: 1 },
    ];
    for (let page = 0; page < pages.length; page += 1) {
      const res = pages[page];
      total = crmIndexAccumTotal(page, pageSize, res.items.length, res.total, total);
      for (const it of res.items) ids.push(it.id);
      loaded += res.items.length;
      if (crmIndexShouldStop(pageSize, res.items.length, res.count, loaded, total)) break;
    }
    assert.ok(ids.includes(7759), `Фролов не попал (${ids.length} id). Это причина пустого «Не разобрано».`);
    assert.equal(ids.length, 51);
  });

  it("count страницы не принимают за общее число лидов филиала (153)", () => {
    const pageSize = 50;
    let total = Number.POSITIVE_INFINITY;
    let loaded = 0;
    const ids: number[] = [];
    const pages = [
      { n: 50, total: 50, count: 50 },
      { n: 50, total: 153, count: 50 },
      { n: 53, total: 153, count: 53 },
    ];
    let id = 1;
    for (let page = 0; page < pages.length; page += 1) {
      const res = pages[page];
      total = crmIndexAccumTotal(page, pageSize, res.n, res.total, total);
      for (let i = 0; i < res.n; i += 1) ids.push(id++);
      loaded += res.n;
      if (crmIndexShouldStop(pageSize, res.n, res.count, loaded, total)) break;
    }
    assert.equal(ids.length, 153, `ожидали 153 лида ЦМИТ, получили ${ids.length} — пагинация обрезала воронку`);
  });

  it("фильтр removed:0 в запросе лидов запрещён — «Не разобрано» часто без removed", () => {
    assert.equal(JSON.stringify(LEAD_INDEX_QUERY).includes("removed"), false);
  });
});

describe("снимок кабинета AlfaCRM /company/2/lead/index", () => {
  it("Фролов — единственная карточка Не разобрано, data-id=7759", () => {
    const p = join(process.cwd(), "attachments", "Лиды _ ALFACRM.html");
    if (!existsSync(p)) {
      assert.ok(true, "нет снимка");
      return;
    }
    const html = readFileSync(p, "utf8");
    const rows = parseCrmLeadBoard(html);
    const frolov = rows.find((r) => r.id === 7759);
    assert.ok(frolov, "в выгрузке CRM нет lead-element data-id=7759");
    assert.equal(frolov!.statusId, 0, "Фролов должен быть в колонке Не разобрано (lead-items-0)");
    assert.match(frolov!.name, /Фролов/);
    const unsorted = rows.filter((r) => r.statusId === 0);
    assert.equal(unsorted.length, 1, `Не разобрано в CRM: ${unsorted.length}, ждали 1 (Фролов)`);
    const col0 = parseCrmLeadColumn(
      html.slice(html.indexOf("lead-items-0"), html.indexOf("lead-items-1")),
      0,
    );
    assert.deepEqual(
      col0.map((r) => r.id),
      [7759],
    );
  });

  it("0 из колонки Не разобрано не теряется через ||", () => {
    assert.equal(crmBoardStatusField(0), null);
    assert.equal(crmBoardStatusField(1), 1);
    assert.equal(crmLeadStatusId({ lead_status_id: crmBoardStatusField(0) }), 0);
  });

  it("API без Фролова + доска CRM → Фролов в Не разобрано", () => {
    const p = join(process.cwd(), "attachments", "Лиды _ ALFACRM.html");
    assert.ok(existsSync(p), "нет снимка CRM");
    const board = parseCrmLeadBoard(readFileSync(p, "utf8"));
    const api = [
      { id: 9109, name: "Другой лид", statusId: 1 },
    ];
    const merged = applyCrmBoardRows(api, board, (row) => ({
      id: row.id,
      name: row.name,
      statusId: row.statusId,
    }));
    const frolov = merged.find((x) => x.id === 7759);
    assert.ok(frolov, "слияние с доской CRM не добавило Фролова");
    assert.equal(frolov!.statusId, 0);
    assert.match(frolov!.name, /Фролов/);
    assert.equal(merged.filter((x) => x.statusId === 0).length, 1);
  });

  it("если API всё ещё считает Фролова клиентом (этап 1), доска ставит Не разобрано", () => {
    const board = [{ id: 7759, name: "Фролов Дмитрий Сергеевич", statusId: 0 }];
    const api = [{ id: 7759, name: "Фролов Дмитрий Сергеевич", statusId: 1 }];
    const merged = applyCrmBoardRows(api, board, (row) => ({ ...row }));
    assert.equal(merged.length, 1);
    assert.equal(merged[0].statusId, 0);
  });

  it("шапка CRM: 1 / 88 / 34 / 30 / 0 — в HTML колонка 0 полная, 1 подгружается", () => {
    const p = join(process.cwd(), "attachments", "Лиды _ ALFACRM.html");
    const html = readFileSync(p, "utf8");
    const rows = parseCrmLeadBoard(html);
    const by: Record<number, number> = {};
    for (const r of rows) by[r.statusId] = (by[r.statusId] || 0) + 1;
    assert.equal(by[0], 1, `Не разобрано: ${by[0]}`);
    assert.ok((by[1] || 0) >= 60, `Разбирается в HTML ${by[1]}, в шапке 88`);
    assert.equal(by[2], 34);
    assert.equal(by[7], 30);
    assert.equal(by[4] || 0, 0);
    const header = [...html.matchAll(/board-count[^>]*>(\d+)<\/span>\s*<span class="status_column[^>]*title="([^"]+)"/g)].map(
      (m) => [m[2], Number(m[1])] as const,
    );
    assert.deepEqual(header, [
      ["Не разобрано", 1],
      ["Разбирается", 88],
      ["Ожидает старта", 34],
      ["Отложен", 30],
      ["Оплатил", 0],
    ]);
  });

  it("сайт 120 из API is_study=0, CRM 153 с доски — это разные множества", () => {
    const crm = join(process.cwd(), "attachments", "Лиды _ ALFACRM.html");
    const site = join(process.cwd(), "attachments", "Кабинет администратора _ Студия «Развивайся».html");
    const crmHtml = readFileSync(crm, "utf8");
    const counts = parseCrmBoardCounts(crmHtml);
    assert.equal(counts.reduce((n, x) => n + x.count, 0), 153);
    const siteHtml = readFileSync(site, "utf8");
    const keys = new Set([...siteHtml.matchAll(/data-card-key="2:(\d+)"/g)].map((m) => m[1]));
    assert.equal(keys.size, 120);
    assert.equal(keys.has("7759"), false, "на сайте в выгрузке нет Фролова");
    assert.ok(crmHtml.includes("data-id=\"7759\""));
  });

  it("initBoard отдаёт JSON {content}, не голый HTML", () => {
    const inner = `<li class="lead-element" data-id="7759"><a href="/company/2/lead/view?id=7759">Фролов Дмитрий Сергеевич</a></li>
      <li class="crm-scroll-pager" data-url="/company/2/lead/board?id=1&page=3"></li>`;
    const parsed = parseCrmLeadBoardPayload(JSON.stringify({ content: inner }), 1);
    assert.equal(parsed.cards.length, 1);
    assert.equal(parsed.cards[0].id, 7759);
    assert.equal(parsed.cards[0].statusId, 1);
    assert.equal(parsed.nextUrl, "/company/2/lead/board?id=1&page=3");
    assert.equal(parseCrmScrollPagerUrl(inner), "/company/2/lead/board?id=1&page=3");
  });

  it("доска — кто в воронке: API-лишние не считаются", () => {
    const board = [
      { id: 7759, name: "Фролов Дмитрий Сергеевич", statusId: 0 },
      { id: 9109, name: "Другой", statusId: 1 },
    ];
    const api = [
      { id: 9109, name: "Другой", statusId: 1 },
      { id: 1, name: "Лишний из is_study=0", statusId: 1 },
    ];
    const merged = applyCrmBoardRows([], board, (row) => {
      const hit = api.find((x) => x.id === row.id);
      return hit ? { ...hit, statusId: row.statusId } : { ...row };
    });
    assert.equal(merged.length, 2);
    assert.ok(merged.some((x) => x.id === 7759));
    assert.equal(
      merged.some((x) => x.id === 1),
      false,
    );
  });
});

describe("живая AlfaCRM: Фролов 7759 и все лиды ЦМИТ", () => {
  it("карточка 7759 есть в customer/index is_study=0 филиала 2", async (t) => {
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
    const post = async (path: string, body: Record<string, unknown>) => {
      const res = await fetch(`${host}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-ALFACRM-TOKEN": auth.token!,
        },
        body: JSON.stringify(body),
      });
      return (await res.json()) as { items?: Record<string, unknown>[]; total?: number; count?: number };
    };

    const byId: { branch: number; row: Record<string, unknown> | null }[] = [];
    for (const branch of [2, 1, 3, 4]) {
      const got = await post(`/v2api/${branch}/customer/index`, { page: 0, pageSize: 10, id: 7759 });
      const row = (got.items || []).find((x) => Number(x.id) === 7759) || null;
      byId.push({ branch, row });
    }
    const hit = byId.find((x) => x.row);
    assert.ok(
      hit?.row,
      `API не нашла id=7759 ни в одном филиале. ${byId.map((x) => `${x.branch}:${x.row ? "есть" : "нет"}`).join(", ")}`,
    );

    const raw = hit!.row!;
    const study = raw.is_study;
    const status = raw.lead_status_id ?? raw.status_id;
    const removed = raw.removed;
    const branches = raw.branch_ids;
    const packed = pack(raw, hit!.branch);

    const ids: number[] = [];
    let listedTotal = 0;
    let total = Number.POSITIVE_INFINITY;
    let loaded = 0;
    for (let page = 0; page < 40; page += 1) {
      const got = await post(`/v2api/2/customer/index`, { page, pageSize: 50, ...LEAD_INDEX_QUERY });
      const batch = got.items || [];
      listedTotal = Number(got.total) || listedTotal;
      total = crmIndexAccumTotal(page, 50, batch.length, got.total, total);
      for (const it of batch) ids.push(Number(it.id));
      loaded += batch.length;
      if (crmIndexShouldStop(50, batch.length, got.count, loaded, total)) break;
    }
    const inList = ids.includes(7759);
    assert.equal(
      Number(study),
      0,
      `Причина: Фролов в API не лид. is_study=${JSON.stringify(study)} lead_status_id=${JSON.stringify(status)} removed=${JSON.stringify(removed)} branch_ids=${JSON.stringify(branches)} филиал=${hit!.branch}`,
    );
    assert.ok(
      inList,
      `Причина: лид 7759 не в /v2api/2/customer/index is_study=0 (${ids.length} шт, total=${listedTotal}). is_study=${JSON.stringify(study)} status=${JSON.stringify(status)} removed=${JSON.stringify(removed)} branch_ids=${JSON.stringify(branches)} филиал карточки=${hit!.branch}`,
    );
    assert.ok(packed, `Причина: запись отброшена. is_study=${JSON.stringify(study)} removed=${JSON.stringify(removed)}`);
    assert.equal(packed!.statusId, Number(status) > 0 ? Number(status) : 0);
  });
});
