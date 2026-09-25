/** Шаг 7. Архивные клиенты, которых нет в живых группах. Касса — тот же проход, что шаг 6. */

import { request, token as alfaToken, dropAlfaIndex } from "./alfacrm";
import { crmUnwrapIndex, crmIndexAccumTotal, crmIndexShouldStop } from "./crm-leads-stages";
import { replaceStep7List } from "./crm-leads";
import { liveAdminGroups } from "./crm-journal-pull";
import { dossiersInGroup } from "./dossiers";
import { step7Keep } from "./crm-step7-core";
import { recheckStep7Cash } from "./crm-step6";
import type { LeadCard } from "./crm-leads-stages";

export { recheckStep7Cash };

const PAGE = 100;
const BRANCHES = [1, 2, 3, 4];

function liveIds() {
  const ids = new Set<number>();
  for (const g of liveAdminGroups()) {
    for (const d of dossiersInGroup(g.branchId, g.groupId)) {
      const cid = Number(d.crmId) || 0;
      if (!cid) continue;
      const link = (d.groupLinks || []).find((x) => Number(x.id) === g.groupId);
      if (link && link.active === false) continue;
      ids.add(cid);
    }
  }
  return ids;
}

async function readPages(path: string, body: Record<string, unknown>, tok: string) {
  const items: Record<string, unknown>[] = [];
  let loaded = 0;
  let total = Number.POSITIVE_INFINITY;
  for (let page = 0; page < 200; page += 1) {
    const json = await request<unknown>(path, { ...body, page, pageSize: PAGE }, tok);
    const pack = crmUnwrapIndex(json);
    const batch = pack.items;
    const count = Number.isFinite(Number(pack.count)) ? Number(pack.count) : batch.length;
    total = crmIndexAccumTotal(page, PAGE, batch.length, pack.total, total);
    if (count === 0 || batch.length === 0) return items;
    items.push(...batch);
    loaded += count || batch.length;
    if (crmIndexShouldStop(PAGE, batch.length, pack.count, loaded, total)) return items;
  }
  throw new Error("список не кончился");
}

export async function syncStep7List() {
  dropAlfaIndex();
  const tok = await alfaToken();
  const live = liveIds();
  const byId = new Map<number, LeadCard>();
  const notes: string[] = [];
  let dropped = 0;
  for (const branch of BRANCHES) {
    try {
      const rows = await readPages(`/v2api/${branch}/customer/index`, { is_study: 1, removed: 2 }, tok);
      let n = 0;
      for (const row of rows) {
        if (!step7Keep(row, live)) {
          if (live.has(Number(row.id))) dropped += 1;
          continue;
        }
        const id = Number(row.id);
        if (byId.has(id)) continue;
        byId.set(id, {
          id,
          customerId: id,
          branchId: branch,
          branches: [branch],
          name: String(row.name || "").trim() || `клиент ${id}`,
          age: "",
          phone: "",
          email: "",
          note: "",
          assigned: "",
          statusId: 0,
          at: new Date().toISOString(),
          chats: 0,
          cashState: "wait",
        });
        n += 1;
      }
      notes.push(`${branch}: ${n}`);
    } catch (e) {
      notes.push(`${branch}: ${e instanceof Error ? e.message : "обрыв"}`);
    }
  }
  const board = replaceStep7List([...byId.values()]);
  return { ok: true as const, note: `Шаг 7 · архив ${board.items.length} · в живых группах снято ${dropped} · ${notes.join(" · ")}` };
}
