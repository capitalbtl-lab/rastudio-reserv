"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, MapPin } from "lucide-react";
import type { CmsSession } from "@/data/cms";
import { hrefForCourseFilter, prettyCourseName } from "@/data/cms";
import { PageLink } from "@/components/page-link";
import { cn } from "@/lib/utils";

const WEEKDAYS: [RegExp, string][] = [
  [/понедельник/i, "Пн"],
  [/вторник/i, "Вт"],
  [/сред/i, "Ср"],
  [/четверг/i, "Чт"],
  [/пятниц/i, "Пт"],
  [/суббот/i, "Сб"],
  [/воскресень/i, "Вс"],
];

function compactWhen(when: string) {
  if (!when) return "";
  const days = WEEKDAYS.filter(([re]) => re.test(when)).map(([, d]) => d);
  const times = [...when.matchAll(/(\d{1,2}:\d{2})\s*до\s*(\d{1,2}:\d{2})/gi)].map(
    (m) => `${m[1]}–${m[2]}`,
  );
  const twice = /2\s*раза/i.test(when);
  if (days.length && times.length) return `${twice ? "2× " : ""}${days.join("/")} ${times.join(", ")}`;
  if (days.length) return `${twice ? "2× " : ""}${days.join("/")}`;
  return when.replace(/^Занятия\s+/i, "");
}

function branchRank(session: CmsSession) {
  const blob = `${session.city} ${session.branch}`;
  if (/октябрьск/i.test(blob)) return 0;
  if (/гражданск/i.test(blob)) return 1;
  if (/луховиц|пушкин/i.test(blob)) return 2;
  return 9;
}

function branchMeta(session: CmsSession) {
  const blob = `${session.city} ${session.branch}`;
  if (/октябрьск/i.test(blob)) return { city: "Коломна", address: "ул. Октябрьской революции, 340" };
  if (/гражданск/i.test(blob)) return { city: "Коломна", address: "ул. Гражданская, 2" };
  if (/пушкин|луховиц/i.test(blob)) return { city: "Луховицы", address: "ул. Пушкина, 202А" };
  return { city: session.city || "Филиал", address: session.branch || "" };
}

function ageRank(age: string) {
  const n = age.match(/\d+/);
  return n ? Number(n[0]) : 99;
}

function courseKey(session: CmsSession) {
  return (session.courseFilter || "").replace(/\s+/g, " ").trim() || "Курс";
}

type SortKey = "course" | "branch" | "age" | "city";

