import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { serverEnv } from "./server-env";
import { SITE } from "./site";
import {
  nidPay,
  parseYooNotification,
  payInvoiceKind,
  rubAmount,
  shouldApplySucceeded,
  yooCreateBody,
  type PayInvoice,
} from "./pay-online-core";

export type { PayInvoice };
export { rubAmount, parseYooNotification, shouldApplySucceeded };

function fileOf() {
  return join(process.cwd(), "storage", "crm-pay-invoices.json");
}

type Store = { items: PayInvoice[] };

function load(): Store {
  try {
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Store;
    return { items: Array.isArray(raw.items) ? raw.items : [] };
  } catch {
    return { items: [] };
  }
}

function save(store: Store) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify({ items: store.items.slice(-2000) }, null, 0), "utf8");
}

export function yookassaCreds() {
  const shopId = serverEnv("YOOKASSA_SHOP_ID") || serverEnv("YANDEX_KASSA_SHOP_ID");
  const secret = serverEnv("YOOKASSA_SECRET_KEY") || serverEnv("YANDEX_KASSA_SECRET");
  return { shopId, secret };
}

export function yookassaReady() {
  const { shopId, secret } = yookassaCreds();
  return Boolean(shopId && secret);
}

async function yooRequest(path: string, init?: { method?: string; body?: unknown; idempotence?: string }) {
  const { shopId, secret } = yookassaCreds();
  if (!shopId || !secret) throw new Error("Нет ключей ЮKassa. API и интеграции → ЮKassa.");
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${shopId}:${secret}`).toString("base64")}`,
    "Content-Type": "application/json",
  };
  if (init?.idempotence) headers["Idempotence-Key"] = init.idempotence;
  const res = await fetch(`https://api.yookassa.ru/v3${path}`, {
    method: init?.method || "GET",
    headers,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(json.description || json.code || `ЮKassa ${res.status}`));
  }
  return json;
}

export async function createOnlinePay(opts: {
  customerId: number;
  branchId: number;
  amount: number;
  kind?: string;
  note?: string;
  child?: string;
}) {
  const customerId = Number(opts.customerId) || 0;
  const amount = Math.round(Math.abs(Number(opts.amount) || 0) * 100) / 100;
  if (!customerId) return { ok: false as const, error: "Нет customerId." };
  if (!amount) return { ok: false as const, error: "Укажите сумму." };
  if (!yookassaReady()) return { ok: false as const, error: "Вставьте ключи ЮKassa в «API и интеграции»." };
  const kind = payInvoiceKind(opts.kind);
  const id = nidPay();
  const note = String(opts.note || (kind === "product" ? "продажа товара" : "оплата на сайте")).slice(0, 180);
  const child = String(opts.child || "").trim();
  const description = `${SITE.shortName}${child ? ` · ${child}` : ""} · ${rubAmount(amount)} ₽`.slice(0, 128);
  const body = yooCreateBody({
    amount,
    returnUrl: `${SITE.domain}/pay?ok=1`,
    description,
    invoiceId: id,
    customerId,
    branchId: Number(opts.branchId) || 1,
    kind,
  });
  const yoo = await yooRequest("/payments", { method: "POST", body, idempotence: id });
  const confirmation = yoo.confirmation && typeof yoo.confirmation === "object" ? (yoo.confirmation as { confirmation_url?: string }) : {};
  const url = String(confirmation.confirmation_url || "");
  const invoice: PayInvoice = {
    id,
    customerId,
    branchId: Number(opts.branchId) || 1,
    amount,
    kind,
    note,
    status: String(yoo.status) === "canceled" ? "canceled" : "pending",
    yooId: String(yoo.id || ""),
    url,
    at: new Date().toISOString(),
  };
  const store = load();
  store.items.push(invoice);
  save(store);
  if (!url) return { ok: false as const, error: "ЮKassa не вернула ссылку на оплату." };
  return { ok: true as const, url, invoiceId: id, yooId: invoice.yooId };
}

