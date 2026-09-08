"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminSchedule } from "@/data/admin-schedule";
import { CRM_BRANCH } from "@/data/ids";
import { CARD_PAY_KINDS } from "@/data/crm-cards";
import {
  ALFA_PAY_ACCOUNTS,
  ALFA_PAY_ITEMS,
  ALFA_PAY_MANAGERS,
  ALFA_PAY_METHODS,
  defaultPayItemId,
  locationIdForBranch,
  locationsOfBranch,
  payItemGroups,
} from "@/data/crm-pay-alfa";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { printCashDraft } from "@/components/crm-client-card";
import { RaSelect } from "@/components/ra-select";
import { CASH_PAGE_SIZES, payAccountLabel } from "@/data/crm-pay-core";
import { ISO_DATE_MAX, ISO_DATE_MIN, RA_POP, clampIsoDate } from "@/data/admin-ui";

function ruToIso(d: string) {
  const s = String(d || "").trim();
  const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (ru) return `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

function money(n?: number) {
  return `${Number(n || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

function kindName(kind: string) {
  return CARD_PAY_KINDS.find((k) => k.id === kind)?.name || kind || "Доход";
}

function itemName(id?: number) {
  const n = Number(id) || 0;
  return ALFA_PAY_ITEMS.find((x) => x.id === n)?.name || (n ? `#${n}` : "—");
}

function methodName(id?: string) {
  const s = String(id || "");
  return ALFA_PAY_METHODS.find((x) => x.id === s)?.name || "—";
}

function rowSum(p: { kind?: string; income?: number; expenditure?: number }) {
  if (p.kind === "product") return 0;
  return Number(p.income || 0) - Number(p.expenditure || 0);
}

type CashRow = {
  id: number;
  customerId: number;
  branchId: number;
  kind: string;
  income: number;
  expenditure: number;
  note: string;
  documentDate: string;
  at?: string;
  cttId?: number;
  payItemId?: number;
  payAccountId?: number;
  locationId?: number;
  managerId?: number;
  payMethod?: string;
  groupId?: number;
  payerName?: string;
  deleted?: boolean;
  name: string;
  parent: string;
  phone: string;
  branchName: string;
};

type CashEdit = {
  id: number;
  customerId: number;
  branchId: number;
  name: string;
  parent: string;
  kind: string;
  sum: string;
  date: string;
  payAccountId: string;
  payItemId: string;
  locationId: string;
  managerId: string;
  cttId: string;
  payer: string;
  groupId: string;
  note: string;
  payMethod: string;
};

function editFromRow(p: CashRow): CashEdit {
  const bid = Number(p.branchId) || 1;
  return {
    id: p.id,
    customerId: p.customerId,
    branchId: bid,
    name: p.name,
    parent: p.parent,
    kind: p.kind || "income",
    sum: String(p.kind === "refund" ? p.expenditure || "" : p.income || ""),
    date: ruToIso(p.documentDate || ""),
    payAccountId: String(p.payAccountId || 1),
    payItemId: String(p.payItemId || defaultPayItemId(bid)),
    locationId: String(p.locationId || locationIdForBranch(bid) || ""),
    managerId: p.managerId ? String(p.managerId) : "",
    cttId: p.cttId != null && Number(p.cttId) !== 0 ? String(p.cttId) : "-1",
    payer: p.payerName || p.parent || "",
    groupId: p.groupId ? String(p.groupId) : "",
    note: p.note || "",
    payMethod: p.payMethod || "",
  };
}

type CashPoll = { lastNote?: string; hits?: number; max?: number; allowed?: boolean; fillDone?: boolean; fillNote?: string };

export function AdminCash({ active, onOpenClient }: { active?: boolean; onOpenClient: (customerId: number, branchId: number) => void }) {
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState(0);
  const [kind, setKind] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [items, setItems] = useState<CashRow[]>([]);
  const [total, setTotal] = useState(0);
  const [poll, setPoll] = useState<CashPoll>({});
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [take, setTake] = useState<(typeof CASH_PAGE_SIZES)[number]>(50);
  const [page, setPage] = useState(0);
  const [edit, setEdit] = useState<CashEdit | null>(null);
  const hydratedIds = useRef(new Set<number>());

  const load = useCallback(
    async (extra: { q?: string; branchId?: number; payKind?: string; includeDeleted?: boolean; take?: number; page?: number } = {}) => {
      setBusy("list");
      const size = extra.take ?? take;
      const pg = extra.page ?? page;
      try {
        const res = await adminSchedule({
          data: {
            token: token(),
            action: "cashList",
            q: extra.q ?? q,
            branchId: extra.branchId ?? branch,
            payKind: extra.payKind ?? kind,
            includeDeleted: extra.includeDeleted ?? includeDeleted,
            take: size,
            skip: pg * size,
          } as never,
        });
        if (!res.ok) {
          setNote(("error" in res && String(res.error)) || "Не удалось прочитать кассу с диска.");
          return;
        }
        setItems(("items" in res && Array.isArray(res.items) ? res.items : []) as CashRow[]);
        setTotal("total" in res ? Number(res.total) || 0 : 0);
        setPoll(("poll" in res && res.poll && typeof res.poll === "object" ? res.poll : {}) as CashPoll);
        setNote("");
        const pageItems = ("items" in res && Array.isArray(res.items) ? res.items : []) as CashRow[];
        const missing = pageItems.filter((p) => {
          const cid = Number(p.customerId) || 0;
          if (!cid || hydratedIds.current.has(cid)) return false;
          return /^клиент\s+\d+$/i.test(String(p.name || "").trim());
        });
        if (missing.length) {
          for (const p of missing) hydratedIds.current.add(Number(p.customerId));
          const hyd = await adminSchedule({
            data: {
              token: token(),
              action: "cashHydrateNames",
              people: missing.slice(0, 12).map((p) => ({ customerId: p.customerId, branchId: p.branchId || 1 })),
            } as never,
          });
          const people = "people" in hyd && Array.isArray(hyd.people) ? (hyd.people as { customerId: number; name?: string; parent?: string; phone?: string }[]) : [];
          if (people.length) {
            const byId = new Map(people.map((x) => [Number(x.customerId), x]));
            setItems((prev) =>
              prev.map((p) => {
                const n = byId.get(Number(p.customerId));
                if (!n?.name || /^клиент\s+\d+$/i.test(n.name)) return p;
                return { ...p, name: n.name, parent: n.parent || p.parent, phone: n.phone || p.phone };
              }),
            );
          }
        }
      } catch (e) {
        setNote(e instanceof Error ? e.message : "Не удалось прочитать кассу.");
      } finally {
        setBusy("");
      }
    },
    [q, branch, kind, includeDeleted, take, page],
  );

  useEffect(() => {
    if (active === false) return;
    void load();
  }, [active, load]);

  async function pollAlfa() {
    setBusy("poll");
    try {
      const res = await adminSchedule({ data: { token: token(), action: "cashPoll" } as never });
      const msg = "note" in res ? String(res.note || "") : "";
      setNote(msg || (res.ok ? "Касса обновлена с диска Alfa." : "Лимит опроса или ошибка."));
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Опрос кассы не прошёл.");
    } finally {
      setBusy("");
    }
  }

  const selectionSum = useMemo(() => items.reduce((n, p) => n + rowSum(p), 0), [items]);

  async function pushPay(p: { id: number; customerId: number; branchId: number }) {
    setBusy("push");
    try {
      const res = (await adminSchedule({
        data: { token: token(), action: "customerPayPush", payId: p.id, id: p.id, customerId: p.customerId, branchId: p.branchId } as never,
      })) as { ok?: boolean; error?: string; local?: boolean; note?: string };
      setNote(res.ok ? (res.local ? `Платёж ${p.id} ещё на диске: ${res.note || "Alfa не ответила"}` : `Платёж ${p.id} ушёл в Alfa`) : res.error || "Не ушло");
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Не ушло");
    } finally {
      setBusy("");
    }
  }

  async function saveEdit(andPush: boolean) {
    if (!edit) return;
    const sum = Number(String(edit.sum).replace(",", "."));
    if (!sum) {
      setNote("Укажите сумму.");
      return;
    }
    if (!edit.payItemId) {
      setNote("Укажите статью — Alfa без неё платёж не примет.");
      return;
    }
    setBusy(andPush ? "push" : "save");
    try {
      const saved = (await adminSchedule({
        data: {
          token: token(),
          action: "customerPay",
          customerId: edit.customerId,
          branchId: edit.branchId,
          payId: edit.id,
          payKind: edit.kind,
          sum,
          payAccountId: Number(edit.payAccountId) || 1,
          payItemId: Number(edit.payItemId) || 0,
          locationId: Number(edit.locationId) || 0,
          managerId: Number(edit.managerId) || 0,
          cttId: Number(edit.cttId) || -1,
          payerName: edit.payer,
          groupId: Number(edit.groupId) || 0,
          note: edit.note,
          payMethod: edit.payMethod,
          documentDate: edit.date,
        } as never,
      })) as { ok?: boolean; error?: string };
      if (!saved.ok) {
        setNote(saved.error || "Не сохранилось");
        return;
      }
      if (andPush) {
        const sent = (await adminSchedule({
          data: { token: token(), action: "customerPayPush", payId: edit.id, id: edit.id, customerId: edit.customerId, branchId: edit.branchId } as never,
        })) as { ok?: boolean; error?: string };
        setNote(sent.ok ? `Платёж ${edit.id} сохранён и в очереди Alfa` : sent.error || "Сохранено, в Alfa не ушло");
      } else {
        setNote(`Платёж ${edit.id} сохранён`);
      }
      setEdit(null);
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Не сохранилось");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)]" data-op="cash-tab">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="font-display text-xl">Касса</p>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Правда на диске. Базовый счет — без абонемента, раздельный — с абонементом. «Обновить кассу» подтягивает историю Alfa порциями (и новые). По 50 / 100 / 500 строк на странице.
          </p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setPage(0);
              void load({ q: e.currentTarget.value, page: 0 });
            }
          }}
          placeholder="id клиента, имя, телефон"
          className="ml-auto h-9 w-64 rounded-full bg-white px-3 text-sm ring-1 ring-black/10"
        />
        <Button type="button" size="sm" className="h-9" variant="secondary" disabled={Boolean(busy)} onClick={() => { setPage(0); void load({ page: 0 }); }}>
          Найти
        </Button>
        <Button type="button" size="sm" className="h-9" data-op="cash-poll" disabled={Boolean(busy)} onClick={() => void pollAlfa()}>
          {busy === "poll" ? "Спрашиваю Alfa…" : "Обновить кассу"}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {[{ id: 0, short: "Все филиалы" }, ...[1, 2, 3, 4].map((id) => ({ id, short: CRM_BRANCH[id]?.short || String(id) }))].map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => {
              setBranch(b.id);
              setPage(0);
              void load({ branchId: b.id, page: 0 });
            }}
            className={cn(
              "rounded-full px-3 py-1 text-[0.78rem] font-semibold ring-1",
              branch === b.id ? "bg-primary text-white ring-primary" : "bg-white text-fg ring-black/10",
            )}
          >
            {b.short}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => {
            setKind("");
            setPage(0);
            void load({ payKind: "", page: 0 });
          }}
          className={cn("rounded-full px-3 py-1 text-[0.78rem] font-semibold ring-1", !kind ? "bg-fg text-white ring-fg" : "bg-white text-fg ring-black/10")}
        >
          Все типы
        </button>
        {CARD_PAY_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => {
              setKind(k.id);
              setPage(0);
              void load({ payKind: k.id, page: 0 });
            }}
            className={cn(
              "rounded-full px-3 py-1 text-[0.78rem] font-semibold ring-1",
              kind === k.id ? "bg-fg text-white ring-fg" : "bg-white text-fg ring-black/10",
            )}
          >
            {k.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            const next = !includeDeleted;
            setIncludeDeleted(next);
            setPage(0);
            void load({ includeDeleted: next, page: 0 });
          }}
          className={cn(
            "rounded-full px-3 py-1 text-[0.78rem] font-semibold ring-1",
            includeDeleted ? "bg-rose-600 text-white ring-rose-600" : "bg-white text-fg ring-black/10",
          )}
        >
          включая удалённые
        </button>
      </div>

      <p className="mt-3 text-[0.78rem] text-muted">
        {total} платежей · на странице {items.length} · сумма строк {money(selectionSum)} · опрос {poll.hits || 0}/{poll.max || 10} за час
        {poll.fillNote ? ` · ${poll.fillNote}` : ""}
        {poll.lastNote ? ` · ${poll.lastNote}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {CASH_PAGE_SIZES.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              setTake(n);
              setPage(0);
              void load({ take: n, page: 0 });
            }}
            className={cn("rounded-full px-3 py-1 text-[0.78rem] font-semibold ring-1", take === n ? "bg-primary text-white ring-primary" : "bg-white text-fg ring-black/10")}
            data-op="cash-page-size"
          >
            по {n}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1 text-[0.78rem] text-muted">
          <button
            type="button"
            disabled={page <= 0 || Boolean(busy)}
            className="rounded-full px-2 py-0.5 font-semibold ring-1 ring-black/10 disabled:opacity-40"
            onClick={() => {
              const next = Math.max(0, page - 1);
              setPage(next);
              void load({ page: next });
            }}
          >
            ←
          </button>
          стр. {page + 1} / {Math.max(1, Math.ceil(total / take) || 1)}
          <button
            type="button"
            disabled={Boolean(busy) || (page + 1) * take >= total}
            className="rounded-full px-2 py-0.5 font-semibold ring-1 ring-black/10 disabled:opacity-40"
            onClick={() => {
              const next = page + 1;
              setPage(next);
              void load({ page: next });
            }}
          >
            →
          </button>
        </span>
      </div>
      {note ? <p className="mt-1 text-sm font-medium text-primary">{note}</p> : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[64rem] text-left text-[0.84rem]">
          <thead className="text-[0.7rem] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-2 py-2">Дата</th>
              <th className="px-2 py-2">Клиент</th>
              <th className="px-2 py-2">Филиал</th>
              <th className="px-2 py-2">Тип</th>
              <th className="px-2 py-2">Сумма</th>
              <th className="px-2 py-2">Статья</th>
              <th className="px-2 py-2">Способ</th>
              <th className="px-2 py-2">Счёт</th>
              <th className="px-2 py-2">Коммент</th>
              <th className="px-2 py-2">id</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const sum = Number(p.income || 0) - Number(p.expenditure || 0);
              return (
                <tr key={`${p.branchId}:${p.id}:${p.customerId}`} className={cn("border-t border-black/6", p.deleted && "opacity-50")}>
                  <td className="px-2 py-2 whitespace-nowrap tabular-nums">{p.documentDate || "—"}</td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      className="text-left font-medium text-primary hover:underline"
                      data-op="cash-open-client"
                      onClick={() => onOpenClient(p.customerId, p.branchId || 1)}
                    >
                      {p.name && !/^клиент\s+\d+$/i.test(p.name) ? p.name : p.parent || `клиент ${p.customerId}`}
                    </button>
                    <p className="text-[0.72rem] text-muted">
                      {p.customerId}
                      {p.phone ? ` · ${p.phone}` : ""}
                    </p>
                  </td>
                  <td className="px-2 py-2">{p.branchName || CRM_BRANCH[p.branchId]?.short || p.branchId}</td>
                  <td className="px-2 py-2">{kindName(p.kind)}</td>
                  <td className={cn("px-2 py-2 whitespace-nowrap tabular-nums font-semibold", sum < 0 ? "text-rose-600" : "")}>
                    {p.kind === "product" ? money(p.income) : `${sum > 0 ? "+" : ""}${money(sum)}`}
                  </td>
                  <td className="px-2 py-2">{itemName(p.payItemId)}</td>
                  <td className="px-2 py-2">{methodName(p.payMethod)}</td>
                  <td className="max-w-[12rem] truncate px-2 py-2" title={payAccountLabel(p.cttId)}>
                    {payAccountLabel(p.cttId)}
                    {Number(p.cttId) > 0 ? ` · абонемент ${p.cttId}` : ""}
                  </td>
                  <td className="max-w-[12rem] truncate px-2 py-2" title={p.note}>
                    {p.note || "—"}
                  </td>
                  <td className="px-2 py-2 tabular-nums text-muted">{p.id}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      data-op="pay-print"
                      className="text-[0.72rem] font-semibold text-primary"
                      onClick={() =>
                        printCashDraft({
                          name: p.name,
                          parent: p.parent,
                          date: p.documentDate,
                          kind: kindName(p.kind),
                          sum: money(p.kind === "product" ? p.income : sum),
                          article: itemName(p.payItemId),
                          method: methodName(p.payMethod),
                          cttId: p.cttId,
                          note: p.note,
                          id: p.id,
                          branch: p.branchName,
                        })
                      }
                    >
                      Печать
                    </button>
                    <button
                      type="button"
                      data-op="pay-edit"
                      className="ml-2 text-[0.72rem] font-semibold text-primary disabled:opacity-40"
                      disabled={Boolean(busy) || p.deleted}
                      onClick={() => setEdit(editFromRow(p))}
                    >
                      Изменить
                    </button>
                    <button
                      type="button"
                      data-op="cash-pay-push"
                      className="ml-2 text-[0.72rem] font-semibold text-primary disabled:opacity-40"
                      disabled={Boolean(busy) || p.deleted}
                      onClick={() => void pushPay(p)}
                    >
                      В CRM
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!items.length && busy !== "list" ? <p className="px-2 py-6 text-sm text-muted">На диске нет платежей в этой выборке.</p> : null}
        {busy === "list" ? <p className="px-2 py-3 text-sm text-muted">Читаю диск…</p> : null}
      </div>
      {edit && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/50 p-3 backdrop-blur-[3px]" onClick={() => setEdit(null)} data-op="cash-pay-edit">
              <div className={cn("flex max-h-[min(92vh,40rem)] w-full max-w-[28rem] flex-col overflow-hidden", RA_POP)} onClick={(e) => e.stopPropagation()}>
                <header className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-4">
                  <div className="min-w-0">
                    <h3 className="font-display text-[1.25rem] leading-tight">Править платёж · {edit.id}</h3>
                    <p className="mt-0.5 text-[0.78rem] text-muted">
                      {edit.name || `клиент ${edit.customerId}`}
                      {edit.id < 0 ? " · ещё только на диске" : " · уже в Alfa"}
                    </p>
                  </div>
                  <button type="button" className="grid size-8 shrink-0 place-items-center rounded-full text-lg leading-none text-muted hover:bg-surface-2" onClick={() => setEdit(null)} aria-label="Закрыть">
                    ×
                  </button>
                </header>
                <div className="shrink-0 flex flex-wrap gap-0.5 px-5 pb-2">
                  {CARD_PAY_KINDS.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      className={cn("rounded-lg px-2 py-1 text-[0.72rem] font-medium", edit.kind === k.id ? "bg-primary/10 text-primary" : "hover:bg-surface-2")}
                      onClick={() => setEdit({ ...edit, kind: k.id })}
                    >
                      {k.name}
                    </button>
                  ))}
                </div>
                <div className="pretty-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-4">
                  <div className="grid grid-cols-1 items-center gap-x-3 gap-y-2 text-[0.78rem] sm:grid-cols-[7.5rem_minmax(0,1fr)]">
                    <span className="text-muted">Тип и дата</span>
                    <div className="flex min-w-0 gap-1">
                      <span className="flex h-9 min-w-0 flex-1 items-center truncate rounded-lg bg-surface-2 px-2 text-muted">{kindName(edit.kind)}</span>
                      <input
                        type="date"
                        value={edit.date}
                        min={ISO_DATE_MIN}
                        max={ISO_DATE_MAX}
                        onChange={(e) => setEdit({ ...edit, date: clampIsoDate(e.target.value) })}
                        className="h-9 w-[10.5rem] shrink-0 rounded-lg bg-surface-2 px-1.5 ring-1 ring-black/8"
                      />
                    </div>
                    <span className="text-muted">Счёт</span>
                    <div className="min-w-0">
                      <RaSelect
                        value={edit.payAccountId}
                        onChange={(v) => setEdit({ ...edit, payAccountId: v })}
                        options={ALFA_PAY_ACCOUNTS.map((x) => ({ value: String(x.id), label: x.name }))}
                      />
                    </div>
                    <span className="text-muted">Статья</span>
                    <div className="min-w-0">
                      <RaSelect value={edit.payItemId} onChange={(v) => setEdit({ ...edit, payItemId: v })} groups={payItemGroups(edit.branchId)} placeholder="Статья дохода" />
                    </div>
                    <span className="text-muted">Локация</span>
                    <div className="min-w-0">
                      <RaSelect
                        value={edit.locationId}
                        onChange={(v) => setEdit({ ...edit, locationId: v })}
                        options={[
                          { value: "", label: "(не задано)" },
                          ...locationsOfBranch(edit.branchId)
                            .filter((x) => x.id > 0)
                            .map((x) => ({ value: String(x.id), label: x.name })),
                        ]}
                      />
                    </div>
                    <span className="text-muted">Менеджер</span>
                    <div className="min-w-0">
                      <RaSelect
                        value={edit.managerId}
                        onChange={(v) => setEdit({ ...edit, managerId: v })}
                        options={[{ value: "", label: "(не задано)" }, ...ALFA_PAY_MANAGERS.map((x) => ({ value: String(x.id), label: x.name }))]}
                      />
                    </div>
                    <span className="text-muted">Клиентский счёт</span>
                    <div className="min-w-0">
                      <RaSelect
                        value={edit.cttId}
                        onChange={(v) => setEdit({ ...edit, cttId: v })}
                        options={[
                          { value: "-1", label: "Базовый счет" },
                          ...(Number(edit.cttId) > 0 ? [{ value: edit.cttId, label: `Абонемент ${edit.cttId}` }] : []),
                        ]}
                      />
                    </div>
                    <span className="text-muted">Сумма</span>
                    <input
                      value={edit.sum}
                      onChange={(e) => setEdit({ ...edit, sum: e.target.value })}
                      placeholder="Например, 5000"
                      className="h-9 min-w-0 rounded-lg bg-surface-2 px-2 ring-1 ring-black/8"
                    />
                    <span className="text-muted">Плательщик</span>
                    <input
                      value={edit.payer}
                      onChange={(e) => setEdit({ ...edit, payer: e.target.value })}
                      placeholder="ФИО родителя"
                      className="h-9 min-w-0 rounded-lg bg-surface-2 px-2 ring-1 ring-black/8"
                    />
                    <span className="text-muted">Группа</span>
                    <input
                      value={edit.groupId}
                      onChange={(e) => setEdit({ ...edit, groupId: e.target.value.replace(/\D/g, "") })}
                      placeholder="id группы"
                      className="h-9 min-w-0 rounded-lg bg-surface-2 px-2 ring-1 ring-black/8"
                    />
                    <span className="text-muted">Комментарий</span>
                    <input
                      value={edit.note}
                      onChange={(e) => setEdit({ ...edit, note: e.target.value })}
                      placeholder="Оплата за обучение"
                      className="h-9 min-w-0 rounded-lg bg-surface-2 px-2 ring-1 ring-black/8"
                    />
                    <span className="text-muted">Способ внесения</span>
                    <div className="min-w-0">
                      <RaSelect
                        value={edit.payMethod}
                        onChange={(v) => setEdit({ ...edit, payMethod: v })}
                        options={ALFA_PAY_METHODS.map((x) => ({ value: x.id, label: x.name }))}
                      />
                    </div>
                  </div>
                </div>
                <footer className="flex shrink-0 justify-end gap-2 border-t border-black/8 px-5 py-3">
                  <Button type="button" size="sm" className="h-9 px-4" variant="ghost" onClick={() => setEdit(null)}>
                    Отмена
                  </Button>
                  <Button type="button" size="sm" className="h-9 px-4" variant="ghost" data-op="customerPayPush" disabled={Boolean(busy)} onClick={() => void saveEdit(true)}>
                    {busy === "push" ? "Отправляю…" : "Отправить в CRM"}
                  </Button>
                  <Button type="button" size="sm" className="h-9 px-4" data-op="customerPay" disabled={Boolean(busy) || !edit.payItemId} onClick={() => void saveEdit(false)}>
                    {busy === "save" ? "Сохраняю…" : "Сохранить"}
                  </Button>
                </footer>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
