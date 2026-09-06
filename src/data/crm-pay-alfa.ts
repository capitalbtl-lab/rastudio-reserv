/** Поля кассы как в модалке Alfa «Добавить доход» (филиал 1, 06.09.2026). */

export const ALFA_PAY_ACCOUNTS = [{ id: 1, name: "Основная касса" }] as const;

export const ALFA_PAY_ITEMS = [
  { id: 2, name: "Групповые занятия", group: "Услуги Студии" },
  { id: 24, name: "Дополнительные занятия", group: "Услуги Студии" },
  { id: 22, name: "Вводные занятия", group: "Услуги Студии" },
  { id: 23, name: "Пробные занятия", group: "Услуги Студии" },
  { id: 9, name: "Мастер-класс", group: "Услуги Студии" },
  { id: 10, name: "Массовое мероприятие", group: "Услуги Студии" },
  { id: 11, name: "Летняя программа (дневное пребывание)", group: "Услуги Агентства" },
  { id: 19, name: "Продлёнка", group: "Услуги Агентства" },
] as const;

export const ALFA_PAY_LOCATIONS = [
  { id: 1, name: 'Студия "Развивайся" (г.Коломна, ул.Гражданская, д.2)', branchId: 1 },
] as const;

export const ALFA_PAY_MANAGERS = [
  { id: 501, name: "Администратор Ресепшн" },
  { id: 1346, name: "Владимир" },
  { id: 1377, name: "ИИ-консультанты Олег и Ольга" },
  { id: 634, name: "Распопова Татьяна Николаевна" },
  { id: 205, name: "Чуднова Ольга Сергеевна" },
  { id: 2, name: "Шевцов Олег Алексеевич" },
] as const;

export const ALFA_PAY_METHODS = [
  { id: "", name: "Не задано" },
  { id: "cash", name: "Наличные" },
  { id: "card", name: "Карта" },
  { id: "transfer", name: "Перевод" },
] as const;

export function locationIdForBranch(branchId: number) {
  return ALFA_PAY_LOCATIONS.find((x) => x.branchId === Number(branchId))?.id || 0;
}

export function payItemGroups() {
  const map = new Map<string, { value: string; label: string }[]>();
  for (const it of ALFA_PAY_ITEMS) {
    const list = map.get(it.group) || [];
    list.push({ value: String(it.id), label: it.name });
    map.set(it.group, list);
  }
  return [...map.entries()].map(([label, options]) => ({ label, options }));
}

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) && n ? n : 0;
}

function str(v: unknown) {
  return String(v || "").trim();
}

/** Тело v2api pay/create: только заполненные поля модалки Alfa. */
export function packAlfaPayCreate(input: {
  customerId: number;
  documentDate: string;
  income: number;
  expenditure: number;
  note: string;
  localId: number;
  kind: string;
  payAccountId?: number;
  payItemId?: number;
  locationId?: number;
  managerId?: number;
  cttId?: number;
  contractId?: number;
  payerName?: string;
  groupId?: number;
  payMethod?: string;
}) {
  const body: Record<string, unknown> = {
    customer_id: num(input.customerId),
    document_date: str(input.documentDate),
    income: Number(input.income) || 0,
    expenditure: Number(input.expenditure) || 0,
    note: str(input.note),
    localId: num(input.localId),
    kind: str(input.kind) || "income",
  };
  const account = num(input.payAccountId) || 1;
  body.pay_account_id = account;
  const item = num(input.payItemId);
  if (item) body.pay_item_id = item;
  const loc = num(input.locationId);
  if (loc) body.location_id = loc;
  const manager = num(input.managerId);
  if (manager) body.manager_id = manager;
  const ctt = num(input.cttId);
  if (ctt) body.ctt_id = ctt;
  const contract = num(input.contractId);
  if (contract) body.customer_contract_id = contract;
  const payer = str(input.payerName);
  if (payer) body.payer_name = payer.slice(0, 2000);
  const group = num(input.groupId);
  if (group) body.group_id = group;
  const method = str(input.payMethod);
  if (method && method !== "cash" && method !== "card" && method !== "transfer") {
    /* неизвестный код не шлём */
  } else if (method) {
    const names: Record<string, string> = { cash: "Наличные", card: "Карта", transfer: "Перевод" };
    body.note = [body.note, names[method]].filter(Boolean).join(". ").slice(0, 2000);
  }
  return body;
}
