"use client";

import { useEffect, useState } from "react";
import { adminDossiers, type Dossier } from "@/data/dossiers";
import { Button } from "@/components/ui/button";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

type Row = {
  id: string;
  crmId: number | null;
  branchId: number | null;
  url: string;
  child: string;
  gender: string;
  dob: string;
  parent: string;
  phone: string;
  city: string;
  branch: string;
  courses: string[];
  tariff: string;
  status: string;
  updatedAt: string;
};

export function AdminDossiers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Dossier | null>(null);
  const [msg, setMsg] = useState("");
  const [childFio, setChildFio] = useState("");
  const [parentFio, setParentFio] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [lastSync, setLastSync] = useState("");
  const [nextSync, setNextSync] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await adminDossiers({ data: { token: token(), action: "list", q } });
    if (res.ok && "items" in res) {
      setRows(res.items as Row[]);
      if ("lastCrmSync" in res) setLastSync(String(res.lastCrmSync || ""));
      if ("nextCrmSync" in res) setNextSync(String(res.nextCrmSync || ""));
    }
  }

  async function syncAll() {
    setBusy(true);
    setMsg("Загружаем данные из AlfaCRM на сайт…");
    const res = await adminDossiers({ data: { token: token(), action: "syncAll" } });
    setBusy(false);
    if (res.ok) {
      setMsg(`Загружено ${"count" in res ? res.count : ""} карточек. Сайт в CRM ничего не писал.`);
      if ("lastCrmSync" in res) setLastSync(String(res.lastCrmSync || ""));
      void load();
    } else setMsg(res.error || "Ошибка CRM");
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(id);
  }, []);

  async function openOne(id: string) {
    const res = await adminDossiers({ data: { token: token(), action: "get", id } });
    if (res.ok && "dossier" in res && res.dossier) {
      setOpen(res.dossier);
      setChildFio(res.dossier.child.fio);
      setParentFio(res.dossier.parent.fio);
      setDob(res.dossier.child.dob || "");
      setPhone(res.dossier.phones[0] || res.dossier.phoneDigits);
    }
  }

  async function save() {
    if (!open) return;
    setBusy(true);
    const res = await adminDossiers({
      data: { token: token(), action: "save", id: open.id, patch: { childFio, parentFio, dob, phone } },
    });
    setBusy(false);
    if (res.ok && "dossier" in res && res.dossier) {
      setOpen(res.dossier);
      setMsg("Личное дело обновлено.");
      void load();
    } else setMsg(res.ok ? "" : res.error || "Ошибка");
  }

  async function sync() {
    if (!open?.crmId || !open.branchId) return;
    setBusy(true);
    const res = await adminDossiers({
      data: { token: token(), action: "sync", crmId: open.crmId, branchId: open.branchId },
    });
    setBusy(false);
    if (res.ok && "dossier" in res && res.dossier) {
      setOpen(res.dossier);
      setChildFio(res.dossier.child.fio);
      setParentFio(res.dossier.parent.fio);
      setDob(res.dossier.child.dob || "");
      setMsg("Подтянули данные из AlfaCRM.");
      void load();
    } else setMsg(res.ok ? "" : res.error || "Ошибка CRM");
  }

  return (
    <section className="mt-10 space-y-5">
      <div>
        <h2 className="font-display text-3xl">Личные дела</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Только в одну сторону: AlfaCRM → сайт. Правки в кабинете на сайте в CRM не уходят. Автозагрузка — раз в неделю, плюс кнопка вручную.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ФИО, телефон, курс, id CRM"
          className="h-11 w-full max-w-md rounded-xl bg-surface px-3 ring-1 ring-black/10"
        />
        <Button type="button" onClick={() => void load()}>
          Найти
        </Button>
        <Button type="button" disabled={busy} onClick={() => void syncAll()}>
          Загрузить из AlfaCRM
        </Button>
      </div>
      <p className="text-xs text-muted">
        {lastSync ? `Последняя загрузка: ${when(lastSync)}` : "Ещё не загружали из CRM"}
        {nextSync ? ` · следующая автоматическая: ${when(nextSync)}` : " · авто — раз в неделю"}
      </p>
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}
      <p className="text-sm text-muted">{rows.length} дел</p>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-3">
          {rows.length ? (
            rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => void openOne(r.id)}
                className="w-full rounded-3xl bg-surface p-5 text-left shadow-[var(--shadow-border)]"
              >
                <p className="font-display text-xl">{r.child || "Без имени ребёнка"}</p>
                <p className="mt-1 text-sm text-muted">
                  {r.parent ? `заказчик ${r.parent}` : "заказчик не указан"}
                  {r.phone ? ` · ${r.phone}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.crmId ? <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[0.72rem] font-semibold text-primary">CRM {r.crmId}</span> : <span className="rounded-full bg-black/5 px-2.5 py-1 text-[0.72rem]">нет в CRM</span>}
                  {r.gender ? <span className="rounded-full bg-black/5 px-2.5 py-1 text-[0.72rem]">{r.gender}</span> : null}
                  {r.dob ? <span className="rounded-full bg-black/5 px-2.5 py-1 text-[0.72rem]">{r.dob}</span> : null}
                  {r.city ? <span className="rounded-full bg-black/5 px-2.5 py-1 text-[0.72rem]">{r.city}</span> : null}
                  {r.status ? <span className="rounded-full bg-black/5 px-2.5 py-1 text-[0.72rem]">{r.status}</span> : null}
                </div>
                {r.courses?.length ? <p className="mt-2 text-sm">{r.courses.join(" · ")}</p> : null}
                <p className="mt-2 text-xs text-muted">{when(r.updatedAt)}</p>
              </button>
            ))
          ) : (
            <p className="text-sm text-muted">Пока пусто — дело появится, когда родитель назовёт телефон или имя.</p>
          )}
        </div>
        {open ? (
          <article className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
            <p className="text-xs text-muted">
              {open.crmId ? `AlfaCRM ${open.crmId}` : "ещё без номера CRM"} · обновлено {when(open.updatedAt)}
            </p>
            <label className="mt-3 block text-sm">
              ФИО ребёнка
              <input value={childFio} onChange={(e) => setChildFio(e.target.value)} className="mt-1 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
            </label>
            <label className="mt-3 block text-sm">
              ФИО заказчика
              <input value={parentFio} onChange={(e) => setParentFio(e.target.value)} className="mt-1 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Дата рождения
                <input value={dob} onChange={(e) => setDob(e.target.value)} placeholder="01.01.2018" className="mt-1 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
              </label>
              <label className="text-sm">
                Телефон
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
              </label>
            </div>
            <ul className="mt-4 space-y-1 text-sm">
              {open.child.gender ? <li>пол: {open.child.gender}</li> : null}
              {open.city ? <li>город: {open.city}</li> : null}
              {open.branch ? <li>филиал: {open.branch}</li> : null}
              {open.address ? <li>адрес: {open.address}</li> : null}
              {open.coursesNow.length ? <li>ходит: {open.coursesNow.join(", ")}</li> : null}
              {open.coursesPast.length ? <li>раньше: {open.coursesPast.join(", ")}</li> : null}
              {open.services.length ? <li>услуги: {open.services.join(", ")}</li> : null}
              {open.tariff ? <li>абонемент: {open.tariff}</li> : null}
              {open.status ? <li>статус: {open.status}</li> : null}
            </ul>
            {Object.keys(open.extras || {}).length ? (
              <div className="mt-4 max-h-56 overflow-auto rounded-2xl bg-surface-2 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Все свойства CRM</p>
                <ul className="mt-2 space-y-1 text-xs">
                  {Object.entries(open.extras)
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <li key={k}>
                        <span className="text-muted">{k}: </span>
                        {v}
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={() => void save()}>
                Сохранить
              </Button>
              {open.crmId && open.branchId ? (
                <Button type="button" variant="secondary" disabled={busy} onClick={() => void sync()}>
                  Подтянуть эту карточку из CRM
                </Button>
              ) : null}
              {open.url ? (
                <a href={open.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-full bg-surface-2 px-4 text-sm font-semibold">
                  Карточка AlfaCRM
                </a>
              ) : null}
            </div>
            {open.log.length ? (
              <div className="mt-5 border-t border-black/5 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">История фактов</p>
                <ul className="mt-2 space-y-2 text-xs text-muted">
                  {open.log.slice(0, 12).map((l, i) => (
                    <li key={i}>
                      {when(l.at)} · {l.source}: {l.text}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>
        ) : (
          <p className="self-start text-sm text-muted">Выберите дело слева.</p>
        )}
      </div>
    </section>
  );
}
