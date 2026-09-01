"use client";

import { useEffect, useMemo, useState } from "react";
import { adminScheduleMap } from "@/data/admin-schedule-map";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/info-tip";
import { AdminSectionHead } from "@/components/admin-self-test";
import type { CourseLink, SchoolLink } from "@/data/schedule-map";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

export function AdminScheduleMap({ embedded }: { embedded?: boolean }) {
  const [schools, setSchools] = useState<SchoolLink[]>([]);
  const [courses, setCourses] = useState<CourseLink[]>([]);
  const [siteSchools, setSiteSchools] = useState<{ href: string; label: string }[]>([]);
  const [siteCourses, setSiteCourses] = useState<{ href: string; name: string; school: string; age?: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await adminScheduleMap({ data: { token: token(), action: "get" } });
    if (!res.ok) return;
    setSchools(res.schools || []);
    setCourses(res.courses || []);
    setSiteSchools(res.siteSchools || []);
    setSiteCourses(res.siteCourses || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setBusy(true);
    const res = await adminScheduleMap({ data: { token: token(), action: "save", schools, courses } });
    setBusy(false);
    setMsg(res.ok ? `Сохранено. Группы на сайте разложены по школам (${"count" in res ? res.count : ""}). CRM не менялась.` : res.error || "Ошибка");
    if (res.ok) {
      setSchools(res.schools || []);
      setCourses(res.courses || []);
    }
  }

  const bySchool = useMemo(() => {
    const names = [...new Set(courses.map((c) => c.school || "Прочее"))];
    return names.map((school) => ({ school, items: courses.filter((c) => (c.school || "Прочее") === school) }));
  }, [courses]);

  function patchCourse(id: number, patch: Partial<CourseLink>) {
    setCourses((list) => list.map((c) => (c.subjectId === id ? { ...c, ...patch } : c)));
  }

  return (
    <section className={embedded ? "space-y-6" : "mt-10 space-y-6"}>
      {embedded ? (
        <p className="text-sm text-muted">
          Предмет из AlfaCRM ↔ курс и школа на сайте. Школа в расписании берётся из названия группы, затем из этой таблицы. CRM не меняется.
        </p>
      ) : (
      <AdminSectionHead
        section="schedule"
        title="Соответствия"
        tip="Школа в расписании = школа на сайте. Предмет AlfaCRM = страница курса. После сохранения группы раскладываются по школам только на сайте."
      >
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Науки и инженерия, языки и раннее развитие появляются в расписании, если предмет привязан к курсу этой школы.
        </p>
      </AdminSectionHead>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {msg ? <p className="mr-auto text-sm text-primary">{msg}</p> : null}
        <Button type="button" disabled={busy} onClick={() => void save()}>
          Сохранить и применить на сайте
        </Button>
      </div>

      <article className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
        <div className="flex items-center gap-2">
          <p className="font-display text-2xl">Школы</p>
          <InfoTip text="Слева — имя блока в расписании занятий. Справа — страница школы на сайте." />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[0.65rem] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-2 py-2">В расписании</th>
                <th className="px-2 py-2">Школа на сайте</th>
              </tr>
            </thead>
            <tbody>
              {schools.map((s) => (
                <tr key={s.schedule} className="border-t border-black/6">
                  <td className="px-2 py-2 font-medium">{s.schedule}</td>
                  <td className="px-2 py-2">
                    <select
                      value={s.siteHref}
                      onChange={(e) => setSchools((list) => list.map((x) => (x.schedule === s.schedule ? { ...x, siteHref: e.target.value } : x)))}
                      className="h-10 w-full max-w-xl rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
                    >
                      {siteSchools.map((o) => (
                        <option key={o.href} value={o.href}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
        <div className="flex items-center gap-2">
          <p className="font-display text-2xl">Курсы и предметы</p>
          <InfoTip text="Предмет из AlfaCRM слева. Курс на сайте и школа расписания справа. Группа с этим предметом попадёт в выбранную школу." />
        </div>
        <div className="mt-4 space-y-6">
          {bySchool.map((block) => (
            <div key={block.school}>
              <p className="mb-2 text-sm font-semibold">{block.school}</p>
              <div className="overflow-x-auto rounded-2xl bg-surface-2">
                <table className="w-full text-left text-sm">
                  <thead className="text-[0.65rem] uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-3 py-2">Предмет в расписании</th>
                      <th className="px-3 py-2">Курс на сайте</th>
                      <th className="w-56 px-3 py-2">Школа в расписании</th>
                    </tr>
                  </thead>
                  <tbody>
                    {block.items.map((c) => (
                      <tr key={c.subjectId} className="border-t border-black/6">
                        <td className="px-3 py-2">
                          <span className="font-medium">{c.subjectName}</span>
                          <span className="ml-2 text-[0.7rem] text-muted">id {c.subjectId}</span>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={c.siteHref}
                            onChange={(e) => {
                              const href = e.target.value;
                              const site = siteCourses.find((x) => x.href === href);
                              patchCourse(c.subjectId, { siteHref: href, school: site?.school || c.school });
                            }}
                            className="h-10 w-full rounded-xl bg-white px-3 ring-1 ring-black/10"
                          >
                            <option value="">— не привязан —</option>
                            {siteCourses.map((o) => (
                              <option key={o.href} value={o.href}>
                                {o.school} · {o.name}
                                {o.age ? ` · ${o.age}` : ""}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={c.school}
                            onChange={(e) => patchCourse(c.subjectId, { school: e.target.value })}
                            className="h-10 w-full rounded-xl bg-white px-3 ring-1 ring-black/10"
                          >
                            {schools.map((s) => (
                              <option key={s.schedule} value={s.schedule}>{s.schedule}</option>
                            ))}
                            <option value="Прочее">Прочее</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
