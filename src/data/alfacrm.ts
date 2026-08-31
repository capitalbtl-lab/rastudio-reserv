const HOST = () => (process.env.ALFACRM_HOST || "https://studiyarazvivaysya.s20.online").replace(/\/$/, "");
const EMAIL = () => process.env.ALFACRM_EMAIL || "";
const API_KEY = () => process.env.ALFACRM_API_KEY || "";

const SOURCE_SITE = 2;
const STATUS_NEW = 1;
const PIPELINE = 1;
const BRANCHES = [1, 2, 3];

type TokenCache = { token: string; exp: number };
let cache: TokenCache | null = null;
let lastAt = 0;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function throttle() {
  const wait = 220 - (Date.now() - lastAt);
  if (wait > 0) await sleep(wait);
  lastAt = Date.now();
}

export function formatRuPhone(raw: string) {
  let d = raw.replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("9")) d = `7${d}`;
  if (d.length === 11 && d.startsWith("8")) d = `7${d.slice(1)}`;
  if (d.length === 11 && d.startsWith("7")) {
    return `+7(${d.slice(1, 4)})${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
  }
  return raw.trim();
}

export async function request<T>(path: string, body: unknown, tok?: string): Promise<T> {
  await throttle();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (tok) headers["X-ALFACRM-TOKEN"] = tok;
  const res = await fetch(`${HOST()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { message: text.slice(0, 200) };
  }
  if (!res.ok) {
    throw new Error(`alfacrm ${res.status} ${path}`);
  }
  return json as T;
}

export async function token() {
  if (cache && cache.exp > Date.now()) return cache.token;
  const email = EMAIL();
  const apiKey = API_KEY();
  if (!email || !apiKey) throw new Error("no-alfacrm");
  const json = await request<{ token?: string }>("/v2api/auth/login", { email, api_key: apiKey });
  if (!json.token) throw new Error("no-alfacrm-token");
  cache = { token: json.token, exp: Date.now() + 50 * 60 * 1000 };
  return json.token;
}

type Customer = {
  id: number;
  name?: string;
  note?: string | null;
  is_study?: number;
};

async function findByPhone(phone: string): Promise<{ branch: number; customer: Customer } | null> {
  const t = await token();
  for (const branch of BRANCHES) {
    const data = await request<{ items?: Customer[] }>(`/v2api/${branch}/customer/index`, {
      page: 0,
      pageSize: 5,
      phone,
    }, t);
    const hit = data.items?.[0];
    if (hit?.id) return { branch, customer: hit };
  }
  return null;
}

export type AlfaLead = {
  parent: string;
  child: string;
  phone: string;
  email?: string;
  dobRu?: string;
  branchId: string;
  courseName?: string;
  gid?: string;
  groupName?: string;
  kind?: "trial" | "group" | "consult";
};

export async function upsertAlfaLead(lead: AlfaLead) {
  const phone = formatRuPhone(lead.phone);
  const branch = Number(lead.branchId) || 2;
  const kind = lead.kind === "group" ? "запись в группу" : lead.kind === "consult" ? "консультация" : "пробное";
  const noteLine = [
    "Источник: ИИ-администратор rastudio.org",
    `Родитель: ${lead.parent}`,
    `Курс: ${lead.courseName || "не указан"}`,
    lead.groupName ? `Группа: ${lead.groupName}` : "",
    lead.gid ? `gid=${lead.gid}` : "",
    `Тип: ${kind}, филиал ${branch}`,
  ]
    .filter(Boolean)
    .join("\n");
  const t = await token();
  const existing = await findByPhone(phone);
  const groupIds = lead.gid && /^\d+$/.test(lead.gid) ? [Number(lead.gid)] : undefined;
  const taskText = `Сайт rastudio.org: ${kind}. ${lead.child || lead.parent}${lead.courseName ? `, ${lead.courseName}` : ""}${lead.gid ? `, группа ${lead.gid}` : ""}. Лид уже в CRM — не обязательно перезванивать.`;
  if (existing) {
    const prev = existing.customer.note ? `${existing.customer.note}\n\n` : "";
    const upd = await request<{ success?: boolean; errors?: unknown; model?: Customer }>(
      `/v2api/${existing.branch}/customer/update?id=${existing.customer.id}`,
      {
        id: existing.customer.id,
        legal_type: 1,
        ...(lead.email ? { email: [lead.email] } : {}),
        note: `${prev}${noteLine}`,
        ...(groupIds ? { group_ids: groupIds } : {}),
      },
      t,
    );
    if (upd.success === false) throw new Error(`alfacrm-update ${JSON.stringify(upd.errors || upd)}`);
    await request(`/v2api/${existing.branch}/task/create`, {
      customer_id: existing.customer.id,
      text: taskText,
    }, t).catch(() => null);
    return { ok: true as const, id: existing.customer.id, duplicate: true, branch: existing.branch };
  }
  const created = await request<{ success?: boolean; errors?: unknown; model?: Customer }>(
    `/v2api/${branch}/customer/create`,
    {
      name: lead.child || lead.parent,
      legal_name: lead.parent,
      legal_type: 1,
      phone: [phone],
      ...(lead.email ? { email: [lead.email] } : {}),
      ...(lead.dobRu ? { dob: lead.dobRu } : {}),
      is_study: 0,
      lead_source_id: SOURCE_SITE,
      lead_status_id: STATUS_NEW,
      pipeline_id: PIPELINE,
      branch_ids: [branch],
      note: noteLine,
      ...(groupIds ? { group_ids: groupIds } : {}),
    },
    t,
  );
  const id = created.model?.id;
  if (created.success === false || !id) {
    throw new Error(`alfacrm-create ${JSON.stringify(created.errors || created)}`);
  }
  await request(`/v2api/${branch}/task/create`, {
    customer_id: id,
    text: taskText,
  }, t).catch(() => null);
  return { ok: true as const, id, duplicate: false, branch };
}
