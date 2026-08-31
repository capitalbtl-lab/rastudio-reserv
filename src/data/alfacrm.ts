const HOST = () => (process.env.ALFACRM_HOST || "https://studiyarazvivaysya.s20.online").replace(/\/$/, "");
const EMAIL = () => process.env.ALFACRM_EMAIL || "";
const API_KEY = () => process.env.ALFACRM_API_KEY || "";

const SOURCE_SITE = 2;
const STATUS_NEW = 1;
const PIPELINE = 1;
const BRANCHES = [1, 2, 3, 4];
const LESSON_TRIAL = 3;

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

export function formatRuDob(raw?: string) {
  const s = String(raw || "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const ru = s.match(/^(\d{1,2})[.](\d{1,2})[.](\d{4})$/);
  if (ru) return `${ru[1].padStart(2, "0")}.${ru[2].padStart(2, "0")}.${ru[3]}`;
  return s;
}

export function leadUrl(branch: number, id: number) {
  return `https://studiyarazvivaysya.s20.online/company/${branch}/lead/view?id=${id}`;
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
    throw new Error(`alfacrm ${res.status} ${path} ${text.slice(0, 240)}`);
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

type Regular = {
  id?: number;
  related_id?: number | null;
  subject_id?: number;
  day?: number;
  time_from_v?: string;
  time_to_v?: string;
  teacher_ids?: number[];
  room_id?: number;
};

function moscowParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    day: map[parts.weekday] || 1,
    date: `${parts.day}.${parts.month}.${parts.year}`,
  };
}

function nextDateForCrmDay(crmDay: number) {
  const now = moscowParts();
  let add = (Number(crmDay) - now.day + 7) % 7;
  if (add === 0) add = 7;
  const ms = Date.now() + add * 86400000;
  return moscowParts(new Date(ms)).date;
}

function durationOf(from?: string, to?: string, fallback = 90) {
  const a = String(from || "").split(":");
  const b = String(to || "").split(":");
  if (a.length < 2 || b.length < 2) return fallback;
  const mins = Number(b[0]) * 60 + Number(b[1]) - (Number(a[0]) * 60 + Number(a[1]));
  return mins > 0 && mins <= 240 ? mins : fallback;
}

async function findByPhone(phone: string): Promise<{ branch: number; customer: Customer } | null> {
  const t = await token();
  const variants = [phone, phone.replace(/\D/g, "")];
  for (const branch of BRANCHES) {
    for (const q of variants) {
      const data = await request<{ items?: Customer[] }>(
        `/v2api/${branch}/customer/index`,
        { page: 0, pageSize: 5, phone: q },
        t,
      );
      const hit = data.items?.[0];
      if (hit?.id) return { branch, customer: hit };
    }
  }
  return null;
}

async function slotFromGid(branch: number, gid: number, t: string): Promise<Regular | null> {
  const res = await request<{ items?: Regular[] }>(
    `/v2api/${branch}/regular-lesson/index`,
    { page: 0, pageSize: 200 },
    t,
  );
  const list = res.items || [];
  return list.find((item) => Number(item.related_id) === gid) || null;
}

async function createTrialLesson(opts: {
  branch: number;
  customerId: number;
  subjectId?: number;
  gid?: string;
  date?: string;
  time?: string;
  duration?: number;
  note?: string;
}) {
  const t = await token();
  let subjectId = Number(opts.subjectId) || 0;
  let date = formatRuDob(opts.date);
  let time = String(opts.time || "").replace(".", ":").slice(0, 5);
  let duration = Number(opts.duration) || 90;
  let teacherIds: number[] = [];
  let roomId: number | undefined;
  const gid = opts.gid && /^\d+$/.test(opts.gid) ? Number(opts.gid) : 0;
  if (gid) {
    const slot = await slotFromGid(opts.branch, gid, t).catch(() => null);
    if (slot) {
      if (!subjectId) subjectId = Number(slot.subject_id) || 0;
      if (!time) time = String(slot.time_from_v || "").slice(0, 5);
      duration = durationOf(slot.time_from_v, slot.time_to_v, duration);
      if (!date && slot.day) date = nextDateForCrmDay(Number(slot.day));
      teacherIds = slot.teacher_ids || [];
      if (slot.room_id) roomId = slot.room_id;
    }
  }
  if (!date) date = nextDateForCrmDay(moscowParts().day === 7 ? 1 : moscowParts().day + 1);
  if (!time) time = "16:00";
  if (!subjectId) return { ok: false as const, error: "no-subject" };
  const created = await request<{ success?: boolean; errors?: unknown; model?: { id?: number } }>(
    `/v2api/${opts.branch}/lesson/create`,
    {
      lesson_type_id: LESSON_TRIAL,
      lesson_date: date,
      time_from: time,
      duration,
      subject_id: subjectId,
      customer_ids: [opts.customerId],
      ...(teacherIds.length ? { teacher_ids: teacherIds } : {}),
      ...(roomId ? { room_id: roomId } : {}),
      note: opts.note || "Пробное с сайта rastudio.org",
    },
    t,
  );
  const id = created.model?.id;
  if (created.success === false || !id) {
    throw new Error(`alfacrm-lesson ${JSON.stringify(created.errors || created)}`);
  }
  return { ok: true as const, id, date, time, duration };
}

