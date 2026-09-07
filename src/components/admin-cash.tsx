"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminSchedule } from "@/data/admin-schedule";
import { CRM_BRANCH } from "@/data/ids";
import { CARD_PAY_KINDS } from "@/data/crm-cards";
import { ALFA_PAY_ITEMS, ALFA_PAY_METHODS } from "@/data/crm-pay-alfa";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { printCashDraft } from "@/components/crm-client-card";
import { CASH_PAGE_SIZES, payAccountLabel } from "@/data/crm-pay-core";

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
  payMethod?: string;
  groupId?: number;
  deleted?: boolean;
  name: string;
  parent: string;
  phone: string;
  branchName: string;
};

type CashPoll = { lastNote?: string; hits?: number; max?: number; allowed?: boolean };

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

  return (
    <div className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)]" data-op="cash-tab">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="font-display text-xl">Касса</p>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Правда на диске. Остаток клиента = сумма строк, не paid_till. «Обновить кассу» — опрос Alfa 10 раз в час, не выгрузка всего справочника.
          </p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void load({ q: e.currentTarget.value });
          }}
          placeholder="id клиента, имя, телефон"
          className="ml-auto h-9 w-64 rounded-full bg-white px-3 text-sm ring-1 ring-black/10"
        />
        <Button type="button" size="sm" className="h-9" variant="secondary" disabled={Boolean(busy)} onClick={() => void load()}>
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
            void load({ payKind: "" });
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
        {total} платежей · сумма строк {money(selectionSum)} · опрос {poll.hits || 0}/{poll.max || 10} за час
        {poll.lastNote ? ` · ${poll.lastNote}` : ""}
      </p>
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
              <th className="px-2 py-2">cttId</th>
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
                      {p.name || `клиент ${p.customerId}`}
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
                  <td className="px-2 py-2 tabular-nums">{p.cttId || "—"}</td>
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!items.length && busy !== "list" ? <p className="px-2 py-6 text-sm text-muted">На диске нет платежей в этой выборке.</p> : null}
        {busy === "list" ? <p className="px-2 py-3 text-sm text-muted">Читаю диск…</p> : null}
      </div>
    </div>
  );
}
