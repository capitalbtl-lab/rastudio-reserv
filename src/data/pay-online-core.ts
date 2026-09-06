/** Онлайн-оплата: ЮKassa → диск → очередь Alfa pay.create. */

export type PayInvoiceStatus = "pending" | "paid" | "canceled";

export type PayInvoice = {
  id: string;
  customerId: number;
  branchId: number;
  amount: number;
  kind: "income" | "product";
  note: string;
  status: PayInvoiceStatus;
  yooId: string;
  url: string;
  localPayId?: number;
  at: string;
  paidAt?: string;
};

export function nidPay() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function rubAmount(n: number) {
  return (Math.round(Math.abs(Number(n) || 0) * 100) / 100).toFixed(2);
}

export function payInvoiceKind(raw?: string | null): "income" | "product" {
  return raw === "product" ? "product" : "income";
}

export function shouldApplySucceeded(inv?: { status?: string } | null) {
  if (!inv) return true;
  return inv.status === "pending";
}

export function parseYooNotification(raw: unknown): {
  event: string;
  paymentId: string;
  status: string;
  amount: number;
  metadata: Record<string, string>;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const ev = raw as { event?: string; type?: string; object?: Record<string, unknown> };
  const obj = ev.object && typeof ev.object === "object" ? ev.object : (raw as Record<string, unknown>);
  const id = String(obj.id || "");
  if (!id) return null;
  const amountRaw = obj.amount && typeof obj.amount === "object" ? (obj.amount as { value?: string }) : null;
  const metaIn = obj.metadata && typeof obj.metadata === "object" ? (obj.metadata as Record<string, unknown>) : {};
  const metadata: Record<string, string> = {};
  for (const [k, v] of Object.entries(metaIn)) metadata[k] = String(v ?? "");
  return {
    event: String(ev.event || ev.type || ""),
    paymentId: id,
    status: String(obj.status || ""),
    amount: Number(amountRaw?.value || 0) || 0,
    metadata,
  };
}

export function yooCreateBody(opts: {
  amount: number;
  returnUrl: string;
  description: string;
  invoiceId: string;
  customerId: number;
  branchId: number;
  kind: string;
}) {
  return {
    amount: { value: rubAmount(opts.amount), currency: "RUB" },
    capture: true,
    confirmation: { type: "redirect", return_url: opts.returnUrl },
    description: opts.description.slice(0, 128),
    metadata: {
      invoiceId: opts.invoiceId,
      customerId: String(opts.customerId),
      branchId: String(opts.branchId),
      kind: opts.kind,
    },
  };
}
