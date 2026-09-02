"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CrmClientCard } from "@/components/crm-client-card";
import { CrmPullDialog, emptyPull, type CrmPullState } from "@/components/crm-pull-dialog";
import { loadFromDisk, pullFromCrm } from "@/lib/crm-pull";
import { retryFetch } from "@/lib/retry-fetch";
import { adminSchedule } from "@/data/admin-schedule";
import { clientCardId, CABINET_ID, CRM_BRANCH } from "@/data/ids";
import { displayPersonName, displayParent, initialsOf, statusLabel } from "@/data/client-display";
import { cn } from "@/lib/utils";
import type { ClientRow, CustomerCard, GroupMember } from "@/data/crm-cards";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

const AGE_BANDS = [
  { id: "", label: "Все возраста" },
  { id: "3-4", label: "3–4" },
  { id: "5-6", label: "5–6" },
  { id: "7-9", label: "7–9" },
  { id: "10-12", label: "10–12" },
  { id: "13-17", label: "13–17" },
  { id: "18+", label: "18+" },
];

type Status = "учится" | "лид" | "архив" | "все";

function emptyRow(customerId: number, branchId: number): ClientRow {
  return {
    id: `crm-${customerId}`,
    crmId: customerId,
    cardId: clientCardId(customerId),
    branchId,
    child: "",
    parent: "",
    phone: "",
    age: null,
    gender: "",
    status: "учится",
    courses: [],
    city: "",
    branch: "",
    archived: false,
  };
}