export type AlfaLead = {
  parent: string;
  child: string;
  phone: string;
  email?: string;
  dobRu?: string;
  branchId: string;
  courseName?: string;
  courseId?: string;
  gid?: string;
  groupName?: string;
  kind?: "trial" | "group" | "consult";
  date?: string;
  time?: string;
  duration?: number;
};

export async function upsertAlfaLead(lead: AlfaLead) {
  const phone = formatRuPhone(lead.phone);
  const branch = Number(lead.branchId) || 2;
  const kind = lead.kind === "group" ? "запись в группу" : lead.kind === "consult" ? "консультация" : "пробное";
  const child = (lead.child || "").trim() || lead.parent;
  const parent = lead.parent.trim();
  const dob = formatRuDob(lead.dobRu);
  const noteLine = [
    `Заказчик: ${parent}`,
    `Ребёнок: ${child}`,
    kind === "пробное" ? "Тип: пробное занятие" : `Тип: ${kind}`,
    lead.courseName ? `Курс: ${lead.courseName}` : "",
    lead.groupName ? `Группа: ${lead.groupName}` : "",
    lead.gid ? `gid=${lead.gid}` : "",
    lead.date || lead.time ? `Слот: ${lead.date || ""} ${lead.time || ""}`.trim() : "",
    "Источник: ИИ-администратор rastudio.org",
  ]
    .filter(Boolean)
    .join("\n");
  const t = await token();
  const existing = await findByPhone(phone);
  const groupIds = lead.gid && /^\d+$/.test(lead.gid) ? [Number(lead.gid)] : undefined;
  const taskText = `Сайт rastudio.org: ${kind}. ${child}${lead.courseName ? `, ${lead.courseName}` : ""}${lead.gid ? `, группа ${lead.gid}` : ""}.`;
  let customerId = 0;
  let usedBranch = branch;
  let duplicate = false;
  if (existing) {
    const prev = existing.customer.note ? `${existing.customer.note}\n\n` : "";
    const upd = await request<{ success?: boolean; errors?: unknown; model?: Customer }>(
      `/v2api/${existing.branch}/customer/update?id=${existing.customer.id}`,
      {
        id: existing.customer.id,
        name: child,
        legal_name: parent,
        legal_type: 1,
        ...(lead.email ? { email: [lead.email] } : {}),
        ...(dob ? { dob } : {}),
        note: `${prev}${noteLine}`,
        ...(groupIds ? { group_ids: groupIds } : {}),
      },
      t,
    );
    if (upd.success === false) throw new Error(`alfacrm-update ${JSON.stringify(upd.errors || upd)}`);
    customerId = existing.customer.id;
    usedBranch = existing.branch;
    duplicate = true;
  } else {
    const created = await request<{ success?: boolean; errors?: unknown; model?: Customer }>(
      `/v2api/${branch}/customer/create`,
      {
        name: child,
        legal_name: parent,
        legal_type: 1,
        phone: [phone],
        ...(lead.email ? { email: [lead.email] } : {}),
        ...(dob ? { dob } : {}),
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
    customerId = id;
  }
  await request(
    `/v2api/${usedBranch}/task/create`,
    {
      customer_ids: [customerId],
      branch_ids: [usedBranch],
      user_id: 1,
      title: `Сайт: ${kind}`,
      text: taskText,
    },
    t,
  ).catch(() => null);

  let lesson: { id?: number; date?: string; time?: string } | null = null;
  if (lead.kind !== "consult") {
    try {
      const booked = await createTrialLesson({
        branch: usedBranch,
        customerId,
        subjectId: Number(lead.courseId) || undefined,
        gid: lead.gid,
        date: lead.date,
        time: lead.time,
        duration: lead.duration,
        note: noteLine,
      });
      if (booked.ok) lesson = { id: booked.id, date: booked.date, time: booked.time };
    } catch (err) {
      console.error("trial-lesson", err);
    }
  }
  return {
    ok: true as const,
    id: customerId,
    duplicate,
    branch: usedBranch,
    url: leadUrl(usedBranch, customerId),
    lesson,
  };
}