export function ScheduleBlock({
  sessions,
  heading = true,
  byCourse = false,
}: {
  sessions: CmsSession[];
  heading?: boolean;
  byCourse?: boolean;
}) {
  const cities = useMemo(
    () => [...new Set(sessions.map((s) => branchMeta(s).city).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")),
    [sessions],
  );
  const ages = useMemo(
    () => [...new Set(sessions.map((s) => s.age).filter(Boolean))].sort((a, b) => ageRank(a) - ageRank(b) || a.localeCompare(b, "ru")),
    [sessions],
  );
  const courses = useMemo(() => {
    const names = [...new Set(sessions.map(courseKey).filter(Boolean))];
    return names.sort((a, b) => prettyCourseName(a).localeCompare(prettyCourseName(b), "ru"));
  }, [sessions]);

  const [sort, setSort] = useState<SortKey>(byCourse ? "course" : "branch");
  const [cityOn, setCityOn] = useState<string[]>([]);
  const [ageOn, setAgeOn] = useState<string[]>([]);
  const [courseOn, setCourseOn] = useState<string[]>([]);

  if (!sessions.length) return null;

  const cityFilter = cityOn.length ? new Set(cityOn) : null;
  const ageFilter = ageOn.length ? new Set(ageOn) : null;
  const courseFilter = courseOn.length ? new Set(courseOn) : null;

  const filtered = sessions.filter((s) => {
    const meta = branchMeta(s);
    if (cityFilter && !cityFilter.has(meta.city)) return false;
    if (ageFilter && !ageFilter.has(s.age)) return false;
    if (courseFilter && !courseFilter.has(courseKey(s))) return false;
    return true;
  });

  const ordered = [...filtered].sort((a, b) => {
    if (sort === "course") {
      const course = prettyCourseName(courseKey(a)).localeCompare(prettyCourseName(courseKey(b)), "ru");
      if (course) return course;
    } else if (sort === "age") {
      const age = ageRank(a.age) - ageRank(b.age);
      if (age) return age;
    } else if (sort === "city") {
      const city = branchMeta(a).city.localeCompare(branchMeta(b).city, "ru");
      if (city) return city;
    }
    const br = branchRank(a) - branchRank(b);
    if (br) return br;
    const age = ageRank(a.age) - ageRank(b.age);
    if (age) return age;
    return compactWhen(a.when).localeCompare(compactWhen(b.when), "ru");
  });

  const groups: { label: string; kicker: string; href: string | null; items: CmsSession[] }[] = [];
  for (const session of ordered) {
    const meta = branchMeta(session);
    const key =
      sort === "course"
        ? {
            kicker: "Курс",
            label: prettyCourseName(courseKey(session)),
            href: hrefForCourseFilter(courseKey(session), session.age),
          }
        : sort === "age"
          ? { kicker: "Возраст", label: session.age || "группа", href: null }
          : { kicker: meta.city, label: meta.address || meta.city, href: null };
    const last = groups[groups.length - 1];
    if (last && last.kicker === key.kicker && last.label === key.label) last.items.push(session);
    else groups.push({ ...key, items: [session] });
  }

  function toggle(list: string[], value: string, set: (next: string[]) => void) {
    set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  return (
    <section className="mt-10">
      {heading ? (
        <>
          <p className="kicker">Расписание</p>
          <h2 className="display mt-2 text-xl md:text-2xl">Группы по филиалам</h2>
        </>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block min-w-[10.5rem] flex-1">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted">Сортировка</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="mt-1.5 h-10 w-full rounded-xl bg-surface px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:ring-2 focus:ring-primary/30"
          >
            {byCourse ? <option value="course">По курсу</option> : null}
            <option value="branch">По филиалу</option>
            <option value="city">По городу</option>
            <option value="age">По возрасту</option>
          </select>
        </label>
      </div>

      {byCourse && courses.length > 1 ? (
        <fieldset className="mt-4">
          <legend className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted">Курс</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {courses.map((course) => {
              const on = courseOn.includes(course);
              return (
                <label
                  key={course}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-sm shadow-[var(--shadow-border)]",
                    on ? "bg-primary text-primary-foreground" : "bg-surface",
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() => toggle(courseOn, course, setCourseOn)}
                  />
                  {prettyCourseName(course)}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {cities.length > 1 ? (
        <fieldset className="mt-4">
          <legend className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted">Город</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {cities.map((city) => {
              const on = cityOn.includes(city);
              return (
                <label
                  key={city}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-sm shadow-[var(--shadow-border)]",
                    on ? "bg-primary text-primary-foreground" : "bg-surface",
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() => toggle(cityOn, city, setCityOn)}
                  />
                  {city}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {ages.length > 1 ? (
        <fieldset className="mt-3">
          <legend className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted">Возраст</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {ages.map((age) => {
              const on = ageOn.includes(age);
              return (
                <label
                  key={age}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-sm shadow-[var(--shadow-border)]",
                    on ? "bg-primary text-primary-foreground" : "bg-surface",
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() => toggle(ageOn, age, setAgeOn)}
                  />
                  {age}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="mt-5 space-y-3">
        {groups.length ? (
          groups.map((group) => (
            <div
              key={`${group.kicker}-${group.label}`}
              className="overflow-hidden rounded-[1.35rem] bg-surface shadow-[var(--shadow-border)]"
            >
              <div className="flex items-center gap-3 px-3.5 pb-2 pt-3.5 md:px-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <MapPin className="size-4" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">{group.kicker}</p>
                  <p className="text-[1.05rem] font-semibold leading-tight">{group.label}</p>
                </div>
                {group.href ? (
                  <PageLink to={group.href} className="shrink-0 text-sm font-semibold text-primary">
                    О курсе
                  </PageLink>
                ) : null}
              </div>
              <ul>
                {group.items.map((s) => {
                  const meta = branchMeta(s);
                  const title = prettyCourseName(courseKey(s));
                  const href = hrefForCourseFilter(courseKey(s), s.age);
                  const row = (
                    <span className="flex items-center gap-3 px-3.5 py-2.5 md:gap-4 md:px-4">
                      <span className="inline-flex min-w-[4.75rem] justify-center rounded-full bg-primary/10 px-2 py-1 text-[0.68rem] font-semibold text-primary">
                        {s.age || "группа"}
                      </span>
                      <span className="min-w-0 flex-1">
                        {sort !== "course" && byCourse ? (
                          <span className="block text-[0.95rem] font-semibold leading-snug">{title}</span>
                        ) : null}
                        <span className={cn("block leading-snug", sort === "course" ? "text-[0.95rem] font-medium" : "text-sm text-muted")}>
                          {compactWhen(s.when)}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {meta.city}
                          {meta.address ? ` · ${meta.address}` : ""}
                          {s.group ? ` · ${s.group}` : ""}
                        </span>
                      </span>
                      {s.signup ? (
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-fg text-bg transition-colors duration-[var(--motion-fast)] group-hover:bg-primary">
                          <ArrowUpRight className="size-3.5" strokeWidth={2.2} />
                        </span>
                      ) : null}
                    </span>
                  );
                  return (
                    <li key={s.id} className="border-t border-border/70">
                      {s.signup ? (
                        <a href={s.signup} className="group block transition-colors hover:bg-[#f3f5f8]">
                          {row}
                        </a>
                      ) : href ? (
                        <PageLink to={href} className="group block transition-colors hover:bg-[#f3f5f8]">
                          {row}
                        </PageLink>
                      ) : (
                        row
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        ) : (
          <p className="rounded-[1.35rem] bg-surface px-4 py-5 text-sm text-muted shadow-[var(--shadow-border)]">
            Нет групп с такими фильтрами. Снимите галочку или выберите другой курс.
          </p>
        )}
      </div>
    </section>
  );
}
