"use client";

import { useEffect, useMemo, useState } from "react";
import { adminScheduleMap } from "@/data/admin-schedule-map";
import { Button } from "@/components/ui/button";
import { AdminSectionHead } from "@/components/admin-self-test";
import type { CourseLink, SchoolLink } from "@/data/schedule-map";
import type { SiteTree } from "@/data/site-tree";
import { cn } from "@/lib/utils";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

const EMPTY_TREE: SiteTree = { schools: [], courses: [], assign: {} };

function ageLo(s: string) {
  const m = String(s || "").match(/(\d{1,2})/);
  return m ? Number(m[1]) : 99;
}

function hay(s: CourseLink) {
  return `${s.subjectName} ${s.subjectId} ${s.school} ${s.siteHref}`.toLowerCase();
}

type CourseRow = {
  course: string;
  courseId: string;
  href: string;
  age: string;
  items: CourseLink[];
};
type SchoolRow = { school: string; schoolId: string; courses: CourseRow[] };

export function AdminScheduleMap({ embedded }: { embedded?: boolean }) {
  const [schools, setSchools] = useState<SchoolLink[]>([]);
  const [courses, setCourses] = useState<CourseLink[]>([]);
  const [saved, setSaved] = useState<CourseLink[]>([]);
  const [siteSchools, setSiteSchools] = useState<{ href: string; label: string }[]>([]);
  const [siteCourses, setSiteCourses] = useState<{ href: string; name: string; school: string; age?: string; schoolId?: string; courseId?: string }[]>([]);
  const [tree, setTree] = useState<SiteTree>(EMPTY_TREE);
  const [schoolId, setSchoolId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [q, setQ] = useState("");
  const [onlyLoose, setOnlyLoose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    setBusy(true);
    try {
      const res = await adminScheduleMap({ data: { token: token(), action: "get" } });
      if (!res.ok) {
        setMsg(res.error || "Не удалось загрузить соответствия.");
        return;
      }
      setSchools(res.schools || []);
      setCourses(res.courses || []);
      setSaved(res.courses || []);
      setSiteSchools(res.siteSchools || []);
      setSiteCourses(res.siteCourses || []);
      if ("tree" in res && res.tree) setTree(res.tree as SiteTree);
      setMsg("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Не удалось загрузить соответствия.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setBusy(true);
    const res = await adminScheduleMap({ data: { token: token(), action: "save", schools, courses } });
    setBusy(false);
    setMsg(res.ok ? `Сохранено. Группы раскладываются как во вкладке «Группы». CRM не менялась.` : res.error || "Ошибка");
    if (res.ok) {
      setSchools(res.schools || []);
      setCourses(res.courses || []);
      setSaved(res.courses || []);
      if ("tree" in res && res.tree) setTree(res.tree as SiteTree);
    }
  }

  const view = useMemo<SchoolRow[]>(() => {
    const schoolsList = tree.schools.length ? tree.schools : siteSchools.map((s) => ({ id: s.href, label: s.label, href: s.href }));
    const used = new Set<number>();
    const hrefOf = (c: { href?: string; id?: string }) => c.href || c.id || "";
    const rows = schoolsList.map((school) => {
      const list = (
        tree.courses.length
          ? tree.courses.filter((c) => c.schoolId === school.id)
          : siteCourses
              .filter((c) => c.school === school.label || c.schoolId === school.id)
              .map((c) => ({ id: c.courseId || c.href, schoolId: school.id, label: c.name, href: c.href, age: c.age || "" }))
      )
        .slice()
        .sort((a, b) => ageLo(a.age || a.label) - ageLo(b.age || b.label) || a.label.localeCompare(b.label, "ru"));
      const courseRows: CourseRow[] = list.map((c) => {
        const href = hrefOf(c);
        const items = courses.filter((s) => s.courseId && s.courseId === c.id);
        items.forEach((s) => used.add(s.subjectId));
        return { course: c.label, courseId: c.id, href, age: c.age || "", items };
      });
      const loose = courses.filter((s) => !used.has(s.subjectId) && (s.schoolId === school.id || s.school === school.label || (!s.schoolId && !s.school && !s.siteHref && !s.courseId)));
      loose.forEach((s) => used.add(s.subjectId));
      if (loose.length) courseRows.push({ course: "Без курса", courseId: `${school.id}#loose`, href: "", age: "", items: loose });
      return { school: school.label, schoolId: school.id, courses: courseRows };
    });
    const orphan = courses.filter((s) => !used.has(s.subjectId));
    if (orphan.length) {
      rows.push({
        school: "Прочее",
        schoolId: "other",
        courses: [{ course: "Без курса", courseId: "other#loose", href: "", age: "", items: orphan }],
      });
    }
    return rows;
  }, [tree, courses, siteSchools, siteCourses]);

  const stats = useMemo(() => {
    const total = courses.length;
    const loose = view.reduce((n, s) => n + (s.courses.find((c) => c.course === "Без курса")?.items.length || 0), 0);
    return { total, loose, mapped: total - loose };
  }, [courses.length, view]);

  useEffect(() => {
    if (schoolId || !view.length) return;
    const withLoose = view.find((s) => s.courses.some((c) => c.course === "Без курса" && c.items.length));
    setSchoolId((withLoose || view[0]).schoolId);
  }, [view, schoolId]);

  const query = q.trim().toLowerCase();
  const active = view.find((s) => s.schoolId === schoolId) || view[0];
  const dirty = JSON.stringify(courses) !== JSON.stringify(saved);

  const shown = useMemo(() => {
    const rows: { school: string; course: string; courseId: string; item: CourseLink; loose: boolean }[] = [];
    const walk = query ? view : active ? [active] : [];
    for (const sch of walk) {
      for (const c of sch.courses) {
        if (!query && courseId && c.courseId !== courseId) continue;
        for (const item of c.items) {
          if (query && !hay(item).includes(query) && !c.course.toLowerCase().includes(query) && !sch.school.toLowerCase().includes(query)) continue;
          const loose = c.course === "Без курса" || !item.siteHref;
          if (onlyLoose && !loose) continue;
          rows.push({ school: sch.school, course: c.course, courseId: c.courseId, item, loose });
        }
      }
    }
    return rows;
  }, [view, active, courseId, query, onlyLoose]);

  function moveSubject(id: number, nextCourseId: string) {
    const course = tree.courses.find((c) => c.id === nextCourseId);
    const school = course ? tree.schools.find((s) => s.id === course.schoolId) : undefined;
    const href = course?.href || course?.id || "";
    setCourses((list) =>
      list.map((c) =>
        c.subjectId === id
          ? {
              ...c,
              courseId: course?.id || "",
              schoolId: school?.id || "",
              siteHref: href,
              school: school?.label || "",
            }
          : c,
      ),
    );
    if (nextCourseId && school?.id) setSchoolId(school.id);
  }

  function chipLabel(c: CourseRow) {
    if (c.course === "Без курса") return "Без курса";
    const age = c.age.replace(/^для детей\s*/i, "").trim();
    return age || c.course.replace(/^художественная творческая студия\s*[·•]?\s*/i, "") || c.course;
  }

  const courseOptions = tree.schools.map((sc) => ({
    id: sc.id,
    label: sc.label,
    courses: tree.courses
      .filter((x) => x.schoolId === sc.id)
      .slice()
      .sort((a, b) => ageLo(a.age || a.label) - ageLo(b.age || b.label) || a.label.localeCompare(b.label, "ru")),
  }));

  return (
    <section className={embedded ? "space-y-4" : "mt-10 space-y-4"}>
      {embedded ? null : (
        <AdminSectionHead
          section="schedule"
          title="Соответствия"
          tip="Предмет CRM (subjectId) привязывается к курсу сайта (courseId). Имена не склеивают."
        />
      )}

      <div className="overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-border)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-black/6 px-4 py-3">
          <label className="relative min-w-[12rem] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">⌕</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Найти предмет, курс, школу"
              className="h-10 w-full rounded-2xl bg-surface-2 pl-9 pr-3 text-sm outline-none ring-1 ring-black/8 focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setOnlyLoose((v) => !v);
              setCourseId("");
            }}
            className={cn(
              "h-10 rounded-2xl px-3 text-sm font-medium ring-1",
              onlyLoose ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-surface-2 text-fg ring-black/8",
            )}
          >
            Без курса{stats.loose ? ` · ${stats.loose}` : ""}
          </button>
          <p className="ml-auto hidden text-xs text-muted sm:block">
            {stats.mapped} привязано · {stats.total} всего
          </p>
        </div>

        <div className="grid md:grid-cols-[15.5rem_minmax(0,1fr)] md:h-[min(68vh,40rem)]">
          <nav className="flex gap-1.5 overflow-x-auto border-b border-black/6 p-2 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r md:p-3">
            {view.map((sch) => {
              const n = sch.courses.reduce((x, c) => x + c.items.length, 0);
              const loose = sch.courses.find((c) => c.course === "Без курса")?.items.length || 0;
              const on = schoolId === sch.schoolId && !query;
              return (
                <button
                  key={sch.schoolId}
                  type="button"
                  title={sch.school}
                  onClick={() => {
                    setSchoolId(sch.schoolId);
                    setCourseId("");
                    setQ("");
                    setOnlyLoose(false);
                  }}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm transition-colors md:w-full",
                    on ? "bg-primary text-white" : "hover:bg-surface-2",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{sch.school.replace(/^Школа\s+/i, "")}</span>
                  <span className={cn("tabular-nums text-[0.7rem]", on ? "text-white/80" : "text-muted")}>{n}</span>
                  {loose ? (
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", on ? "bg-amber-200" : "bg-amber-500")} />
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div className="flex min-h-0 flex-col">
            {!query && active ? (
              <div className="flex gap-1.5 overflow-x-auto px-3 pt-3 pb-1">
                <Chip
                  on={!courseId}
                  label="Все"
                  count={active.courses.reduce((n, c) => n + c.items.length, 0)}
                  onClick={() => setCourseId("")}
                />
                {active.courses.map((c) => (
                  <Chip
                    key={c.courseId}
                    on={courseId === c.courseId}
                    warn={c.course === "Без курса"}
                    label={chipLabel(c)}
                    title={c.course}
                    count={c.items.length}
                    onClick={() => setCourseId(c.courseId)}
                  />
                ))}
              </div>
            ) : (
              <p className="px-4 pt-3 text-xs text-muted">
                {query ? `Поиск: ${shown.length}` : null}
              </p>
            )}

            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
              {busy && !courses.length ? <li className="px-2 py-8 text-center text-sm text-muted">Загружаю…</li> : null}
              {!busy && !shown.length ? (
                <li className="px-2 py-10 text-center text-sm text-muted">
                  {query ? "Ничего не нашлось." : onlyLoose ? "Все предметы привязаны к курсам." : "В этом курсе пока нет предметов — перенесите из «Без курса»."}
                </li>
              ) : null}
              {shown.map((row) => {
                const selected = tree.courses.find((x) => x.id === row.item.courseId || x.href === row.item.siteHref || x.id === row.item.siteHref)?.id || row.item.courseId || "";
                return (
                  <li
                    key={row.item.subjectId}
                    className={cn(
                      "grid items-center gap-2 rounded-2xl bg-white px-3 py-2 ring-1 ring-black/6 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,16.5rem)]",
                      row.loose && "ring-amber-200",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", row.loose ? "bg-amber-400" : "bg-emerald-500")} />
                        <span className="truncate font-medium leading-snug">{row.item.subjectName}</span>
                      </p>
                      <p className="mt-0.5 truncate pl-4 text-[0.68rem] text-muted">
                        id {row.item.subjectId}
                        {query || courseId === "" ? ` · ${row.school.replace(/^Школа\s+/i, "")}` : ""}
                        {row.loose ? " · не привязан" : ""}
                      </p>
                    </div>
                    <select
                      value={selected}
                      onChange={(e) => moveSubject(row.item.subjectId, e.target.value)}
                      className="h-9 w-full rounded-xl bg-surface-2 px-2 text-sm outline-none ring-1 ring-black/8 focus:ring-2 focus:ring-primary/40"
                    >
                      <option value="">— без курса —</option>
                      {courseOptions.map((sc) => (
                        <optgroup key={sc.id} label={sc.label}>
                          {sc.courses.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-black/6 px-4 py-3">
          <p className="mr-auto min-h-5 text-sm text-muted">
            {msg || (dirty ? "Есть несохранённые привязки. На сайт уйдут после сохранения." : "Выберите школу слева, курс сверху — предмет привязывается списком справа.")}
          </p>
          {dirty ? (
            <Button type="button" variant="ghost" className="h-9 px-3 text-sm" disabled={busy} onClick={() => { setCourses(saved); setMsg(""); }}>
              Отменить
            </Button>
          ) : null}
          <Button type="button" className="h-9 px-4 text-sm" disabled={busy || !dirty} onClick={() => void save()}>
            Сохранить
          </Button>
        </div>
      </div>
    </section>
  );
}

function Chip({
  on,
  warn,
  label,
  title,
  count,
  onClick,
}: {
  on: boolean;
  warn?: boolean;
  label: string;
  title?: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title || label}
      onClick={onClick}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.78rem] font-medium ring-1 transition-colors",
        on ? "bg-primary text-white ring-primary" : warn ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-surface-2 text-fg ring-black/8 hover:bg-white",
      )}
    >
      <span className="max-w-[10rem] truncate">{label}</span>
      <span className={cn("tabular-nums text-[0.68rem]", on ? "text-white/80" : "text-muted")}>{count}</span>
    </button>
  );
}