export async function applyYooPayment(raw: unknown) {
  const note = parseYooNotification(raw);
  if (!note) return { ok: false as const, error: "Пустое уведомление ЮKassa." };
  if (note.status !== "succeeded" && note.event !== "payment.succeeded") {
    if (note.status === "canceled") {
      const store = load();
      const hit = store.items.find((x) => x.yooId === note.paymentId);
      if (hit && hit.status === "pending") {
        hit.status = "canceled";
        save(store);
      }
    }
    return { ok: true as const, ignored: true };
  }
  let paid: Record<string, unknown>;
  try {
    paid = await yooRequest(`/payments/${note.paymentId}`);
  } catch {
    return { ok: false as const, error: "ЮKassa не подтвердила платёж." };
  }
  if (String(paid.status) !== "succeeded") return { ok: true as const, ignored: true };
  const meta = paid.metadata && typeof paid.metadata === "object" ? (paid.metadata as Record<string, string>) : note.metadata;
  const amountRaw = paid.amount && typeof paid.amount === "object" ? Number((paid.amount as { value?: string }).value) : note.amount;
  const amount = Number(amountRaw) || note.amount;
  const store = load();
  let inv = store.items.find((x) => x.yooId === note.paymentId || x.id === String(meta.invoiceId || ""));
  if (inv && !shouldApplySucceeded(inv)) return { ok: true as const, duplicate: true, invoiceId: inv.id };
  const customerId = Number(inv?.customerId || meta.customerId) || 0;
  const branchId = Number(inv?.branchId || meta.branchId) || 1;
  if (!customerId) return { ok: false as const, error: "В платеже нет customerId." };
  const kind = payInvoiceKind(inv?.kind || meta.kind);
  const { appendPay, payEffect, customerBalance, ensureOpening } = await import("./crm-pay");
  const { findDossier, upsertDossier } = await import("./dossiers");
  const d = findDossier({ crmId: customerId });
  ensureOpening(customerId, Number(d?.branchId || branchId), d?.extras?.balance);
  const prev = customerBalance(customerId, d?.extras?.balance);
  const fx = payEffect(kind, amount, prev);
  const now = new Date();
  const ru = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
  const payNote = inv?.note || `ЮKassa ${note.paymentId}`;
  const pay = appendPay({
    customerId,
    branchId: Number(d?.branchId || branchId),
    kind,
    income: fx.income,
    expenditure: fx.expenditure,
    note: payNote,
    documentDate: ru,
  });
  upsertDossier({
    crmId: customerId,
    extras: { ...(d?.extras || {}), balance: String(fx.next) },
    source: "sync",
  } as never);
  const { enqueueExport } = await import("./crm-export-queue");
  enqueueExport({
    op: "pay.create",
    branchId: Number(d?.branchId || branchId),
    entityId: customerId,
    actor: "sync",
    body: {
      customer_id: customerId,
      document_date: ru,
      income: fx.income,
      expenditure: fx.expenditure,
      note: payNote,
      localId: pay.id,
      kind,
    },
  });
  if (!inv) {
    inv = {
      id: String(meta.invoiceId || nidPay()),
      customerId,
      branchId,
      amount,
      kind,
      note: payNote,
      status: "paid",
      yooId: note.paymentId,
      url: "",
      localPayId: pay.id,
      at: new Date().toISOString(),
      paidAt: new Date().toISOString(),
    };
    store.items.push(inv);
  } else {
    inv.status = "paid";
    inv.paidAt = new Date().toISOString();
    inv.localPayId = pay.id;
    inv.yooId = inv.yooId || note.paymentId;
  }
  save(store);
  try {
    const { logAdmin } = await import("./admin-settings");
    logAdmin(`ЮKassa ${rubAmount(amount)} ₽ клиент ${customerId} → диск и очередь Alfa`, "sync");
  } catch {
    /* журнал */
  }
  if (kind !== "product") {
    void import("./funnel-auto").then((m) =>
      m.applyFunnelAuto("tariff", {
        customerId,
        branchId,
        isStudy: Number(d?.extras?.is_study),
        statusId: Number(d?.extras?.lead_status_id || 0),
      }),
    );
  }
  return { ok: true as const, invoiceId: inv.id, payId: pay.id, queued: true };
}
