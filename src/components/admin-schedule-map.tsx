"use client";

import { useEffect, useMemo, useState } from "react";
import { adminScheduleMap } from "@/data/admin-schedule-map";
import { Button } from "@/components/ui/button";
import { AdminSectionHead } from "@/components/admin-self-test";
import { RaSelect } from "@/components/ra-select";
import type { CourseLink, SchoolLink } from "@/data/schedule-map";
import type { TariffLink } from "@/data/tariff-map";
import type { SiteTree } from "@/data/site-tree";
import { groupMapByTree, type MapBoardSchool } from "@/data/crm-map-board";
import { cn } from "@/lib/utils";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

const EMPTY_TREE: SiteTree = { schools: [], courses: [], assign: {} };

type SchoolRow = MapBoardSchool;

export function AdminScheduleMap({ embedded }: { embedded?: boolean }) {
  const [schools, setSchools] = useState<SchoolLink[]>([]);
  const [courses, setCourses] = useState<CourseLink[]>([]);
  const [saved, setSaved] = useState<CourseLink[]>([]);
  const [kind, setKind] = useState<"subjects" | "tariffs">("subjects");
  const [tariffs, setTariffs] = useState<TariffLink[]>([]);
  const [tariffSaved, setTariffSaved] = useState<TariffLink[]>([]);
  const [tariffNames, setTariffNames] = useState<{ id: number; name: string }[]>([]);
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
      setTariffs((res as { tariffs?: TariffLink[] }).tariffs || []);
      setTariffSaved((res as { tariffs?: TariffLink[] }).tariffs || []);
      setTariffNames((res as { tariffNames?: { id: number; name: string }[] }).tariffNames || []);
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
    const res =
      kind === "tariffs"
        ? await adminScheduleMap({ data: { token: token(), action: "saveTariffs", tariffs } })
        : await adminScheduleMap({ data: { token: token(), action: "save", schools, courses } });
    setBusy(false);
    setMsg(
      res.ok
        ? kind === "tariffs"
          ? "Абонементы привязаны к курсам сайта. AlfaCRM не менялась."
          : `Сохранено. Группы раскладываются как во вкладке «Группы». CRM не менялась.`
        : res.error || "Ошибка",
    );
    if (res.ok) {
      if (kind === "tariffs") {
        setTariffs((res as { tariffs?: TariffLink[] }).tariffs || tariffs);
        setTariffSaved((res as { tariffs?: TariffLink[] }).tariffs || tariffs);
        if ("tariffNames" in res && Array.isArray((res as { tariffNames?: { id: number; name: string }[] }).tariffNames)) {
          setTariffNames((res as { tariffNames: { id: number; name: string }[] }).tariffNames);
        }
      } else {
        setSchools(res.schools || []);
        setCourses(res.courses || []);
        setSaved(res.courses || []);
      }
      if ("tree" in res && res.tree) setTree(res.tree as SiteTree);
    }
  }

  const view = useMemo<SchoolRow[]>(() => {
    const schools = tree.schools.length ? tree.schools : siteSchools.map((s) => ({ id: s.href, label: s.label, href: s.href }));
    const coursesTree = tree.courses.length
      ? tree.courses
      : siteCourses.map((c) => ({
          id: c.courseId || c.href,
          schoolId: c.schoolId || schools.find((s) => s.id === c.schoolId)?.id || "",
          label: c.name,
          age: c.age || "",
          href: c.href,
        }));
    return groupMapByTree(
      { schools, courses: coursesTree },
      courses.map((s) => ({ id: s.subjectId, title: s.subjectName, courseId: s.courseId, schoolId: s.schoolId })),
    );
  }, [tree, courses, siteSchools, siteCourses]);

  const tariffView = useMemo(() => {
    const schools = tree.schools.length ? tree.schools : siteSchools.map((s) => ({ id: s.href, label: s.label, href: s.href }));
    return groupMapByTree(
      { schools, courses: tree.courses },
      tariffs.map((t) => ({
        id: t.tariffId,
        title: tariffNames.find((n) => n.id === t.tariffId)?.name || `абонемент ${t.tariffId}`,
        courseId: t.courseId,
        schoolId: t.schoolId,
      })),
    );
  }, [tree, tariffs, tariffNames, siteSchools]);

  const stats = useMemo(() => {
    if (kind === "tariffs") {
      const total = tariffs.length;
      const mapped = tariffs.filter((t) => t.courseId).length;
      return { total, mapped, loose: total - mapped };
    }
    const total = courses.length;
    const loose = view.reduce((n, s) => n + (s.courses.find((c) => c.label === "Без курса")?.items.length || 0), 0);
    return { total, loose, mapped: total - loose };
  }, [kind, tariffs, courses.length, view]);

  const query = q.trim().toLowerCase();
  const board = kind === "tariffs" ? tariffView : view;
  const active = board.find((s) => s.schoolId === schoolId) || board[0];
  const dirty = kind === "tariffs" ? JSON.stringify(tariffs) !== JSON.stringify(tariffSaved) : JSON.stringify(courses) !== JSON.stringify(saved);

  useEffect(() => {
    if (schoolId || !board.length) return;
    const withLoose = board.find((s) => s.courses.some((c) => c.label === "Без курса" && c.items.length));
    setSchoolId((withLoose || board[0]).schoolId);
  }, [board, schoolId]);

  const shown = useMemo(() => {
    const rows: { school: string; schoolId: string; course: string; id: number; title: string; hint: string; selected: string; loose: boolean }[] = [];
    const walk = query ? board : active ? [active] : [];
    for (const sch of walk) {
      for (const c of sch.courses) {
        if (!query && courseId && c.courseId !== courseId) continue;
        for (const item of c.items) {
          const haystack = `${item.title} ${item.id} ${item.courseId} ${item.schoolId} ${sch.label} ${c.label}`.toLowerCase();
          if (query && !haystack.includes(query)) continue;
          const loose = c.label === "Без курса" || !item.courseId;
          if (onlyLoose && !loose) continue;
          rows.push({
            school: sch.label,
            schoolId: sch.schoolId,
            course: c.label,
            id: item.id,
            title: item.title,
            hint: kind === "tariffs" ? `tariffId ${item.id}` : `subjectId ${item.id}`,
            selected: item.courseId && !item.courseId.includes("#") ? item.courseId : "",
            loose,
          });
        }
      }
    }
    return rows;
  }, [board, active, courseId, query, onlyLoose, kind]);

  function moveItem(id: number, nextCourseId: string, fromCourseId = "") {
    const course = tree.courses.find((c) => c.id === nextCourseId);
    const school = course ? tree.schools.find((s) => s.id === course.schoolId) : undefined;
    if (kind === "tariffs") {
      setTariffs((list) => {
        const idx = list.findIndex((t) => t.tariffId === id && (t.courseId || "") === (fromCourseId || ""));
        const row = { tariffId: id, courseId: course?.id || "", schoolId: school?.id || "" };
        if (idx < 0) return [...list, row];
        return list.map((t, i) => (i === idx ? row : t));
      });
    } else {
      setCourses((list) =>
        list.map((c) =>
          c.subjectId === id
            ? {
                ...c,
                courseId: course?.id || "",
                schoolId: school?.id || "",
                siteHref: course?.href || "",
                school: school?.label || "",
              }
            : c,
        ),
      );
    }
    if (nextCourseId && school?.id) setSchoolId(school.id);
  }

  function addTariffCourse(id: number) {
    setTariffs((list) => [...list, { tariffId: id, courseId: "", schoolId: "" }]);
  }

  function chipLabel(c: { label: string; age?: string }) {
    if (c.label === "Без курса") return "Без курса";
    const age = (c.age || "").replace(/^для детей\s*/i, "").trim();
    return age || c.label;
  }

  function ageLo(s: string) {
    const m = String(s || "").match(/(\d{1,2})/);
    return m ? Number(m[1]) : 99;
  }

  const courseOptions = tree.schools.map((sc) => ({
    id: sc.id,
    label: `${sc.label} · ${sc.id}`,
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
          tip="Предмет CRM и абонемент привязываются к курсу сайта. AlfaCRM эти соответствия не получает."
        />
      )}

      <div className="overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-border)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-black/6 px-4 py-3">
          <div className="flex rounded-2xl bg-surface-2 p-0.5 ring-1 ring-black/8">
            {([
              ["subjects", "Предметы CRM"],
              ["tariffs", "Абонементы"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setKind(id);
                  setCourseId("");
                  setQ("");
                  setOnlyLoose(false);
                }}
                className={cn("h-9 rounded-2xl px-3 text-sm font-semibold", kind === id ? "bg-primary text-white" : "text-muted hover:text-fg")}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="relative min-w-[12rem] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">⌕</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={kind === "tariffs" ? "Найти абонемент, курс, школу" : "Найти предмет, курс, школу"}
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
            {board.map((sch) => {
              const n = sch.courses.reduce((x, c) => x + c.items.length, 0);
              const loose = sch.courses.find((c) => c.label === "Без курса")?.items.length || 0;
              const on = schoolId === sch.schoolId && !query;
              return (
                <button
                  key={sch.schoolId}
                  type="button"
                  title={`${sch.label} · ${sch.schoolId}`}
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
                  <span className="min-w-0 flex-1 truncate font-medium">{sch.label.replace(/^Школа\s+/i, "")}</span>
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
                    warn={c.label === "Без курса"}
                    label={chipLabel(c)}
                    title={`${c.label} · ${c.courseId}`}
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
              {busy && !(kind === "tariffs" ? tariffs.length : courses.length) ? <li className="px-2 py-8 text-center text-sm text-muted">Загружаю…</li> : null}
              {!busy && !shown.length ? (
                <li className="px-2 py-10 text-center text-sm text-muted">
                  {query
                    ? "Ничего не нашлось."
                    : onlyLoose
                      ? kind === "tariffs"
                        ? "Все абонементы привязаны к курсам сайта."
                        : "Все предметы привязаны к курсам."
                      : kind === "tariffs"
                        ? "В этом курсе пока нет абонементов — перенесите из «Без курса»."
                        : "В этом курсе пока нет предметов — перенесите из «Без курса»."}
                </li>
              ) : null}
              {shown.map((row) => {
                return (
                  <li
                    key={`${kind}-${row.id}-${row.selected || "loose"}-${row.schoolId}`}
                    className={cn(
                      "grid items-center gap-2 rounded-2xl bg-white px-3 py-2 ring-1 ring-black/6 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,17rem)]",
                      row.loose && "ring-amber-200",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", row.loose ? "bg-amber-400" : "bg-emerald-500")} />
                        <span className="truncate font-medium leading-snug">{row.title}</span>
                      </p>
                      <p className="mt-0.5 truncate pl-4 font-mono text-[0.68rem] text-muted">
                        {row.hint}
                        {row.selected ? ` → ${row.selected}` : ""}
                        {query || courseId === "" ? ` · ${row.schoolId}` : ""}
                        {row.loose ? " · не привязан" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <RaSelect
                        value={row.selected}
                        onChange={(v) => moveItem(row.id, v, row.selected)}
                        placeholder="без курса"
                        groups={courseOptions.map((sc) => ({
                          label: sc.label,
                          options: sc.courses.map((x) => ({ value: x.id, label: x.label, hint: x.id })),
                        }))}
                        className="h-9 min-w-0 flex-1"
                      />
                      {kind === "tariffs" ? (
                        <button
                          type="button"
                          title="Ещё один курс сайта"
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg text-muted ring-1 ring-black/8 hover:bg-surface-2 hover:text-fg"
                          onClick={() => addTariffCourse(row.id)}
                        >
                          +
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-black/6 px-4 py-3">
          <p className="mr-auto min-h-5 text-sm text-muted">
            {msg ||
              (dirty
                ? "Есть несохранённые привязки. На сайт уйдут после сохранения. AlfaCRM не меняется."
                : kind === "tariffs"
                  ? "Абонемент привязывается к курсу сайта. Это соответствие только здесь."
                  : "Выберите школу слева, курс сверху — предмет привязывается списком справа.")}
          </p>
          {dirty ? (
            <Button type="button" variant="ghost" className="h-9 px-3 text-sm" disabled={busy} onClick={() => { kind === "tariffs" ? setTariffs(tariffSaved) : setCourses(saved); setMsg(""); }}>
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
