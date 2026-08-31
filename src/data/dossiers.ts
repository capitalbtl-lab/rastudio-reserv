import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { formatRuPhone, leadUrl, request, token as alfaToken } from "./alfacrm";
import type { SessionNote } from "./session-note";

export type PersonName = {
  fio: string;
  last?: string;
  first?: string;
  middle?: string;
};

export type DossierLog = { at: string; source: string; text: string };

export type Dossier = {
  id: string;
  crmId?: number;
  branchId?: number;
  url?: string;
  phones: string[];
  phoneDigits: string;
  child: PersonName & { gender?: "мальчик" | "девочка" | ""; dob?: string };
  parent: PersonName;
  address?: string;
  city?: string;
  branch?: string;
  coursesNow: string[];
  coursesPast: string[];
  services: string[];
  tariff?: string;
  status?: string;
  extras: Record<string, string>;
  chatIds: string[];
  log: DossierLog[];
  createdAt: string;
  updatedAt: string;
};

type Store = { items: Dossier[] };

const MAX = 2000;

function fileOf() {
  return join(process.cwd(), "storage", "dossiers.json");
}

function loadStore(): Store {
  try {
    if (!existsSync(fileOf())) return { items: [] };
    const raw = JSON.parse(readFileSync(fileOf(), "utf8")) as Store;
    return { items: Array.isArray(raw.items) ? raw.items : [] };
  } catch {
    return { items: [] };
  }
}

function saveStore(store: Store) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  writeFileSync(fileOf(), JSON.stringify({ items: store.items.slice(0, MAX) }, null, 0), "utf8");
}

export function digitsPhone(raw?: string) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("9")) d = `7${d}`;
  if (d.length === 11 && d.startsWith("8")) d = `7${d.slice(1)}`;
  return d;
}

function splitFio(raw?: string): PersonName {
  const fio = String(raw || "").replace(/\s+/g, " ").trim();
  if (!fio) return { fio: "" };
  const parts = fio.split(" ");
  if (parts.length === 1) return { fio, first: parts[0] };
  if (parts.length === 2) return { fio, last: parts[0], first: parts[1] };
  return { fio, last: parts[0], first: parts[1], middle: parts.slice(2).join(" ") };
}

function preferName(prev: string, next: string) {
  const a = (prev || "").trim();
  const b = (next || "").trim();
  if (!b) return a;
  if (!a) return b;
  if (a.toLowerCase() === b.toLowerCase()) return a.split(" ").length >= b.split(" ").length ? a : b;
  const a0 = a.split(/\s+/)[0].toLowerCase();
  if (b.toLowerCase().includes(a0) && b.split(/\s+/).length >= a.split(/\s+/).length) return b;
  if (b.split(/\s+/).length > a.split(/\s+/).length) return b;
  return a;
}

