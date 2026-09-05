"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CrmClientCard } from "@/components/crm-client-card";
import { CrmPullDialog, emptyPull, type CrmPullState } from "@/components/crm-pull-dialog";
import { loadFromDisk, pullFromCrm } from "@/lib/crm-pull";
import { retryFetch } from "@/lib/retry-fetch";
import { adminSchedule } from "@/data/admin-schedule";
import { clientCardId, groupCardId, CABINET_ID, CRM_BRANCH } from "@/data/ids";
import { displayPersonName, displayParent, initialsOf, statusLabel } from "@/data/client-display";
import { cn } from "@/lib/utils";
import { ADMIN_PANEL_BLUE, RA_POP } from "@/data/admin-ui";
import { LessonStrip, GroupLessonStrip } from "@/components/lesson-strip";
import { CrmGroupMembers, GroupLoadScene } from "@/components/crm-group-card";
import { CrmLeadBoard } from "@/components/crm-lead-board";
import type { ClientRow, CustomerCard, GroupMember } from "@/data/crm-cards";
import { LEAD_STAGES, mergeStages, reorderLeads, filterLeadCards, mergeBranchLeadCards, type LeadCard, type LeadStage } from "@/data/crm-leads-stages";
import { crmSyncMinutes } from "@/components/admin-crm-settings";
import type { CrmSlot, GroupCalLesson } from "@/data/crm-slots-core";
import { GROUP_STATUSES, isAdminGroup } from "@/data/group-status";
import { keepByLiveTariff, type TariffHave } from "@/data/pupil-tariffs";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

const FUNNEL_KEY = "ra_funnel_board";

type FunnelSnap = { at: number; branch: number; stages: LeadStage[]; items: LeadCard[] };

function funnelStore(): Record<string, FunnelSnap> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(FUNNEL_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function funnelSnapGet(bid: number): FunnelSnap | null {
  const all = funnelStore();
  if (bid) return all[String(bid)]?.items?.length ? all[String(bid)] : null;
  const zero = all["0"];
  const parts = [1, 2, 3, 4].map((id) => all[String(id)]).filter((x): x is FunnelSnap => Boolean(x?.items?.length));
  if (!parts.length) return zero?.items?.length ? zero : null;
  const seen = new Set<number>();
  const items: LeadCard[] = [];
  for (const p of parts) {
    for (const it of p.items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      items.push(it);
    }
  }
  return {
    at: Math.max(zero?.at || 0, ...parts.map((p) => p.at || 0)),
    branch: 0,
    stages: parts[0]?.stages || zero?.stages || LEAD_STAGES,
    items,
  };
}

function funnelSnapPut(bid: number, stages: LeadStage[], items: LeadCard[]) {
  if (typeof window === "undefined") return;
  try {
    const all = funnelStore();
    all[String(bid)] = { at: Date.now(), branch: bid, stages, items };
    if (bid) {
      const seen = new Set<number>();
      const union: LeadCard[] = [];
      for (const key of ["1", "2", "3", "4"]) {
        const snap = all[key];
        if (!snap?.items) continue;
        for (const it of snap.items) {
          if (seen.has(it.id)) continue;
          seen.add(it.id);
          union.push(it);
        }
      }
      all["0"] = { at: Date.now(), branch: 0, stages, items: union };
    }
    localStorage.setItem(FUNNEL_KEY, JSON.stringify(all));
  } catch {
    /* quota */
  }
}

function funnelSnapTimes(): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(funnelStore())) out[Number(k)] = Number(v.at || 0);
  return out;
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

function ageSpan(raw: string): [number, number] | null {
  const t = String(raw || "")
    .toLowerCase()
    .replace(/[–—]/g, "-");
  if (/\b18\s*\+|взросл|родител/.test(t)) return [18, 99];
  const plus = t.match(/(\d+)\s*\+/);
  if (plus) return [Number(plus[1]), 99];
  const m = t.match(/(\d+)\s*-\s*(\d+)/);
  if (m) return [Number(m[1]), Number(m[2])];
  const one = t.match(/(?:^|\D)(\d{1,2})(?:\s*лет|\s*года|\s*год)?/);
  if (one) {
    const n = Number(one[1]);
    if (n >= 1 && n <= 80) return [n, n];
  }
  return null;
}

function ageMatches(slot: CrmSlot, band: string) {
  if (!band) return true;
  const want = ageSpan(band === "18+" ? "18+" : band);
  if (!want) return true;
  const got = ageSpan(`${slot.age} ${slot.groupName} ${slot.course}`);
  if (!got) return false;
  return got[0] <= want[1] && want[0] <= got[1];
}

type Status = "учится" | "лид" | "архив" | "все";

const GROUP_LEVELS = [
  { id: 7, name: "1 класс" },
  { id: 8, name: "2 класс" },
  { id: 9, name: "3 класс" },
  { id: 10, name: "4 класс" },
  { id: 11, name: "5 класс" },
  { id: 15, name: "Ознакомительный" },
  { id: 12, name: "Начальный" },
  { id: 13, name: "Средний" },
  { id: 14, name: "Продвинутый" },
];

const GROUP_STATUS = GROUP_STATUSES.filter((s) => s.admin);

type GroupInfo = {
  description: string;
  remarks: string;
  hashtags: string;
  makeup: string;
  statusId: number;
  bDate: string;
  eDate: string;
  levelId: number;
  signup: string;
  subjectId: number;
  calendar: GroupCalLesson[];
  tariffs: { id: number; name: string; price: number; fit?: boolean }[];
};

type ClientsSnap = {
  q: string;
  status: Status;
  branch: number;
  age: string;
  items: ClientRow[];
  total: number;
  counts: { все: number; учится: number; лид: number; архив: number };
  branchCounts: Record<number, number>;
  synced: string;
  all: number;
};

let clientsSnap: ClientsSnap | null = null;
const CLIENTS_KEY = "ra_clients_snap";
const LIVE_KEY = "ra_live_tariff_ids";

function readClientsSnap(): ClientsSnap | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CLIENTS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as ClientsSnap;
    return Array.isArray(v?.items) ? v : null;
  } catch {
    return null;
  }
}

function writeClientsSnap(s: ClientsSnap) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CLIENTS_KEY, JSON.stringify(s));
  } catch {
    /* quota */
  }
}

function readLiveIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(sessionStorage.getItem(LIVE_KEY) || "[]");
    return Array.isArray(raw) ? raw.map(Number).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeLiveIds(ids: number[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(LIVE_KEY, JSON.stringify(ids.slice(0, 4000)));
  } catch {
    /* quota */
  }
}

if (!clientsSnap) clientsSnap = readClientsSnap();

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

function rowToLead(r: ClientRow): LeadCard {
  const title = displayPersonName(r.child, r.parent, r.phone);
  const age = r.age == null || r.age === "" ? "" : typeof r.age === "number" ? `${r.age} лет` : String(r.age);
  return {
    id: Number(r.crmId) || 0,
    customerId: Number(r.crmId) || 0,
    branchId: Number(r.branchId) || 0,
    name: title || r.phone || `лид ${r.crmId || ""}`,
    age,
    phone: r.phone || "",
    email: "",
    note: r.note || "",
    assigned: "",
    statusId: Number(r.leadStatusId || 0),
    at: r.updatedAt || "",
    chats: 0,
  };
}

function slotCalendar(s: CrmSlot): GroupCalLesson[] {
  const days = s.beats?.length ? [...new Set(s.beats.map((b) => b.day).filter(Boolean))] : [s.day].filter(Boolean);
  if (!days.length) return [];
  const out: GroupCalLesson[] = [];
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  for (let add = -14; add <= 56 && out.length < 12; add += 1) {
    const d = new Date(start);
    d.setDate(d.getDate() + add);
    const wd = d.getDay() === 0 ? 7 : d.getDay();
    if (!days.includes(wd)) continue;
    const beat = s.beats?.find((b) => b.day === wd);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    out.push({
      date: `${y}-${m}-${day}`,
      from: beat?.timeFrom || s.timeFrom || "",
      to: beat?.timeTo || s.timeTo || "",
      status: 2,
      type: "Групповое",
    });
  }
  return out;
}

