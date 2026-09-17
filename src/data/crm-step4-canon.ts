/** Канон шага 4: тело pay/index и разбор ответа по карточке API. */

export function payIncomeCanon(raw: unknown): { has: boolean; value: number } {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { has: false, value: 0 };
    return { has: true, value: raw };
  }
  if (raw == null) return { has: false, value: 0 };
  const s = String(raw).trim();
  if (!s) return { has: false, value: 0 };
  if (/[₽,eE\s]/.test(s)) return { has: false, value: 0 };
  if (!/^\d+(?:\.\d+)?$/.test(s)) return { has: false, value: 0 };
  const n = Number(s);
  if (!Number.isFinite(n)) return { has: false, value: 0 };
  return { has: true, value: n };
}

export function payDocumentDateCanon(item: Record<string, unknown>): string {
  const raw = String(item.document_date ?? "").trim();
  if (!raw) return "";
  const dmy = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const ymd = raw.match(/^(\d{4})[.-](\d{2})[.-](\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  return "";
}

export function payIndexBody(p: {
  page: number;
  customerId: number;
  dateFromYmd: string;
  dateToYmd: string;
  payTypeId?: number;
  pageSize?: number;
}) {
  const body: Record<string, unknown> = {
    page: Math.max(0, Number(p.page) || 0),
    pageSize: Number(p.pageSize) || 500,
    customer_id: Number(p.customerId) || 0,
    date_from: p.dateFromYmd,
    date_to: p.dateToYmd,
  };
  const t = Number(p.payTypeId) || 0;
  if (t) body.pay_type_id = t;
  return body;
}

export function customerTariffPath(home: number, cid: number) {
  return `/v2api/${Number(home) || 1}/customer-tariff/index?customer_id=${Number(cid) || 0}`;
}

export function customerTariffBody(page: number) {
  return { page: Math.max(0, Number(page) || 0), pageSize: 500 };
}
