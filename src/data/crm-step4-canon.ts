/** Канон шага 4: разбор ответа Pay по карточке API. Очередь и штампы A/B здесь не живут. */

export { payIncomeCanon, payDocumentDateCanon, alfaPayIndexDate, PAY_INBOUND_EXTRA_TYPES, PAY_INBOUND_PAGE } from "./crm-pay-core";

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