export function AdminClients({
  onOpenGroup,
  hint,
  slots = [],
  wide,
  active = true,
}: {
  onOpenGroup: (groupId: number, branchId: number) => void;
  hint?: string;
  slots?: CrmSlot[];
  wide?: boolean;
  active?: boolean;
}) {
  const [q, setQ] = useState(() => clientsSnap?.q || "");
  const [status, setStatus] = useState<Status>(() => clientsSnap?.status || "учится");
  const [branch, setBranch] = useState(() => clientsSnap?.branch || 0);
  const [age, setAge] = useState(() => clientsSnap?.age || "");
  const [rows, setRows] = useState<ClientRow[]>(() => clientsSnap?.items || []);
  const [total, setTotal] = useState(() => clientsSnap?.total || 0);
  const [counts, setCounts] = useState(() => clientsSnap?.counts || { все: 0, учится: 0, лид: 0, архив: 0 });
  const [branchCounts, setBranchCounts] = useState<Record<number, number>>(() => clientsSnap?.branchCounts || { 1: 0, 2: 0, 3: 0, 4: 0 });
  const [busy, setBusy] = useState(() => !clientsSnap?.items.length);
  const [card, setCard] = useState<CustomerCard | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [activeId, setActiveId] = useState(0);
  const [pull, setPull] = useState<CrmPullState>(emptyPull("clients"));
  const [synced, setSynced] = useState(() => clientsSnap?.synced || "");
  const [cap, setCap] = useState(120);
  const [groupOpen, setGroupOpen] = useState(false);
  const [addingGroup, setAddingGroup] = useState("");
  const [view, setView] = useState<"дети" | "группы">("дети");
  const [tariffHave, setTariffHave] = useState<TariffHave>("all");
  const [liveTariffIds, setLiveTariffIds] = useState<Set<number>>(() => new Set(readLiveIds()));
  const [liveTariffBusy, setLiveTariffBusy] = useState(false);
  const [liveReady, setLiveReady] = useState(() => readLiveIds().length > 0);
  const [tariffProgress, setTariffProgress] = useState<{ done: number; total: number; extra: string } | null>(null);
  const [pickedGroup, setPickedGroup] = useState<CrmSlot | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [groupArchive, setGroupArchive] = useState<GroupMember[]>([]);
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const [groupLoading, setGroupLoading] = useState(false);
  const [funnelItems, setFunnelItems] = useState<LeadCard[]>(() => funnelSnapGet(0)?.items || funnelSnapGet(clientsSnap?.branch || 0)?.items || []);
  const [funnelStages, setFunnelStages] = useState<LeadStage[]>(() => funnelSnapGet(clientsSnap?.branch || 0)?.stages || LEAD_STAGES);
  const [funnelLoading, setFunnelLoading] = useState(false);
  const [funnelW, setFunnelW] = useState(400);
  const [funnelNote, setFunnelNote] = useState("");
  const funnelWRef = useRef(400);
  const funnelMoved = useRef(new Map<string, number>());
  const funnelGone = useRef(new Set<string>());
  const funnelAt = useRef<Record<number, number>>(funnelSnapTimes());
  const funnelSeq = useRef(0);
  const funnelItemsRef = useRef<LeadCard[]>([]);
  const [leadKeys, setLeadKeys] = useState<Set<string> | null>(null);
  const leadKeysRef = useRef<Set<string> | null>(null);
  const groupMenuRef = useRef<HTMLDivElement>(null);
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  const searchT = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const autoPull = useRef(false);
  const groupGen = useRef(0);
  const groupPack = useRef(new Map<string, { members: GroupMember[]; archive: GroupMember[]; info: GroupInfo }>());
  const qRef = useRef("");
  const statusRef = useRef<Status>("учится");
  const branchRef = useRef(0);
  const ageRef = useRef("");
  const activeIdRef = useRef(0);
  const desktopRef = useRef(desktop);
  const viewRef = useRef<"дети" | "группы">("дети");
  const liveTariffAt = useRef(0);
  const rowsRef = useRef<ClientRow[]>(rows);
  const wasActive = useRef(active);
  qRef.current = q;
  statusRef.current = status;
  branchRef.current = branch;
  ageRef.current = age;
  desktopRef.current = desktop;
  viewRef.current = view;
  rowsRef.current = rows;

  useEffect(() => {
    if (active && !wasActive.current && viewRef.current === "группы") {
      setView("дети");
      setPickedGroup(null);
      setGroupInfo(null);
      setGroupMembers([]);
      setGroupArchive([]);
    }
    wasActive.current = active;
  }, [active]);

  async function loadLiveTariffs(force = false) {
    if (liveTariffBusy) return;
    if (!force && liveTariffAt.current && Date.now() - liveTariffAt.current < 120000 && liveTariffIds.size) return;
    setLiveTariffBusy(true);
    type Pack = {
      ok?: boolean;
      ids?: number[];
      done?: boolean;
      next?: number;
      total?: number;
      fromCache?: boolean;
      extra?: string;
      live?: number;
    };
    const live = new Set(liveTariffIds);
    function merge(ids: number[] | undefined) {
      for (const id of ids || []) if (Number(id)) live.add(Number(id));
      setLiveTariffIds(new Set(live));
      if (live.size) {
        setLiveReady(true);
        writeLiveIds([...live]);
      }
    }
    try {
      const first = (await retryFetch(
        () => adminSchedule({ data: { token: token(), action: "clientsLiveTariffs", force } as never }),
        1,
        45000,
      )) as Pack;
      merge(first.ids);
      liveTariffAt.current = Date.now();
      setTariffProgress(null);
      if (force) await load(qRef.current, statusRef.current, branchRef.current, ageRef.current);
    } finally {
      setLiveTariffBusy(false);
    }
  }

  function pickTariffHave(next: TariffHave) {
    setTariffHave(next);
    if (next !== "all") void loadLiveTariffs();
  }

  useEffect(() => {
    if (liveTariffIds.size) return;
    const ids = rows.filter((r) => r.hasLiveTariff).map((r) => Number(r.crmId) || 0).filter(Boolean);
    if (!ids.length) return;
    setLiveTariffIds(new Set(ids));
    setLiveReady(true);
    writeLiveIds(ids);
  }, [rows, liveTariffIds.size]);

  async function load(nextQ = q, nextStatus = status, nextBranch = branch, nextAge = age) {
    if (!rowsRef.current.length) setBusy(true);
    try {
      const res = (await retryFetch(() => loadFromDisk("clients", { q: nextQ, status: nextStatus, branchId: nextBranch, ageBand: nextAge }), 2, 20000)) as {
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
        rowsRef.current = res.items;
        setTotal(Number(res.total) || res.items.length);
        if (res.counts) setCounts(res.counts);
        if (res.branchCounts) setBranchCounts(res.branchCounts);
        if (res.lastCrmSync) setSynced(res.lastCrmSync);
        clientsSnap = {
          q: nextQ,
          status: nextStatus,
          branch: nextBranch,
          age: nextAge,
          items: res.items,
          total: Number(res.total) || res.items.length,
          counts: res.counts || counts,
          branchCounts: res.branchCounts || { 1: 0, 2: 0, 3: 0, 4: 0 },
          synced: res.lastCrmSync || "",
          all: Number(res.all || 0),
        };
        writeClientsSnap(clientsSnap);
        const all = Number(res.all || 0);
        if (!autoPull.current && !nextQ && nextStatus === "учится" && all === 0 && !res.items.length) {
          autoPull.current = true;
          void pullKind("clients");
        }
        const keep = activeIdRef.current;
        const still = keep && res.items.some((r) => Number(r.crmId) === keep);
        if (!res.items.length) {
          setCard(null);
          setActiveId(0);
          activeIdRef.current = 0;
        } else if (!still && desktopRef.current && viewRef.current === "дети" && nextStatus !== "лид") {
          const first = res.items[0];
          window.requestAnimationFrame(() => {
            if (activeIdRef.current) return;
            void openRow(first);
          });
        }
      }
    } catch {
      /* keep cache on screen */
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
      if (!res.ok || res.error) {
        setPull((u) => ({ ...u, done: true, error: res.error || "AlfaCRM не ответила.", lines: res.lines || u.lines, kind: "clients" }));
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
      if (kind === "clientsLeads") {
        leadKeysRef.current = null;
        setLeadKeys(null);
        void loadFunnel(branchRef.current, true);
      }
      setStatus(nextStatus);
      await load(qRef.current, nextStatus, branchRef.current, ageRef.current);
      if (viewRef.current === "группы") void openFirstGroup(nextStatus);
    } catch (e) {
      setPull((u) => ({
        ...u,
        done: true,
        error: e instanceof Error && e.message ? e.message : "Не удалось загрузить клиентов.",
        kind: "clients",
      }));
    }
  }

  async function loadFunnel(bid: number, force = false, delta = false) {
    const seq = ++funnelSeq.current;
    const have = funnelItemsRef.current.length > 0 || funnelAt.current[bid] > 0;
    if (force || !have) setFunnelLoading(!have);
    const watching = () => bid === 0 || bid === branchRef.current;
    if (watching()) {
      if (delta && have) setFunnelNote("Сверяю изменения в AlfaCRM…");
      else if (force && have) setFunnelNote("Обновляю доску CRM…");
      else if (!have) setFunnelNote("Загружаю лидов из AlfaCRM…");
    }
    const watchdog = window.setTimeout(() => {
      if (seq !== funnelSeq.current) return;
      setFunnelLoading(false);
      if (watching() && !funnelAt.current[bid]) setFunnelNote("CRM отвечает долго. Доска откроется, как только дойдёт.");
    }, 15000);
    try {
      const res = (await adminSchedule({
        data: { token: token(), action: "leadsBoard", branchId: bid, force, delta } as never,
      })) as { ok?: boolean; error?: string; stages?: LeadStage[]; items?: LeadCard[]; total?: number; note?: string; delta?: boolean };
      if (res.ok && Array.isArray(res.items)) {
        const nextStages = mergeStages(res.stages || [], res.items.map((x) => x.statusId));
        const moved = funnelMoved.current;
        const packed =
          moved.size || funnelGone.current.size
            ? res.items
                .filter((it) => !funnelGone.current.has(`${it.branchId}:${it.id}`))
                .map((it) => {
                  const v = moved.get(`${it.branchId}:${it.id}`);
                  return v == null ? it : { ...it, statusId: v };
                })
            : res.items;
        const nextItems = mergeBranchLeadCards(funnelItemsRef.current, packed, bid);
        funnelItemsRef.current = nextItems;
        funnelAt.current[bid] = Date.now();
        funnelSnapPut(bid, nextStages, packed);
        setFunnelStages(nextStages);
        setFunnelItems(nextItems);
        if (watching()) setFunnelNote(res.note || (packed.length ? `${packed.length} лидов` : "Пустая воронка."));
        return;
      }
      if (watching()) setFunnelNote(res.error || "AlfaCRM не отдала воронку лидов.");
    } catch (e) {
      if (watching()) setFunnelNote(e instanceof Error && e.message ? e.message : "Не удалось загрузить воронку лидов.");
    } finally {
      window.clearTimeout(watchdog);
      if (seq === funnelSeq.current) setFunnelLoading(false);
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
      applyLiveStatus(crmId, bid, next);
      if ((next.tariffs || []).some((t) => !t.archived)) {
        setLiveTariffIds((s) => {
          if (s.has(crmId)) return s;
          const n = new Set(s);
          n.add(crmId);
          return n;
        });
        setLiveReady(true);
      }
    }
  }

  function applyLiveStatus(crmId: number, bid: number, next: CustomerCard) {
    const live = next.status === "лид" || next.isStudy === 0 ? "лид" : next.status === "архив" || next.isStudy === 2 ? "архив" : "учится";
    const tab = statusRef.current;
    const prev = rowsRef.current.find((row) => Number(row.crmId) === crmId)?.status;
    setRows((xs) => {
      const i = xs.findIndex((row) => Number(row.crmId) === crmId);
      if (tab && tab !== "все" && tab !== live) {
        if (i < 0) return xs;
        const copy = xs.filter((_, j) => j !== i);
        rowsRef.current = copy;
        return copy;
      }
      if (i < 0) return xs;
      const copy = xs.slice();
      copy[i] = { ...copy[i], status: live };
      rowsRef.current = copy;
      return copy;
    });
    if (prev && prev !== live) {
      setCounts((c) => {
        const nextCounts = { ...c };
        if (prev === "учится" || prev === "лид" || prev === "архив") nextCounts[prev] = Math.max(0, (nextCounts[prev] || 0) - 1);
        if (live === "учится" || live === "лид" || live === "архив") nextCounts[live] = (nextCounts[live] || 0) + 1;
        return nextCounts;
      });
    }
    if (live === "лид") {
      setFunnelItems((xs) => {
        if (xs.some((x) => x.id === crmId && x.branchId === bid)) return xs;
        return [
          ...xs,
          {
            id: crmId,
            customerId: crmId,
            branchId: bid,
            name: next.name || "",
            age: next.age || "",
            phone: next.phones?.[0] || "",
            email: next.emails?.[0] || "",
            note: next.note || "",
            assigned: "",
            statusId: Number(next.leadStatusId || 0),
            sort: 0,
            at: "",
            chats: 0,
          },
        ];
      });
    } else {
      setFunnelItems((xs) => xs.filter((x) => !(x.id === crmId && x.branchId === bid)));
    }
  }

  async function mutateCard(action: "customerSave" | "customerLesson" | "customerPay" | "customerTariff" | "customerGroup", extra: Record<string, unknown> = {}) {
    if (!card) return;
    const res = await adminSchedule({
      data: { token: token(), action, customerId: card.id, branchId: card.branchId, ...extra } as never,
    });
    if (!res.ok) throw new Error(("error" in res && res.error) || "AlfaCRM не приняла изменение.");
    if ("customer" in res && res.customer) {
      const next = res.customer as CustomerCard;
      setCard(next);
      applyLiveStatus(card.id, card.branchId, next);
    }
  }

  async function openById(customerId: number, branchId: number) {
    const crmId = Number(customerId) || 0;
    if (!crmId) return;
    const row = rows.find((r) => Number(r.crmId) === crmId);
    await openRow(row || emptyRow(crmId, branchId || 1));
  }

  useEffect(() => {
    void load(qRef.current, statusRef.current, branchRef.current, ageRef.current);
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
    const t = window.setInterval(() => {
      void load(qRef.current, statusRef.current, branchRef.current, ageRef.current);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(t);
  }, []);

  useLayoutEffect(() => {
    if (!(status === "лид" && view === "дети")) return;
    if (funnelItemsRef.current.length) return;
    const snap = funnelSnapGet(0);
    if (!snap?.items?.length) return;
    funnelItemsRef.current = snap.items;
    setFunnelItems(snap.items);
    if (snap.stages?.length) setFunnelStages(mergeStages(snap.stages));
  }, [status, view, branch]);

  useEffect(() => {
    funnelItemsRef.current = funnelItems;
  }, [funnelItems]);

  useEffect(() => {
    if (!(status === "лид" && view === "дети")) return;
    const snap = funnelSnapGet(branch) || funnelSnapGet(0);
    if (snap?.items?.length) {
      funnelAt.current[branch] = Number(snap.at) || Date.now();
      if (!funnelItemsRef.current.length) {
        funnelItemsRef.current = snap.items;
        setFunnelItems(snap.items);
        if (snap.stages?.length) setFunnelStages(mergeStages(snap.stages));
      }
      return;
    }
    void loadFunnel(branch, false, false);
  }, [status, view, branch]);

  useEffect(() => {
    if (!funnelNote || funnelNote.startsWith("Записываю")) return;
    const info = /с воронки CRM|из API is_study/i.test(funnelNote);
    const t = window.setTimeout(() => setFunnelNote(""), info ? 3500 : 8000);
    return () => window.clearTimeout(t);
  }, [funnelNote]);

  useEffect(() => {
    if (!(status === "лид" && view === "дети")) return;
    const t = window.setInterval(() => void loadFunnel(branchRef.current, false, true), crmSyncMinutes() * 60 * 1000);
    return () => window.clearInterval(t);
  }, [status, view]);

  useEffect(() => {
    if (!groupOpen) return;
    function onDoc(e: MouseEvent) {
      if (groupMenuRef.current && !groupMenuRef.current.contains(e.target as Node)) setGroupOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setGroupOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [groupOpen]);

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

  const liveSet = useMemo(() => {
    const live = new Set(liveTariffIds);
    for (const r of rows) if (r.hasLiveTariff && Number(r.crmId)) live.add(Number(r.crmId));
    return live;
  }, [liveTariffIds, rows]);
  const shown = useMemo(() => {
    return keepByLiveTariff(rows, tariffHave, liveSet, (r) => Number(r.crmId) || 0).slice(0, cap);
  }, [rows, cap, tariffHave, liveSet]);
  const funnelOn = status === "лид" && view === "дети";
  const tariffCounts = useMemo(() => {
    const pool = funnelOn ? funnelItems.map((it) => Number(it.customerId || it.id) || 0) : rows.map((r) => Number(r.crmId) || 0);
    let withN = 0;
    for (const id of pool) if (id && liveSet.has(id)) withN += 1;
    return { all: pool.length, with: withN, without: Math.max(0, pool.length - withN), ready: true };
  }, [funnelOn, funnelItems, rows, liveSet]);
  const chipCounts = useMemo(() => {
    const next = { ...branchCounts };
    if (!funnelOn || !funnelItems.length) return next;
    const tally: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const it of funnelItems) {
      if (tally[it.branchId] != null) tally[it.branchId] += 1;
    }
    for (const id of [1, 2, 3, 4] as const) {
      if (tally[id] > 0) next[id] = tally[id];
    }
    return next;
  }, [branchCounts, funnelOn, funnelItems]);
  const branchSum = (chipCounts[1] || 0) + (chipCounts[2] || 0) + (chipCounts[3] || 0) + (chipCounts[4] || 0);
  const funnelWas = useRef(false);
  useEffect(() => {
    try {
      const n = Number(localStorage.getItem("ra_funnel_card_w") || 0);
      if (n >= 280 && n <= 760) {
        setFunnelW(n);
        funnelWRef.current = n;
      }
    } catch {
      /* */
    }
  }, []);
  useEffect(() => {
    if (funnelOn && !funnelWas.current) {
      setCard(null);
      setActiveId(0);
      activeIdRef.current = 0;
    }
    funnelWas.current = funnelOn;
  }, [funnelOn]);
  const funnelShown = useMemo(
    () =>
      keepByLiveTariff(
        filterLeadCards(funnelItems, { branch, age, q, gone: funnelGone.current }),
        tariffHave,
        liveSet,
        (it) => Number(it.customerId || it.id) || 0,
      ),
    [funnelItems, q, branch, age, tariffHave, liveSet],
  );
  const activeIndex = shown.findIndex((r) => Number(r.crmId) === activeId);
  const joinedIds = new Set((card?.groups || []).filter((g) => g.active).map((g) => g.id));
  const groupOpts = useMemo(() => {
    const seen = new Set<string>();
    const out: CrmSlot[] = [];
    for (const s of slots) {
      if (!s.groupId || !isAdminGroup(s.statusId)) continue;
      if (branch && s.branchId !== branch) continue;
      if (!ageMatches(s, age)) continue;
      const key = `${s.branchId}:${s.groupId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    out.sort((a, b) => a.groupName.localeCompare(b.groupName, "ru") || a.day - b.day || a.timeFrom.localeCompare(b.timeFrom));
    return out;
  }, [slots, branch, age]);
  const freeGroupOpts = groupOpts.filter((s) => !joinedIds.has(s.groupId));
  const shownGroups = useMemo(() => {
    let list = groupOpts;
    if (status === "лид") {
      list = leadKeys ? list.filter((s) => leadKeys.has(`${s.branchId}:${s.groupId}`)) : [];
    }
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter((s) =>
      `${s.groupName} ${s.teacher} ${s.age} ${s.course} ${CRM_BRANCH[s.branchId]?.short || ""}`.toLowerCase().includes(qq),
    );
  }, [groupOpts, status, leadKeys, q]);
  const warmupKey = shownGroups.slice(0, 6).map((s) => `${s.branchId}:${s.groupId}`).join(",");
  useEffect(() => {
    if (view !== "группы" || !warmupKey) return;
    shownGroups.slice(0, 6).forEach((s) => {
      if (s.groupId && !groupPack.current.has(`${s.branchId}:${s.groupId}`)) void prefetchGroup(s);
    });
  }, [view, warmupKey]);
  const memberShown = useMemo(() => {
    const qq = q.trim().toLowerCase().replace(/ё/g, "е");
    const list = [
      ...groupMembers.map((m) => ({ ...m, archived: false })),
      ...groupArchive.map((m) => ({ ...m, archived: true })),
    ];
    if (!qq) return list;
    return list.filter((m) =>
      `${m.name} ${m.parent} ${m.phone} ${m.id} ${m.age}`.toLowerCase().replace(/ё/g, "е").includes(qq),
    );
  }, [groupMembers, groupArchive, q]);

  async function loadLeadKeys() {
    if (leadKeysRef.current) return leadKeysRef.current;
    const res = (await retryFetch(() => loadFromDisk("clients", { q: "", status: "лид", branchId: 0, ageBand: "" }), 2, 20000)) as {
      items?: ClientRow[];
    };
    const keys = new Set<string>();
    for (const r of res.items || []) {
      for (const g of r.groupLinks || []) {
        if (g.id) keys.add(`${Number(g.branchId || r.branchId || 0)}:${g.id}`);
      }
    }
    leadKeysRef.current = keys;
    setLeadKeys(keys);
    return keys;
  }

  useEffect(() => {
    if (status !== "лид") return;
    void loadLeadKeys();
  }, [status]);

  async function openFirstGroup(statusNow: Status, list?: CrmSlot[]) {
    let rows = list;
    if (!rows) {
      if (statusNow === "лид") {
        const keys = await loadLeadKeys();
        rows = groupOpts.filter((s) => keys.has(`${s.branchId}:${s.groupId}`));
      } else rows = groupOpts;
    }
    const first = rows[0];
    if (first) await openGroupSlot(first);
    else {
      setPickedGroup(null);
      setGroupInfo(null);
      setGroupMembers([]);
      setGroupArchive([]);
    }
  }

  async function openGroupSlot(s: CrmSlot) {
    if (!s.groupId) return;
    const key = `${s.branchId}:${s.groupId}`;
    const gen = ++groupGen.current;
    setView("группы");
    setPickedGroup(s);
    setCard(null);
    setActiveId(0);
    activeIdRef.current = 0;
    setGroupOpen(false);
    const cached = groupPack.current.get(key);
    if (cached) {
      setGroupMembers(cached.members);
      setGroupArchive(cached.archive);
      setGroupInfo(cached.info);
      setGroupLoading(false);
    } else {
      setGroupLoading(true);
      setGroupMembers([]);
      setGroupArchive([]);
      setGroupInfo({
        description: s.description || s.groupNote || "",
        remarks: s.remarks || "",
        hashtags: (s.hashtags || "").replace(/\s+/g, " ").trim(),
        makeup: s.makeup || "",
        statusId: s.statusId || 0,
        bDate: s.bDate || "",
        eDate: s.eDate || "",
        levelId: s.levelId || 0,
        signup: s.signup || "",
        subjectId: s.subjectId || 0,
        calendar: slotCalendar(s),
        tariffs: [],
      });
    }
    try {
      const [people, res] = await Promise.all([
        adminSchedule({
          data: { token: token(), action: "groupMembers", groupId: s.groupId, branchId: s.branchId } as never,
        }),
        adminSchedule({
          data: { token: token(), action: "groupGet", groupId: s.groupId, branchId: s.branchId, lite: true } as never,
        }),
      ]);
      if (gen !== groupGen.current) return;
      const members = people.ok && "active" in people ? ((people.active || []) as GroupMember[]) : [];
      const archive = people.ok && "archive" in people ? ((people.archive || []) as GroupMember[]) : [];
      const g = res.ok && "group" in res && res.group
        ? (res.group as {
            note?: string;
            description?: string;
            remarks?: string;
            hashtags?: string;
            makeup?: string;
            statusId?: number;
            signup?: string;
            subjectId?: number;
            bDate?: string;
            eDate?: string;
            levelId?: number;
            calendar?: GroupCalLesson[];
          })
        : null;
      const info: GroupInfo = {
        description: g?.description || g?.note || s.description || s.groupNote || "",
        remarks: g?.remarks || s.remarks || "",
        hashtags: ((g?.hashtags || s.hashtags || "").replace(/\s+/g, " ").trim()),
        makeup: g?.makeup || s.makeup || "",
        statusId: g?.statusId || s.statusId || 0,
        bDate: g?.bDate || s.bDate || "",
        eDate: g?.eDate || s.eDate || "",
        levelId: g?.levelId || s.levelId || 0,
        signup: g?.signup || s.signup || "",
        subjectId: g?.subjectId || s.subjectId || 0,
        calendar: g?.calendar?.length ? g.calendar : cached?.info.calendar?.length ? cached.info.calendar : slotCalendar(s),
        tariffs: res.ok && "tariffs" in res && Array.isArray(res.tariffs)
          ? (res.tariffs as GroupInfo["tariffs"]).filter((t) => t.fit)
          : cached?.info.tariffs || [],
      };
      setGroupMembers(members);
      setGroupArchive(archive);
      setGroupInfo(info);
      groupPack.current.set(key, { members, archive, info });
      const i = shownGroups.findIndex((x) => x.groupId === s.groupId && x.branchId === s.branchId);
      [shownGroups[i - 1], shownGroups[i + 1], shownGroups[i + 2], shownGroups[i + 3]]
        .filter((x): x is CrmSlot => Boolean(x?.groupId))
        .forEach((next) => {
          if (!groupPack.current.has(`${next.branchId}:${next.groupId}`)) void prefetchGroup(next);
        });
    } finally {
      if (gen === groupGen.current) setGroupLoading(false);
    }
  }

  async function prefetchGroup(s: CrmSlot) {
    if (!s.groupId) return;
    const key = `${s.branchId}:${s.groupId}`;
    if (groupPack.current.has(key)) return;
    try {
      const [people, res] = await Promise.all([
        adminSchedule({
          data: { token: token(), action: "groupMembers", groupId: s.groupId, branchId: s.branchId, diskOnly: true } as never,
        }),
        adminSchedule({
          data: { token: token(), action: "groupGet", groupId: s.groupId, branchId: s.branchId, lite: true } as never,
        }),
      ]);
      if (groupPack.current.has(key)) return;
      const members = people.ok && "active" in people ? ((people.active || []) as GroupMember[]) : [];
      const archive = people.ok && "archive" in people ? ((people.archive || []) as GroupMember[]) : [];
      const g = res.ok && "group" in res && res.group
        ? (res.group as { note?: string; description?: string; remarks?: string; hashtags?: string; makeup?: string; statusId?: number; signup?: string; subjectId?: number; bDate?: string; eDate?: string; levelId?: number; calendar?: GroupCalLesson[] })
        : null;
      groupPack.current.set(key, {
        members,
        archive,
        info: {
          description: g?.description || g?.note || s.description || s.groupNote || "",
          remarks: g?.remarks || s.remarks || "",
          hashtags: (g?.hashtags || s.hashtags || "").replace(/\s+/g, " ").trim(),
          makeup: g?.makeup || s.makeup || "",
          statusId: g?.statusId || s.statusId || 0,
          bDate: g?.bDate || s.bDate || "",
          eDate: g?.eDate || s.eDate || "",
          levelId: g?.levelId || s.levelId || 0,
          signup: g?.signup || s.signup || "",
          subjectId: g?.subjectId || s.subjectId || 0,
          calendar: g?.calendar || [],
          tariffs: res.ok && "tariffs" in res && Array.isArray(res.tariffs) ? (res.tariffs as GroupInfo["tariffs"]).filter((t) => t.fit) : [],
        },
      });
    } catch {
      /* prefetch is best-effort */
    }
  }

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
      className="flex h-full min-h-0 flex-1 flex-col"
      data-cabinet-id={CABINET_ID}
      data-pane="clients"
      data-screen={wide ? "wide" : "normal"}
      data-filter-status={status}
      data-filter-branch={branch}
      data-filter-age={age}
      data-filter-tariff={tariffHave}
    >
      <div className="shrink-0 rounded-[1.4rem] bg-white p-3 shadow-[var(--shadow-border)] md:px-4 md:py-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-10 w-full max-w-[22rem] items-center gap-2 rounded-full bg-surface-2 px-3 ring-1 ring-black/6 transition-[box-shadow] duration-[var(--motion-quick)] focus-within:ring-2 focus-within:ring-primary/35">
            <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            <input
              value={q}
              onChange={(e) => {
                const v = e.target.value;
                setQ(v);
                window.clearTimeout(searchT.current);
                searchT.current = window.setTimeout(() => {
                  if (viewRef.current === "дети") void load(v, status, branch, age);
                }, 120);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => e.preventDefault()}
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
              placeholder={view === "группы" ? "Группа, педагог, возраст" : status === "лид" ? "Лид, телефон, этап" : "Имя, телефон, customerId"}
              className="h-10 w-full bg-transparent text-sm outline-none"
              aria-label={view === "группы" ? "Поиск групп" : "Поиск клиентов"}
            />
            <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 font-mono text-[0.68rem] tabular-nums text-muted">
              {busy || groupLoading || funnelLoading ? "…" : view === "группы" ? `${shownGroups.length}` : funnelOn ? `${funnelShown.length}` : `${shown.length}${total > shown.length ? `/${total}` : ""}`}
            </span>
          </label>
          <div className="flex h-10 items-center rounded-full bg-surface-2 p-1" data-sort-group="status" role="tablist" aria-label="Текущие или лиды">
            {([
              ["учится", "Текущие", counts.учится],
              ["лид", "Лиды", counts.лид],
            ] as const).map(([id, label, n]) => {
              const on = status === id;
              return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={on}
                data-sort="status"
                data-id={id}
                onClick={() => {
                  setStatus(id);
                  setCap(120);
                  if (view === "дети") {
                    setPickedGroup(null);
                    void load(q, id, branch, age);
                    return;
                  }
                  setCard(null);
                  setActiveId(0);
                  activeIdRef.current = 0;
                  void openFirstGroup(id);
                }}
                className={cn(
                  "h-8 rounded-full px-3.5 text-[0.8rem] font-semibold transition-colors duration-[var(--motion-quick)]",
                  on ? "bg-primary text-white shadow-sm" : "text-muted hover:text-fg",
                )}
              >
                {label}
                <span className="ml-1 tabular-nums opacity-80">{n}</span>
              </button>
              );
            })}
          </div>
          <span className="hidden h-6 w-px bg-black/10 sm:block" aria-hidden />
          <div className="flex h-10 items-center rounded-full bg-surface-2 p-1" data-sort-group="entity" role="tablist" aria-label="Группы или дети">
            {([
              ["группы", "Группы", status === "лид" ? (leadKeys ? shownGroups.length : "…") : groupOpts.length],
              ["дети", "Дети", status === "лид" ? counts.лид : counts.учится],
            ] as const).map(([id, label, n]) => {
              const on = id === "группы" ? view === "группы" : view === "дети";
              return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={on}
                data-sort="entity"
                data-id={id}
                onClick={() => {
                  if (id === "группы") {
                    setView("группы");
                    setCard(null);
                    setActiveId(0);
                    activeIdRef.current = 0;
                    void openFirstGroup(status);
                    return;
                  }
                  setView("дети");
                  setPickedGroup(null);
                  setCap(120);
                  void load(q, status, branch, age);
                }}
                className={cn(
                  "h-8 rounded-full px-3.5 text-[0.8rem] font-semibold transition-colors duration-[var(--motion-quick)]",
                  on ? "bg-primary text-white shadow-sm" : "text-muted hover:text-fg",
                )}
              >
                {label}
                <span className="ml-1 tabular-nums opacity-80">{n}</span>
              </button>
              );
            })}
          </div>
          <div className="flex h-10 max-w-full items-center rounded-full bg-surface-2 p-1" data-sort-group="tariff" role="tablist" aria-label="Абонемент">
            {([
              ["all", "Все", tariffCounts.all],
              ["with", "С абонементом", liveTariffBusy && !tariffCounts.with ? "…" : tariffCounts.with],
              ["without", "Без абонемента", liveTariffBusy && !tariffCounts.with ? "…" : tariffCounts.without],
            ] as const).map(([id, label, n]) => {
              const on = tariffHave === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  data-sort="tariff"
                  data-id={id}
                  onClick={() => pickTariffHave(id)}
                  className={cn(
                    "h-8 rounded-full px-3 text-[0.8rem] font-semibold transition-colors duration-[var(--motion-quick)]",
                    on ? "bg-primary text-white shadow-sm" : "text-muted hover:text-fg",
                  )}
                >
                  {label}
                  <span className="ml-1 tabular-nums opacity-80">{n}</span>
                </button>
              );
            })}
          </div>
          {liveTariffBusy && tariffProgress && !tariffProgress.extra.includes("хранилищ") ? (
            <p className="px-1 py-1 text-[0.72rem] text-muted">{tariffProgress.extra || "Обновляю абонементы…"}</p>
          ) : null}

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
            <button
              type="button"
              className="inline-flex h-10 items-center rounded-full px-3 text-[0.8rem] font-semibold text-fg hover:bg-surface-2 disabled:opacity-50"
              disabled={busy || pull.open}
              onClick={() => void pullKind("clientsLeads")}
            >
              Загрузить доску CRM
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center rounded-full px-3 text-[0.8rem] font-semibold text-fg hover:bg-surface-2 disabled:opacity-50"
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
              {counts.архив ? `Архив ${counts.архив}` : "Загрузить архив"}
            </button>
          </div>
        </div>
        {hint ? <p className="mt-2 rounded-xl bg-primary/10 px-3 py-1.5 text-sm font-medium text-fg">{hint}</p> : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <span className="pr-1 text-[0.72rem] font-bold uppercase tracking-[0.12em] text-fg">Филиал</span>
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
                <span className="ml-1 tabular-nums opacity-70">{chipCounts[id] || 0}</span>
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <span className="pr-1 text-[0.72rem] font-bold uppercase tracking-[0.12em] text-fg">Возраст</span>
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
          <div className="ml-auto flex items-center gap-1.5">
            <div className="relative" ref={groupMenuRef} data-op="group-filter">
            <button
              type="button"
              data-op="add-group"
              onClick={() => setGroupOpen((v) => !v)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[0.75rem] font-semibold ring-1 transition-colors",
                groupOpen ? "bg-fg text-white ring-fg" : "bg-surface-2 text-fg ring-black/8 hover:bg-white",
              )}
            >
              Группа
              <span className="tabular-nums opacity-80">{groupOpts.length}</span>
              <span className="text-[0.65rem] opacity-70">▾</span>
            </button>
            {groupOpen ? (
              <div className={cn("absolute right-0 top-9 z-50 w-[min(28rem,calc(100vw-2rem))] overflow-hidden", RA_POP)}>
                <p className="border-b border-black/6 px-3 py-2 text-[0.72rem] text-muted">
                  {card ? `Добавить «${displayPersonName(card.name, card.parent)}» в группу` : "Откройте карточку клиента — затем плюс у группы"}
                  {branch ? ` · ${CRM_BRANCH[branch]?.short}` : ""}
                  {age ? ` · ${AGE_BANDS.find((b) => b.id === age)?.label || age}` : ""}
                </p>
                <ul className="max-h-72 overflow-y-auto pretty-scroll py-1">
                  {groupOpts.length ? groupOpts.map((s) => {
                    const key = `${s.branchId}:${s.groupId}`;
                    const inGroup = joinedIds.has(s.groupId);
                    const busyPlus = addingGroup === key;
                    return (
                      <li key={key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-surface-2">
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => void openGroupSlot(s)}
                        >
                          <p className="truncate text-[0.82rem] font-medium">{s.groupName}</p>
                          <p className="truncate text-[0.7rem] text-muted">
                            {[s.dayLabel && s.timeFrom ? `${s.dayLabel} ${s.timeFrom}${s.timeTo ? `–${s.timeTo}` : ""}` : "", s.age, s.teacher, !branch ? CRM_BRANCH[s.branchId]?.short : ""]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </button>
                        <button
                          type="button"
                          title={inGroup ? "уже в этой группе" : "добавить в группу"}
                          disabled={!card || inGroup || Boolean(addingGroup)}
                          data-group-id={s.groupId}
                          data-branch-id={s.branchId}
                          className={cn(
                            "grid h-7 w-7 shrink-0 place-items-center rounded-full text-lg leading-none",
                            inGroup ? "bg-primary/15 text-primary" : "bg-primary text-white hover:bg-primary/90 disabled:opacity-40",
                          )}
                          onClick={() => {
                            if (!card || inGroup) return;
                            setAddingGroup(key);
                            void mutateCard("customerGroup", { groupId: s.groupId, branchId: s.branchId || card.branchId }).finally(() => setAddingGroup(""));
                          }}
                        >
                          {busyPlus ? "…" : inGroup ? "✓" : <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />}
                        </button>
                      </li>
                    );
                  }) : (
                    <li className="px-3 py-4 text-center text-sm text-muted">Нет групп в этой выборке.</li>
                  )}
                </ul>
              </div>
            ) : null}
          </div>
          </div>
          {synced ? <span className="hidden text-[0.68rem] text-muted xl:inline">{new Date(synced).toLocaleString("ru-RU")}</span> : null}
        </div>
        {status === "архив" && !counts.архив ? (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">Архив на сайте пуст. Нажмите «загрузить архив» — только is_study=2.</p>
        ) : null}
        {status === "лид" && !counts.лид ? (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">Лидов на сайте нет. Нажмите «Загрузить лиды» — только активные is_study=0. Архивные лиды с сайта удаляются.</p>
        ) : null}
      </div>

      <div
        className={cn(
          "mt-3 min-h-0 flex-1 items-stretch overflow-hidden",
          funnelOn && card && desktop
            ? "grid gap-0"
            : funnelOn
              ? "flex flex-col gap-3"
              : "grid gap-3 lg:grid-cols-[22rem_minmax(0,1fr)]",
        )}
        style={funnelOn && card && desktop ? { gridTemplateColumns: `minmax(0,1fr) ${funnelW}px` } : undefined}
        data-layout={funnelOn ? "lead-funnel" : "list-card"}
      >
        {funnelOn ? (
          funnelLoading && !funnelShown.length ? (
            <p className="m-auto text-sm text-muted">Загружаю воронку лидов AlfaCRM…</p>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {funnelNote ? (
                <p className="shrink-0 px-3 py-2 text-[0.78rem] text-muted">{funnelNote}</p>
              ) : null}
            <CrmLeadBoard
              stages={funnelStages}
              items={funnelShown}
              activeId={activeId}
              hideBranch={Boolean(branch)}
              onOpen={(lead) => void openById(lead.customerId || lead.id, lead.branchId || 1)}
              onMove={(lead, statusId, beforeId) => {
                if (!lead.id) return;
                const key = `${lead.branchId}:${lead.id}`;
                const prev = lead.statusId;
                const sameCol = prev === statusId;
                funnelMoved.current.set(key, statusId);
                const src = funnelItems.length ? funnelItems : funnelShown;
                const nextItems = reorderLeads(src, lead, statusId, beforeId);
                setFunnelItems(nextItems);
                funnelSnapPut(branchRef.current, funnelStages, nextItems);
                const colNow = nextItems.filter((x) => x.statusId === statusId);
                const idx = colNow.findIndex((x) => x.id === lead.id && x.branchId === lead.branchId);
                const sort = Math.max(0, idx) * 10;
                void adminSchedule({
                  data: { token: token(), action: "leadMove", leadId: lead.id, branchId: lead.branchId, leadStatusId: statusId, sort } as never,
                }).then((res) => {
                  if (res && res.ok) return;
                  if (sameCol) return;
                  funnelMoved.current.delete(key);
                  setFunnelItems((xs) => xs.map((x) => (x.id === lead.id && x.branchId === lead.branchId ? { ...x, statusId: prev } : x)));
                });
              }}
              onArchive={(lead) => {
                const key = `${lead.branchId}:${lead.id}`;
                funnelGone.current.add(key);
                setFunnelItems((xs) => {
                  const src = xs.length ? xs : funnelShown;
                  const next = src.filter((x) => !(x.id === lead.id && x.branchId === lead.branchId));
                  funnelSnapPut(branchRef.current, funnelStages, next);
                  return next;
                });
                if (activeId === lead.customerId || activeId === lead.id) {
                  setCard(null);
                  setActiveId(0);
                  activeIdRef.current = 0;
                }
                void adminSchedule({
                  data: { token: token(), action: "leadArchive", leadId: lead.id, branchId: lead.branchId } as never,
                }).then((res) => {
                  if (res && res.ok) return;
                  funnelGone.current.delete(key);
                  setFunnelItems((xs) => {
                    if (xs.some((x) => x.id === lead.id && x.branchId === lead.branchId)) return xs;
                    return [lead, ...xs];
                  });
                });
              }}
              onRenameStage={(id, name) => {
                setFunnelStages((xs) => xs.map((s) => (s.id === id ? { ...s, name } : s)));
                void adminSchedule({
                  data: { token: token(), action: "leadStageSave", stageId: id, name, branchId: branchRef.current } as never,
                }).then((res) => {
                  if (res && "stages" in res && Array.isArray(res.stages)) setFunnelStages(mergeStages(res.stages as LeadStage[]));
                });
              }}
              onDeleteStage={(id) => {
                setFunnelStages((xs) => xs.filter((s) => s.id !== id));
                setFunnelItems((xs) => xs.map((it) => (it.statusId === id ? { ...it, statusId: 0 } : it)));
                void adminSchedule({
                  data: { token: token(), action: "leadStageDelete", stageId: id, branchId: branchRef.current } as never,
                }).then((res) => {
                  if (res && "stages" in res && Array.isArray(res.stages)) {
                    setFunnelStages(mergeStages(res.stages as LeadStage[]));
                    if ("items" in res && Array.isArray(res.items)) setFunnelItems(res.items as LeadCard[]);
                  }
                });
              }}
              onReorderStages={(ids) => {
                const prev = funnelStages;
                setFunnelNote("Записываю порядок в AlfaCRM…");
                setFunnelStages((xs) => {
                  const by = new Map(xs.map((s) => [s.id, s]));
                  const next = ids.map((id) => by.get(id)).filter((s): s is LeadStage => Boolean(s));
                  for (const s of xs) if (!next.some((x) => x.id === s.id)) next.push(s);
                  funnelSnapPut(branchRef.current, next, funnelItems);
                  return next;
                });
                void adminSchedule({
                  data: { token: token(), action: "leadStageSort", stageIds: ids, branchId: branchRef.current } as never,
                }).then((res) => {
                  if (res && "ok" in res && res.ok && "stages" in res && Array.isArray(res.stages)) {
                    setFunnelStages(mergeStages(res.stages as LeadStage[]));
                    setFunnelNote("Порядок записан в AlfaCRM. Обновите страницу этапов воронки в CRM.");
                    return;
                  }
                  setFunnelStages(prev);
                  setFunnelNote((res && "error" in res && String(res.error || "")) || "AlfaCRM не приняла новый порядок этапов.");
                });
              }}
            />
            </div>
          )
        ) : (
        <div ref={listRef} className="pretty-scroll min-h-0 space-y-1.5 overflow-y-auto p-2 max-lg:max-h-[72vh] lg:h-full">
          {view === "группы"
            ? shownGroups.map((s) => {
                const title = s.groupName || `группа ${s.groupId}`;
                const on = pickedGroup && s.groupId === pickedGroup.groupId && s.branchId === pickedGroup.branchId;
                return (
                  <button
                    key={`${s.branchId}-${s.groupId}`}
                    type="button"
                    onClick={() => void openGroupSlot(s)}
                    data-group-id={s.groupId}
                    data-branch-id={s.branchId}
                    data-card-id={groupCardId(s.branchId, s.groupId)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-[1rem] bg-white px-2.5 py-2 text-left shadow-[var(--shadow-border)] transition-[box-shadow,transform] duration-[var(--motion-quick)] ease-[var(--ease-out)]",
                      on ? "shadow-[0_0_0_2px_var(--color-primary,#2563eb)]" : "hover:shadow-[var(--shadow-border-hover)]",
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-mono text-[0.68rem] font-bold text-primary">
                      {s.groupId}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-1.5">
                        <span className="truncate font-display text-[0.95rem] leading-tight">{title}</span>
                        <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[0.62rem] font-semibold text-muted">
                          {CRM_BRANCH[s.branchId]?.short || s.city || "филиал"}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[0.72rem] text-muted">
                        {[s.age, s.dayLabel && s.timeFrom ? `${s.dayLabel} ${s.timeFrom}` : "", s.teacher].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                );
              })
            : shown.map((r) => {
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
                  on ? "shadow-[0_0_0_2px_var(--color-primary,#2563eb)]" : "hover:shadow-[var(--shadow-border-hover)]",
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
                    {[
                      r.age ? `${r.age} лет` : "",
                      (r.groupLinks || []).filter((g) => g.active !== false).map((g) => g.name).find(Boolean) || "",
                      parent,
                      r.phone,
                      CRM_BRANCH[Number(r.branchId) || 0]?.short,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </button>
            );
          })}
          {view === "группы" && !groupLoading && !shownGroups.length ? (
            <p className="rounded-[1.2rem] bg-white px-4 py-10 text-center text-sm text-muted ring-1 ring-black/6">
              {status === "лид" ? "Нет групп, в которых есть лиды." : "Нет групп в этой выборке."}
            </p>
          ) : null}
          {view === "дети" && total > shown.length ? (
            <button type="button" className="w-full rounded-[1.2rem] bg-white py-3 text-sm font-semibold text-primary ring-1 ring-black/6" onClick={() => setCap((n) => n + 120)}>
              Ещё {Math.min(120, total - shown.length)} из {total - shown.length}
            </button>
          ) : null}
          {view === "дети" && !busy && !shown.length ? (
            <p className="rounded-[1.2rem] bg-white px-4 py-10 text-center text-sm text-muted ring-1 ring-black/6">
              {status === "архив" ? "Архив пуст в этой выборке." : status === "лид" ? "Лидов нет в этой выборке." : "Текущих клиентов нет. Нажмите «Обновить»."}
            </p>
          ) : null}
        </div>
        )}
        {funnelOn && !(card && desktop) ? null : (
        <div className="hidden min-h-0 min-w-0 lg:flex lg:h-full lg:flex-col lg:overflow-hidden">
          {view === "группы" && pickedGroup && !card ? (
            <article
              className="pretty-scroll min-h-0 flex-1 overflow-y-auto rounded-[1.2rem] p-4 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)] md:p-5"
              style={{ background: ADMIN_PANEL_BLUE }}
              data-card-id={`card:group:${pickedGroup.branchId}:${pickedGroup.groupId}`}
              data-group-id={pickedGroup.groupId}
              data-branch-id={pickedGroup.branchId}
            >
              {groupLoading ? <GroupLoadScene hint={pickedGroup.groupName} /> : null}
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">
                Карточка группы · card:group:{pickedGroup.branchId}:{pickedGroup.groupId}
              </p>
              <h4 className="font-display mt-1 text-[1.45rem] leading-tight">{pickedGroup.groupName}</h4>
              <p className="mt-1.5 flex flex-wrap gap-1.5 text-sm text-muted">
                <span className="rounded-full bg-white px-2 py-0.5 font-mono text-[0.72rem] ring-1 ring-black/8">gid {pickedGroup.groupId}</span>
                {CRM_BRANCH[pickedGroup.branchId]?.short ? <span>{CRM_BRANCH[pickedGroup.branchId]?.short}</span> : null}
                {pickedGroup.age ? <span>{pickedGroup.age}</span> : null}
                {pickedGroup.course ? <span>{pickedGroup.course}</span> : null}
                {pickedGroup.teacher ? <span>{pickedGroup.teacher}</span> : null}
              </p>
              <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-sm ring-1 ring-black/6">
                {[
                  pickedGroup.dayLabel && pickedGroup.timeFrom ? `${pickedGroup.dayLabel} ${pickedGroup.timeFrom}${pickedGroup.timeTo ? `–${pickedGroup.timeTo}` : ""}` : "",
                  pickedGroup.timesPerWeek > 1 ? `${pickedGroup.timesPerWeek} раза в неделю` : "",
                  pickedGroup.city,
                  pickedGroup.branch,
                  groupInfo?.bDate || pickedGroup.bDate ? `период ${groupInfo?.bDate || pickedGroup.bDate || "…"} – ${groupInfo?.eDate || pickedGroup.eDate || "…"}` : "",
                  `${groupMembers.filter((m) => m.status !== "лид").length} уч. · ${groupMembers.filter((m) => m.status === "лид").length} лид. · ${groupArchive.length} арх. / ${pickedGroup.limit || "—"} мест`,
                ].filter(Boolean).join(" · ")}
              </p>
              {groupInfo?.calendar?.length ? (
                <div className="mt-3">
                  <LessonStrip
                    lessons={groupInfo.calendar}
                    group={pickedGroup.groupName}
                    subject={pickedGroup.subject}
                    teacher={pickedGroup.teacher}
                    branchId={pickedGroup.branchId}
                    groupId={pickedGroup.groupId}
                    onLessons={(calendar) => setGroupInfo((g) => (g ? { ...g, calendar } : g))}
                  />
                </div>
              ) : null}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                  Описание
                  <p className="mt-1 min-h-10 rounded-md bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8">
                    {groupInfo?.description || "—"}
                  </p>
                </label>
                <label className="block text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                  Примечания
                  <p className="mt-1 min-h-10 rounded-md bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8">
                    {groupInfo?.remarks || "—"}
                  </p>
                </label>
                <label className="block text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                  Хэштеги
                  <span className="ml-1 font-normal normal-case tracking-normal text-muted">не для привязок</span>
                  <p className="mt-1 min-h-10 rounded-md bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8">
                    {groupInfo?.hashtags || "—"}
                  </p>
                </label>
                <label className="block text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                  Отработка
                  <p className="mt-1 min-h-10 rounded-md bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8">
                    {groupInfo?.makeup || "—"}
                  </p>
                </label>
                <label className="block text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                  Статус
                  <p className="mt-1 min-h-10 rounded-md bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8">
                    {GROUP_STATUS.find((st) => st.id === (groupInfo?.statusId || pickedGroup.statusId))?.name || "—"}
                  </p>
                </label>
                <label className="block text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
                  Предмет
                  <p className="mt-1 min-h-10 rounded-md bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-fg ring-1 ring-black/8">
                    {pickedGroup.subject || pickedGroup.course || (groupInfo?.subjectId ? `id ${groupInfo.subjectId}` : "—")}
                  </p>
                </label>
                <label className="block text-[0.72rem] font-semibold uppercase tracking-wider text-muted sm:col-span-2">
                  Абонементы
                  <div className="mt-1 flex min-h-10 flex-wrap items-center gap-1 rounded-md bg-white px-2 py-1.5 ring-1 ring-black/8">
                    {groupInfo?.tariffs?.length
                      ? groupInfo.tariffs.map((t) => (
                          <span key={t.id} className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[0.75rem] font-medium text-sky-900">
                            {t.name} · {Math.round(t.price).toLocaleString("ru-RU")} ₽
                          </span>
                        ))
                      : <span className="text-sm text-muted">нет совпадения по предмету</span>}
                  </div>
                </label>
              </div>
              {groupInfo?.signup ? (
                <a href={groupInfo.signup} target="_blank" rel="noreferrer" className="mt-3 inline-flex h-10 items-center rounded-md bg-white px-3 text-sm font-semibold text-primary ring-1 ring-black/8">
                  Запись в группу {pickedGroup.groupId}
                </a>
              ) : null}
              <CrmGroupMembers
                title="Ученики"
                items={keepByLiveTariff(groupMembers.filter((m) => m.status !== "лид"), tariffHave, liveSet, (m) => m.id)}
                onOpen={(m) => void openById(m.id, pickedGroup.branchId)}
                loading={groupLoading}
              />
              <CrmGroupMembers
                title="Лиды"
                items={keepByLiveTariff(groupMembers.filter((m) => m.status === "лид"), tariffHave, liveSet, (m) => m.id)}
                onOpen={(m) => void openById(m.id, pickedGroup.branchId)}
                variant="lead"
                loading={groupLoading}
              />
              <CrmGroupMembers
                title="Архивные ученики"
                items={keepByLiveTariff(groupArchive, tariffHave, liveSet, (m) => m.id)}
                onOpen={(m) => void openById(m.id, pickedGroup.branchId)}
                variant="archive"
                loading={groupLoading}
              />
            </article>
          ) : card ? (
            <div className={cn("relative min-h-0 min-w-0 flex-1 overflow-hidden p-1", funnelOn && "pl-3")}>
            {funnelOn ? (
            <button
              type="button"
              aria-label="Ширина карточки"
              title="Потяните, чтобы изменить ширину карточки"
              className="absolute left-0 top-3 bottom-3 z-10 w-2 cursor-col-resize rounded-full bg-black/10 hover:bg-primary/50"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const startX = e.clientX;
                const startW = funnelWRef.current;
                const move = (ev: PointerEvent) => {
                  const next = Math.min(760, Math.max(280, startW - (ev.clientX - startX)));
                  funnelWRef.current = next;
                  setFunnelW(next);
                };
                const up = () => {
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", up);
                  try {
                    localStorage.setItem("ra_funnel_card_w", String(funnelWRef.current));
                  } catch {
                    /* */
                  }
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
              }}
            />
            ) : null}
            <CrmClientCard
              card={card}
              loading={cardLoading}
              variant="panel"
              wide={funnelOn ? false : wide}
              layout={funnelOn ? "lead" : "client"}
              groupChoices={freeGroupOpts.map((s) => ({
                id: s.groupId,
                name: s.groupName,
                branchId: s.branchId,
                subjectId: s.subjectId || undefined,
                teacher: s.teacher,
                day: s.dayLabel,
                from: s.timeFrom,
                to: s.timeTo,
                course: s.course,
                school: s.school,
                schoolId: s.schoolId,
                courseId: s.courseId,
              }))}
              onClose={() => {
                if (viewRef.current === "группы") {
                  setCard(null);
                  setActiveId(0);
                  activeIdRef.current = 0;
                  return;
                }
                if (desktopRef.current) {
                  const first = shown[0];
                  if (first && Number(first.crmId) !== activeId) void openRow(first);
                  return;
                }
                setCard(null);
                setActiveId(0);
                activeIdRef.current = 0;
              }}
              onOpenGroup={(gid, bid) => {
                const s = groupOpts.find((g) => g.groupId === gid && g.branchId === bid) || groupOpts.find((g) => g.groupId === gid);
                if (s) void openGroupSlot(s);
                else onOpenGroup(gid, bid);
              }}
              onAction={mutateCard}
            />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-[1.4rem] bg-white px-6 text-center text-sm text-muted shadow-[var(--shadow-border)]">
              {view === "группы" ? "Выберите группу слева — карточка откроется здесь." : <>Выберите человека — карточка <span className="mx-1 font-mono">card:customer:{"{id}"}</span> откроется здесь.</>}
            </div>
          )}
        </div>
        )}
      </div>

      {card && !desktop ? (
        <CrmClientCard
          card={card}
          loading={cardLoading}
          wide={funnelOn ? false : wide}
          layout={funnelOn ? "lead" : "client"}
          groupChoices={freeGroupOpts.map((s) => ({
            id: s.groupId,
            name: s.groupName,
            branchId: s.branchId,
            subjectId: s.subjectId || undefined,
            teacher: s.teacher,
            day: s.dayLabel,
            from: s.timeFrom,
            to: s.timeTo,
            course: s.course,
            school: s.school,
            schoolId: s.schoolId,
            courseId: s.courseId,
          }))}
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
      {funnelNote && typeof document !== "undefined"
        ? createPortal(
            <div className="pointer-events-none fixed bottom-4 left-1/2 z-[400] max-w-[min(90vw,20rem)] -translate-x-1/2 rounded-full bg-slate-100/95 px-3 py-1 text-center text-[0.7rem] leading-snug text-slate-500 shadow-sm ring-1 ring-black/[0.06]">
              {/с воронки CRM|из API is_study/i.test(funnelNote) ? funnelNote.replace(/\s*\(.*\)\s*$/, "").trim() : funnelNote}
            </div>,
            document.body,
          )
        : null}
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
