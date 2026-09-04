"use client";

import { useEffect, useState } from "react";
import { adminSchedule } from "@/data/admin-schedule";
import { cn } from "@/lib/utils";
import { SITE_BRANCHES, SITE_SIGNUP_DEFAULT, type SiteSignup } from "@/data/site-signup-core";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

type CourseRow = { id: string; label: string; age: string; groups: number; emptyTeacher: number; noPlaces: number; tariffs: number[] };
type SchoolRow = { id: string; label: string; courses: CourseRow[] };

export function AdminPublicSite() {
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [loose, setLoose] = useState<{ id: string; groupId: number; name: string; branchId: number }[]>([]);
  const [stats, setStats] = useState({ schools: 0, courses: 0, groups: 0, loose: 0, tariffs: 0, teachers: 0 });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState("");
  const [signup, setSignup] = useState<SiteSignup>(SITE_SIGNUP_DEFAULT);
  const [saved, setSaved] = useState("");

  async function load() {
    setBusy(true);
    try {
      const res = (await adminSchedule({ data: { token: token(), action: "publicSiteGet" } as never })) as {
        ok?: boolean;
        schools?: SchoolRow[];
        loose?: { id: string; groupId: number; name: string; branchId: number }[];
        stats?: typeof stats;
        signup?: SiteSignup;
      };
      if (res.ok) {
        setSchools(res.schools || []);
        setLoose(res.loose || []);
        if (res.stats) setStats(res.stats);
        if (res.signup) setSignup(res.signup);
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveSignup(next: SiteSignup) {
    setSignup(next);
    const res = (await adminSchedule({
      data: { token: token(), action: "publicSiteSave", signup: next } as never,
    })) as { ok?: boolean; signup?: SiteSignup; error?: string };
    if (res.ok && res.signup) {
      setSignup(res.signup);
      setSaved("Сохранено. На сайте сразу.");
    } else setSaved(res.error || "Не сохранилось.");
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-2xl">Сайт</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Сайт — то, что видят родители. Админка — группы, CRM и эти настройки. Кнопки записи на сайте можно выключить.
        </p>
      </div>
      <section className="rounded-2xl bg-white p-4 ring-1 ring-black/8">
        <h3 className="font-semibold">Кнопки записи на сайте</h3>
        <p className="mt-1 text-sm text-muted">
          «Запись на пробное» открывает форму в стиле сайта, филиал уже выбран. «Запись в группу» — ссылка из карточки группы в AlfaCRM.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={signup.trialOn}
              onChange={(e) => void saveSignup({ ...signup, trialOn: e.target.checked })}
            />
            Пробное на сайте
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={signup.groupOn}
              onChange={(e) => void saveSignup({ ...signup, groupOn: e.target.checked })}
            />
            Запись в группу на сайте
          </label>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {SITE_BRANCHES.map((b) => (
            <label key={b.id} className="block text-sm">
              <span className="text-[0.72rem] font-semibold uppercase tracking-wider text-muted">Форма пробного · {b.label}</span>
              <input
                className="mt-1 h-10 w-full rounded-xl bg-bg px-3 text-xs ring-1 ring-black/8"
                value={signup.trialByBranch[String(b.id)] || ""}
                onChange={(e) =>
                  setSignup((s) => ({ ...s, trialByBranch: { ...s.trialByBranch, [String(b.id)]: e.target.value } }))
                }
                onBlur={(e) =>
                  void saveSignup({
                    ...signup,
                    trialByBranch: { ...signup.trialByBranch, [String(b.id)]: e.target.value },
                  })
                }
              />
            </label>
          ))}
        </div>
        {saved ? <p className="mt-2 text-sm text-muted">{saved}</p> : null}
      </section>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Школы", stats.schools],
          ["Курсы", stats.courses],
          ["Группы", stats.groups],
          ["Без курса", stats.loose],
          ["Абонементы", stats.tariffs],
          ["Педагоги", stats.teachers],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-2xl bg-white px-3 py-3 ring-1 ring-black/8">
            <p className="text-[0.68rem] uppercase tracking-wider text-muted">{k}</p>
            <p className="font-display text-2xl">{v}</p>
          </div>
        ))}
      </div>
      {busy && !schools.length ? <p className="text-sm text-muted">Загружаю карту сайта…</p> : null}
      <div className="space-y-2">
        {schools.map((s) => (
          <article key={s.id} className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/8">
            <button
              type="button"
              onClick={() => setOpen((v) => (v === s.id ? "" : s.id))}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="font-semibold">{s.label}</span>
              <span className="text-sm text-muted">
                {s.courses.length} курсов · {s.courses.reduce((n, c) => n + c.groups, 0)} групп
              </span>
            </button>
            {open === s.id ? (
              <ul className="border-t border-black/6">
                {s.courses.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-baseline gap-2 px-4 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 font-medium">{c.label}</span>
                    {c.age ? <span className="text-[0.75rem] text-muted">{c.age}</span> : null}
                    <span className={cn("text-[0.75rem]", c.groups ? "text-muted" : "text-rose-600")}>
                      {c.groups ? `${c.groups} групп` : "нет групп"}
                    </span>
                    {c.tariffs.length ? <span className="text-[0.75rem] text-muted">абонемент {c.tariffs.join(", ")}</span> : <span className="text-[0.75rem] text-amber-700">без абонемента</span>}
                    {c.emptyTeacher ? <span className="text-[0.75rem] text-amber-700">без педагога {c.emptyTeacher}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
      {loose.length ? (
        <div className="rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
          <p className="text-sm font-semibold text-amber-950">Группы без курса сайта — не попадут в форму записи</p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {loose.slice(0, 12).map((g) => (
              <li key={g.id}>
                {g.name} · gid {g.groupId} · филиал {g.branchId}
              </li>
            ))}
            {loose.length > 12 ? <li>ещё {loose.length - 12}</li> : null}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
