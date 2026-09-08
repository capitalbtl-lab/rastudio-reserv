/** Поля кассы как в модалке Alfa «Добавить доход». Локация = филиал: 1 Гражданская, 2 ЦМИТ, 3 Луховицы, 4 Лето. */

export const ALFA_PAY_BRANCHES = [1, 2, 3, 4] as const;

export const ALFA_PAY_ACCOUNTS = [{ id: 1, name: "Основная касса" }] as const;

export const ALFA_PAY_ITEMS = [
  { id: 2, name: "Групповые занятия", group: "Услуги Студии", branches: [1, 2, 3] },
  { id: 24, name: "Дополнительные занятия", group: "Услуги Студии", branches: [1, 2, 3] },
  { id: 22, name: "Вводные занятия", group: "Услуги Студии", branches: [1, 2, 3] },
  { id: 23, name: "Пробные занятия", group: "Услуги Студии", branches: [1, 2, 3, 4] },
  { id: 9, name: "Мастер-класс", group: "Услуги Студии", branches: [1, 2, 3, 4] },
  { id: 10, name: "Массовое мероприятие", group: "Услуги Студии", branches: [1, 2, 3, 4] },
  { id: 11, name: "Летняя программа (дневное пребывание)", group: "Услуги Агентства", branches: [4] },
  { id: 19, name: "Продлёнка", group: "Услуги Агентства", branches: [4] },
] as const;

/** Только пары из справочника локаций Alfa (id = филиал). */
export const ALFA_PAY_LOCATIONS: { id: number; branchId: number; name: string }[] = [
  { id: 1, branchId: 1, name: 'Студия "Развивайся" (г.Коломна, ул.Гражданская, д.2)' },
  { id: 2, branchId: 2, name: 'ЦМИТ "Развивайся" (г.Коломна, ул.Окт.Революции, д.340)' },
  { id: 3, branchId: 3, name: 'Студия "Развивайся" (г.Луховицы, ул.Пушкина, д.202А)' },
  { id: 4, branchId: 4, name: 'Летние программы от Студии "Развивайся"' },
];

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

export function locationsOfBranch(branchId: number) {
  const b = Number(branchId) || 0;
  return ALFA_PAY_LOCATIONS.filter((x) => x.branchId === b);
}

export function locationIdForBranch(branchId: number) {
  const hit = locationsOfBranch(branchId).find((x) => x.id > 0);
  return hit?.id || 0;
}

export function locationBelongsToBranch(locationId: number, branchId: number) {
  const loc = Number(locationId) || 0;
  const b = Number(branchId) || 0;
  if (!loc || !b) return false;
  return ALFA_PAY_LOCATIONS.some((x) => x.id === loc && x.branchId === b);
}

export function defaultPayItemId(branchId: number) {
  return Number(branchId) === 4 ? 11 : 2;
}

export function payItemGroups(branchId?: number) {
  const b = Number(branchId) || 0;
  const map = new Map<string, { value: string; label: string }[]>();
  for (const it of ALFA_PAY_ITEMS) {
    if (b && it.branches.length && !it.branches.includes(b as 1 | 2 | 3 | 4)) continue;
    const list = map.get(it.group) || [];
    list.push({ value: String(it.id), label: it.name });
    map.set(it.group, list);
  }
  if (!map.size) {
    for (const it of ALFA_PAY_ITEMS) {
      const list = map.get(it.group) || [];
      list.push({ value: String(it.id), label: it.name });
      map.set(it.group, list);
    }
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

function ruPayDate(raw: unknown) {
  const s = String(raw || "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (ru) return `${ru[1].padStart(2, "0")}.${ru[2].padStart(2, "0")}.${ru[3]}`;
  return s;
}

function payTypeId(kind: string, income: number, expenditure: number) {
  if (kind === "product") return 2;
  if (kind === "refund") return 3;
  if (kind === "correct") return 6;
  if (expenditure && !income) return 3;
  return 1;
}

/** Тело v2api/{branch}/pay/create: только поля этого филиала.
 *  ctt_id −1 в форме Alfa = «Базовый счет». В API такого id нет — не шлём. */
export function packAlfaPayCreate(input: {
  customerId: number;
  branchId?: number;
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
  const branchId = num(input.branchId) || 1;
  const kind = str(input.kind) || "income";
  const income = Number(input.income) || 0;
  const expenditure = Number(input.expenditure) || 0;
  const body: Record<string, unknown> = {
    branch_id: branchId,
    document_date: ruPayDate(input.documentDate),
    income,
    expenditure,
    note: str(input.note),
    localId: Number.isFinite(Number(input.localId)) ? Number(input.localId) : 0,
    kind,
    pay_type_id: payTypeId(kind, income, expenditure),
  };
  const customer = num(input.customerId);
  if (customer) body.customer_id = customer;
  body.pay_account_id = num(input.payAccountId) || 1;
  const item = num(input.payItemId) || defaultPayItemId(branchId);
  if (item) body.pay_item_id = item;
  const loc = num(input.locationId) || locationIdForBranch(branchId);
  if (loc && locationBelongsToBranch(loc, branchId)) body.location_id = loc;
  const manager = num(input.managerId);
  if (manager) body.manager_id = manager;
  const ctt = Number(input.cttId);
  if (Number.isFinite(ctt) && ctt > 0) body.ctt_id = ctt;
  const contract = num(input.contractId);
  if (contract) body.customer_contract_id = contract;
  const payer = str(input.payerName);
  if (payer) body.payer_name = payer.slice(0, 2000);
  const group = num(input.groupId);
  if (group) body.group_id = group;
  const method = str(input.payMethod);
  if (method === "cash" || method === "card" || method === "transfer") {
    const names: Record<string, string> = { cash: "Наличные", card: "Карта", transfer: "Перевод" };
    body.note = [body.note, names[method]].filter(Boolean).join(". ").slice(0, 2000);
  }
  return body;
}

