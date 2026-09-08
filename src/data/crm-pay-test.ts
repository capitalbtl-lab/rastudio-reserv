import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { logAdmin } from "./admin-settings";
import { defaultPayItemId, locationIdForBranch, packAlfaPayCreate } from "./crm-pay-alfa";
import { PAY_TEST_ID, PAY_TEST_NAME, PAY_TEST_PHONE, isChudnovaAlexandra, planChudnovaPays } from "./crm-pay-test-core";
import { formatRuPhone } from "./ru-phone";

const g = globalThis as { __raPayTest?: boolean };

function markFile() {
  return join(process.cwd(), "storage", "crm-pay-test.json");
}

function loadMark() {
  try {
    if (!existsSync(markFile())) return { done: "" };
    return JSON.parse(readFileSync(markFile(), "utf8")) as { done?: string; at?: string; note?: string };
  } catch {
    return { done: "" };
  }
}

function saveMark(row: { done: string; at: string; note: string }) {
  mkdirSync(dirname(markFile()), { recursive: true });
  writeFileSync(markFile(), JSON.stringify(row, null, 0), "utf8");
}

function ruToday() {
  const n = new Date();
  return `${String(n.getDate()).padStart(2, "0")}.${String(n.getMonth() + 1).padStart(2, "0")}.${n.getFullYear()}`;
}

async function findChudnova(
  request: typeof import("./alfacrm").request,
  t: string,
): Promise<{ id: number; branchId: number; name: string } | null> {
  const phone = formatRuPhone(PAY_TEST_PHONE).replace(/\D/g, "") || "79163389392";
  for (const branch of [1, 2, 3, 4]) {
    const tries = [
      { page: 0, pageSize: 50, name: PAY_TEST_NAME },
      { page: 0, pageSize: 50, name: "Чуднова" },
      { page: 0, pageSize: 50, phone },
    ];
    for (const body of tries) {
      const json = await request<{ items?: { id?: number; name?: string; is_study?: number }[] }>(
        `/v2api/${branch}/customer/index`,
        body,
        t,
      ).catch(() => ({ items: [] as { id?: number; name?: string }[] }));
      const hit = (json.items || []).find((x) => isChudnovaAlexandra(String(x.name || "")) && Number(x.id));
      if (hit?.id) return { id: Number(hit.id), branchId: branch, name: String(hit.name || PAY_TEST_NAME) };
    }
  }
  return null;
}

export async function maybeRunChudnovaPayTest() {
  if (g.__raPayTest) return { skipped: "busy" as const };
  const mark = loadMark();
  const { localPaysPending } = await import("./crm-pay");
  const stuck = localPaysPending().filter((x) => /тест rastudio\.org/.test(String(x.note || "")));
  if (mark.done === PAY_TEST_ID && !stuck.length) return { skipped: "done" as const };
  g.__raPayTest = true;
  try {
    const { token, request } = await import("./alfacrm");
    const t = await token();
    const who = await findChudnova(request, t);
    if (!who) {
      saveMark({ done: "", at: new Date().toISOString(), note: "не нашла Чуднову Александру" });
      logAdmin("Тест кассы: Чуднову Александру в Alfa не нашла", "sync");
      g.__raPayTest = false;
      return { ok: false as const, error: "нет клиента" };
    }
    const { appendPay, flushLocalPaysToAlfa } = await import("./crm-pay");
    const { enqueueExport, tickExportQueue } = await import("./crm-export-queue");
    const date = ruToday();
    const jobs = stuck.length ? [] : planChudnovaPays(who.id, who.branchId, date);
    const ids: number[] = stuck.map((x) => Number(x.id));
    for (const row of jobs) {
      const pay = appendPay({
        customerId: row.customerId,
        branchId: row.branchId,
        kind: "income",
        income: row.amount,
        expenditure: 0,
        note: row.note,
        documentDate: row.documentDate,
      });
      ids.push(pay.id);
      enqueueExport({
        op: "pay.create",
        branchId: row.branchId,
        entityId: row.customerId,
        body: packAlfaPayCreate({
          customerId: row.customerId,
          branchId: row.branchId,
          documentDate: row.documentDate,
          income: row.amount,
          expenditure: 0,
          note: row.note,
          localId: pay.id,
          kind: "income",
          payAccountId: 1,
          payItemId: defaultPayItemId(row.branchId),
          locationId: locationIdForBranch(row.branchId),
          payMethod: row.payMethod,
          payerName: PAY_TEST_NAME,
        }),
      });
    }
    await tickExportQueue(4, "pay.create", { lean: true });
    const flush = await flushLocalPaysToAlfa();
    const left = localPaysPending().filter((x) => /тест rastudio\.org/.test(String(x.note || "")) || ids.includes(Number(x.id)));
    saveMark({
      done: left.length ? "" : PAY_TEST_ID,
      at: new Date().toISOString(),
      note: `${who.name} #${who.id} филиал ${who.branchId} · ${ids.length} шт.${left.length ? ` · ждут Alfa ${left.map((x) => x.id).join(",")}` : ""}`,
    });
    logAdmin(`Тест кассы: ${who.name} #${who.id} филиал ${who.branchId} · 1 ₽ наличные и карта${left.length ? " · ещё на диске" : ""}`, "sync");
    g.__raPayTest = false;
    return { ok: true as const, customerId: who.id, branchId: who.branchId, name: who.name, pays: ids, left: left.length, flush };
  } catch (e) {
    g.__raPayTest = false;
    const msg = e instanceof Error ? e.message : "тест кассы";
    if (/no-alfacrm/.test(msg)) return { skipped: "no-alfacrm" as const };
    logAdmin(`Тест кассы: ${msg}`, "sync");
    return { ok: false as const, error: msg };
  }
}
