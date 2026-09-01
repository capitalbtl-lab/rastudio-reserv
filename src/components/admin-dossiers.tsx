"use client";

import { useEffect, useMemo, useState } from "react";
import { adminDossiers, type Dossier } from "@/data/dossiers";
import { adminDossierJobs, JOB_ACTIONS, type DossierJob } from "@/data/dossier-jobs";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/info-tip";
import { AdminSelfTest } from "@/components/admin-self-test";
import { AdminSaveBar } from "@/components/admin-save-bar";
import { cn } from "@/lib/utils";

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
  age: number | null;
  ageBand: string;
  parent: string;
  phone: string;
  city: string;
  branch: string;
  courses: string[];
  coursesNow: string[];
  coursesPast: string[];
  schools: string[];
  teachers: string[];
  tariff: string;
  status: string;
  archived: boolean;
  updatedAt: string;
};

type Facet = { name: string; n: number };

const EMPTY_FACETS: Record<string, Facet[]> = { status: [], ageBand: [], school: [], course: [], teacher: [], city: [] };

export function AdminDossiers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [facets, setFacets] = useState(EMPTY_FACETS);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("все");
  const [ageBand, setAgeBand] = useState("все");
  const [school, setSchool] = useState("все");
  const [course, setCourse] = useState("все");
  const [teacher, setTeacher] = useState("все");
  const [open, setOpen] = useState<Dossier | null>(null);
  const [msg, setMsg] = useState("");
  const [childFio, setChildFio] = useState("");
  const [parentFio, setParentFio] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [lastSync, setLastSync] = useState("");
  const [nextSync, setNextSync] = useState("");
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [jobAction, setJobAction] = useState<(typeof JOB_ACTIONS)[number]["id"]>("custom");
  const [instruction, setInstruction] = useState("");
  const [jobs, setJobs] = useState<DossierJob[]>([]);
  const [total, setTotal] = useState(0);

  async function load() {
    const res = await adminDossiers({ data: { token: token(), action: "list", q } });
    if (res.ok && "items" in res) {
      setRows(res.items as Row[]);
      setTotal(Number(res.total) || res.items.length);
      if ("lastCrmSync" in res) setLastSync(String(res.lastCrmSync || ""));
      if ("nextCrmSync" in res) setNextSync(String(res.nextCrmSync || ""));
      if ("facets" in res && res.facets) setFacets(res.facets as typeof EMPTY_FACETS);
    }
  }

  async function loadJobs() {
    const res = await adminDossierJobs({ data: { token: token(), action: "list" } });
    if (res.ok && "jobs" in res) setJobs(res.jobs);
  }

  async function syncAll() {
    setBusy(true);
    setMsg("Загружаем всех клиентов AlfaCRM, включая архив…");
    const res = await adminDossiers({ data: { token: token(), action: "syncAll" } });
    setBusy(false);
    if (res.ok) {
      setMsg(`Загружено ${"count" in res ? res.count : ""} карточек. В CRM сайт ничего не писал.`);
      if ("lastCrmSync" in res) setLastSync(String(res.lastCrmSync || ""));
      void load();
    } else setMsg(res.error || "Ошибка CRM");
  }

  useEffect(() => {
    void load();
    void loadJobs();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (status !== "все" && r.status !== status) return false;
      if (ageBand !== "все" && r.ageBand !== ageBand) return false;
      if (school !== "все" && !r.schools.includes(school)) return false;
      if (course !== "все" && !r.courses.includes(course)) return false;
      if (teacher !== "все" && !r.teachers.includes(teacher)) return false;
      return true;
    });
  }, [rows, status, ageBand, school, course, teacher]);

  const grouped = useMemo(() => {
    const bag = new Map<string, Row[]>();
    for (const r of filtered) {
      const key = `${r.status || "без статуса"} · ${r.schools[0] || r.courses[0] || "без направления"}`;
      if (!bag.has(key)) bag.set(key, []);
      bag.get(key)!.push(r);
    }
    return [...bag.entries()];
  }, [filtered]);

  const selectedIds = Object.keys(picked).filter((id) => picked[id]);

  function toggleAll(on: boolean) {
    if (!on) {
      setPicked({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const r of filtered) next[r.id] = true;
    setPicked(next);
  }

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

  async function runJob() {
    if (!selectedIds.length) {
      setMsg("Отметьте карточки в текущем фильтре.");
      return;
    }
    setBusy(true);
    const res = await adminDossierJobs({
      data: {
        token: token(),
        action: "create",
        job: {
          action: jobAction,
          instruction,
          dossierIds: selectedIds,
          filters: { status, ageBand, school, course, teacher, q },
        },
      },
    });
    setBusy(false);
    if (res.ok && "job" in res) {
      setMsg(`${res.job.count} чел. · ${res.job.reason}`);
      if ("jobs" in res) setJobs(res.jobs);
    } else setMsg(res.ok ? "" : res.error || "Ошибка");
  }

  function FacetSelect({
    label,
    value,
    set,
    items,
  }: {
    label: string;
    value: string;
    set: (v: string) => void;
    items: Facet[];
  }) {
    return (
      <label className="text-xs font-semibold text-muted">
        {label}
        <select value={value} onChange={(e) => set(e.target.value)} className="mt-1 block h-10 w-full min-w-[9rem] rounded-xl bg-surface px-2 text-sm font-medium text-fg ring-1 ring-black/10">
          <option value="все">все</option>
          {items.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name} ({f.n})
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <section className="mt-10 space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-3xl">Личные дела</h2>
          <InfoTip text="Все клиенты AlfaCRM: учатся, лиды и архив. Сайт только читает CRM. Фильтры режут список для массового задания агенту: рассылка, обзвон, ВК, MAX — когда канал подключен." />
        </div>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Все карточки из CRM, без исключения. Сортировка: сначала учатся, затем лиды, затем архив — внутри по направлению и курсу. Отметьте сегмент и нажмите «Выполнить».
        </p>
        <div className="mt-3">
          <AdminSelfTest section="dossiers" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ФИО, телефон, курс, педагог, id CRM"
          className="h-11 w-full max-w-md rounded-xl bg-surface px-3 ring-1 ring-black/10"
        />
        <Button type="button" onClick={() => void load()}>
          Найти
        </Button>
        <Button type="button" disabled={busy} onClick={() => void syncAll()}>
          Загрузить всех из AlfaCRM
        </Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <FacetSelect label="Статус" value={status} set={setStatus} items={facets.status || []} />
        <FacetSelect label="Возраст" value={ageBand} set={setAgeBand} items={facets.ageBand || []} />
        <FacetSelect label="Направление" value={school} set={setSchool} items={facets.school || []} />
        <FacetSelect label="Курс" value={course} set={setCourse} items={facets.course || []} />
        <FacetSelect label="Педагог" value={teacher} set={setTeacher} items={facets.teacher || []} />
      </div>
      <p className="text-xs text-muted">
        {lastSync ? `Последняя загрузка: ${when(lastSync)}` : "Ещё не загружали из CRM"}
        {nextSync ? ` · следующая автоматическая: ${when(nextSync)}` : " · авто — раз в неделю"}
        {` · в базе ${total} · на экране ${filtered.length}`}
      </p>
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}

      <article className="rounded-3xl bg-surface p-4 shadow-[var(--shadow-border)] md:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-lg">Задание агенту</p>
          <InfoTip text="Кнопки — готовые инструкции. Текст можно дополнить. «Выполнить» ставит задание на выбранные карточки. Если канал ещё не подключён, задание сохраняется и его можно повторить позже." />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {JOB_ACTIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setJobAction(a.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold",
                jobAction === a.id ? "bg-primary text-primary-foreground" : "bg-surface-2",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">{JOB_ACTIONS.find((a) => a.id === jobAction)?.hint}</p>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          rows={3}
          placeholder="Например: напомнить про оплату апреля, предложить летнюю смену, пригласить на день открытых дверей 12 сентября."
          className="mt-3 w-full rounded-xl bg-surface-2 px-3 py-2 text-sm ring-1 ring-black/10"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" disabled={busy || !selectedIds.length} onClick={() => void runJob()}>
            Выполнить · {selectedIds.length}
          </Button>
          <button type="button" className="text-sm font-semibold text-primary" onClick={() => toggleAll(true)}>
            Отметить всех в фильтре ({filtered.length})
          </button>
          <button type="button" className="text-sm text-muted" onClick={() => toggleAll(false)}>
            Снять
          </button>
        </div>
        {jobs.length ? (
          <ul className="mt-4 space-y-2 border-t border-black/5 pt-3 text-xs text-muted">
            {jobs.slice(0, 8).map((j) => (
              <li key={j.id}>
                {when(j.at)} · {JOB_ACTIONS.find((a) => a.id === j.action)?.label || j.action} · {j.count} чел. · {j.status}
                {j.instruction ? ` — ${j.instruction.slice(0, 80)}` : ""}
                {j.status === "blocked" ? (
                  <button
                    type="button"
                    className="ml-2 font-semibold text-primary"
                    onClick={() => void adminDossierJobs({ data: { token: token(), action: "retry", id: j.id } }).then((res) => res.ok && "jobs" in res && setJobs(res.jobs))}
                  >
                    Повторить
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </article>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          {grouped.length ? (
            grouped.map(([title, list]) => (
              <div key={title}>
                <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">
                  {title} · {list.length}
                </p>
                <div className="space-y-2">
                  {list.map((r) => (
                    <div key={r.id} className="flex gap-2 rounded-2xl bg-surface p-3 shadow-[var(--shadow-border)]">
                      <input
                        type="checkbox"
                        className="mt-2"
                        checked={Boolean(picked[r.id])}
                        onChange={(e) => setPicked((p) => ({ ...p, [r.id]: e.target.checked }))}
                      />
                      <button type="button" onClick={() => void openOne(r.id)} className="min-w-0 flex-1 text-left">
                        <p className="font-display text-lg leading-tight">{r.child || "Без имени ребёнка"}</p>
                        <p className="mt-0.5 text-sm text-muted">
                          {r.parent ? `заказчик ${r.parent}` : "заказчик не указан"}
                          {r.phone ? ` · ${r.phone}` : ""}
                          {r.age != null ? ` · ${r.age} лет` : ""}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.68rem] font-semibold text-primary">{r.status || "без статуса"}</span>
                          {r.schools.map((s) => (
                            <span key={s} className="rounded-full bg-black/5 px-2 py-0.5 text-[0.68rem]">
                              {s}
                            </span>
                          ))}
                          {r.teachers.slice(0, 2).map((t) => (
                            <span key={t} className="rounded-full bg-black/5 px-2 py-0.5 text-[0.68rem]">
                              {t}
                            </span>
                          ))}
                        </div>
                        {r.courses.length ? <p className="mt-1 text-sm">{r.courses.slice(0, 3).join(" · ")}</p> : null}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted">Пока пусто — нажмите «Загрузить всех из AlfaCRM».</p>
          )}
        </div>
        {open ? (
          <div className="lg:sticky lg:top-24 lg:max-h-[calc(100svh-7rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain">
            <article className="flex flex-col rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
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
                {open.age != null ? <li>возраст: {open.age} ({open.ageBand})</li> : null}
                {open.city ? <li>город: {open.city}</li> : null}
                {open.branch ? <li>филиал: {open.branch}</li> : null}
                {open.address ? <li>адрес: {open.address}</li> : null}
                {open.coursesNow?.length ? <li>ходит: {open.coursesNow.join(", ")}</li> : null}
                {open.coursesPast?.length ? <li>раньше: {open.coursesPast.join(", ")}</li> : null}
                {open.teachers?.length ? <li>педагоги: {open.teachers.join(", ")}</li> : null}
                {open.schools?.length ? <li>направления: {open.schools.join(", ")}</li> : null}
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
              <AdminSaveBar>
                {open.url ? (
                  <a href={open.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-full bg-surface-2 px-4 text-sm font-semibold">
                    Карточка AlfaCRM
                  </a>
                ) : null}
                {open.crmId && open.branchId ? (
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => void sync()}>
                    Подтянуть эту карточку из CRM
                  </Button>
                ) : null}
                <Button type="button" disabled={busy} onClick={() => void save()}>
                  Сохранить
                </Button>
              </AdminSaveBar>
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
          </div>
        ) : (
          <p className="self-start text-sm text-muted lg:sticky lg:top-24">Выберите дело слева.</p>
        )}
      </div>
    </section>
  );
}
