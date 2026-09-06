/** Разовый тест кассы: только Чуднова Александра, 1 ₽ наличные и карта. */

export const PAY_TEST_ID = "2026-09-06-chudnova-1rub";
export const PAY_TEST_NAME = "Чуднова Александра";
export const PAY_TEST_PHONE = "89163389392";

export function isChudnovaAlexandra(name: string) {
  const n = String(name || "").toLowerCase().replace(/ё/g, "е");
  if (!n.includes("чуднов")) return false;
  if (n.includes("ольга")) return false;
  return /александр/.test(n);
}

export function planChudnovaPays(customerId: number, branchId: number, date: string) {
  const id = Number(customerId) || 0;
  const branch = Number(branchId) || 1;
  if (!id) return [];
  return [
    { payMethod: "cash" as const, label: "наличные" },
    { payMethod: "card" as const, label: "карта" },
  ].map((m) => ({
    customerId: id,
    branchId: branch,
    amount: 1,
    payMethod: m.payMethod,
    note: `тест rastudio.org 1 ₽ ${m.label} · ${PAY_TEST_NAME}`,
    documentDate: date,
  }));
}