function uniq(list: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of list) {
    const s = String(x || "").trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function emptyDossier(partial: Partial<Dossier> & { id: string }): Dossier {
  const now = new Date().toISOString();
  return {
    id: partial.id,
    phones: [],
    phoneDigits: "",
    child: { fio: "" },
    parent: { fio: "" },
    coursesNow: [],
    coursesPast: [],
    services: [],
    extras: {},
    chatIds: [],
    log: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function mergePerson(prev: PersonName, incoming?: string): PersonName {
  const fio = preferName(prev.fio, incoming || "");
  return { ...prev, ...splitFio(fio), fio };
}

export function upsertDossier(patch: {
  crmId?: number;
  branchId?: number;
  phone?: string;
  child?: string;
  parent?: string;
  gender?: "мальчик" | "девочка" | "";
  dob?: string;
  address?: string;
  city?: string;
  branch?: string;
  course?: string;
  coursePast?: string;
  service?: string;
  tariff?: string;
  status?: string;
  extras?: Record<string, string>;
  chatId?: string;
  source: string;
  note?: string;
}) {
  const digits = digitsPhone(patch.phone);
  const store = loadStore();
  const byCrm = patch.crmId
    ? store.items.find((d) => d.crmId === patch.crmId)
    : undefined;
  const byPhone = digits ? store.items.find((d) => d.phoneDigits === digits || d.phones.some((p) => digitsPhone(p) === digits)) : undefined;
  let cur = byCrm || byPhone;
  const id = cur?.id || (patch.crmId ? `crm-${patch.crmId}` : digits ? `tel-${digits}` : `tmp-${Date.now().toString(36)}`);
  if (!cur) cur = emptyDossier({ id });
  const before = JSON.stringify({
    child: cur.child.fio,
    parent: cur.parent.fio,
    dob: cur.child.dob,
    city: cur.city,
  });
  const childFio = mergePerson(cur.child, patch.child);
  const parentFio = mergePerson(cur.parent, patch.parent);
  const next: Dossier = {
    ...cur,
    id,
    crmId: patch.crmId || cur.crmId,
    branchId: patch.branchId || cur.branchId,
    url: patch.crmId && (patch.branchId || cur.branchId) ? leadUrl(patch.branchId || cur.branchId || 2, patch.crmId) : cur.url,
    phones: uniq([...cur.phones, patch.phone ? formatRuPhone(patch.phone) : ""]),
    phoneDigits: digits || cur.phoneDigits,
    child: {
      ...childFio,
      gender: patch.gender || cur.child.gender || "",
      dob: patch.dob || cur.child.dob || "",
    },
    parent: parentFio,
    address: patch.address || cur.address,
    city: patch.city || cur.city,
    branch: patch.branch || cur.branch,
    coursesNow: uniq([...cur.coursesNow, patch.course || ""]),
    coursesPast: uniq([...cur.coursesPast, patch.coursePast || ""]),
    services: uniq([...cur.services, patch.service || ""]),
    tariff: patch.tariff || cur.tariff,
    status: patch.status || cur.status,
    extras: { ...cur.extras, ...(patch.extras || {}) },
    chatIds: uniq([...cur.chatIds, patch.chatId || ""]),
    updatedAt: new Date().toISOString(),
    createdAt: cur.createdAt,
    log: cur.log,
  };
  const after = JSON.stringify({
    child: next.child.fio,
    parent: next.parent.fio,
    dob: next.child.dob,
    city: next.city,
  });
  if (before !== after || patch.note) {
    next.log = [
      {
        at: next.updatedAt,
        source: patch.source,
        text: patch.note || `Обновление: ${next.child.fio || "без имени"} · ${next.parent.fio || "заказчик"} · ${next.phoneDigits}`,
      },
      ...cur.log,
    ].slice(0, 80);
  }
  const rest = store.items.filter((d) => d.id !== cur!.id && d.id !== next.id);
  if (byPhone && byCrm && byPhone.id !== byCrm.id) {
    store.items = [next, ...rest.filter((d) => d.id !== byPhone.id && d.id !== byCrm.id)];
  } else {
    store.items = [next, ...rest];
  }
  store.items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  saveStore(store);
  return next;
}

export function dossierFromNote(note: SessionNote, extra?: { phone?: string; chatId?: string; crmId?: number; branchId?: number }) {
  const gender: Dossier["child"]["gender"] =
    /девоч|дочь|дочк|девочка/i.test(`${note.child || ""} ${note.essence}`)
      ? "девочка"
      : /мальчик|сын\b/i.test(`${note.child || ""} ${note.essence}`)
        ? "мальчик"
        : "";
  return upsertDossier({
    crmId: extra?.crmId,
    branchId: extra?.branchId || note.branchId,
    phone: extra?.phone || note.phone,
    child: note.child,
    parent: note.parent,
    gender,
    city: note.city,
    branch: note.branch,
    course: note.course || note.school,
    service: note.service,
    chatId: extra?.chatId,
    source: "chat",
    note: note.essence,
  });
}

export function findDossier(opts: { crmId?: number; phone?: string; id?: string }) {
  const store = loadStore();
  const digits = digitsPhone(opts.phone);
  return (
    store.items.find((d) => (opts.id && d.id === opts.id) || (opts.crmId && d.crmId === opts.crmId) || (digits && d.phoneDigits === digits)) ||
    null
  );
}

export function dossierPrompt(d: Dossier | null) {
  if (!d) return "";
  const lines = [
    d.crmId ? `AlfaCRM id ${d.crmId}, филиал ${d.branchId || "—"}` : "карточки в CRM ещё нет",
    d.child.fio ? `ребёнок: ${d.child.fio}${d.child.gender ? `, ${d.child.gender}` : ""}${d.child.dob ? `, др ${d.child.dob}` : ""}` : "",
    d.parent.fio ? `заказчик: ${d.parent.fio}` : "",
    d.phones.length ? `телефон: ${d.phones.join(", ")}` : "",
    d.city ? `город: ${d.city}` : "",
    d.branch ? `филиал: ${d.branch}` : "",
    d.address ? `адрес: ${d.address}` : "",
    d.coursesNow.length ? `ходит сейчас: ${d.coursesNow.join(", ")}` : "",
    d.coursesPast.length ? `ходил раньше: ${d.coursesPast.join(", ")}` : "",
    d.services.length ? `услуги: ${d.services.join(", ")}` : "",
    d.tariff ? `абонемент: ${d.tariff}` : "",
    d.status ? `статус: ${d.status}` : "",
  ].filter(Boolean);
  if (!lines.length) return "";
  return `

ЛИЧНОЕ ДЕЛО клиента (основа разговора, не переспрашивай то, что здесь есть):
${lines.map((l) => `— ${l}`).join("\n")}
Если клиент назвал более полное ФИО — запомни новое, короткое не важнее полного.
`;
}

export async function syncDossierFromCrm(crmId: number, branchId: number) {
  const t = await alfaToken();
  const data = await request<{ items?: Record<string, unknown>[] }>(
    `/v2api/${branchId}/customer/index`,
    { page: 0, pageSize: 1, id: crmId },
    t,
  );
  const item = data.items?.[0] || {};
  const phoneRaw = Array.isArray(item.phone) ? String(item.phone[0] || "") : String(item.phone || "");
  const isStudy = Number(item.is_study);
  return upsertDossier({
    crmId,
    branchId,
    phone: phoneRaw,
    child: String(item.name || ""),
    parent: String(item.legal_name || ""),
    dob: String(item.dob || ""),
    tariff: item.paid_till ? `оплачено до ${item.paid_till}` : undefined,
    status: isStudy === 1 ? "учится" : isStudy === 0 ? "лид" : String(item.study_status_id || ""),
    extras: {
      email: Array.isArray(item.email) ? String(item.email[0] || "") : String(item.email || ""),
      balance: item.balance != null ? String(item.balance) : "",
    },
    source: "alfacrm",
    note: "Синхронизация из AlfaCRM",
  });
}

export const adminDossiers = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        action?: "list" | "get" | "save" | "sync";
        id?: string;
        crmId?: number;
        branchId?: number;
        q?: string;
        patch?: Partial<Dossier> & { childFio?: string; parentFio?: string; dob?: string; phone?: string };
      },
  )
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const store = loadStore();
    if (data.action === "get" && data.id) {
      const one = store.items.find((d) => d.id === data.id);
      if (!one) return { ok: false as const, error: "Дело не найдено." };
      return { ok: true as const, dossier: one };
    }
    if (data.action === "sync" && data.crmId && data.branchId) {
      try {
        const d = await syncDossierFromCrm(data.crmId, data.branchId);
        return { ok: true as const, dossier: d };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "CRM" };
      }
    }
    if (data.action === "save" && data.id) {
      const prev = store.items.find((d) => d.id === data.id);
      if (!prev) return { ok: false as const, error: "Дело не найдено." };
      const p = data.patch || {};
      const next = upsertDossier({
        crmId: prev.crmId,
        branchId: prev.branchId,
        phone: p.phone || prev.phoneDigits,
        child: p.childFio ?? prev.child.fio,
        parent: p.parentFio ?? prev.parent.fio,
        dob: p.dob ?? prev.child.dob,
        address: p.address ?? prev.address,
        city: p.city ?? prev.city,
        branch: p.branch ?? prev.branch,
        tariff: p.tariff ?? prev.tariff,
        status: p.status ?? prev.status,
        source: "admin",
        note: "Правка в кабинете",
      });
      return { ok: true as const, dossier: next };
    }
    const q = String(data.q || "").toLowerCase();
    const items = store.items.filter((d) => {
      if (!q) return true;
      const hay = `${d.child.fio} ${d.parent.fio} ${d.phoneDigits} ${d.phones.join(" ")} ${d.city} ${d.coursesNow.join(" ")} ${d.crmId || ""}`.toLowerCase();
      return hay.includes(q);
    });
    return {
      ok: true as const,
      total: store.items.length,
      items: items.slice(0, 200).map((d) => ({
        id: d.id,
        crmId: d.crmId || null,
        branchId: d.branchId || null,
        url: d.url || "",
        child: d.child.fio,
        gender: d.child.gender || "",
        dob: d.child.dob || "",
        parent: d.parent.fio,
        phone: d.phones[0] || d.phoneDigits,
        city: d.city || "",
        branch: d.branch || "",
        courses: d.coursesNow,
        tariff: d.tariff || "",
        status: d.status || "",
        updatedAt: d.updatedAt,
      })),
    };
  });
