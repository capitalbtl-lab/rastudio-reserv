export function packCardTariff(it: Record<string, unknown>, catalog?: CatalogTariff[]) {
  const live = tariffRowLive(it);
  return {
    id: Number(it.id) || 0,
    tariffId: Number(it.tariff_id || it.tariffId || 0) || undefined,
    name: customerTariffLabel(it, catalog),
    rest: Number(it.balance ?? it.rest ?? 0) || 0,
    lessons: Number(it.lesson_count ?? it.lessons_count ?? it.paid_count ?? 0) || 0,
    archived: !live,
    bDate: String(it.b_date || it.bDate || ""),
    eDate: String(it.e_date || it.eDate || ""),
    price: Number(it.price || 0) || 0,
  };
}

export function parseDossierCtt(extras?: Record<string, string> | null) {
  try {
    const raw = JSON.parse(String(extras?.ctt || "[]")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((row) => {
        const it = row as Record<string, unknown>;
        const id = Number(it.id || 0);
        if (!id) return null;
        return {
          id,
          tariffId: Number(it.tariffId || it.tariff_id || 0) || undefined,
          name: String(it.name || "абонемент"),
          rest: Number(it.rest || 0) || 0,
          lessons: Number(it.lessons || 0) || 0,
          archived: Boolean(it.archived),
          bDate: String(it.bDate || it.b_date || ""),
          eDate: String(it.eDate || it.e_date || ""),
          price: Number(it.price || 0) || 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  } catch {
    return [];
  }
}

export function isPaidCountLabel(raw?: string) {
  return /занятий по абонементу|оплачено до/i.test(String(raw || ""));
}

/** Один ученик: строки customer-tariff на диск. */
export async function pullCustomerTariffs(branchId: number, customerId: number) {
  const cid = Number(customerId) || 0;
  const branch = Number(branchId) || 1;
  if (!cid) return [];
  const { request, token } = await import("./alfacrm");
  const { crmUnwrapIndex } = await import("./crm-leads-stages");
  const { loadTariffs } = await import("./crm-tariffs");
  const t = await token();
  const json = await request(customerTariffIndexPath(branch, cid), { page: 0, pageSize: 50, customer_id: cid }, t).catch(
    () => ({}),
  );
  const catalog = loadTariffs().items.map((x) => ({ id: x.id, name: x.name, archive: x.archive, price: x.price }));
  const rows = crmUnwrapIndex(json).items.filter((it) => Number(it.id) && (!tariffRowCustomerId(it) || tariffRowCustomerId(it) === cid)).map((it) => packCardTariff(it, catalog));
  const { stampDossierCtt } = await import("./dossiers");
  stampDossierCtt(cid, rows, branch);
  return rows;
}