export function AdminClients({
  onOpenGroup,
  hint,
}: {
  onOpenGroup: (groupId: number, branchId: number) => void;
  hint?: string;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status>("учится");
  const [branch, setBranch] = useState(0);
  const [age, setAge] = useState("");
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ все: 0, учится: 0, лид: 0, архив: 0 });
  const [branchCounts, setBranchCounts] = useState<Record<number, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState<CustomerCard | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [activeId, setActiveId] = useState(0);
  const [pull, setPull] = useState<CrmPullState>(emptyPull("clients"));
  const [synced, setSynced] = useState("");
  const [cap, setCap] = useState(120);
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  const searchT = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const autoPull = useRef(false);
  const qRef = useRef("");
  const statusRef = useRef<Status>("учится");
  const branchRef = useRef(0);
  const ageRef = useRef("");
  const activeIdRef = useRef(0);
  const desktopRef = useRef(desktop);
  qRef.current = q;
  statusRef.current = status;
  branchRef.current = branch;
  ageRef.current = age;
  desktopRef.current = desktop;

  async function load(nextQ = q, nextStatus = status, nextBranch = branch, nextAge = age) {
    setBusy(true);
    try {
      const res = (await retryFetch(() => loadFromDisk("clients", { q: nextQ, status: nextStatus, branchId: nextBranch, ageBand: nextAge }))) as {
        ok?: boolean;
        items?: ClientRow[];
        total?: number;
        counts?: typeof counts;
        branchCounts?: Record<number, number>;
        lastCrmSync?: string;
        all?: number;
        error?: string;
      };
      if (res.ok && Array.isArray(res.items)) {
        setRows(res.items);
        setTotal(Number(res.total) || res.items.length);
        if (res.counts) setCounts(res.counts);
        if (res.branchCounts) setBranchCounts(res.branchCounts);
        if (res.lastCrmSync) setSynced(res.lastCrmSync);
        const all = Number(res.all || 0);
        if (!autoPull.current && !nextQ && nextStatus === "учится" && all === 0) {
          autoPull.current = true;
          void pullKind("clients");
        }
        const keep = activeIdRef.current;
        const still = keep && res.items.some((r) => Number(r.crmId) === keep);
        if (!res.items.length) {
          setCard(null);
          setActiveId(0);
          activeIdRef.current = 0;
        } else if (!still && desktopRef.current) {
          void openRow(res.items[0]);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function pullKind(kind: "clients" | "clientsArchive" | "clientsLeads") {
    const title = kind === "clientsArchive" ? "архив" : kind === "clientsLeads" ? "лиды" : "текущих";
    setPull({ ...emptyPull("clients"), open: true, step: `AlfaCRM · ${title}…`, kind: "clients" });
    try {
      const res = (await pullFromCrm(kind, (step, lines, done, totalN) => {
        setPull((u) => (u.done ? u : { ...u, step: step || u.step, lines, added: done, total: totalN, kind: "clients" }));
      })) as { ok?: boolean; error?: string; lines?: { ok: boolean; text: string }[]; added?: number; total?: number };
      if (!res.ok) {
        setPull((u) => ({ ...u, done: true, error: res.error || "AlfaCRM не ответила.", kind: "clients" }));
        return;
      }
      setPull({
        open: true,
        kind: "clients",
        step: "",
        done: true,
        error: "",
        lines: res.lines || [],
        added: Number(res.added || 0),
        updated: 0,
        total: Number(res.total || 0),
      });
      const nextStatus: Status = kind === "clientsArchive" ? "архив" : kind === "clientsLeads" ? "лид" : "учится";
      setStatus(nextStatus);
      await load(qRef.current, nextStatus, branchRef.current, ageRef.current);
    } catch {
      setPull((u) => ({ ...u, done: true, error: "Не удалось загрузить клиентов.", kind: "clients" }));
    }
  }

  async function openRow(r: ClientRow) {
    const crmId = Number(r.crmId || 0);
    if (!crmId) return;
    const bid = Number(r.branchId) || 1;
    setActiveId(crmId);
    activeIdRef.current = crmId;
    const title = displayPersonName(r.child, r.parent);
    setCard({
      id: crmId,
      cardId: clientCardId(crmId),
      branchId: bid,
      name: title,
      parent: displayParent(r.child, r.parent),
      dob: "",
      age: r.age == null || r.age === "" ? "" : typeof r.age === "number" ? `${r.age} лет` : String(r.age),
      gender: r.gender,
      phones: r.phone ? [r.phone] : [],
      emails: [],
      address: "",
      status: r.status,
      note: "",
      paidTill: "",
      url: `https://studiyarazvivaysya.s20.online/company/${bid}/customer/view?id=${crmId}`,
      schools: r.schools || [],
      groups: r.groupLinks || [],
      comms: [],
    });
    setCardLoading(true);
    const res = await adminSchedule({ data: { token: token(), action: "customerGet", customerId: crmId, branchId: bid } as never });
    setCardLoading(false);
    if (res.ok && "customer" in res && res.customer) {
      const next = res.customer as CustomerCard;
      setCard((prev) => ({
        ...next,
        cardId: next.cardId || clientCardId(crmId),
        name: next.name || prev?.name || "",
        parent: next.parent || prev?.parent || "",
        groups: next.groups?.length ? next.groups : prev?.groups || r.groupLinks || [],
        schools: next.schools?.length ? next.schools : prev?.schools || r.schools || [],
      }));
    }
  }

  async function mutateCard(action: "customerSave" | "customerLesson" | "customerPay" | "customerTariff", extra: Record<string, unknown> = {}) {
    if (!card) return;
    const res = await adminSchedule({
      data: { token: token(), action, customerId: card.id, branchId: card.branchId, ...extra } as never,
    });
    if (!res.ok) throw new Error(("error" in res && res.error) || "AlfaCRM не приняла изменение.");
    if ("customer" in res && res.customer) setCard(res.customer as CustomerCard);
  }

  async function openById(customerId: number, branchId: number) {
    const crmId = Number(customerId) || 0;
    if (!crmId) return;
    const row = rows.find((r) => Number(r.crmId) === crmId);
    await openRow(row || emptyRow(crmId, branchId || 1));
  }

  useEffect(() => {
    void load("", "учится", 0, "");
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      const on = mq.matches;
      setDesktop(on);
      desktopRef.current = on;
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    function onQuery(e: Event) {
      const d = (e as CustomEvent<{ q?: string }>).detail || {};
      const next = String(d.q || "");
      setQ(next);
      void load(next, statusRef.current, branchRef.current, ageRef.current);
    }
    function onOpen(e: Event) {
      const d = (e as CustomEvent<{ customerId?: number; branchId?: number; q?: string }>).detail || {};
      const id = Number(d.customerId || 0);
      const bid = Number(d.branchId || 0) || 1;
      if (d.q) {
        setQ(d.q);
        void load(d.q, statusRef.current, branchRef.current, ageRef.current);
      }
      if (id) void openById(id, bid);
    }
    function onFilter(e: Event) {
      const d = (e as CustomEvent<{ status?: Status; branchId?: number; ageBand?: string; q?: string }>).detail || {};
      const nextStatus = d.status === "лид" || d.status === "архив" || d.status === "учится" ? d.status : statusRef.current;
      const nextBranch = d.branchId == null ? branchRef.current : Number(d.branchId) || 0;
      const nextAge = d.ageBand == null ? ageRef.current : String(d.ageBand);
      const nextQ = d.q == null ? qRef.current : String(d.q);
      setStatus(nextStatus);
      setBranch(nextBranch);
      setAge(nextAge);
      if (d.q != null) setQ(nextQ);
      setCap(120);
      void load(nextQ, nextStatus, nextBranch, nextAge);
    }
    window.addEventListener("ra-clients-query", onQuery);
    window.addEventListener("ra-open-client", onOpen);
    window.addEventListener("ra-clients-filter", onFilter);
    return () => {
      window.removeEventListener("ra-clients-query", onQuery);
      window.removeEventListener("ra-open-client", onOpen);
      window.removeEventListener("ra-clients-filter", onFilter);
    };
  }, [rows]);

  const branchSum = (branchCounts[1] || 0) + (branchCounts[2] || 0) + (branchCounts[3] || 0) + (branchCounts[4] || 0);
  const shown = useMemo(() => rows.slice(0, cap), [rows, cap]);
  const activeIndex = shown.findIndex((r) => Number(r.crmId) === activeId);

  function move(delta: number) {
    if (!shown.length) return;
    const i = activeIndex < 0 ? 0 : Math.max(0, Math.min(shown.length - 1, activeIndex + delta));
    const row = shown[i];
    if (row) void openRow(row);
    const el = listRef.current?.querySelector(`[data-customer-id="${row?.crmId}"]`);
    if (el instanceof HTMLElement) el.scrollIntoView({ block: "nearest" });
  }

  return (
    <div
      className="mt-4 flex min-h-0 flex-1 flex-col"
      data-cabinet-id={CABINET_ID}
      data-pane="clients"
      data-filter-status={status}
      data-filter-branch={branch}
      data-filter-age={age}
    >
      <div className="shrink-0 rounded-[1.4rem] bg-white p-3 shadow-[var(--shadow-border)] md:px-4 md:py-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-10 min-w-[14rem] max-w-md flex-1 items-center gap-2 rounded-full bg-surface-2 px-3 ring-1 ring-black/6 transition-[box-shadow] duration-[var(--motion-quick)] focus-within:ring-2 focus-within:ring-primary/35">
            <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            <input
              value={q}
              onChange={(e) => {
                const v = e.target.value;
                setQ(v);
                window.clearTimeout(searchT.current);
                searchT.current = window.setTimeout(() => void load(v, status, branch, age), 120);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (activeId) return;
                  const first = shown[0];
                  if (first?.crmId) void openRow(first);
                  else void load(q, status, branch, age);
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  move(1);
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  move(-1);
                }
                if (e.key === "Escape") {
                  e.currentTarget.blur();
                }
              }}
              placeholder="Имя, телефон, customerId"
              className="h-10 w-full bg-transparent text-sm outline-none"
              aria-label="Поиск клиентов"
            />
            <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 font-mono text-[0.68rem] tabular-nums text-muted">
              {busy ? "…" : `${shown.length}${total > shown.length ? `/${total}` : ""}`}
            </span>
          </label>

          <div className="flex h-10 items-center rounded-full bg-surface-2 p-1" data-sort-group="status" role="tablist" aria-label="Статус">
            {([
              ["учится", "Текущие", counts.учится],
              ["лид", "Лиды", counts.лид],
            ] as const).map(([id, label, n]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={status === id}
                data-sort="status"
                data-id={id}
                onClick={() => {
                  setStatus(id);
                  setCap(120);
                  void load(q, id, branch, age);
                }}
                className={cn(
                  "h-8 rounded-full px-3.5 text-[0.8rem] font-semibold transition-colors duration-[var(--motion-quick)]",
                  status === id ? "bg-primary text-white shadow-sm" : "text-muted hover:text-fg",
                )}
              >
                {label}
                <span className="ml-1 tabular-nums opacity-80">{n}</span>
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-1">
            <button
              type="button"
              className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[0.8rem] font-semibold text-fg hover:bg-surface-2 disabled:opacity-50"
              disabled={busy || pull.open}
              onClick={() => void pullKind("clients")}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} aria-hidden />
              Обновить
            </button>
            <Button type="button" size="sm" variant="secondary" className="h-10" disabled={busy || pull.open} onClick={() => void pullKind("clientsLeads")}>
              Загрузить лиды
            </Button>
            <button
              type="button"
              className={cn("px-2 text-[0.75rem] font-semibold underline-offset-2 hover:underline", status === "архив" ? "text-fg" : "text-muted")}
              disabled={busy || pull.open}
              onClick={() => {
                if (!counts.архив) void pullKind("clientsArchive");
                else {
                  setStatus("архив");
                  setCap(120);
                  void load(q, "архив", branch, age);
                }
              }}
            >
              {counts.архив ? `архив ${counts.архив}` : "загрузить архив"}
            </button>
          </div>
        </div>
        {hint ? <p className="mt-2 rounded-xl bg-primary/10 px-3 py-1.5 text-sm font-medium text-fg">{hint}</p> : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <span className="pr-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">Филиал</span>
            <button
              type="button"
              data-sort="branch"
              data-id="0"
              onClick={() => {
                setBranch(0);
                setCap(120);
                void load(q, status, 0, age);
              }}
              className={cn("rounded-full px-2.5 py-1 text-[0.75rem] font-semibold transition-colors duration-[var(--motion-quick)]", branch === 0 ? "bg-fg text-white" : "text-muted hover:bg-surface-2 hover:text-fg")}
            >
              Все
              <span className="ml-1 tabular-nums opacity-70">{branchSum}</span>
            </button>
            {([1, 2, 3, 4] as const).map((id) => (
              <button
                key={id}
                type="button"
                data-sort="branch"
                data-id={String(id)}
                onClick={() => {
                  setBranch(id);
                  setCap(120);
                  void load(q, status, id, age);
                }}
                className={cn("rounded-full px-2.5 py-1 text-[0.75rem] font-semibold transition-colors duration-[var(--motion-quick)]", branch === id ? "bg-fg text-white" : "text-muted hover:bg-surface-2 hover:text-fg")}
              >
                {CRM_BRANCH[id]?.short || id}
                <span className="ml-1 tabular-nums opacity-70">{branchCounts[id] || 0}</span>
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <span className="pr-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">Возраст</span>
            {AGE_BANDS.map((b) => (
              <button
                key={b.id || "all"}
                type="button"
                data-sort="age"
                data-id={b.id || "all"}
                onClick={() => {
                  setAge(b.id);
                  setCap(120);
                  void load(q, status, branch, b.id);
                }}
                className={cn("rounded-full px-2.5 py-1 text-[0.75rem] font-semibold transition-colors duration-[var(--motion-quick)]", age === b.id ? "bg-fg text-white" : "text-muted hover:bg-surface-2 hover:text-fg")}
              >
                {b.id ? b.label : "Все"}
              </button>
            ))}
          </div>
          {synced ? <span className="ml-auto text-[0.68rem] text-muted">{new Date(synced).toLocaleString("ru-RU")}</span> : null}
        </div>
        {status === "архив" && !counts.архив ? (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">Архив на сайте пуст. Нажмите «загрузить архив» — только is_study=2.</p>
        ) : null}
        {status === "лид" && !counts.лид ? (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">Лидов на сайте нет. Нажмите «Загрузить лиды» — только активные is_study=0. Архивные лиды с сайта удаляются.</p>
        ) : null}
      </div>

      <div className="mt-3 grid min-h-0 flex-1 items-stretch gap-3 overflow-hidden lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]" data-layout="list-card">
        <div ref={listRef} className="pretty-scroll min-h-0 space-y-1.5 overflow-y-auto p-1 max-lg:max-h-[72vh] lg:h-full">
          {shown.map((r) => {
            const crmId = Number(r.crmId || 0);
            const title = displayPersonName(r.child, r.parent);
            const parent = displayParent(r.child, r.parent);
            const on = crmId && crmId === activeId;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => void openRow(r)}
                data-customer-id={crmId || undefined}
                data-card-id={crmId ? clientCardId(crmId) : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[1rem] bg-white px-2.5 py-2 text-left shadow-[var(--shadow-border)] transition-[box-shadow,transform] duration-[var(--motion-quick)] ease-[var(--ease-out)]",
                  on ? "ring-2 ring-primary" : "hover:shadow-[var(--shadow-border-hover)]",
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[0.72rem] font-bold text-primary">
                  {initialsOf(title)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-1.5">
                    <span className="truncate font-display text-[0.95rem] leading-tight">{title}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0.5 text-[0.62rem] font-semibold",
                        r.status === "учится" ? "bg-primary/10 text-primary" : r.status === "лид" ? "bg-amber-100 text-amber-900" : "bg-surface-2 text-muted",
                      )}
                    >
                      {statusLabel(r.status)}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[0.72rem] text-muted">
                    {[r.age ? `${r.age} лет` : "", parent, r.phone, CRM_BRANCH[Number(r.branchId) || 0]?.short, crmId ? `id ${crmId}` : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </button>
            );
          })}
          {total > shown.length ? (
            <button type="button" className="w-full rounded-[1.2rem] bg-white py-3 text-sm font-semibold text-primary ring-1 ring-black/6" onClick={() => setCap((n) => n + 120)}>
              Ещё {Math.min(120, total - shown.length)} из {total - shown.length}
            </button>
          ) : null}
          {!busy && !shown.length ? (
            <p className="rounded-[1.2rem] bg-white px-4 py-10 text-center text-sm text-muted ring-1 ring-black/6">
              {status === "архив" ? "Архив пуст в этой выборке." : status === "лид" ? "Лидов нет в этой выборке." : "Текущих клиентов нет. Нажмите «Обновить»."}
            </p>
          ) : null}
        </div>
        <div className="hidden min-h-0 min-w-0 lg:block lg:h-full lg:overflow-hidden">
          {card ? (
            <CrmClientCard
              card={card}
              loading={cardLoading}
              variant="panel"
              onClose={() => {
                if (desktopRef.current) {
                  const first = shown[0];
                  if (first && Number(first.crmId) !== activeId) void openRow(first);
                  return;
                }
                setCard(null);
                setActiveId(0);
                activeIdRef.current = 0;
              }}
              onOpenGroup={onOpenGroup}
              onAction={mutateCard}
            />
          ) : (
            <div className="flex h-full min-h-[16rem] items-center justify-center rounded-[1.4rem] bg-white px-6 text-center text-sm text-muted shadow-[var(--shadow-border)]">
              Выберите человека — карточка <span className="mx-1 font-mono">card:customer:{"{id}"}</span> откроется здесь.
            </div>
          )}
        </div>
      </div>

      {card && !desktop ? (
        <CrmClientCard
          card={card}
          loading={cardLoading}
          onClose={() => {
            setCard(null);
            setActiveId(0);
            activeIdRef.current = 0;
          }}
          onOpenGroup={onOpenGroup}
          onAction={mutateCard}
        />
      ) : null}
      {pull.open ? <CrmPullDialog pull={pull} onClose={() => setPull((u) => ({ ...u, open: false }))} /> : null}
    </div>
  );
}

export function openGroupMemberAsClient(m: GroupMember, branchId: number): CustomerCard {
  const title = displayPersonName(m.name, m.parent, m.phone);
  return {
    id: m.id,
    cardId: clientCardId(m.id),
    branchId,
    name: title,
    parent: displayParent(m.name, m.parent),
    dob: m.dob,
    age: m.age,
    gender: m.gender,
    phones: m.phones?.length ? m.phones : m.phone ? [m.phone] : [],
    emails: m.email ? [m.email] : [],
    address: "",
    status: m.status,
    note: "",
    paidTill: m.to || "",
    url: `https://studiyarazvivaysya.s20.online/company/${branchId}/customer/view?id=${m.id}`,
    schools: [],
    groups: [],
    comms: [],
  };
}
